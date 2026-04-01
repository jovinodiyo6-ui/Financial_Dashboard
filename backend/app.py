from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import jwt_required, create_access_token, get_jwt_identity
from werkzeug.exceptions import HTTPException
from extensions import db, jwt, bcrypt
from models import *
from services.accounting_engine import (
    post_journal_entry,
    get_company_account,
    serialize_journal_entry,
    seed_chart_of_accounts,
    serialize_ledger_account,
    analyze_journal_lines,
)
from services.invoice_service import create_invoice, serialize_invoice, apply_customer_payment, post_invoice_journal
from services.bill_service import create_bill, serialize_bill, apply_vendor_payment, post_bill_journal, get_or_create_vendor_profile
from services.reporting_service import (
    build_account_register,
    build_accounting_overview,
    build_trial_balance,
    build_inventory_summary,
    build_workforce_overview,
    build_project_summary,
    aggregate_org_reports,
    serialize_inventory_item,
    serialize_purchase_order,
    serialize_project,
)
from services.finance_service import calculate_finance_summary, calculate_tax_summary, get_or_create_tax_profile
from services.ai_cfo_service import build_ai_cfo_overview, answer_ai_cfo_question
from services.guided_entry_service import post_guided_entries
from services.statement_service import build_financial_statements
from services.ingestion_service import (
    read_external_dataframe,
    normalize_ledger_dataframe,
    calc,
    extract_manufacturing_schedule,
)
from services.common import refresh_finance_documents, generate_document_number
from middleware import get_user_from_token, roles_required, plan_required, get_plan_definition
from utils import parse_money, parse_iso_date, today_utc_date, iso_date, hash_key
from constants import *
from bootstrap import ensure_startup_schema, build_system_status_payload
import os
import datetime
import json
import re
import secrets

app = Flask(__name__)

# Config
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///saas.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-secret")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Extensions
db.init_app(app)
jwt.init_app(app)
bcrypt.init_app(app)
CORS(app)

# Ensure database tables exist on startup (idempotent for SQLite/Postgres)
with app.app_context():
    db.create_all()
    ensure_startup_schema(db)

# Return JSON for unhandled exceptions (avoids HTML 500 pages)
@app.errorhandler(Exception)
def handle_exception(err):
    if isinstance(err, HTTPException):
        response = err.get_response()
        response.data = json.dumps({"error": err.description})
        response.content_type = "application/json"
        return response
    try:
        db.session.rollback()
    except Exception:
        pass
    return {"error": str(err)}, 500

# --- Routes ---

@app.route("/")
def home():
    return {"status": "FULL SAAS RUNNING"}

@app.route("/health")
def health():
    return {"status": "ok"}


@app.route("/system-status")
def system_status():
    return build_system_status_payload()


@app.route("/system/version")
def system_version():
    return build_system_status_payload()


# ---------------------------------------------------------------------------
# Auth + identity
# ---------------------------------------------------------------------------

def _require_user():
    user = get_user_from_token()
    if not user:
        return None, ({"error": "invalid token"}, 401)
    return user, None


def _is_org_admin(user):
    return user.role in {"owner", "admin"}


def _membership_rows_for_access(user):
    rows = _membership_rows_for_user(user.id)
    if rows:
        return rows
    return []


def _has_company_access(user, company_id):
    if _is_org_admin(user):
        return Company.query.filter_by(id=company_id, org_id=user.org_id).first() is not None
    return UserCompanyMembership.query.filter_by(user_id=user.id, company_id=company_id).first() is not None


def _visible_companies_for_user(user):
    if _is_org_admin(user):
        return Company.query.filter_by(org_id=user.org_id).order_by(Company.id.asc()).all()

    company_ids = [row.company_id for row in _membership_rows_for_access(user)]
    if not company_ids:
        return []
    return Company.query.filter(Company.org_id == user.org_id, Company.id.in_(company_ids)).order_by(Company.id.asc()).all()


def _resolve_company_for_user(user, company_id=None):
    target_company_id = company_id or request.args.get("company_id")
    if not target_company_id:
        payload = request.get_json(silent=True) or {}
        target_company_id = payload.get("company_id")
    target_company_id = target_company_id or user.default_company_id
    if not target_company_id:
        return None
    try:
        target_company_id = int(target_company_id)
    except (TypeError, ValueError):
        return None

    if not _has_company_access(user, target_company_id):
        return None
    company = Company.query.filter_by(id=target_company_id, org_id=user.org_id).first()
    if not company:
        return None
    return company


SUPPORTED_API_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}


def _build_api_contract():
    contract = {}
    for rule in app.url_map.iter_rules():
        if rule.rule.startswith("/static"):
            continue
        methods = sorted(method for method in rule.methods if method in SUPPORTED_API_METHODS)
        contract[rule.rule] = methods
    return contract


def _serialize_subscription(org):
    plan = get_plan_definition(org.plan_code if org else "free")
    return {
        "plan_code": plan["code"],
        "plan_label": plan["label"],
        "subscription_status": (org.subscription_status if org else "free") or "free",
        "max_companies": int((org.max_companies if org else None) or plan["max_companies"] or 1),
        "ai_enabled": bool((org.ai_assistant_enabled if org else None) or plan["ai_enabled"]),
        "price_monthly": plan["price_monthly"],
        "local_price_kes": plan["local_price_kes"],
        "features": list(plan["features"]),
        "summary": plan["summary"],
    }


def _membership_rows_for_user(user_id):
    rows = UserCompanyMembership.query.filter_by(user_id=user_id).all()
    if rows:
        return rows

    user = db.session.get(User, user_id)
    if not user or not user.default_company_id:
        return []
    return [
        UserCompanyMembership(
            user_id=user.id,
            company_id=user.default_company_id,
            role=user.role,
            is_default=True,
        )
    ]


def _serialize_memberships(user):
    memberships = []
    for row in _membership_rows_for_user(user.id):
        company = db.session.get(Company, row.company_id)
        memberships.append(
            {
                "company_id": row.company_id,
                "company_name": company.name if company else f"Company {row.company_id}",
                "role": row.role,
                "is_default": bool(row.is_default),
            }
        )
    return memberships


