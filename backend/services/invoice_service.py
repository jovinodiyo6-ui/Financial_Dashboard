from extensions import db
from models import Invoice, InvoiceItem, CustomerPayment, Company
from services.common import (
    generate_document_number,
    normalize_document_items,
    refresh_invoice_status,
    invoice_items_for,
    serialize_line_items,
)
from services.accounting_engine import post_operational_entry
from utils import parse_iso_date, parse_money, today_utc_date, iso_date
import datetime

def create_invoice(user, company, data):
    customer_name = (data.get("customer_name") or "").strip()
    customer_email = (data.get("customer_email") or "").strip().lower() or None
    if not customer_name:
        raise ValueError("customer_name is required")

    issue_date = parse_iso_date(data.get("issue_date"), "issue_date", today_utc_date())
    due_date = parse_iso_date(data.get("due_date"), "due_date", issue_date + datetime.timedelta(days=14))
    tax_rate = parse_money(data.get("tax_rate", 0), "tax_rate")
    items, subtotal = normalize_document_items(data.get("items"), "invoice")

    requested_status = (data.get("status") or "draft").strip().lower()
    if requested_status not in {"draft", "sent"}:
        raise ValueError("invoice status must be draft or sent")

    tax_amount = round(subtotal * (tax_rate / 100), 2)
    total_amount = round(subtotal + tax_amount, 2)
    invoice = Invoice(
        org_id=user.org_id,
        company_id=company.id,
        invoice_number=generate_document_number(Invoice, company.id, "INV"),
        customer_name=customer_name,
        customer_email=customer_email,
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
        last_sent_at=datetime.datetime.now(datetime.UTC) if requested_status == "sent" else None,
    )
    db.session.add(invoice)
    db.session.flush()

    for item in items:
        db.session.add(
            InvoiceItem(
                invoice_id=invoice.id,
                description=item["description"],
                quantity=item["quantity"],
                unit_price=item["unit_price"],
                amount=item["amount"],
            )
        )

    refresh_invoice_status(invoice)
    if requested_status == "sent":
        post_invoice_journal(invoice, user)

    return invoice

def post_invoice_journal(invoice, user):
    journal_lines = [
        {"account_code": "1100", "debit": float(invoice.total_amount or 0), "credit": 0, "description": invoice.customer_name},
        {"account_code": "4000", "debit": 0, "credit": float(invoice.subtotal or 0), "description": invoice.customer_name},
    ]
    if float(invoice.tax_amount or 0) > 0:
        journal_lines.append({"account_code": "2100", "debit": 0, "credit": float(invoice.tax_amount or 0), "description": invoice.customer_name})
    
    post_operational_entry(
        db.session.get(Company, invoice.company_id),
        user,
        source_type="invoice_issue",
        source_id=invoice.id,
        memo=f"Invoice {invoice.invoice_number} issued",
        lines=journal_lines,
        entry_date=invoice.issue_date,
        reference=invoice.invoice_number,
    )

def apply_customer_payment(invoice, amount, payment_date, reference="", source="manual", notes="", bank_transaction_id=None):
    if amount <= 0:
        raise ValueError("payment amount must be greater than 0")
    refresh_invoice_status(invoice)
    if amount - float(invoice.balance_due or 0) > 0.01:
        raise ValueError("payment exceeds invoice balance")

    payment = CustomerPayment(
        org_id=invoice.org_id,
        company_id=invoice.company_id,
        invoice_id=invoice.id,
        amount=round(amount, 2),
        reference=(reference or "").strip() or None,
        source=source,
        notes=notes or None,
        payment_date=payment_date,
        bank_transaction_id=bank_transaction_id,
    )
    db.session.add(payment)
    db.session.flush()
    refresh_invoice_status(invoice)
    return payment

def serialize_invoice(invoice):
    paid_amount = round(float(invoice.total_amount or 0) - float(invoice.balance_due or 0), 2)
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "customer_name": invoice.customer_name,
        "customer_email": invoice.customer_email,
        "status": invoice.status,
        "issue_date": iso_date(invoice.issue_date),
        "due_date": iso_date(invoice.due_date),
        "subtotal": round(float(invoice.subtotal or 0), 2),
        "tax_rate": round(float(invoice.tax_rate or 0), 2),
        "tax_amount": round(float(invoice.tax_amount or 0), 2),
        "total_amount": round(float(invoice.total_amount or 0), 2),
        "balance_due": round(float(invoice.balance_due or 0), 2),
        "paid_amount": paid_amount,
        "notes": invoice.notes or "",
        "overdue": invoice.status == "overdue",
        "items": serialize_line_items(invoice_items_for(invoice.id)),
    }
