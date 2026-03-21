import os
from extensions import db
from models import TaxProfile, CustomerPayment, VendorPayment, BankFeedTransaction
from services.common import refresh_finance_documents
from utils import today_utc_date, parse_money

def get_or_create_tax_profile(company):
    profile = TaxProfile.query.filter_by(company_id=company.id).first()
    if profile:
        return profile

    profile = TaxProfile(
        org_id=company.org_id,
        company_id=company.id,
        jurisdiction_code=(os.getenv("DEFAULT_TAX_JURISDICTION", "generic") or "generic").strip().lower(),
        filing_frequency=(os.getenv("DEFAULT_TAX_FILING_FREQUENCY", "monthly") or "monthly").strip().lower(),
        currency_code=(os.getenv("DEFAULT_TAX_CURRENCY", "USD") or "USD").strip().upper(),
        sales_tax_name=(os.getenv("DEFAULT_SALES_TAX_NAME", "Sales Tax") or "Sales Tax").strip(),
        purchase_tax_name=(os.getenv("DEFAULT_PURCHASE_TAX_NAME", "Purchase Tax Credit") or "Purchase Tax Credit").strip(),
        indirect_tax_rate=float(os.getenv("DEFAULT_INDIRECT_TAX_RATE", "16") or 16),
        income_tax_rate=float(os.getenv("DEFAULT_INCOME_TAX_RATE", "30") or 30),
        period_start_month=int(os.getenv("DEFAULT_TAX_PERIOD_START_MONTH", "1") or 1),
    )
    db.session.add(profile)
    db.session.commit()
    return profile

def calculate_finance_summary(company):
    invoices, bills = refresh_finance_documents(company.id)
    today = today_utc_date()

    invoice_payments = CustomerPayment.query.filter_by(company_id=company.id).all()
    bill_payments = VendorPayment.query.filter_by(company_id=company.id).all()
    bank_transactions = BankFeedTransaction.query.filter_by(company_id=company.id).all()

    open_receivables = sum(invoice.balance_due for invoice in invoices if invoice.status in {"sent", "partial", "overdue"})
    overdue_receivables = sum(invoice.balance_due for invoice in invoices if invoice.status == "overdue")
    open_payables = sum(bill.balance_due for bill in bills if bill.status in {"approved", "partial", "overdue"})
    overdue_payables = sum(bill.balance_due for bill in bills if bill.status == "overdue")

    collected_this_month = sum(
        payment.amount
        for payment in invoice_payments
        if payment.payment_date and payment.payment_date.year == today.year and payment.payment_date.month == today.month
    )
    paid_this_month = sum(
        payment.amount
        for payment in bill_payments
        if payment.payment_date and payment.payment_date.year == today.year and payment.payment_date.month == today.month
    )

    sales_tax_due = sum(invoice.tax_amount for invoice in invoices if invoice.status not in {"draft", "cancelled"})
    purchase_tax_credit = sum(bill.tax_amount for bill in bills if bill.status not in {"draft", "cancelled"})
    revenue = sum(float(invoice.subtotal or 0) for invoice in invoices if invoice.status not in {"draft", "cancelled"})
    expenses = sum(float(bill.subtotal or 0) for bill in bills if bill.status not in {"draft", "cancelled"})
    net_profit = revenue - expenses

    return {
        "revenue": round(revenue, 2),
        "expenses": round(expenses, 2),
        "net_profit": round(net_profit, 2),
        "open_receivables": round(open_receivables, 2),
        "overdue_receivables": round(overdue_receivables, 2),
        "open_payables": round(open_payables, 2),
        "overdue_payables": round(overdue_payables, 2),
        "collected_this_month": round(collected_this_month, 2),
        "paid_this_month": round(paid_this_month, 2),
        "invoice_count": len(invoices),
        "bill_count": len(bills),
        "overdue_invoice_count": sum(1 for invoice in invoices if invoice.status == "overdue"),
        "overdue_bill_count": sum(1 for bill in bills if bill.status == "overdue"),
        "bank_unmatched_count": sum(1 for transaction in bank_transactions if transaction.status == "unmatched"),
        "bank_net_flow": round(sum(float(transaction.amount or 0) for transaction in bank_transactions), 2),
        "sales_tax_due": round(sales_tax_due, 2),
        "purchase_tax_credit": round(purchase_tax_credit, 2),
        "net_tax_due": round(sales_tax_due - purchase_tax_credit, 2),
    }

def calculate_tax_summary(company, profile=None):
    profile = profile or get_or_create_tax_profile(company)
    invoices, bills = refresh_finance_documents(company.id)
    sales_tax_collected = sum(invoice.tax_amount for invoice in invoices if invoice.status not in {"draft", "cancelled"})
    purchase_tax_credit = sum(bill.tax_amount for bill in bills if bill.status not in {"draft", "cancelled"})
    taxable_profit = sum(invoice.subtotal for invoice in invoices if invoice.status not in {"draft", "cancelled"}) - sum(
        bill.subtotal for bill in bills if bill.status not in {"draft", "cancelled"}
    )
    estimated_income_tax = max(0.0, taxable_profit) * (float(profile.income_tax_rate or 0) / 100)
    return {
        "jurisdiction_code": profile.jurisdiction_code,
        "filing_frequency": profile.filing_frequency,
        "currency_code": profile.currency_code,
        "sales_tax_name": profile.sales_tax_name,
        "purchase_tax_name": profile.purchase_tax_name,
        "income_tax_rate": round(float(profile.income_tax_rate or 0), 2),
        "indirect_tax_rate": round(float(profile.indirect_tax_rate or 0), 2),
        "sales_tax_collected": round(sales_tax_collected, 2),
        "purchase_tax_credit": round(purchase_tax_credit, 2),
        "net_tax_due": round(sales_tax_collected - purchase_tax_credit, 2),
        "taxable_profit": round(taxable_profit, 2),
        "estimated_income_tax": round(estimated_income_tax, 2),
        "effective_tax_rate": (float(profile.income_tax_rate or 0) / 100) if taxable_profit > 0 else 0.0,
    }
