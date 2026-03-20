import os
import json
import datetime
import hashlib
import re
import pandas as pd
from functools import wraps
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from pathlib import Path
from io import StringIO

# --- CONFIGURATION ---
app = Flask(__name__)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///saas.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-secret")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)
jwt = JWTManager(app)
bcrypt = Bcrypt(app)
CORS(app)

# --- CONSTANTS ---
VALID_ROLES = {"owner", "admin", "accountant", "manager", "cashier", "member"}
VALID_TAX_FILING_FREQUENCIES = {"monthly", "quarterly", "annual"}
DEFAULT_CHART_OF_ACCOUNTS = [
    {"code": "1000", "name": "Cash", "category": "asset", "subtype": "current", "normal_balance": "debit"},
    {"code": "1100", "name": "Accounts Receivable", "category": "asset", "subtype": "current", "normal_balance": "debit"},
    {"code": "1200", "name": "Inventory Asset", "category": "asset", "subtype": "current", "normal_balance": "debit"},
    {"code": "1250", "name": "Input Tax Receivable", "category": "asset", "subtype": "current", "normal_balance": "debit"},
    {"code": "2000", "name": "Accounts Payable", "category": "liability", "subtype": "current", "normal_balance": "credit"},
    {"code": "2100", "name": "Sales Tax Payable", "category": "liability", "subtype": "current", "normal_balance": "credit"},
    {"code": "3000", "name": "Owner Equity", "category": "equity", "subtype": "equity", "normal_balance": "credit"},
    {"code": "4000", "name": "Sales Revenue", "category": "revenue", "subtype": "operating", "normal_balance": "credit"},
    {"code": "5000", "name": "Cost of Goods Sold", "category": "expense", "subtype": "operating", "normal_balance": "debit"},
    {"code": "5100", "name": "Payroll Expense", "category": "expense", "subtype": "operating", "normal_balance": "debit"},
    {"code": "5200", "name": "Operating Expense", "category": "expense", "subtype": "operating", "normal_balance": "debit"},
]
PLAN_DEFINITIONS = {
    "free": {"code": "free", "max_companies": 1, "ai_enabled": False},
    "pro": {"code": "pro", "max_companies": 5, "ai_enabled": False},
    "ai": {"code": "ai", "max_companies": 25, "ai_enabled": True},
}

# --- UTILS ---
def iso_date(value):
    return value.isoformat() if value else None

def parse_iso_date(raw_value, field_name, default=None):
    if raw_value in {None, ""}:
        return default
    if isinstance(raw_value, (datetime.date, datetime.datetime)):
        return raw_value
    try:
        return datetime.date.fromisoformat(str(raw_value))
    except ValueError:
        raise ValueError(f"{field_name} must be in YYYY-MM-DD format")

def parse_money(value, field_name="amount"):
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be numeric")

def today_utc_date():
    return datetime.datetime.now(datetime.UTC).date()

# --- MODELS ---
class Organization(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    billing_email = db.Column(db.String(120))
    plan_code = db.Column(db.String(20), default="free")
    ai_assistant_enabled = db.Column(db.Boolean, default=False)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    org_id = db.Column(db.Integer, nullable=False)
    default_company_id = db.Column(db.Integer)

class Company(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(120), nullable=False)

class Invoice(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer)
    company_id = db.Column(db.Integer)
    invoice_number = db.Column(db.String(40), unique=True)
    customer_name = db.Column(db.String(120))
    status = db.Column(db.String(20), default="draft")
    issue_date = db.Column(db.Date)
    due_date = db.Column(db.Date)
    subtotal = db.Column(db.Float, default=0.0)
    tax_amount = db.Column(db.Float, default=0.0)
    total_amount = db.Column(db.Float, default=0.0)
    balance_due = db.Column(db.Float, default=0.0)

class InvoiceItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    invoice_id = db.Column(db.Integer)
    description = db.Column(db.String(200))
    quantity = db.Column(db.Float)
    unit_price = db.Column(db.Float)
    amount = db.Column(db.Float)

class CustomerPayment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    invoice_id = db.Column(db.Integer)
    amount = db.Column(db.Float)
    payment_date = db.Column(db.Date)
    company_id = db.Column(db.Integer)

class VendorBill(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer)
    company_id = db.Column(db.Integer)
    bill_number = db.Column(db.String(40), unique=True)
    vendor_name = db.Column(db.String(120))
    status = db.Column(db.String(20), default="draft")
    issue_date = db.Column(db.Date)
    due_date = db.Column(db.Date)
    subtotal = db.Column(db.Float, default=0.0)
    tax_amount = db.Column(db.Float, default=0.0)
    total_amount = db.Column(db.Float, default=0.0)
    balance_due = db.Column(db.Float, default=0.0)

class VendorBillItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    bill_id = db.Column(db.Integer)
    description = db.Column(db.String(200))
    quantity = db.Column(db.Float)
    unit_price = db.Column(db.Float)
    amount = db.Column(db.Float)

class VendorPayment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    bill_id = db.Column(db.Integer)
    amount = db.Column(db.Float)
    payment_date = db.Column(db.Date)
    company_id = db.Column(db.Integer)

class JournalEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer)
    org_id = db.Column(db.Integer)
    entry_number = db.Column(db.String(40))
    entry_date = db.Column(db.Date)
    memo = db.Column(db.String(255))
    source_type = db.Column(db.String(40))
    source_id = db.Column(db.Integer)
    status = db.Column(db.String(20), default="posted")
    created_by = db.Column(db.Integer)