def _serialize_user_record(user):
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "default_company_id": user.default_company_id,
        "memberships": _serialize_memberships(user),
    }


def _plan_items():
    ordered_codes = ["free", "pro", "ai"]
    items = []
    for code in ordered_codes:
        plan = get_plan_definition(code)
        items.append(
            {
                "code": plan["code"],
                "label": plan["label"],
                "price_monthly": plan["price_monthly"],
                "local_price_kes": plan["local_price_kes"],
                "summary": plan["summary"],
                "max_companies": plan["max_companies"],
                "ai_enabled": plan["ai_enabled"],
                "features": list(plan["features"]),
            }
        )
    return items


def _sync_org_subscription(org, plan_code, status="active", customer_id=None, subscription_id=None):
    if not org:
        return None
    normalized_code = str(plan_code or "free").strip().lower()
    if normalized_code not in PLAN_DEFINITIONS:
        normalized_code = "free"
    plan = get_plan_definition(normalized_code)
    org.plan_code = plan["code"]
    org.subscription_status = status
    org.max_companies = int(plan["max_companies"])
    org.ai_assistant_enabled = bool(plan["ai_enabled"])
    org.subscription_updated_at = datetime.datetime.now(datetime.UTC)
    if customer_id is not None:
        org.stripe_customer_id = customer_id
    if subscription_id is not None:
        org.stripe_subscription_id = subscription_id
    return plan


def _normalize_mpesa_phone_number(phone_number):
    digits = re.sub(r"\D+", "", str(phone_number or ""))
    if not digits:
        raise ValueError("phone_number is required")
    if digits.startswith("254") and len(digits) == 12:
        return digits
    if digits.startswith("0") and len(digits) == 10:
        return f"254{digits[1:]}"
    if digits.startswith("7") and len(digits) == 9:
        return f"254{digits}"
    raise ValueError("phone_number must be a valid Kenyan mobile number")


def _serialize_billing_payment_request(payment_request):
    return {
        "id": payment_request.id,
        "provider": payment_request.provider,
        "plan_code": payment_request.plan_code,
        "currency_code": payment_request.currency_code,
        "amount": round(float(payment_request.amount or 0), 2),
        "phone_number": payment_request.phone_number or "",
        "status": payment_request.status,
        "external_reference": payment_request.external_reference or "",
        "merchant_request_id": payment_request.merchant_request_id or "",
        "checkout_request_id": payment_request.checkout_request_id or "",
        "created_at": payment_request.created_at.isoformat() if payment_request.created_at else None,
        "updated_at": payment_request.updated_at.isoformat() if payment_request.updated_at else None,
    }


def _plan_code_from_amount(amount):
    normalized_amount = round(float(amount or 0), 2)
    for code in ["pro", "ai"]:
        plan = get_plan_definition(code)
        if round(float(plan["local_price_kes"] or 0), 2) == normalized_amount:
            return plan["code"]
    return None


def _create_mpesa_checkout_request(user, data):
    if user.role not in {"owner", "admin"}:
        return None, ({"error": "not allowed"}, 403)

    requested_plan_code = str(data.get("plan_code") or "").strip().lower()
    requested_amount = data.get("amount")
    if not requested_plan_code and requested_amount not in {None, ""}:
        requested_plan_code = _plan_code_from_amount(requested_amount)
    if requested_plan_code not in PLAN_DEFINITIONS or requested_plan_code == "free":
        return None, ({"error": "plan_code must be a paid plan"}, 400)

    phone_number = _normalize_mpesa_phone_number(data.get("phone_number") or data.get("phone"))
    org = db.session.get(Organization, user.org_id)
    plan = get_plan_definition(requested_plan_code)

    payment_request = BillingPaymentRequest(
        org_id=user.org_id,
        company_id=user.default_company_id,
        requested_by=user.id,
        provider="mpesa",
        plan_code=plan["code"],
        currency_code="KES",
        amount=float(plan["local_price_kes"] or 0),
        phone_number=phone_number,
        status="preview",
        external_reference=f"preview-{plan['code']}-{int(datetime.datetime.now(datetime.UTC).timestamp())}",
        provider_response_json=json.dumps({"mode": "preview"}),
    )
    db.session.add(payment_request)
    db.session.flush()

    if all(
        os.getenv(name)
        for name in ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY"]
    ):
        payment_request.status = "pending"
        payment_request.external_reference = f"mpesa-{payment_request.id}"
        payment_request.checkout_request_id = f"checkout-{payment_request.id}"
        payment_request.merchant_request_id = f"merchant-{payment_request.id}"

    db.session.commit()

    if str(data.get("simulate_success") or "").strip().lower() in {"1", "true", "yes"}:
        _sync_org_subscription(org, plan["code"], status="active")
        payment_request.status = "paid"
        payment_request.callback_payload_json = json.dumps({"mode": "preview", "simulated": True})
        db.session.commit()

    return payment_request, None


def _record_audit(user, action, company_id=None):
    if not user:
        return
    db.session.add(
        AuditLog(
            user_id=user.id,
            company_id=company_id if company_id is not None else user.default_company_id,
            action=action,
        )
    )


def _touch_active_session(user):
    session = ActiveSession.query.filter_by(user_id=user.id).first()
    if not session:
        session = ActiveSession(user_id=user.id)
        db.session.add(session)
    session.last_seen = datetime.datetime.now(datetime.UTC)


def _remove_active_session(user):
    session = ActiveSession.query.filter_by(user_id=user.id).first()
    if session:
        db.session.delete(session)


def _active_user_count_for_org(org_id):
    cutoff = datetime.datetime.now(datetime.UTC) - datetime.timedelta(minutes=30)
    active_sessions = ActiveSession.query.filter(ActiveSession.last_seen >= cutoff).all()
    active_user_ids = [session.user_id for session in active_sessions]
    if not active_user_ids:
        return 0
    return User.query.filter(User.org_id == org_id, User.id.in_(active_user_ids)).count()


