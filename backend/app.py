from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import jwt_required, create_access_token, get_jwt_identity
from extensions import db, jwt, bcrypt
from models import *
from services.accounting_engine import post_journal_entry, get_company_account, serialize_journal_entry
from services.invoice_service import create_invoice, serialize_invoice, apply_customer_payment
from services.bill_service import create_bill, serialize_bill, apply_vendor_payment
from services.reporting_service import (
    build_accounting_overview, build_trial_balance, build_inventory_summary, 
    build_workforce_overview, build_project_summary, aggregate_org_reports
)
from services.finance_service import calculate_finance_summary, calculate_tax_summary, get_or_create_tax_profile
from services.ai_cfo_service import build_ai_cfo_overview, answer_ai_cfo_question
from services.ingestion_service import read_external_dataframe, normalize_ledger_dataframe, calc
from services.common import refresh_finance_documents, generate_document_number
from middleware import get_user_from_token, roles_required, plan_required
from utils import parse_money, parse_iso_date, today_utc_date, iso_date
from constants import *
import os
import datetime
import json

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

# --- Routes ---

@app.route("/")
def home():
    return {"status": "FULL SAAS RUNNING"}

@app.route("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Auth + identity
# ---------------------------------------------------------------------------

def _require_user():
    user = get_user_from_token()
    if not user:
        return None, ({"error": "invalid token"}, 401)
    return user, None


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    
    user = User.query.filter_by(email=email).first()
    if not user or not bcrypt.check_password_hash(user.password, password):
        return {"error": "invalid credentials"}, 401
    
    token = create_access_token(identity=str(user.id))
    return {"token": token}

@app.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password")
    org_name = data.get("org")
    business_type = (data.get("business_type") or "sole_proprietor").strip()
    partner_names = data.get("partner_names") or []

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
        db.session.add(CompanyOnboardingState(company_id=company.id, is_configured=True, configured_at=datetime.datetime.now(datetime.UTC)))
    
    user = User(email=email, password=hashed, role="owner", org_id=org.id, default_company_id=company.id)
    db.session.add(user)
    db.session.commit()
    
    return {"msg": "registered"}

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
        if len(owners) <= 1:
            return {"error": "create another owner before deleting this account"}, 400

        db.session.delete(user)
        db.session.commit()
        return {"msg": "account deleted"}

    org = db.session.get(Organization, user.org_id)
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "org_id": user.org_id,
        "default_company_id": user.default_company_id,
        "plan_code": org.plan_code if org else "free",
    }


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

@app.route("/companies", methods=["GET"])
@jwt_required()
def list_companies():
    user, error = _require_user()
    if error:
        return error
    companies = Company.query.filter_by(org_id=user.org_id).all()
    return [ _serialize_company(c) for c in companies ]

@app.route("/companies/<int:company_id>/setup", methods=["PUT"])
@jwt_required()
def setup_company(company_id):
    user, error = _require_user()
    if error:
        return error

    company = Company.query.filter_by(id=company_id, org_id=user.org_id).first()
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
    company = Company.query.get(user.default_company_id)
    return build_accounting_overview(company)

@app.route("/ai-cfo/overview")
@jwt_required()
def ai_cfo():
    user, error = _require_user()
    if error:
        return error
    company = Company.query.get(user.default_company_id)
    return build_ai_cfo_overview(company)

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
