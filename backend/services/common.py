from utils import parse_money, today_utc_date
from models import Invoice, VendorBill, CustomerPayment, VendorPayment, InvoiceItem, VendorBillItem
from extensions import db

def normalize_document_items(items, document_name):
    if not isinstance(items, list) or not items:
        raise ValueError(f"{document_name} requires at least one line item")

    normalized_items = []
    subtotal = 0.0
    for index, item in enumerate(items, start=1):
        payload = item or {}
        description = (payload.get("description") or f"Line {index}").strip()
        quantity = parse_money(payload.get("quantity", 0), f"line {index} quantity")
        unit_price = parse_money(payload.get("unit_price", 0), f"line {index} unit_price")
        if quantity <= 0:
            raise ValueError(f"line {index} quantity must be greater than 0")
        if unit_price < 0:
            raise ValueError(f"line {index} unit_price cannot be negative")

        amount = round(quantity * unit_price, 2)
        subtotal += amount
        normalized_items.append(
            {
                "description": description,
                "quantity": quantity,
                "unit_price": unit_price,
                "amount": amount,
            }
        )

    return normalized_items, round(subtotal, 2)

def generate_document_number(model_class, company_id, prefix):
    next_number = model_class.query.filter_by(company_id=company_id).count() + 1
    return f"{prefix}-{int(company_id):03d}-{next_number:05d}"

def total_customer_payments(invoice_id):
    rows = CustomerPayment.query.filter_by(invoice_id=invoice_id).all()
    return round(sum(float(row.amount or 0) for row in rows), 2)

def total_vendor_payments(bill_id):
    rows = VendorPayment.query.filter_by(bill_id=bill_id).all()
    return round(sum(float(row.amount or 0) for row in rows), 2)

def refresh_invoice_status(invoice):
    previous_status = invoice.status
    previous_balance = round(float(invoice.balance_due or 0), 2)
    payments_total = total_customer_payments(invoice.id)
    invoice.balance_due = round(max(0.0, float(invoice.total_amount or 0) - payments_total), 2)
    today = today_utc_date()

    if previous_status == "cancelled":
        return previous_status != invoice.status or previous_balance != invoice.balance_due

    if invoice.balance_due <= 0.009:
        invoice.balance_due = 0.0
        invoice.status = "paid"
    elif payments_total > 0:
        invoice.status = "partial"
    elif invoice.status == "draft":
        invoice.status = "draft"
    elif invoice.due_date and invoice.due_date < today:
        invoice.status = "overdue"
    else:
        invoice.status = "sent"

    return previous_status != invoice.status or previous_balance != invoice.balance_due

def refresh_bill_status(bill):
    previous_status = bill.status
    previous_balance = round(float(bill.balance_due or 0), 2)
    payments_total = total_vendor_payments(bill.id)
    bill.balance_due = round(max(0.0, float(bill.total_amount or 0) - payments_total), 2)
    today = today_utc_date()

    if previous_status == "cancelled":
        return previous_status != bill.status or previous_balance != bill.balance_due

    if bill.balance_due <= 0.009:
        bill.balance_due = 0.0
        bill.status = "paid"
    elif payments_total > 0:
        bill.status = "partial"
    elif bill.status == "draft":
        bill.status = "draft"
    elif bill.due_date and bill.due_date < today:
        bill.status = "overdue"
    else:
        bill.status = "approved"

    return previous_status != bill.status or previous_balance != bill.balance_due

def refresh_finance_documents(company_id):
    dirty = False
    invoices = Invoice.query.filter_by(company_id=company_id).all()
    bills = VendorBill.query.filter_by(company_id=company_id).all()

    for invoice in invoices:
        dirty = refresh_invoice_status(invoice) or dirty
    for bill in bills:
        dirty = refresh_bill_status(bill) or dirty

    if dirty:
        db.session.commit()

    return invoices, bills

def invoice_items_for(invoice_id):
    return InvoiceItem.query.filter_by(invoice_id=invoice_id).order_by(InvoiceItem.id.asc()).all()

def bill_items_for(bill_id):
    return VendorBillItem.query.filter_by(bill_id=bill_id).order_by(VendorBillItem.id.asc()).all()

def serialize_line_items(items):
    return [
        {
            "id": item.id,
            "description": item.description,
            "quantity": round(float(item.quantity or 0), 2),
            "unit_price": round(float(item.unit_price or 0), 2),
            "amount": round(float(item.amount or 0), 2),
        }
        for item in items
    ]