def _serialize_vendor_profile(vendor):
    return {
        "id": vendor.id,
        "vendor_name": vendor.vendor_name,
        "email": vendor.email or "",
        "tax_id": vendor.tax_id or "",
        "default_payment_rail": vendor.default_payment_rail,
        "remittance_reference": vendor.remittance_reference or "",
        "bank_last4": vendor.bank_last4 or "",
        "is_1099_eligible": bool(vendor.is_1099_eligible),
        "tax_form_type": vendor.tax_form_type,
        "tin_status": vendor.tin_status,
    }


def _serialize_bank_feed_transaction(transaction):
    return {
        "id": transaction.id,
        "posted_at": iso_date(transaction.posted_at),
        "description": transaction.description,
        "amount": round(float(transaction.amount or 0), 2),
        "reference": transaction.reference or "",
        "status": transaction.status,
        "matched_invoice_id": transaction.matched_invoice_id,
        "matched_bill_id": transaction.matched_bill_id,
    }


def _serialize_bank_connection(connection):
    return {
        "id": connection.id,
        "provider": connection.provider,
        "institution_name": connection.institution_name or "",
        "status": connection.status,
        "created_at": connection.created_at.isoformat() if connection.created_at else None,
        "updated_at": connection.updated_at.isoformat() if connection.updated_at else None,
    }


def _serialize_reconciliation_rule(rule):
    return {
        "id": rule.id,
        "name": rule.name,
        "keyword": rule.keyword or "",
        "direction": rule.direction,
        "min_amount": rule.min_amount,
        "max_amount": rule.max_amount,
        "auto_action": rule.auto_action,
        "target_reference": rule.target_reference or "",
        "exception_type": rule.exception_type or "",
        "priority": rule.priority,
        "is_active": bool(rule.is_active),
    }


def _serialize_reconciliation_exception(exception):
    transaction = db.session.get(BankFeedTransaction, exception.bank_transaction_id)
    return {
        "id": exception.id,
        "transaction_id": exception.bank_transaction_id,
        "description": transaction.description if transaction else "",
        "exception_type": exception.exception_type,
        "notes": exception.notes or "",
        "status": exception.status,
        "created_at": exception.created_at.isoformat() if exception.created_at else None,
    }


def _serialize_disbursement(disbursement):
    bill = db.session.get(VendorBill, disbursement.bill_id)
    return {
        "id": disbursement.id,
        "bill_id": disbursement.bill_id,
        "bill_number": bill.bill_number if bill else "",
        "vendor_name": bill.vendor_name if bill else "",
        "payment_rail": disbursement.payment_rail,
        "status": disbursement.status,
        "scheduled_date": iso_date(disbursement.scheduled_date),
        "amount": round(float(disbursement.amount or 0), 2),
        "reference": disbursement.reference or "",
        "confirmation_code": disbursement.confirmation_code or "",
    }


def _serialize_employee(employee):
    return {
        "id": employee.id,
        "full_name": employee.full_name,
        "email": employee.email or "",
        "pay_type": employee.pay_type,
        "hourly_rate": round(float(employee.hourly_rate or 0), 2),
        "salary_amount": round(float(employee.salary_amount or 0), 2),
        "withholding_rate": round(float(employee.withholding_rate or 0), 2),
        "benefit_rate": round(float(employee.benefit_rate or 0), 2),
        "is_active": bool(employee.is_active),
    }


def _serialize_contractor(contractor):
    return {
        "id": contractor.id,
        "full_name": contractor.full_name,
        "email": contractor.email or "",
        "tax_id": contractor.tax_id or "",
        "default_rate": round(float(contractor.default_rate or 0), 2),
        "is_1099_eligible": bool(contractor.is_1099_eligible),
        "tax_form_type": contractor.tax_form_type,
        "is_active": bool(contractor.is_active),
    }


def _serialize_time_entry(entry):
    return {
        "id": entry.id,
        "employee_id": entry.employee_id,
        "contractor_id": entry.contractor_id,
        "project_id": entry.project_id,
        "work_date": iso_date(entry.work_date),
        "hours": round(float(entry.hours or 0), 2),
        "hourly_cost": round(float(entry.hourly_cost or 0), 2),
        "billable_rate": round(float(entry.billable_rate or 0), 2),
        "description": entry.description or "",
        "status": entry.status,
    }


def _serialize_mileage_entry(entry):
    return {
        "id": entry.id,
        "employee_id": entry.employee_id,
        "contractor_id": entry.contractor_id,
        "project_id": entry.project_id,
        "trip_date": iso_date(entry.trip_date),
        "miles": round(float(entry.miles or 0), 2),
        "rate_per_mile": round(float(entry.rate_per_mile or 0), 2),
        "purpose": entry.purpose or "",
        "status": entry.status,
    }


def _serialize_payroll_run(run):
    return {
        "id": run.id,
        "payroll_number": run.payroll_number,
        "period_start": iso_date(run.period_start),
        "period_end": iso_date(run.period_end),
        "pay_date": iso_date(run.pay_date),
        "status": run.status,
        "gross_pay": round(float(run.gross_pay or 0), 2),
        "withholding_total": round(float(run.withholding_total or 0), 2),
        "benefit_total": round(float(run.benefit_total or 0), 2),
        "mileage_reimbursement_total": round(float(run.mileage_reimbursement_total or 0), 2),
        "net_cash": round(float(run.net_cash or 0), 2),
    }


def _serialize_integration(connection):
    return {
        "id": connection.id,
        "provider": connection.provider,
        "category": connection.category,
        "status": connection.status,
        "last_synced_at": connection.last_synced_at.isoformat() if connection.last_synced_at else None,
    }


def _serialize_tax_filing(filing):
    payload = {}
    try:
        payload = json.loads(filing.payload_json or "{}")
    except (TypeError, ValueError):
        payload = {}
    return {
        "id": filing.id,
        "reference": filing.reference or "",
        "jurisdiction_code": filing.jurisdiction_code,
        "filing_frequency": filing.filing_frequency,
        "filing_type": filing.filing_type,
        "period_start": iso_date(filing.period_start),
        "period_end": iso_date(filing.period_end),
        "status": filing.status,
        "payload": payload,
        "submitted_at": filing.submitted_at.isoformat() if filing.submitted_at else None,
    }


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    
    user = User.query.filter_by(email=email).first()
    if not user or not bcrypt.check_password_hash(user.password, password):
        return {"error": "invalid credentials"}, 401

    _touch_active_session(user)
    _record_audit(user, "Signed in")
    db.session.commit()
    token = create_access_token(identity=str(user.id))
    return {"token": token}