class JournalLine(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    journal_entry_id = db.Column(db.Integer)
    account_id = db.Column(db.Integer)
    debit = db.Column(db.Float, default=0.0)
    credit = db.Column(db.Float, default=0.0)
    line_number = db.Column(db.Integer)
    description = db.Column(db.String(255))

class LedgerAccount(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer)
    org_id = db.Column(db.Integer)
    code = db.Column(db.String(20))
    name = db.Column(db.String(120))
    category = db.Column(db.String(20))
    subtype = db.Column(db.String(40))
    normal_balance = db.Column(db.String(10))
    is_system = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)

class TaxProfile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer)
    org_id = db.Column(db.Integer)
    jurisdiction_code = db.Column(db.String(40), default="generic")
    filing_frequency = db.Column(db.String(20), default="monthly")
    currency_code = db.Column(db.String(8), default="USD")
    indirect_tax_rate = db.Column(db.Float, default=16.0)
    income_tax_rate = db.Column(db.Float, default=30.0)

class Report(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=True)
    data = db.Column(db.Text, nullable=False)

# --- SERVICES ---

def get_user_from_token():
    try:
        user_id = int(get_jwt_identity())
        return db.session.get(User, user_id)
    except:
        return None

def seed_chart_of_accounts(company):
    for template in DEFAULT_CHART_OF_ACCOUNTS:
        if not LedgerAccount.query.filter_by(company_id=company.id, code=template["code"]).first():
            db.session.add(LedgerAccount(
                org_id=company.org_id, company_id=company.id,
                code=template["code"], name=template["name"],
                category=template["category"], subtype=template.get("subtype"),
                normal_balance=template.get("normal_balance", "debit"),
                is_system=True
            ))
    db.session.flush()

def generate_journal_number(company_id):
    count = JournalEntry.query.filter_by(company_id=company_id).count() + 1
    return f"JE-{company_id}-{count:05d}"

def get_company_account(company_id, code):
    return LedgerAccount.query.filter_by(company_id=company_id, code=code).first()

def post_journal_entry(company, user, entry_date, memo, lines, source_type="manual", source_id=None):
    seed_chart_of_accounts(company)
    entry = JournalEntry(
        org_id=company.org_id, company_id=company.id,
        entry_number=generate_journal_number(company.id),
        entry_date=entry_date, memo=memo,
        source_type=source_type, source_id=source_id, created_by=user.id
    )
    db.session.add(entry)
    db.session.flush()
    
    for idx, line in enumerate(lines, 1):
        account = get_company_account(company.id, line["account_code"])
        if not account: continue
        db.session.add(JournalLine(
            journal_entry_id=entry.id, account_id=account.id,
            line_number=idx, description=line.get("description"),
            debit=line.get("debit", 0), credit=line.get("credit", 0)
        ))
    return entry

def post_invoice_journal(invoice, user):
    company = db.session.get(Company, invoice.company_id)
    lines = [
        {"account_code": "1100", "debit": invoice.total_amount, "credit": 0, "description": invoice.customer_name},
        {"account_code": "4000", "debit": 0, "credit": invoice.subtotal, "description": invoice.customer_name}
    ]
    if invoice.tax_amount > 0:
        lines.append({"account_code": "2100", "debit": 0, "credit": invoice.tax_amount, "description": invoice.customer_name})
    post_journal_entry(company, user, invoice.issue_date, f"Invoice {invoice.invoice_number}", lines, "invoice_issue", invoice.id)

def refresh_finance_documents(company_id):
    invoices = Invoice.query.filter_by(company_id=company_id).all()
    for inv in invoices:
        paid = sum(p.amount for p in CustomerPayment.query.filter_by(invoice_id=inv.id).all())
        inv.balance_due = round(inv.total_amount - paid, 2)
        if inv.balance_due <= 0: inv.status = "paid"
        elif paid > 0: inv.status = "partial"
    
    bills = VendorBill.query.filter_by(company_id=company_id).all()
    for bill in bills:
        paid = sum(p.amount for p in VendorPayment.query.filter_by(bill_id=bill.id).all())
        bill.balance_due = round(bill.total_amount - paid, 2)
        if bill.balance_due <= 0: bill.status = "paid"
        elif paid > 0: bill.status = "partial"
    
    db.session.commit()
    return invoices, bills

def calculate_finance_summary(company):
    invoices, bills = refresh_finance_documents(company.id)
    
    sales_tax_due = sum(i.tax_amount for i in invoices if i.status not in ["draft", "cancelled"])
    purchase_tax_credit = sum(b.tax_amount for b in bills if b.status not in ["draft", "cancelled"])
    
    return {
        "open_receivables": sum(i.balance_due for i in invoices if i.balance_due > 0),
        "open_payables": sum(b.balance_due for b in bills if b.balance_due > 0),
        "invoice_count": len(invoices),
        "sales_tax_due": sales_tax_due,
        "purchase_tax_credit": purchase_tax_credit,
        "net_tax_due": sales_tax_due - purchase_tax_credit
    }

