from extensions import db
from models import VendorBill, VendorBillItem, VendorPayment, VendorProfile, Company
from services.common import (
    generate_document_number,
    normalize_document_items,
    refresh_bill_status,
    bill_items_for,
    serialize_line_items,
)
from services.accounting_engine import post_operational_entry
from utils import parse_iso_date, parse_money, today_utc_date, iso_date
import datetime

def get_or_create_vendor_profile(company, vendor_name, defaults=None):
    normalized_name = (vendor_name or "").strip()
    if not normalized_name:
        raise ValueError("vendor_name is required")
    vendor = VendorProfile.query.filter_by(company_id=company.id, vendor_name=normalized_name).first()
    if vendor:
        return vendor

    defaults = defaults or {}
    vendor = VendorProfile(
        org_id=company.org_id,
        company_id=company.id,
        vendor_name=normalized_name,
        email=(defaults.get("email") or "").strip().lower() or None,
        tax_id=(defaults.get("tax_id") or "").strip() or None,
        default_payment_rail=(defaults.get("default_payment_rail") or "ach").strip().lower(),
        remittance_reference=(defaults.get("remittance_reference") or "").strip() or None,
        bank_last4=(defaults.get("bank_last4") or "").strip()[-4:] or None,
        is_1099_eligible=defaults.get("is_1099_eligible", False),
        tax_form_type=(defaults.get("tax_form_type") or "1099-NEC").strip().upper(),
        tin_status=(defaults.get("tin_status") or "pending").strip().lower(),
    )
    db.session.add(vendor)
    db.session.flush()
    return vendor

def create_bill(user, company, data):
    vendor_name = (data.get("vendor_name") or "").strip()
    if not vendor_name:
        raise ValueError("vendor_name is required")

    issue_date = parse_iso_date(data.get("issue_date"), "issue_date", today_utc_date())
    due_date = parse_iso_date(data.get("due_date"), "due_date", issue_date + datetime.timedelta(days=30))
    tax_rate = parse_money(data.get("tax_rate", 0), "tax_rate")
    items, subtotal = normalize_document_items(data.get("items"), "bill")

    requested_status = (data.get("status") or "draft").strip().lower()
    if requested_status not in {"draft", "approved"}:
        raise ValueError("bill status must be draft or approved")

    tax_amount = round(subtotal * (tax_rate / 100), 2)
    total_amount = round(subtotal + tax_amount, 2)
    get_or_create_vendor_profile(
        company,
        vendor_name,
        {
            "email": data.get("vendor_email"),
            "tax_id": data.get("vendor_tax_id"),
            "default_payment_rail": data.get("default_payment_rail"),
            "is_1099_eligible": data.get("is_1099_eligible"),
            "tax_form_type": data.get("tax_form_type"),
            "tin_status": data.get("tin_status"),
        },
    )
    bill = VendorBill(
        org_id=user.org_id,
        company_id=company.id,
        bill_number=generate_document_number(VendorBill, company.id, "BILL"),
        vendor_name=vendor_name,
        status=requested_status,
        issue_date=issue_date,
        due_date=due_date,
        subtotal=subtotal,
        tax_rate=tax_rate,
        tax_amount=tax_amount,
        total_amount=total_amount,
        balance_due=total_amount,
        notes=(data.get("notes") or "").strip() or None,
        created_by=user.id,
        approved_at=datetime.datetime.now(datetime.UTC) if requested_status == "approved" else None,
    )
    db.session.add(bill)
    db.session.flush()

    for item in items:
        db.session.add(
            VendorBillItem(
                bill_id=bill.id,
                description=item["description"],
                quantity=item["quantity"],
                unit_price=item["unit_price"],
                amount=item["amount"],
            )
        )

    refresh_bill_status(bill)
    if requested_status == "approved":
        post_bill_journal(bill, user)

    return bill

def post_bill_journal(bill, user):
    journal_lines = [
        {"account_code": "5200", "debit": float(bill.subtotal or 0), "credit": 0, "description": bill.vendor_name},
        {"account_code": "2000", "debit": 0, "credit": float(bill.total_amount or 0), "description": bill.vendor_name},
    ]
    if float(bill.tax_amount or 0) > 0:
        journal_lines.insert(1, {"account_code": "1250", "debit": float(bill.tax_amount or 0), "credit": 0, "description": bill.vendor_name})
    
    post_operational_entry(
        db.session.get(Company, bill.company_id),
        user,
        source_type="bill_issue",
        source_id=bill.id,
        memo=f"Vendor bill {bill.bill_number} approved",
        lines=journal_lines,
        entry_date=bill.issue_date,
        reference=bill.bill_number,
    )

def apply_vendor_payment(bill, amount, payment_date, reference="", source="manual", notes="", bank_transaction_id=None):
    if amount <= 0:
        raise ValueError("payment amount must be greater than 0")
    refresh_bill_status(bill)
    if amount - float(bill.balance_due or 0) > 0.01:
        raise ValueError("payment exceeds bill balance")

    payment = VendorPayment(
        org_id=bill.org_id,
        company_id=bill.company_id,
        bill_id=bill.id,
        amount=round(amount, 2),
        reference=(reference or "").strip() or None,
        source=source,
        notes=notes or None,
        payment_date=payment_date,
        bank_transaction_id=bank_transaction_id,
    )
    db.session.add(payment)
    db.session.flush()
    refresh_bill_status(bill)
    return payment

def serialize_bill(bill):
    paid_amount = round(float(bill.total_amount or 0) - float(bill.balance_due or 0), 2)
    return {
        "id": bill.id,
        "bill_number": bill.bill_number,
        "vendor_name": bill.vendor_name,
        "status": bill.status,
        "issue_date": iso_date(bill.issue_date),
        "due_date": iso_date(bill.due_date),
        "subtotal": round(float(bill.subtotal or 0), 2),
        "tax_rate": round(float(bill.tax_rate or 0), 2),
        "tax_amount": round(float(bill.tax_amount or 0), 2),
        "total_amount": round(float(bill.total_amount or 0), 2),
        "balance_due": round(float(bill.balance_due or 0), 2),
        "paid_amount": paid_amount,
        "notes": bill.notes or "",
        "overdue": bill.status == "overdue",
        "items": serialize_line_items(bill_items_for(bill.id)),
    }