@app.route("/register", methods=["POST"])
def register():
    try:
        data = request.get_json(silent=True) or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password")
        org_name = data.get("org")
        business_type = (data.get("business_type") or "sole_proprietor").strip().lower()
        partner_names = [str(name).strip() for name in (data.get("partner_names") or []) if str(name).strip()]

        if not email or not password or not org_name:
            return {"error": "email, password, and org are required"}, 400
        if business_type not in VALID_BUSINESS_TYPES:
            return {"error": "invalid business_type"}, 400

        if User.query.filter_by(email=email).first():
            return {"error": "email already exists"}, 409
        if business_type == "partnership" and len(partner_names) < 2:
            return {"error": "partnerships require at least two partner names"}, 400

        hashed = bcrypt.generate_password_hash(password).decode()
        org = Organization(name=org_name, billing_email=email)
        db.session.add(org)
        db.session.flush()

        company = Company(org_id=org.id, name=org_name, business_type=business_type)
        db.session.add(company)
        db.session.flush()

        if business_type == "partnership":
            for idx, name in enumerate(partner_names, start=1):
                db.session.add(CompanyPartner(company_id=company.id, name=name.strip(), display_order=idx))
            db.session.add(
                CompanyOnboardingState(
                    company_id=company.id,
                    is_configured=True,
                    configured_at=datetime.datetime.now(datetime.UTC),
                )
            )

        user = User(email=email, password=hashed, role="owner", org_id=org.id, default_company_id=company.id)
        db.session.add(user)
        db.session.flush()
        db.session.add(
            UserCompanyMembership(
                user_id=user.id,
                company_id=company.id,
                role="owner",
                is_default=True,
            )
        )
        _sync_org_subscription(org, org.plan_code or "free", status=org.subscription_status or "free")
        db.session.commit()

        return {"msg": "registered"}
    except Exception as exc:  # surface errors instead of HTML 500
        db.session.rollback()
        return {"error": str(exc)}, 500


@app.route("/password-reset/request", methods=["POST"])
def password_reset_request():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    response = {
        "msg": "If an account exists for that email, a password reset link has been generated.",
        "delivery": "preview",
    }

    user = User.query.filter_by(email=email).first()
    if not user:
        return response

    now = datetime.datetime.now(datetime.UTC)
    token = secrets.token_urlsafe(24)
    PasswordResetToken.query.filter_by(user_id=user.id, used_at=None).update({"used_at": now})
    db.session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_key(token),
            expires_at=now + datetime.timedelta(hours=1),
        )
    )
    db.session.commit()
    response["reset_token"] = token
    return response


@app.route("/password-reset/confirm", methods=["POST"])
def password_reset_confirm():
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    password = data.get("password") or ""
    if not token or not password:
        return {"error": "token and password are required"}, 400

    reset_token = PasswordResetToken.query.filter_by(token_hash=hash_key(token), used_at=None).first()
    now = datetime.datetime.now(datetime.UTC)
    if not reset_token or not reset_token.expires_at or reset_token.expires_at < now:
        return {"error": "invalid or expired reset token"}, 400

    user = db.session.get(User, reset_token.user_id)
    if not user:
        reset_token.used_at = now
        db.session.commit()
        return {"error": "invalid or expired reset token"}, 400

    user.password = bcrypt.generate_password_hash(password).decode()
    reset_token.used_at = now
    db.session.commit()
    return {"msg": "Password reset complete"}

@app.route("/me", methods=["GET", "DELETE"])
@jwt_required()
def me():
    user, error = _require_user()
    if error:
        return error

    if request.method == "DELETE":
        data = request.get_json(silent=True) or {}
        password = data.get("password") or ""
        if not bcrypt.check_password_hash(user.password, password):
            return {"error": "invalid password"}, 401

        # Ensure another owner exists before deleting the last one
        owners = User.query.filter_by(org_id=user.org_id, role="owner").all()
        if user.role == "owner" and len(owners) <= 1:
            return {"error": "create another owner before deleting this account"}, 400

        UserCompanyMembership.query.filter_by(user_id=user.id).delete()
        ActiveSession.query.filter_by(user_id=user.id).delete()
        db.session.delete(user)
        db.session.commit()
        return {"msg": "account deleted"}

    org = db.session.get(Organization, user.org_id)
    default_company = db.session.get(Company, user.default_company_id) if user.default_company_id else None
    return {
        **_serialize_user_record(user),
        "org_id": user.org_id,
        "plan_code": org.plan_code if org else "free",
        "subscription": _serialize_subscription(org),
        "default_company": _serialize_company(default_company) if default_company else None,
        "api_contract": _build_api_contract(),
    }


@app.route("/admin/users", methods=["POST"])
@jwt_required()
@roles_required("owner", "admin")
def create_admin_user():
    actor, error = _require_user()
    if error:
        return error

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = (data.get("role") or "member").strip().lower()
    requested_company_ids = data.get("company_ids") or [actor.default_company_id]

    if not email or not password:
        return {"error": "email and password are required"}, 400
    if role not in VALID_MEMBERSHIP_ROLES:
        return {"error": "invalid role"}, 400
    if User.query.filter_by(email=email).first():
        return {"error": "email already exists"}, 409

    valid_company_ids = []
    for raw_company_id in requested_company_ids:
        try:
            company_id = int(raw_company_id)
        except (TypeError, ValueError):
            continue
        company = Company.query.filter_by(id=company_id, org_id=actor.org_id).first()
        if company:
            valid_company_ids.append(company.id)

    if not valid_company_ids:
        return {"error": "at least one valid company_id is required"}, 400

    user = User(
        email=email,
        password=bcrypt.generate_password_hash(password).decode(),
        role=role,
        org_id=actor.org_id,
        default_company_id=valid_company_ids[0],
    )
    db.session.add(user)
    db.session.flush()

    for index, company_id in enumerate(dict.fromkeys(valid_company_ids).keys()):
        db.session.add(
            UserCompanyMembership(
                user_id=user.id,
                company_id=company_id,
                role=role,
                is_default=index == 0,
            )
        )

    db.session.commit()
    return {"user": _serialize_user_record(user)}, 201


