from extensions import db
import datetime

class Organization(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    usage = db.Column(db.Integer, default=0)
    billing_email = db.Column(db.String(120), nullable=True)
    plan_code = db.Column(db.String(20), nullable=False, default="free")
    subscription_status = db.Column(db.String(20), nullable=False, default="free")
    stripe_customer_id = db.Column(db.String(120), nullable=True)
    stripe_subscription_id = db.Column(db.String(120), nullable=True)
    max_companies = db.Column(db.Integer, nullable=False, default=1)
    ai_assistant_enabled = db.Column(db.Boolean, nullable=False, default=False)
    subscription_updated_at = db.Column(db.DateTime(timezone=True), nullable=True)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    org_id = db.Column(db.Integer, nullable=False)
    default_company_id = db.Column(db.Integer, nullable=True)


class Report(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=True)
    data = db.Column(db.Text, nullable=False)


class Company(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    business_type = db.Column(db.String(50), nullable=False, default="sole_proprietor")


class UserCompanyMembership(db.Model):
    __table_args__ = (db.UniqueConstraint("user_id", "company_id", name="uq_user_company_membership"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    role = db.Column(db.String(20), nullable=False, default="member")
    is_default = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class CompanyPartner(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    display_order = db.Column(db.Integer, nullable=False, default=1)


class CompanyOnboardingState(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, unique=True, nullable=False)
    is_configured = db.Column(db.Boolean, nullable=False, default=False)
    configured_at = db.Column(db.DateTime(timezone=True), nullable=True)


class APIKey(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    key_hash = db.Column(db.String(200), nullable=False)


class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=True)
    action = db.Column(db.String(200), nullable=False)
    time = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
    )


class ActiveSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, unique=True, nullable=False)
    last_seen = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class PasswordResetToken(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    token_hash = db.Column(db.String(64), unique=True, nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    used_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class BackgroundJob(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    requested_by = db.Column(db.Integer, nullable=False)
    job_type = db.Column(db.String(40), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="queued")
    provider = db.Column(db.String(20), nullable=False, default="inline")
    payload_json = db.Column(db.Text, nullable=True)
    result_json = db.Column(db.Text, nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class BillingPaymentRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    requested_by = db.Column(db.Integer, nullable=False)
    provider = db.Column(db.String(20), nullable=False, default="mpesa")
    plan_code = db.Column(db.String(20), nullable=False)
    currency_code = db.Column(db.String(8), nullable=False, default="KES")
    amount = db.Column(db.Float, nullable=False, default=0.0)
    phone_number = db.Column(db.String(30), nullable=True)
    external_reference = db.Column(db.String(120), nullable=True)
    merchant_request_id = db.Column(db.String(120), nullable=True)
    checkout_request_id = db.Column(db.String(120), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="pending")
    provider_response_json = db.Column(db.Text, nullable=True)
    callback_payload_json = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        onupdate=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class Invoice(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    invoice_number = db.Column(db.String(40), nullable=False, unique=True)
    customer_name = db.Column(db.String(120), nullable=False)
    customer_email = db.Column(db.String(120), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="draft")
    issue_date = db.Column(db.Date, nullable=False)
    due_date = db.Column(db.Date, nullable=False)
    subtotal = db.Column(db.Float, nullable=False, default=0.0)
    tax_rate = db.Column(db.Float, nullable=False, default=0.0)
    tax_amount = db.Column(db.Float, nullable=False, default=0.0)
    total_amount = db.Column(db.Float, nullable=False, default=0.0)
    balance_due = db.Column(db.Float, nullable=False, default=0.0)
    notes = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, nullable=False)
    last_sent_at = db.Column(db.DateTime(timezone=True), nullable=True)
    paid_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class InvoiceItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    invoice_id = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(200), nullable=False)
    quantity = db.Column(db.Float, nullable=False, default=1.0)
    unit_price = db.Column(db.Float, nullable=False, default=0.0)
    amount = db.Column(db.Float, nullable=False, default=0.0)


class CustomerPayment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    invoice_id = db.Column(db.Integer, nullable=False)
    amount = db.Column(db.Float, nullable=False, default=0.0)
    reference = db.Column(db.String(120), nullable=True)
    source = db.Column(db.String(30), nullable=False, default="manual")
    notes = db.Column(db.Text, nullable=True)
    payment_date = db.Column(db.Date, nullable=False)
    bank_transaction_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class VendorBill(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    bill_number = db.Column(db.String(40), nullable=False, unique=True)
    vendor_name = db.Column(db.String(120), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="draft")
    issue_date = db.Column(db.Date, nullable=False)
    due_date = db.Column(db.Date, nullable=False)
    subtotal = db.Column(db.Float, nullable=False, default=0.0)
    tax_rate = db.Column(db.Float, nullable=False, default=0.0)
    tax_amount = db.Column(db.Float, nullable=False, default=0.0)
    total_amount = db.Column(db.Float, nullable=False, default=0.0)
    balance_due = db.Column(db.Float, nullable=False, default=0.0)
    notes = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, nullable=False)
    approved_at = db.Column(db.DateTime(timezone=True), nullable=True)
    paid_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class VendorBillItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    bill_id = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(200), nullable=False)
    quantity = db.Column(db.Float, nullable=False, default=1.0)
    unit_price = db.Column(db.Float, nullable=False, default=0.0)
    amount = db.Column(db.Float, nullable=False, default=0.0)


class VendorPayment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    bill_id = db.Column(db.Integer, nullable=False)
    amount = db.Column(db.Float, nullable=False, default=0.0)
    reference = db.Column(db.String(120), nullable=True)
    source = db.Column(db.String(30), nullable=False, default="manual")
    notes = db.Column(db.Text, nullable=True)
    payment_date = db.Column(db.Date, nullable=False)
    bank_transaction_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class BankFeedTransaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    posted_at = db.Column(db.Date, nullable=False)
    description = db.Column(db.String(255), nullable=False)
    amount = db.Column(db.Float, nullable=False, default=0.0)
    reference = db.Column(db.String(120), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="unmatched")
    matched_invoice_id = db.Column(db.Integer, nullable=True)
    matched_bill_id = db.Column(db.Integer, nullable=True)
    raw_payload = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class BankConnection(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    provider = db.Column(db.String(30), nullable=False, default="plaid")
    item_id = db.Column(db.String(120), nullable=False, unique=True)
    access_token = db.Column(db.String(255), nullable=False)
    institution_name = db.Column(db.String(120), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="connected")
    sync_cursor = db.Column(db.String(255), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        onupdate=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class TaxProfile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False, unique=True)
    jurisdiction_code = db.Column(db.String(40), nullable=False, default="generic")
    filing_frequency = db.Column(db.String(20), nullable=False, default="monthly")
    registration_number = db.Column(db.String(80), nullable=True)
    currency_code = db.Column(db.String(8), nullable=False, default="USD")
    sales_tax_name = db.Column(db.String(40), nullable=False, default="Sales Tax")
    purchase_tax_name = db.Column(db.String(40), nullable=False, default="Purchase Tax Credit")
    indirect_tax_rate = db.Column(db.Float, nullable=False, default=16.0)
    income_tax_rate = db.Column(db.Float, nullable=False, default=30.0)
    period_start_month = db.Column(db.Integer, nullable=False, default=1)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        onupdate=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class LedgerAccount(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    code = db.Column(db.String(20), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(20), nullable=False)
    subtype = db.Column(db.String(40), nullable=True)
    normal_balance = db.Column(db.String(10), nullable=False, default="debit")
    description = db.Column(db.Text, nullable=True)
    is_system = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        onupdate=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class JournalEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    entry_number = db.Column(db.String(40), nullable=False, unique=True)
    entry_date = db.Column(db.Date, nullable=False)
    memo = db.Column(db.String(255), nullable=False)
    reference = db.Column(db.String(120), nullable=True)
    source_type = db.Column(db.String(40), nullable=False, default="manual")
    source_id = db.Column(db.Integer, nullable=True)
    status = db.Column(db.String(20), nullable=False, default="posted")
    reverses_entry_id = db.Column(db.Integer, nullable=True)
    created_by = db.Column(db.Integer, nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class JournalLine(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    journal_entry_id = db.Column(db.Integer, nullable=False)
    account_id = db.Column(db.Integer, nullable=False)
    project_id = db.Column(db.Integer, nullable=True)
    line_number = db.Column(db.Integer, nullable=False, default=1)
    description = db.Column(db.String(255), nullable=True)
    debit = db.Column(db.Float, nullable=False, default=0.0)
    credit = db.Column(db.Float, nullable=False, default=0.0)


class VendorProfile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    vendor_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), nullable=True)
    tax_id = db.Column(db.String(80), nullable=True)
    default_payment_rail = db.Column(db.String(30), nullable=False, default="ach")
    remittance_reference = db.Column(db.String(120), nullable=True)
    bank_last4 = db.Column(db.String(4), nullable=True)
    is_1099_eligible = db.Column(db.Boolean, nullable=False, default=False)
    tax_form_type = db.Column(db.String(20), nullable=False, default="1099-NEC")
    tin_status = db.Column(db.String(20), nullable=False, default="pending")
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        onupdate=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class BillDisbursement(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    bill_id = db.Column(db.Integer, nullable=False)
    vendor_profile_id = db.Column(db.Integer, nullable=True)
    payment_rail = db.Column(db.String(30), nullable=False, default="ach")
    status = db.Column(db.String(20), nullable=False, default="scheduled")
    scheduled_date = db.Column(db.Date, nullable=False)
    processed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    amount = db.Column(db.Float, nullable=False, default=0.0)
    reference = db.Column(db.String(120), nullable=True)
    confirmation_code = db.Column(db.String(40), nullable=True)
    compliance_status = db.Column(db.String(20), nullable=False, default="ready")
    created_by = db.Column(db.Integer, nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class ReconciliationRule(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    keyword = db.Column(db.String(120), nullable=True)
    direction = db.Column(db.String(20), nullable=False, default="any")
    min_amount = db.Column(db.Float, nullable=True)
    max_amount = db.Column(db.Float, nullable=True)
    auto_action = db.Column(db.String(30), nullable=False, default="suggest_account")
    target_reference = db.Column(db.String(80), nullable=True)
    exception_type = db.Column(db.String(40), nullable=True)
    priority = db.Column(db.Integer, nullable=False, default=100)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class ReconciliationException(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    bank_transaction_id = db.Column(db.Integer, nullable=False)
    exception_type = db.Column(db.String(40), nullable=False)
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), nullable=False, default="open")
    created_by = db.Column(db.Integer, nullable=False)
    resolved_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class TaxFiling(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    jurisdiction_code = db.Column(db.String(40), nullable=False)
    filing_frequency = db.Column(db.String(20), nullable=False)
    filing_type = db.Column(db.String(30), nullable=False, default="indirect_tax")
    period_start = db.Column(db.Date, nullable=False)
    period_end = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), nullable=False, default="prepared")
    reference = db.Column(db.String(80), nullable=True)
    payload_json = db.Column(db.Text, nullable=True)
    prepared_by = db.Column(db.Integer, nullable=False)
    prepared_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )
    submitted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class EmployeeProfile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), nullable=True)
    pay_type = db.Column(db.String(20), nullable=False, default="hourly")
    hourly_rate = db.Column(db.Float, nullable=False, default=0.0)
    salary_amount = db.Column(db.Float, nullable=False, default=0.0)
    withholding_rate = db.Column(db.Float, nullable=False, default=0.0)
    benefit_rate = db.Column(db.Float, nullable=False, default=0.0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        onupdate=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class ContractorProfile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), nullable=True)
    tax_id = db.Column(db.String(80), nullable=True)
    default_rate = db.Column(db.Float, nullable=False, default=0.0)
    is_1099_eligible = db.Column(db.Boolean, nullable=False, default=True)
    tax_form_type = db.Column(db.String(20), nullable=False, default="1099-NEC")
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        onupdate=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class TimeEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    employee_id = db.Column(db.Integer, nullable=True)
    contractor_id = db.Column(db.Integer, nullable=True)
    project_id = db.Column(db.Integer, nullable=True)
    work_date = db.Column(db.Date, nullable=False)
    hours = db.Column(db.Float, nullable=False, default=0.0)
    hourly_cost = db.Column(db.Float, nullable=False, default=0.0)
    billable_rate = db.Column(db.Float, nullable=False, default=0.0)
    description = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="submitted")
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class MileageEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    employee_id = db.Column(db.Integer, nullable=True)
    contractor_id = db.Column(db.Integer, nullable=True)
    project_id = db.Column(db.Integer, nullable=True)
    trip_date = db.Column(db.Date, nullable=False)
    miles = db.Column(db.Float, nullable=False, default=0.0)
    rate_per_mile = db.Column(db.Float, nullable=False, default=0.0)
    purpose = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="submitted")
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class PayrollRun(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    payroll_number = db.Column(db.String(40), nullable=False, unique=True)
    period_start = db.Column(db.Date, nullable=False)
    period_end = db.Column(db.Date, nullable=False)
    pay_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), nullable=False, default="processed")
    gross_pay = db.Column(db.Float, nullable=False, default=0.0)
    withholding_total = db.Column(db.Float, nullable=False, default=0.0)
    benefit_total = db.Column(db.Float, nullable=False, default=0.0)
    mileage_reimbursement_total = db.Column(db.Float, nullable=False, default=0.0)
    net_cash = db.Column(db.Float, nullable=False, default=0.0)
    created_by = db.Column(db.Integer, nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class PayrollLine(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    payroll_run_id = db.Column(db.Integer, nullable=False)
    employee_id = db.Column(db.Integer, nullable=False)
    regular_hours = db.Column(db.Float, nullable=False, default=0.0)
    gross_pay = db.Column(db.Float, nullable=False, default=0.0)
    withholding_amount = db.Column(db.Float, nullable=False, default=0.0)
    benefit_amount = db.Column(db.Float, nullable=False, default=0.0)
    mileage_reimbursement = db.Column(db.Float, nullable=False, default=0.0)
    net_pay = db.Column(db.Float, nullable=False, default=0.0)


class InventoryItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    sku = db.Column(db.String(60), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(80), nullable=True)
    quantity_on_hand = db.Column(db.Float, nullable=False, default=0.0)
    reorder_point = db.Column(db.Float, nullable=False, default=0.0)
    reorder_quantity = db.Column(db.Float, nullable=False, default=0.0)
    unit_cost = db.Column(db.Float, nullable=False, default=0.0)
    unit_price = db.Column(db.Float, nullable=False, default=0.0)
    preferred_vendor_name = db.Column(db.String(120), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        onupdate=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class PurchaseOrder(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    po_number = db.Column(db.String(40), nullable=False, unique=True)
    vendor_name = db.Column(db.String(120), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="draft")
    issue_date = db.Column(db.Date, nullable=False)
    expected_date = db.Column(db.Date, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class PurchaseOrderLine(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    purchase_order_id = db.Column(db.Integer, nullable=False)
    inventory_item_id = db.Column(db.Integer, nullable=True)
    sku = db.Column(db.String(60), nullable=True)
    description = db.Column(db.String(200), nullable=False)
    quantity = db.Column(db.Float, nullable=False, default=0.0)
    unit_cost = db.Column(db.Float, nullable=False, default=0.0)
    received_quantity = db.Column(db.Float, nullable=False, default=0.0)


class InventoryMovement(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    inventory_item_id = db.Column(db.Integer, nullable=False)
    project_id = db.Column(db.Integer, nullable=True)
    movement_type = db.Column(db.String(30), nullable=False)
    quantity_delta = db.Column(db.Float, nullable=False, default=0.0)
    unit_cost = db.Column(db.Float, nullable=False, default=0.0)
    reference = db.Column(db.String(120), nullable=True)
    occurred_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    project_code = db.Column(db.String(40), nullable=False, unique=True)
    name = db.Column(db.String(120), nullable=False)
    customer_name = db.Column(db.String(120), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="active")
    budget_revenue = db.Column(db.Float, nullable=False, default=0.0)
    budget_cost = db.Column(db.Float, nullable=False, default=0.0)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        onupdate=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class ProjectCostEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    project_id = db.Column(db.Integer, nullable=False)
    entry_type = db.Column(db.String(20), nullable=False, default="cost")
    description = db.Column(db.String(255), nullable=False)
    amount = db.Column(db.Float, nullable=False, default=0.0)
    reference = db.Column(db.String(120), nullable=True)
    work_date = db.Column(db.Date, nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


class IntegrationConnection(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=False)
    provider = db.Column(db.String(40), nullable=False)
    category = db.Column(db.String(40), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="available")
    config_json = db.Column(db.Text, nullable=True)
    last_synced_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        onupdate=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )
