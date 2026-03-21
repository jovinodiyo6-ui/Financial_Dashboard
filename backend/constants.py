VALID_ROLES = {"owner", "admin", "accountant", "manager", "cashier", "member"}
VALID_MEMBERSHIP_ROLES = set(VALID_ROLES)
INVOICE_OPEN_STATUSES = {"draft", "sent", "partial", "overdue"}
BILL_OPEN_STATUSES = {"draft", "approved", "partial", "overdue"}
INVOICE_SETTLED_STATUSES = {"paid", "cancelled"}
BILL_SETTLED_STATUSES = {"paid", "cancelled"}
VALID_TAX_FILING_FREQUENCIES = {"monthly", "quarterly", "annual"}
VALID_ACCOUNT_CATEGORIES = {"asset", "liability", "equity", "revenue", "expense"}
VALID_PAYMENT_RAILS = {"ach", "wire", "card", "check", "mobile_money"}
VALID_RECONCILIATION_DIRECTIONS = {"any", "inflow", "outflow"}
VALID_RECONCILIATION_ACTIONS = {"suggest_account", "flag_exception"}
VALID_TAX_FILING_TYPES = {"indirect_tax", "income_tax", "payroll_tax"}
VALID_PAY_TYPES = {"hourly", "salary"}
VALID_INTEGRATION_STATUSES = {"available", "connected", "attention"}
VALID_BUSINESS_TYPES = {"sole_proprietor", "partnership", "manufacturing", "company"}
JOB_TYPES = {"finance_digest", "tax_filing_package", "accountant_brief"}
JOB_TERMINAL_STATUSES = {"completed", "failed"}

DEFAULT_CHART_OF_ACCOUNTS = [
    {"code": "1000", "name": "Cash", "category": "asset", "subtype": "current", "normal_balance": "debit"},
    {"code": "1100", "name": "Accounts Receivable", "category": "asset", "subtype": "current", "normal_balance": "debit"},
    {"code": "1200", "name": "Inventory Asset", "category": "asset", "subtype": "current", "normal_balance": "debit"},
    {"code": "1250", "name": "Input Tax Receivable", "category": "asset", "subtype": "current", "normal_balance": "debit"},
    {"code": "1300", "name": "Prepaid Expenses", "category": "asset", "subtype": "current", "normal_balance": "debit"},
    {"code": "1500", "name": "Property and Equipment", "category": "asset", "subtype": "non-current", "normal_balance": "debit"},
    {"code": "2000", "name": "Accounts Payable", "category": "liability", "subtype": "current", "normal_balance": "credit"},
    {"code": "2100", "name": "Sales Tax Payable", "category": "liability", "subtype": "current", "normal_balance": "credit"},
    {"code": "2200", "name": "Payroll Withholding Payable", "category": "liability", "subtype": "current", "normal_balance": "credit"},
    {"code": "2300", "name": "Accrued Expenses", "category": "liability", "subtype": "current", "normal_balance": "credit"},
    {"code": "2400", "name": "Contractor Payable", "category": "liability", "subtype": "current", "normal_balance": "credit"},
    {"code": "3000", "name": "Owner Equity", "category": "equity", "subtype": "equity", "normal_balance": "credit"},
    {"code": "3100", "name": "Retained Earnings", "category": "equity", "subtype": "equity", "normal_balance": "credit"},
    {"code": "4000", "name": "Sales Revenue", "category": "revenue", "subtype": "operating", "normal_balance": "credit"},
    {"code": "4100", "name": "Service Revenue", "category": "revenue", "subtype": "operating", "normal_balance": "credit"},
    {"code": "5000", "name": "Cost of Goods Sold", "category": "expense", "subtype": "operating", "normal_balance": "debit"},
    {"code": "5100", "name": "Payroll Expense", "category": "expense", "subtype": "operating", "normal_balance": "debit"},
    {"code": "5200", "name": "Operating Expense", "category": "expense", "subtype": "operating", "normal_balance": "debit"},
    {"code": "5300", "name": "Tax Expense", "category": "expense", "subtype": "other", "normal_balance": "debit"},
    {"code": "5400", "name": "Mileage Reimbursement Expense", "category": "expense", "subtype": "operating", "normal_balance": "debit"},
    {"code": "5500", "name": "Software and SaaS Expense", "category": "expense", "subtype": "operating", "normal_balance": "debit"},
    {"code": "5600", "name": "Contractor Expense", "category": "expense", "subtype": "operating", "normal_balance": "debit"},
]

INTEGRATION_CATALOG = [
    {"provider": "plaid", "category": "banking", "description": "Direct bank feeds and transaction sync."},
    {"provider": "stripe", "category": "payments", "description": "Card payments and customer collections."},
    {"provider": "google_drive", "category": "documents", "description": "Shared workpapers, invoices, and filing packs."},
    {"provider": "slack", "category": "collaboration", "description": "Approval alerts, daily cash, and close notifications."},
    {"provider": "power_bi", "category": "analytics", "description": "Publish accountant and board reporting datasets."},
]

TAX_JURISDICTION_LIBRARY = {
    "generic": {
        "name": "Generic Indirect Tax",
        "filing_type": "indirect_tax",
        "return_labels": ["taxable_sales", "tax_collected", "tax_credit", "net_tax_due"],
    },
    "ke-vat": {
        "name": "Kenya VAT",
        "filing_type": "indirect_tax",
        "return_labels": ["vatable_sales", "output_vat", "input_vat", "vat_payable"],
    },
    "us-sales-tax": {
        "name": "United States Sales Tax",
        "filing_type": "indirect_tax",
        "return_labels": ["taxable_sales", "sales_tax_collected", "exempt_sales", "net_sales_tax_due"],
    },
    "uk-vat": {
        "name": "United Kingdom VAT",
        "filing_type": "indirect_tax",
        "return_labels": ["vat_due_sales", "vat_reclaimed", "net_vat_due", "total_sales_ex_vat"],
    },
    "ca-gst": {
        "name": "Canada GST/HST",
        "filing_type": "indirect_tax",
        "return_labels": ["gst_hst_collected", "input_tax_credits", "net_gst_hst_due", "taxable_supplies"],
    },
    "au-gst": {
        "name": "Australia GST",
        "filing_type": "indirect_tax",
        "return_labels": ["gst_collected", "gst_credits", "net_gst_due", "taxable_sales"],
    },
}

PLAN_DEFINITIONS = {
    "free": {
        "code": "free",
        "label": "Starter",
        "price_monthly": 0,
        "local_price_kes": 0,
        "summary": "For students, freelancers, and first-time founders building habits before they need advanced finance operations.",
        "max_companies": 1,
        "ai_enabled": False,
        "features": ["1 company", "core accounting", "manual imports"],
    },
    "pro": {
        "code": "pro",
        "label": "Pro",
        "price_monthly": 20,
        "local_price_kes": 900,
        "summary": "For serious small businesses that need workflow automation, exports, bank feeds, and deeper operating control.",
        "max_companies": 5,
        "ai_enabled": False,
        "features": ["5 companies", "team workflows", "automations", "async jobs"],
    },
    "ai": {
        "code": "ai",
        "label": "AI CFO",
        "price_monthly": 50,
        "local_price_kes": 1500,
        "summary": "For owners who want proactive alerts, cash forecasting, and an always-available finance copilot.",
        "max_companies": 25,
        "ai_enabled": True,
        "features": ["25 companies", "AI CFO chat", "proactive alerts", "scenario forecasting"],
    },
}