# ---------------------------------------------------------------------------
# Companies + onboarding
# ---------------------------------------------------------------------------

def _serialize_company(company: Company):
    partner_rows = CompanyPartner.query.filter_by(company_id=company.id).order_by(CompanyPartner.display_order.asc()).all()
    partner_names = [row.name for row in partner_rows]
    onboarding_state = CompanyOnboardingState.query.filter_by(company_id=company.id).first()
    return {
        "id": company.id,
        "name": company.name,
        "business_type": company.business_type,
        "partner_count": len(partner_names),
        "partner_names": partner_names,
        "onboarding_complete": bool(onboarding_state.is_configured) if onboarding_state else False,
    }

@app.route("/companies", methods=["GET", "POST"])
@jwt_required()
def list_companies():
    user, error = _require_user()
    if error:
        return error
    if request.method == "GET":
        companies = _visible_companies_for_user(user)
        return [_serialize_company(c) for c in companies]

    if user.role not in {"owner", "admin"}:
        return {"error": "not allowed"}, 403

    org = db.session.get(Organization, user.org_id)
    plan = get_plan_definition(org.plan_code if org else "free")
    existing_company_count = Company.query.filter_by(org_id=user.org_id).count()
    max_companies = int((org.max_companies if org else None) or plan["max_companies"] or 1)
    if existing_company_count >= max_companies:
        return {"error": "plan limit reached for companies"}, 403

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    business_type = (data.get("business_type") or "sole_proprietor").strip().lower()
    partner_names = [str(name).strip() for name in (data.get("partner_names") or []) if str(name).strip()]

    if not name:
        return {"error": "name is required"}, 400
    if business_type not in VALID_BUSINESS_TYPES:
        return {"error": "invalid business_type"}, 400
    if business_type == "partnership" and len(partner_names) < 2:
        return {"error": "partnerships require at least two partner names"}, 400

    company = Company(org_id=user.org_id, name=name, business_type=business_type)
    db.session.add(company)
    db.session.flush()

    db.session.add(
        UserCompanyMembership(
            user_id=user.id,
            company_id=company.id,
            role=user.role,
            is_default=False,
        )
    )

    if business_type == "partnership":
        for idx, partner_name in enumerate(partner_names, start=1):
            db.session.add(
                CompanyPartner(company_id=company.id, name=partner_name, display_order=idx)
            )
        db.session.add(
            CompanyOnboardingState(
                company_id=company.id,
                is_configured=True,
                configured_at=datetime.datetime.now(datetime.UTC),
            )
        )

    db.session.commit()
    return _serialize_company(company), 201

@app.route("/companies/<int:company_id>/setup", methods=["PUT"])
@jwt_required()
def setup_company(company_id):
    user, error = _require_user()
    if error:
        return error

    company = _resolve_company_for_user(user, company_id)
    if not company:
        return {"error": "company not found"}, 404

    data = request.get_json(silent=True) or {}
    business_type = (data.get("business_type") or company.business_type).strip()
    partner_names = data.get("partner_names") or []

    if business_type == "partnership" and len(partner_names) < 2:
        return {"error": "partnerships require at least two partner names"}, 400

    company.business_type = business_type
    CompanyPartner.query.filter_by(company_id=company.id).delete()
    for idx, name in enumerate(partner_names, start=1):
        db.session.add(CompanyPartner(company_id=company.id, name=name.strip(), display_order=idx))

    state = CompanyOnboardingState.query.filter_by(company_id=company.id).first()
    if not state:
        state = CompanyOnboardingState(company_id=company.id)
        db.session.add(state)
    state.is_configured = True
    state.configured_at = datetime.datetime.now(datetime.UTC)

    db.session.commit()
    return _serialize_company(company)


# ---------------------------------------------------------------------------
# Analytics / usage
# ---------------------------------------------------------------------------

@app.route("/analytics", methods=["GET"])
@jwt_required()
def analytics():
    user, error = _require_user()
    if error:
        return error
    org = db.session.get(Organization, user.org_id)
    reports = Report.query.filter_by(org_id=user.org_id).count()
    return {"usage": int(org.usage) if org else 0, "reports": reports}


@app.route("/billing/plans", methods=["GET"])
@jwt_required(optional=True)
def billing_plans():
    user = get_user_from_token()
    org = db.session.get(Organization, user.org_id) if user else None
    return {
        "items": _plan_items(),
        "current_plan_code": (org.plan_code if org else "free") or "free",
    }


@app.route("/billing/summary", methods=["GET"])
@jwt_required()
def billing_summary():
    user, error = _require_user()
    if error:
        return error

    org = db.session.get(Organization, user.org_id)
    company_count = Company.query.filter_by(org_id=user.org_id).count()
    summary = _serialize_subscription(org)
    summary.update(
        {
            "company_count": company_count,
            "company_limit_reached": company_count >= int(summary["max_companies"] or 1),
        }
    )
    return summary


@app.route("/billing/webhook", methods=["POST"])
def billing_webhook():
    payload = request.get_json(silent=True) or {}
    event_type = str(payload.get("type") or "").strip()
    event_object = ((payload.get("data") or {}).get("object") or {})
    metadata = event_object.get("metadata") or {}
    org_id = metadata.get("org_id")
    plan_code = metadata.get("plan_code")
    status = (event_object.get("status") or "active").strip().lower()

    if event_type not in {"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"}:
        return {"handled": False}
    if not org_id:
        return {"handled": False, "error": "missing org_id"}, 400

    org = db.session.get(Organization, int(org_id))
    if not org:
        return {"handled": False, "error": "organization not found"}, 404

    if event_type == "customer.subscription.deleted":
        _sync_org_subscription(
            org,
            "free",
            status="cancelled",
            customer_id=event_object.get("customer"),
            subscription_id=event_object.get("id"),
        )
    else:
        _sync_org_subscription(
            org,
            plan_code,
            status=status or "active",
            customer_id=event_object.get("customer"),
            subscription_id=event_object.get("id"),
        )

    db.session.commit()
    return {"handled": True, "subscription": _serialize_subscription(org)}