def get_or_create_tax_profile(company):
    profile = TaxProfile.query.filter_by(company_id=company.id).first()
    if not profile:
        profile = TaxProfile(company_id=company.id, org_id=company.org_id)
        db.session.add(profile)
        db.session.commit()
    return profile

def calculate_tax_summary(company):
    profile = get_or_create_tax_profile(company)
    invoices, bills = refresh_finance_documents(company.id)
    
    sales_tax = sum(i.tax_amount for i in invoices if i.status not in ["draft", "cancelled"])
    purchase_tax = sum(b.tax_amount for b in bills if b.status not in ["draft", "cancelled"])
    
    return {
        "sales_tax_collected": sales_tax,
        "purchase_tax_credit": purchase_tax,
        "net_tax_due": sales_tax - purchase_tax,
        "jurisdiction_code": profile.jurisdiction_code
    }

# --- ROUTES ---

@app.route("/")
def home():
    return {"status": "FULL SAAS RUNNING"}

@app.route("/register", methods=["POST"])
def register():
    data = request.json
    if User.query.filter_by(email=data["email"]).first():
        return {"error": "email exists"}, 409
    
    org = Organization(name=data["org"], billing_email=data["email"])
    db.session.add(org)
    db.session.flush()
    
    company = Company(org_id=org.id, name=data["org"])
    db.session.add(company)
    db.session.flush()
    
    pw_hash = bcrypt.generate_password_hash(data["password"]).decode()
    user = User(email=data["email"], password=pw_hash, role="owner", org_id=org.id, default_company_id=company.id)
    db.session.add(user)
    db.session.commit()
    seed_chart_of_accounts(company)
    return {"msg": "registered"}

@app.route("/login", methods=["POST"])
def login():
    data = request.json
    user = User.query.filter_by(email=data["email"]).first()
    if user and bcrypt.check_password_hash(user.password, data["password"]):
        return {"token": create_access_token(identity=str(user.id))}
    return {"error": "invalid"}, 401

@app.route("/dashboard")
@jwt_required()
def dashboard():
    user = get_user_from_token()
    company = Company.query.get(user.default_company_id)
    return calculate_finance_summary(company)

@app.route("/finance/invoices", methods=["GET", "POST"])
@jwt_required()
def handle_invoices():
    user = get_user_from_token()
    company = Company.query.get(user.default_company_id)
    
    if request.method == "GET":
        invoices, _ = refresh_finance_documents(company.id)
        return {"items": [{"id": i.id, "number": i.invoice_number, "customer": i.customer_name, "total": i.total_amount, "balance": i.balance_due, "status": i.status} for i in invoices]}
    
    data = request.json
    count = Invoice.query.filter_by(company_id=company.id).count() + 1
    subtotal = sum(i["quantity"] * i["unit_price"] for i in data["items"])
    tax_rate = data.get("tax_rate", 0)
    tax_amount = round(subtotal * (tax_rate / 100), 2)
    
    invoice = Invoice(
        org_id=user.org_id, company_id=company.id,
        invoice_number=f"INV-{company.id}-{count:05d}",
        customer_name=data["customer_name"], status="sent",
        issue_date=parse_iso_date(data.get("issue_date"), "date", today_utc_date()),
        subtotal=subtotal, tax_amount=tax_amount, total_amount=subtotal + tax_amount, balance_due=subtotal + tax_amount
    )
    db.session.add(invoice)
    db.session.flush()
    
    for item in data["items"]:
        db.session.add(InvoiceItem(invoice_id=invoice.id, description=item["description"], quantity=item["quantity"], unit_price=item["unit_price"], amount=item["quantity"]*item["unit_price"]))
    
    post_invoice_journal(invoice, user)
    db.session.commit()
    return {"msg": "created", "id": invoice.id}

@app.route("/finance/accounting/overview")
@jwt_required()
def accounting_overview():
    user = get_user_from_token()
    company = Company.query.get(user.default_company_id)
    entries = JournalEntry.query.filter_by(company_id=company.id).all()
    accounts = LedgerAccount.query.filter_by(company_id=company.id).all()
    
    balances = {a.code: 0.0 for a in accounts}
    lines = db.session.query(JournalLine).join(JournalEntry).filter(JournalEntry.company_id == company.id).all()
    for l in lines:
        acc = db.session.get(LedgerAccount, l.account_id)
        if acc:
            balances[acc.code] += (l.debit - l.credit) if acc.normal_balance == "debit" else (l.credit - l.debit)
            
    return {
        "journal_count": len(entries),
        "trial_balance": [{"code": k, "balance": v} for k, v in balances.items() if v != 0]
    }

@app.route("/finance/tax/summary")
@jwt_required()
def tax_summary():
    user = get_user_from_token()
    company = Company.query.get(user.default_company_id)
    return calculate_tax_summary(company)

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)