@app.route("/billing/mpesa/checkout", methods=["POST"])
@jwt_required()
def mpesa_checkout():
    user, error = _require_user()
    if error:
        return error
    data = request.get_json(silent=True) or {}
    payment_request, checkout_error = _create_mpesa_checkout_request(user, data)
    if checkout_error:
        return checkout_error
    return _serialize_billing_payment_request(payment_request), 201


@app.route("/billing/mpesa/stk-push", methods=["POST"])
@jwt_required()
def mpesa_stk_push():
    user, error = _require_user()
    if error:
        return error
    data = request.get_json(silent=True) or {}
    payment_request, checkout_error = _create_mpesa_checkout_request(user, data)
    if checkout_error:
        return checkout_error
    return _serialize_billing_payment_request(payment_request), 201


@app.route("/billing/mpesa/requests/<int:request_id>", methods=["GET"])
@jwt_required()
def mpesa_request_status(request_id):
    user, error = _require_user()
    if error:
        return error

    payment_request = BillingPaymentRequest.query.filter_by(
        id=request_id,
        org_id=user.org_id,
    ).first()
    if not payment_request:
        return {"error": "payment request not found"}, 404
    return _serialize_billing_payment_request(payment_request)


@app.route("/billing/mpesa/callback", methods=["POST"])
def mpesa_callback():
    payload = request.get_json(silent=True) or {}
    callback = (((payload.get("Body") or {}).get("stkCallback") or {}))
    checkout_request_id = callback.get("CheckoutRequestID")
    merchant_request_id = callback.get("MerchantRequestID")
    result_code = callback.get("ResultCode")
    request_record = BillingPaymentRequest.query.filter(
        BillingPaymentRequest.checkout_request_id == checkout_request_id
    ).first()
    if not request_record and merchant_request_id:
        request_record = BillingPaymentRequest.query.filter_by(
            merchant_request_id=merchant_request_id
        ).first()
    if request_record:
        request_record.callback_payload_json = json.dumps(payload)
        request_record.status = "paid" if result_code == 0 else "failed"
        if result_code == 0:
            org = db.session.get(Organization, request_record.org_id)
            _sync_org_subscription(org, request_record.plan_code, status="active")
        db.session.commit()
    return {"ResultCode": 0, "ResultDesc": "Accepted"}

@app.route("/dashboard")
@jwt_required()
def dashboard():
    user, error = _require_user()
    if error:
        return error
    company_id = request.args.get("company_id") or user.default_company_id
    company = Company.query.filter_by(id=company_id, org_id=user.org_id).first()
    if not company:
        return {"error": "company not found"}, 404
    return calculate_finance_summary(company)

@app.route("/finance/summary")
@jwt_required()
def finance_summary():
    user, error = _require_user()
    if error:
        return error
    company_id = request.args.get("company_id") or user.default_company_id
    company = Company.query.filter_by(id=company_id, org_id=user.org_id).first()
    if not company:
        return {"error": "company not found"}, 404
    return calculate_finance_summary(company)


@app.route("/finance/statements")
@jwt_required()
def finance_statements():
    user, error = _require_user()
    if error:
        return error

    company = Company.query.get(user.default_company_id)
    if not company:
        return {"error": "company not found"}, 404
    return build_financial_statements(company)

@app.route("/finance/invoices", methods=["GET"])
@jwt_required()
def list_invoices():
    user, error = _require_user()
    if error:
        return error
    company = Company.query.get(user.default_company_id)
    invoices, _ = refresh_finance_documents(company.id)
    return {"items": [serialize_invoice(inv) for inv in invoices]}

@app.route("/finance/invoices", methods=["POST"])
@jwt_required()
def create_invoice_route():
    user, error = _require_user()
    if error:
        return error
    company = Company.query.get(user.default_company_id)
    data = request.get_json()
    invoice = create_invoice(user, company, data)
    return serialize_invoice(invoice), 201

@app.route("/finance/bills", methods=["GET"])
@jwt_required()
def list_bills():
    user, error = _require_user()
    if error:
        return error
    company = Company.query.get(user.default_company_id)
    _, bills = refresh_finance_documents(company.id)
    return {"items": [serialize_bill(b) for b in bills]}

@app.route("/finance/bills", methods=["POST"])
@jwt_required()
def create_bill_route():
    user, error = _require_user()
    if error:
        return error
    company = Company.query.get(user.default_company_id)
    data = request.get_json()
    bill = create_bill(user, company, data)
    return serialize_bill(bill), 201

@app.route("/finance/invoices/<int:invoice_id>/payments", methods=["POST"])
@jwt_required()
def pay_invoice(invoice_id):
    user, error = _require_user()
    if error:
        return error
    invoice = Invoice.query.filter_by(id=invoice_id, company_id=user.default_company_id).first()
    if not invoice:
        return {"error": "invoice not found"}, 404
    data = request.get_json(silent=True) or {}
    amount = parse_money(data.get("amount", 0), "amount")
    payment_date = parse_iso_date(data.get("payment_date"), "payment_date", today_utc_date())
    apply_customer_payment(invoice, amount, payment_date, reference=data.get("reference", ""))
    db.session.commit()
    return serialize_invoice(invoice)

@app.route("/finance/bills/<int:bill_id>/payments", methods=["POST"])
@jwt_required()
def pay_bill(bill_id):
    user, error = _require_user()
    if error:
        return error
    bill = VendorBill.query.filter_by(id=bill_id, company_id=user.default_company_id).first()
    if not bill:
        return {"error": "bill not found"}, 404
    data = request.get_json(silent=True) or {}
    amount = parse_money(data.get("amount", 0), "amount")
    payment_date = parse_iso_date(data.get("payment_date"), "payment_date", today_utc_date())
    apply_vendor_payment(bill, amount, payment_date, reference=data.get("reference", ""))
    db.session.commit()
    return serialize_bill(bill)

@app.route("/finance/receivables")
@jwt_required()
def receivables():
    user, error = _require_user()
    if error:
        return error
    invoices, _ = refresh_finance_documents(user.default_company_id)
    open_invoices = [inv for inv in invoices if inv.status in {"sent", "partial", "overdue"}]
    total_open = round(sum(inv.balance_due for inv in open_invoices), 2)
    return {"total_open": total_open, "count": len(open_invoices)}

@app.route("/finance/payables")
@jwt_required()
def payables():
    user, error = _require_user()
    if error:
        return error
    _, bills = refresh_finance_documents(user.default_company_id)
    open_bills = [bill for bill in bills if bill.status in {"approved", "partial", "overdue"}]
    total_open = round(sum(bill.balance_due for bill in open_bills), 2)
    return {"total_open": total_open, "count": len(open_bills)}

@app.route("/finance/accounting/overview")
@jwt_required()
def accounting_overview():
    user, error = _require_user()
    if error:
        return error
    company = _resolve_company_for_user(user)
    return build_accounting_overview(company)


@app.route("/finance/chart-of-accounts", methods=["GET", "POST"])
@jwt_required()
def chart_of_accounts():
    user, error = _require_user()
    if error:
        return error
    company = _resolve_company_for_user(user)
    if not company:
        return {"error": "company not found"}, 404

    if request.method == "GET":
        seed_chart_of_accounts(company)
        db.session.commit()
        accounts = (
            LedgerAccount.query.filter_by(company_id=company.id)
            .order_by(LedgerAccount.code.asc(), LedgerAccount.id.asc())
            .all()
        )
        return {"items": [serialize_ledger_account(account) for account in accounts]}

    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    name = (data.get("name") or "").strip()
    if not code or not name:
        return {"error": "code and name are required"}, 400

    existing = LedgerAccount.query.filter_by(company_id=company.id, code=code).first()
    if existing:
        return {"error": "account code already exists"}, 409

    account = LedgerAccount(
        org_id=company.org_id,
        company_id=company.id,
        code=code,
        name=name,
        category=(data.get("category") or "expense").strip(),
        subtype=(data.get("subtype") or "").strip() or None,
        normal_balance=(data.get("normal_balance") or "debit").strip(),
        description=(data.get("description") or "").strip() or None,
        is_system=False,
        is_active=True,
    )
    db.session.add(account)
    db.session.commit()
    return serialize_ledger_account(account), 201


@app.route("/finance/chart-of-accounts/seed", methods=["POST"])
@jwt_required()
def seed_chart_of_accounts_route():
    user, error = _require_user()
    if error:
        return error
    company = _resolve_company_for_user(user)
    if not company:
        return {"error": "company not found"}, 404

    created = seed_chart_of_accounts(company)
    db.session.commit()
    accounts = (
        LedgerAccount.query.filter_by(company_id=company.id)
        .order_by(LedgerAccount.code.asc(), LedgerAccount.id.asc())
        .all()
    )
    return {"created": created, "items": [serialize_ledger_account(account) for account in accounts]}


@app.route("/finance/journal-entries/validate", methods=["POST"])
@jwt_required()
def validate_journal_entry():
    user, error = _require_user()
    if error:
        return error
    company = _resolve_company_for_user(user)
    if not company:
        return {"error": "company not found"}, 404

    payload = request.get_json(silent=True) or {}
    seed_chart_of_accounts(company)
    diagnostics = analyze_journal_lines(company, payload.get("lines"))
    return diagnostics


@app.route("/finance/journal-entries", methods=["GET", "POST"])
@jwt_required()
def journal_entries():
    user, error = _require_user()
    if error:
        return error
    company = _resolve_company_for_user(user)
    if not company:
        return {"error": "company not found"}, 404

    if request.method == "GET":
        entries = (
            JournalEntry.query.filter_by(company_id=company.id)
            .order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())
            .limit(50)
            .all()
        )
        return {"items": [serialize_journal_entry(entry) for entry in entries]}

    payload = request.get_json(silent=True) or {}
    entry_date = parse_iso_date(payload.get("entry_date"), "entry_date", today_utc_date())
    diagnostics = analyze_journal_lines(company, payload.get("lines"))
    if not diagnostics["can_post"]:
        return {"error": diagnostics["error"], "diagnostics": diagnostics}, 400

    entry = post_journal_entry(
        company,
        user,
        entry_date=entry_date,
        memo=(payload.get("memo") or "").strip() or "Manual journal entry",
        lines=payload.get("lines") or [],
        source_type="manual",
        reference=(payload.get("reference") or "").strip() or None,
    )
    db.session.commit()
    response = serialize_journal_entry(entry)
    response["diagnostics"] = diagnostics
    return response, 201


@app.route("/finance/guided-entries", methods=["POST"])
@jwt_required()
def guided_entries():
    user, error = _require_user()
    if error:
        return error
    company = _resolve_company_for_user(user)
    if not company:
        return {"error": "company not found"}, 404

    payload = request.get_json(silent=True) or {}
    entry_date = parse_iso_date(payload.get("entry_date"), "entry_date", today_utc_date())
    business_type = (payload.get("business_type") or company.business_type or "sole_proprietor").strip().lower()
    try:
        entries = post_guided_entries(
            company,
            user,
            entry_date=entry_date,
            business_type=business_type,
            inputs=payload.get("inputs") or {},
        )
    except ValueError as exc:
        db.session.rollback()
        return {"error": str(exc)}, 400

    db.session.commit()
    return {
        "business_type": business_type,
        "created_count": len(entries),
        "entries": entries,
    }, 201


@app.route("/finance/register")
@jwt_required()
def account_register():
    user, error = _require_user()
    if error:
        return error
    company = _resolve_company_for_user(user)
    if not company:
        return {"error": "company not found"}, 404

    seed_chart_of_accounts(company)
    account_id = request.args.get("account_id")
    account_code = request.args.get("account_code")
    account = get_company_account(company.id, account_id=account_id, account_code=account_code)
    if not account:
        account = (
            LedgerAccount.query.filter_by(company_id=company.id)
            .order_by(LedgerAccount.code.asc(), LedgerAccount.id.asc())
            .first()
        )
    if not account:
        return {"error": "account not found"}, 404
    return build_account_register(company, account)

@app.route("/ai-cfo/overview")
@jwt_required()
def ai_cfo():
    user, error = _require_user()
    if error:
        return error
    company = Company.query.get(user.default_company_id)
    return build_ai_cfo_overview(company)


@app.route("/ai-cfo/ask", methods=["POST"])
@jwt_required()
@plan_required("ai")
def ask_ai_cfo():
    user, error = _require_user()
    if error:
        return error
    company = Company.query.get(user.default_company_id)
    payload = request.get_json(silent=True) or {}
    question = (payload.get("question") or "").strip()
    if not question:
        return {"error": "question is required"}, 400

    overview = build_ai_cfo_overview(company)
    return {
        "answer": answer_ai_cfo_question(question, overview),
        "top_actions": overview.get("top_actions") or [],
        "narrative": overview.get("narrative") or "",
    }

@app.route("/finance/tax/summary")
@jwt_required()
def tax_summary():
    user, error = _require_user()
    if error:
        return error
    company = Company.query.get(user.default_company_id)
    return calculate_tax_summary(company)

@app.route("/finance/tax/seed-demo", methods=["POST"])
@jwt_required()
def tax_seed_demo():
    """
    Quickly populate demo invoices and bills so the Tax Center is not empty.
    """
    user, error = _require_user()
    if error:
        return error
    company = Company.query.get(user.default_company_id)

    # Clear existing invoices/bills for a fresh demo
    Invoice.query.filter_by(company_id=company.id).delete()
    VendorBill.query.filter_by(company_id=company.id).delete()
    db.session.commit()

    # Create sample invoices (all at 16% VAT)
    demo_invoices = [
        {"customer_name": "Demo Customer A", "items": [{"description": "INV001", "quantity": 1, "unit_price": 1000}], "tax_rate": 16},
        {"customer_name": "Demo Customer B", "items": [{"description": "INV002", "quantity": 1, "unit_price": 2500}], "tax_rate": 16},
        {"customer_name": "Demo Customer C", "items": [{"description": "INV003", "quantity": 1, "unit_price": 1500}], "tax_rate": 16},
    ]
    for payload in demo_invoices:
        create_invoice(user, company, {**payload, "status": "sent"})

    # Create sample bills
    demo_bills = [
        {"vendor_name": "Demo Supplies A", "items": [{"description": "EXP001", "quantity": 1, "unit_price": 800}], "tax_rate": 16},
        {"vendor_name": "Demo Supplies B", "items": [{"description": "EXP002", "quantity": 1, "unit_price": 1200}], "tax_rate": 16},
    ]
    if (request.get_json(silent=True) or {}).get("include_refund_case"):
        demo_bills.append({"vendor_name": "Refund Scenario", "items": [{"description": "EXP003", "quantity": 1, "unit_price": 4000}], "tax_rate": 16})

    for payload in demo_bills:
        create_bill(user, company, {**payload, "status": "approved"})

    db.session.commit()
    return calculate_tax_summary(company), 201

@app.route("/finance/tax/profile", methods=["GET", "PUT"])
@jwt_required()
def tax_profile():
    user, error = _require_user()
    if error:
        return error
    company = Company.query.get(user.default_company_id)
    profile = get_or_create_tax_profile(company)

    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        for field in [
            "jurisdiction_code",
            "filing_frequency",
            "registration_number",
            "currency_code",
            "sales_tax_name",
            "purchase_tax_name",
            "indirect_tax_rate",
            "income_tax_rate",
            "period_start_month",
        ]:
            if field in data:
                setattr(profile, field, data[field])
        db.session.commit()

    return {
        "jurisdiction_code": profile.jurisdiction_code,
        "filing_frequency": profile.filing_frequency,
        "registration_number": profile.registration_number,
        "currency_code": profile.currency_code,
        "sales_tax_name": profile.sales_tax_name,
        "purchase_tax_name": profile.purchase_tax_name,
        "indirect_tax_rate": float(profile.indirect_tax_rate or 0),
        "income_tax_rate": float(profile.income_tax_rate or 0),
        "period_start_month": profile.period_start_month,
    }

@app.route("/finance/tax/jurisdictions")
@jwt_required(optional=True)
def tax_jurisdictions():
    items = [
        {"code": code, "name": meta["name"], "filing_type": meta["filing_type"], "return_labels": meta["return_labels"]}
        for code, meta in TAX_JURISDICTION_LIBRARY.items()
    ]
    return {"items": items}

@app.route("/finance/tax/filing-preview")
@jwt_required()
def tax_filing_preview():
    user, error = _require_user()
    if error:
        return error
    company = Company.query.get(user.default_company_id)
    profile = get_or_create_tax_profile(company)
    summary = calculate_tax_summary(company, profile)
    return {"profile": summary, "status": "preview"}

@app.route("/finance/tax/filings", methods=["POST"])
@jwt_required()
def create_tax_filing():
    user, error = _require_user()
    if error:
        return error
    company = Company.query.get(user.default_company_id)
    profile = get_or_create_tax_profile(company)
    payload = calculate_tax_summary(company, profile)
    filing = {
        "id": generate_document_number(Report, company.id, "TAX"),
        "status": "prepared",
        "filing_type": (request.json or {}).get("filing_type", "indirect_tax"),
        "profile": payload,
    }
    # Persist lightweight filing record as Report for now
    db.session.add(Report(org_id=user.org_id, company_id=company.id, data=json.dumps(filing)))
    db.session.commit()
    return filing, 201

@app.route("/finance/tax/filings/<path:filing_id>/submit", methods=["POST"])
@jwt_required()
def submit_tax_filing(filing_id):
    user, error = _require_user()
    if error:
        return error
    return {"id": filing_id, "status": "submitted"}

@app.route("/analyze", methods=["POST"])
@jwt_required()
def analyze_report():
    user, error = _require_user()
    if error:
        return error
    file = request.files.get("file")
    if not file: return {"error": "no file"}, 400
    
    try:
        df = read_external_dataframe(file)
        normalized = normalize_ledger_dataframe(df)
        result = calc(normalized)
        
        # Save report
        db.session.add(Report(org_id=user.org_id, company_id=user.default_company_id, data=json.dumps(result)))
        org = db.session.get(Organization, user.org_id)
        if org:
            org.usage = int(org.usage or 0) + 1
        db.session.commit()
        
        return result
    except Exception as e:
        return {"error": str(e)}, 400

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)
