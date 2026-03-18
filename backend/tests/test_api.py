import importlib.util
import io
import os
from pathlib import Path

import pytest


@pytest.fixture(scope="session")
def backend_module(tmp_path_factory):
    db_file = tmp_path_factory.mktemp("db") / "test_api.sqlite"
    os.environ["FLASK_ENV"] = "development"
    os.environ["JWT_SECRET_KEY"] = "test-secret-key-with-32-plus-bytes-123456"
    os.environ["DATABASE_URL"] = f"sqlite:///{db_file.as_posix()}"

    module_path = Path(__file__).resolve().parents[1] / "Financial dashboard back end.py"
    spec = importlib.util.spec_from_file_location("backend_app", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def client(backend_module):
    app = backend_module.app
    db = backend_module.db

    with app.app_context():
        db.drop_all()
        db.create_all()

    return app.test_client()


def register_and_login(client, email="owner@example.com", password="secret123", register_overrides=None):
    register_payload = {
        "org": "Acme",
        "email": email,
        "password": password,
    }
    if register_overrides:
        register_payload.update(register_overrides)

    register_response = client.post(
        "/register",
        json=register_payload,
    )
    assert register_response.status_code == 200

    login_response = client.post(
        "/login",
        json={"email": email, "password": password},
    )
    assert login_response.status_code == 200

    payload = login_response.get_json()
    assert "token" in payload
    return payload["token"]


def test_register_and_login_success(client):
    token = register_and_login(client)
    assert token

    headers = {"Authorization": f"Bearer {token}"}
    companies_response = client.get("/companies", headers=headers)
    assert companies_response.status_code == 200
    assert companies_response.get_json()[0]["onboarding_complete"] is False


def test_register_duplicate_email_conflict(client):
    register_and_login(client)

    duplicate_response = client.post(
        "/register",
        json={"org": "Acme", "email": "owner@example.com", "password": "secret123"},
    )

    assert duplicate_response.status_code == 409
    assert duplicate_response.get_json()["error"] == "email already exists"


def test_register_partnership_persists_partner_names(client):
    token = register_and_login(
        client,
        email="partners@example.com",
        register_overrides={
            "org": "Alpha Partners",
            "business_type": "partnership",
            "partner_names": ["Ada Mwangi", "Brian Otieno", "Chao Wanjiku"],
        },
    )
    headers = {"Authorization": f"Bearer {token}"}

    companies_response = client.get("/companies", headers=headers)

    assert companies_response.status_code == 200
    companies = companies_response.get_json()
    assert len(companies) == 1
    assert companies[0]["business_type"] == "partnership"
    assert companies[0]["partner_count"] == 3
    assert companies[0]["partner_names"] == ["Ada Mwangi", "Brian Otieno", "Chao Wanjiku"]
    assert companies[0]["onboarding_complete"] is True


def test_register_partnership_requires_two_names(client):
    response = client.post(
        "/register",
        json={
            "org": "Solo Partner LLP",
            "email": "solo-partner@example.com",
            "password": "secret123",
            "business_type": "partnership",
            "partner_names": ["Only One"],
        },
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "partnerships require at least two partner names"


def test_company_setup_updates_default_company_after_login(client):
    token = register_and_login(client, email="setup@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    companies_response = client.get("/companies", headers=headers)
    assert companies_response.status_code == 200
    company = companies_response.get_json()[0]
    assert company["onboarding_complete"] is False

    setup_response = client.put(
        f"/companies/{company['id']}/setup",
        headers=headers,
        json={
            "business_type": "partnership",
            "partner_names": ["Alice Njeri", "Brian Kiptoo"],
        },
    )

    assert setup_response.status_code == 200
    updated_company = setup_response.get_json()
    assert updated_company["business_type"] == "partnership"
    assert updated_company["partner_names"] == ["Alice Njeri", "Brian Kiptoo"]
    assert updated_company["onboarding_complete"] is True


def test_analytics_requires_auth(client):
    response = client.get("/analytics")
    assert response.status_code == 401


def test_analyze_success_increments_usage(client):
    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    csv_bytes = io.BytesIO(b"type,amount\nrevenue,100\nexpense,40\n")
    response = client.post(
        "/analyze",
        headers=headers,
        data={"file": (csv_bytes, "sample.csv")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["revenue"] == 100.0
    assert payload["expenses"] == 40.0
    assert payload["assets_non_current_gross"] == 0.0
    assert payload["accumulated_depreciation"] == 0.0
    assert payload["assets_non_current_net"] == 0.0

    analytics = client.get("/analytics", headers=headers)
    assert analytics.status_code == 200
    analytics_payload = analytics.get_json()
    assert analytics_payload["usage"] == 1
    assert analytics_payload["reports"] == 1


def test_analyze_invalid_csv_rejected(client):
    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    csv_bytes = io.BytesIO(b"category,value\nrevenue,100\n")
    response = client.post(
        "/analyze",
        headers=headers,
        data={"file": (csv_bytes, "bad.csv")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 400
    assert "invalid csv" in response.get_json()["error"]


def test_analyze_non_current_asset_with_depreciation(client):
    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    csv_bytes = io.BytesIO(
        b"type,subtype,amount,depreciation\nasset,non-current,1000,250\nasset,current,200,0\nliability,current,150,0\n"
    )
    response = client.post(
        "/analyze",
        headers=headers,
        data={"file": (csv_bytes, "depreciation.csv")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["assets_non_current_gross"] == 1000.0
    assert payload["accumulated_depreciation"] == 250.0
    assert payload["assets_non_current_net"] == 750.0
    assert payload["assets_current"] == 200.0
    assert payload["total_assets"] == 950.0
    assert payload["liabilities_current"] == 150.0


def test_normalize_trial_balance_stacked_layout(backend_module):
    df = backend_module.pd.DataFrame(
        {
            0: [
                "Stock 1 October 19x8",
                23680,
                "Carriage outwards",
                2000,
                "Carriage inwards",
                3100,
                "Returns inwards",
                2050,
                "Returns outwards",
                3220,
                "Purchases",
                118740,
                "Sales",
                186000,
                "Salaries and wages",
                38620,
                "Rent",
                3040,
                "Insurance",
                780,
                "Motor expenses",
                6640,
                "Office expenses",
                2160,
                "Lighting and heating expenses",
                1660,
                "General expenses",
                3140,
                "Premises",
                50000,
                "Motor vehicles",
                18000,
                "Fixtures and fittings",
                3500,
                "Debtors",
                38960,
                "Creditors",
                17310,
                "Cash at bank",
                1820,
                "Drawings",
                12000,
                "Capital",
                126360,
            ]
        }
    )

    normalized = backend_module.normalize_ledger_dataframe(df)
    rows = {row["account"]: row for row in normalized.to_dict(orient="records")}

    assert rows["Opening Stock"]["amount"] == 23680.0
    assert rows["Opening Stock"]["type"] == "asset"
    assert rows["Sales Revenue"]["amount"] == 186000.0
    assert rows["Accounts Payable"]["amount"] == 17310.0
    assert rows["Owner Capital"]["type"] == "capital"
    assert rows["Drawings"]["type"] == "drawings"

    summary = backend_module.calc(normalized)
    assert summary["revenue"] == 186000.0
    assert summary["expenses"] == 185150.0
    assert summary["assets_current"] == 64460.0
    assert summary["assets_non_current_gross"] == 71500.0
    assert summary["total_liabilities"] == 17310.0


def test_extract_ledger_accepts_trial_balance_xlsx(client):
    openpyxl = pytest.importorskip("openpyxl")
    workbook = openpyxl.Workbook()
    sheet = workbook.active

    stacked_rows = [
        "Stock 1 October 19x8",
        23680,
        "Carriage outwards",
        2000,
        "Carriage inwards",
        3100,
        "Returns inwards",
        2050,
        "Returns outwards",
        3220,
        "Purchases",
        118740,
        "Sales",
        186000,
        "Salaries and wages",
        38620,
        "Rent",
        3040,
        "Insurance",
        780,
        "Premises",
        50000,
        "Debtors",
        38960,
        "Creditors",
        17310,
        "Cash at bank",
        1820,
        "Capital",
        126360,
    ]
    for index, value in enumerate(stacked_rows, start=1):
        sheet[f"A{index}"] = value

    payload = io.BytesIO()
    workbook.save(payload)
    payload.seek(0)

    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post(
        "/extract-ledger",
        headers=headers,
        data={"file": (payload, "trial.xlsx")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    extracted = response.get_json()
    assert extracted["summary"]["revenue"] == 186000.0
    assert extracted["summary"]["assets_current"] == 64460.0
    assert any(row["account"] == "Opening Stock" and row["amount"] == 23680.0 for row in extracted["ledger_rows"])
    assert any(row["account"] == "Owner Capital" and row["amount"] == 126360.0 for row in extracted["ledger_rows"])


def test_extract_ledger_accepts_manufacturing_schedule_csv(client):
    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    csv_bytes = io.BytesIO(
        (
            "Particulars,$000,$000_2\n"
            "Opening Raw Materials,40,\n"
            "Add: Purchases of Raw Materials,210,\n"
            "Less: Closing Raw Materials,(50),\n"
            "Cost of Raw Materials Consumed,,200\n"
            "Add: Direct Manufacturing Labor,,150\n"
            "PRIME COST,,350\n"
            "Factory Overheads:,,\n"
            "Factory Indirect Labor,45,\n"
            "Factory Utilities ($30 + $5 accrued),35,\n"
            "Depreciation of Factory Equipment,25,\n"
            "Total Factory Overheads,,105\n"
            ",,455\n"
            "Add: Opening Work in Progress (WIP),,30\n"
            "Less: Closing Work in Progress (WIP),,(40)\n"
            "COST OF GOODS MANUFACTURED,,445\n"
        ).encode("utf-8")
    )

    response = client.post(
        "/extract-ledger",
        headers=headers,
        data={"file": (csv_bytes, "manufacturing_schedule.csv")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    payload = response.get_json()
    rows = {row["account"]: row for row in payload["ledger_rows"]}

    assert "Cost of Raw Materials Consumed" not in rows
    assert rows["Raw Materials Opening Stock"]["amount"] == 40.0
    assert rows["Closing Raw Materials"]["amount"] == 50.0
    assert rows["Direct Manufacturing Labor"]["amount"] == 150.0
    assert rows["Factory Indirect Labor"]["amount"] == 45.0
    assert rows["Factory Utilities"]["amount"] == 35.0
    assert rows["Depreciation of Factory Equipment"]["amount"] == 25.0
    assert rows["Opening Work in Progress"]["amount"] == 30.0
    assert rows["Closing Work in Progress"]["amount"] == 40.0
    assert payload["summary"]["rawMaterialsConsumed"] == 200.0
    assert payload["summary"]["primeCost"] == 350.0
    assert payload["summary"]["totalFactoryOverheads"] == 105.0
    assert payload["summary"]["costOfGoodsManufactured"] == 445.0


def test_invoice_receivables_and_tax_workflow(client):
    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    invoice_response = client.post(
        "/finance/invoices",
        headers=headers,
        json={
            "customer_name": "Northwind Traders",
            "customer_email": "ap@northwind.test",
            "status": "sent",
            "tax_rate": 16,
            "items": [
                {"description": "Advisory Services", "quantity": 2, "unit_price": 50},
            ],
        },
    )

    assert invoice_response.status_code == 201
    invoice_payload = invoice_response.get_json()
    assert invoice_payload["status"] == "sent"
    assert invoice_payload["subtotal"] == 100.0
    assert invoice_payload["tax_amount"] == 16.0
    assert invoice_payload["total_amount"] == 116.0
    assert invoice_payload["balance_due"] == 116.0

    receivables_response = client.get("/finance/receivables", headers=headers)
    assert receivables_response.status_code == 200
    receivables_payload = receivables_response.get_json()
    assert receivables_payload["total_open"] == 116.0

    payment_response = client.post(
        f"/finance/invoices/{invoice_payload['id']}/payments",
        headers=headers,
        json={"amount": 40.0, "reference": "WIRE-001"},
    )

    assert payment_response.status_code == 200
    updated_invoice = payment_response.get_json()
    assert updated_invoice["status"] == "partial"
    assert updated_invoice["balance_due"] == 76.0

    summary_response = client.get("/finance/summary", headers=headers)
    assert summary_response.status_code == 200
    summary_payload = summary_response.get_json()
    assert summary_payload["open_receivables"] == 76.0
    assert summary_payload["collected_this_month"] == 40.0

    tax_response = client.get("/finance/tax/summary", headers=headers)
    assert tax_response.status_code == 200
    tax_payload = tax_response.get_json()
    assert tax_payload["sales_tax_collected"] == 16.0
    assert tax_payload["net_tax_due"] == 16.0


def test_bill_bank_feed_and_reconciliation_workflow(client):
    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    bill_response = client.post(
        "/finance/bills",
        headers=headers,
        json={
            "vendor_name": "Acme Supplies",
            "status": "approved",
            "tax_rate": 10,
            "items": [
                {"description": "Office Supplies", "quantity": 2, "unit_price": 50},
            ],
        },
    )

    assert bill_response.status_code == 201
    bill_payload = bill_response.get_json()
    assert bill_payload["status"] == "approved"
    assert bill_payload["total_amount"] == 110.0

    bank_feed_bytes = io.BytesIO(
        b"date,description,amount,reference\n2026-03-01,Acme Supplies settlement,-110.00,BANK-01\n"
    )
    import_response = client.post(
        "/finance/bank-feed/import",
        headers=headers,
        data={"file": (bank_feed_bytes, "bank_feed.csv")},
        content_type="multipart/form-data",
    )

    assert import_response.status_code == 200
    import_payload = import_response.get_json()
    assert import_payload["imported"] == 1
    transaction_id = import_payload["items"][0]["id"]

    suggestions_response = client.get("/finance/reconciliation/suggestions", headers=headers)
    assert suggestions_response.status_code == 200
    suggestions_payload = suggestions_response.get_json()["items"]
    assert suggestions_payload
    suggestion = suggestions_payload[0]
    assert suggestion["entity_type"] == "bill"
    assert suggestion["entity_id"] == bill_payload["id"]

    match_response = client.post(
        "/finance/reconciliation/match",
        headers=headers,
        json={
            "transaction_id": transaction_id,
            "entity_type": "bill",
            "entity_id": bill_payload["id"],
        },
    )

    assert match_response.status_code == 200
    matched_payload = match_response.get_json()
    assert matched_payload["transaction"]["status"] == "matched"
    assert matched_payload["matched"]["status"] == "paid"
    assert matched_payload["matched"]["balance_due"] == 0.0

    payables_response = client.get("/finance/payables", headers=headers)
    assert payables_response.status_code == 200
    payables_payload = payables_response.get_json()
    assert payables_payload["total_open"] == 0.0

    tax_response = client.get("/finance/tax/summary", headers=headers)
    assert tax_response.status_code == 200
    tax_payload = tax_response.get_json()
    assert tax_payload["purchase_tax_credit"] == 10.0


def test_tax_profile_update_and_provider_status(client):
    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    providers_response = client.get("/finance/banking/providers", headers=headers)
    assert providers_response.status_code == 200
    providers_payload = providers_response.get_json()
    assert providers_payload["plaid"]["enabled"] is False

    update_response = client.put(
        "/finance/tax/profile",
        headers=headers,
        json={
            "jurisdiction_code": "ke-vat",
            "filing_frequency": "quarterly",
            "registration_number": "P051234567X",
            "currency_code": "KES",
            "sales_tax_name": "Output VAT",
            "purchase_tax_name": "Input VAT",
            "indirect_tax_rate": 16,
            "income_tax_rate": 30,
            "period_start_month": 1,
        },
    )

    assert update_response.status_code == 200
    profile_payload = update_response.get_json()
    assert profile_payload["jurisdiction_code"] == "ke-vat"
    assert profile_payload["sales_tax_name"] == "Output VAT"

    summary_response = client.get("/finance/tax/summary", headers=headers)
    assert summary_response.status_code == 200
    summary_payload = summary_response.get_json()
    assert summary_payload["jurisdiction_code"] == "ke-vat"

    filing_response = client.get("/finance/tax/filing-preview", headers=headers)
    assert filing_response.status_code == 200
    filing_payload = filing_response.get_json()
    assert filing_payload["profile"]["jurisdiction_code"] == "ke-vat"


def test_accounting_core_and_tax_filing_routes(client):
    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    coa_response = client.get("/finance/chart-of-accounts", headers=headers)
    assert coa_response.status_code == 200
    coa_payload = coa_response.get_json()["items"]
    assert any(account["code"] == "1000" for account in coa_payload)

    create_account_response = client.post(
        "/finance/chart-of-accounts",
        headers=headers,
        json={
            "code": "5700",
            "name": "Professional Fees",
            "category": "expense",
            "subtype": "operating",
            "normal_balance": "debit",
        },
    )
    assert create_account_response.status_code == 201

    journal_response = client.post(
        "/finance/journal-entries",
        headers=headers,
        json={
            "memo": "Owner capital injection",
            "entry_date": "2026-03-10",
            "reference": "CAP-01",
            "lines": [
                {"account_code": "1000", "debit": 500, "credit": 0},
                {"account_code": "3000", "debit": 0, "credit": 500},
            ],
        },
    )
    assert journal_response.status_code == 201
    journal_payload = journal_response.get_json()
    assert journal_payload["entry_number"].startswith("JE-")

    register_response = client.get("/finance/register?account_code=1000", headers=headers)
    assert register_response.status_code == 200
    register_payload = register_response.get_json()
    assert register_payload["account"]["code"] == "1000"
    assert register_payload["ending_balance"] == 500.0

    overview_response = client.get("/finance/accounting/overview", headers=headers)
    assert overview_response.status_code == 200
    overview_payload = overview_response.get_json()
    assert overview_payload["trial_balance"]["balanced"] is True
    assert overview_payload["journal_count"] >= 1

    jurisdictions_response = client.get("/finance/tax/jurisdictions", headers=headers)
    assert jurisdictions_response.status_code == 200
    jurisdictions_payload = jurisdictions_response.get_json()["items"]
    assert any(item["code"] == "ke-vat" for item in jurisdictions_payload)

    filing_prepare_response = client.post(
        "/finance/tax/filings",
        headers=headers,
        json={"filing_type": "indirect_tax"},
    )
    assert filing_prepare_response.status_code == 201
    filing_payload = filing_prepare_response.get_json()
    assert filing_payload["status"] == "prepared"

    submit_response = client.post(
        f"/finance/tax/filings/{filing_payload['id']}/submit",
        headers=headers,
    )
    assert submit_response.status_code == 200
    submitted_payload = submit_response.get_json()
    assert submitted_payload["status"] == "submitted"


def test_vendor_billpay_reconciliation_rules_and_integrations(client):
    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    vendor_response = client.post(
        "/finance/vendors",
        headers=headers,
        json={
            "vendor_name": "Payroll Partner",
            "email": "pay@vendor.test",
            "tax_id": "TIN-4455",
            "default_payment_rail": "ach",
            "is_1099_eligible": True,
            "tin_status": "verified",
        },
    )
    assert vendor_response.status_code == 201

    bill_response = client.post(
        "/finance/bills",
        headers=headers,
        json={
            "vendor_name": "Payroll Partner",
            "status": "approved",
            "tax_rate": 0,
            "items": [{"description": "Advisory", "quantity": 1, "unit_price": 700}],
        },
    )
    assert bill_response.status_code == 201
    bill_payload = bill_response.get_json()

    schedule_response = client.post(
        "/finance/bill-pay/disbursements",
        headers=headers,
        json={
            "bill_id": bill_payload["id"],
            "amount": 700,
            "payment_rail": "ach",
        },
    )
    assert schedule_response.status_code == 201
    disbursement_payload = schedule_response.get_json()
    assert disbursement_payload["status"] == "scheduled"

    execute_response = client.post(
        f"/finance/bill-pay/disbursements/{disbursement_payload['id']}/execute",
        headers=headers,
        json={"payment_date": "2026-03-12"},
    )
    assert execute_response.status_code == 200
    executed_payload = execute_response.get_json()
    assert executed_payload["status"] == "completed"
    assert executed_payload["confirmation_code"]

    form_1099_response = client.get("/finance/vendors/1099-summary", headers=headers)
    assert form_1099_response.status_code == 200
    form_1099_payload = form_1099_response.get_json()
    assert form_1099_payload["reportable_total"] == 700.0
    assert form_1099_payload["ready_count"] == 1

    bank_feed_bytes = io.BytesIO(
        b"date,description,amount,reference\n2026-03-14,Stripe service fee,-25.00,FEE-01\n"
    )
    import_response = client.post(
        "/finance/bank-feed/import",
        headers=headers,
        data={"file": (bank_feed_bytes, "fees.csv")},
        content_type="multipart/form-data",
    )
    assert import_response.status_code == 200

    rule_response = client.post(
        "/finance/reconciliation/rules",
        headers=headers,
        json={
            "name": "Stripe fees",
            "keyword": "stripe",
            "direction": "outflow",
            "auto_action": "flag_exception",
            "exception_type": "bank_fee_review",
        },
    )
    assert rule_response.status_code == 201

    auto_apply_response = client.post(
        "/finance/reconciliation/rules/auto-apply",
        headers=headers,
        json={},
    )
    assert auto_apply_response.status_code == 200
    auto_apply_payload = auto_apply_response.get_json()
    assert auto_apply_payload["exceptions"] >= 1

    workspace_response = client.get("/finance/reconciliation/workspace", headers=headers)
    assert workspace_response.status_code == 200
    workspace_payload = workspace_response.get_json()
    assert workspace_payload["summary"]["exceptions"] >= 1
    exception_id = workspace_payload["exceptions"][0]["id"]

    resolve_response = client.post(
        f"/finance/reconciliation/exceptions/{exception_id}/resolve",
        headers=headers,
    )
    assert resolve_response.status_code == 200
    assert resolve_response.get_json()["status"] == "resolved"

    integrations_response = client.post(
        "/finance/integrations",
        headers=headers,
        json={"provider": "slack", "config": {"channel": "#finance-alerts"}},
    )
    assert integrations_response.status_code == 201
    integration_payload = integrations_response.get_json()
    assert integration_payload["status"] == "connected"

    sync_response = client.post(
        f"/finance/integrations/{integration_payload['id']}/sync",
        headers=headers,
    )
    assert sync_response.status_code == 200


def test_workforce_inventory_projects_and_accountant_toolkit(client):
    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    employee_response = client.post(
        "/finance/workforce/employees",
        headers=headers,
        json={
            "full_name": "Amina Ops",
            "pay_type": "hourly",
            "hourly_rate": 20,
            "withholding_rate": 10,
            "benefit_rate": 5,
        },
    )
    assert employee_response.status_code == 201
    employee_payload = employee_response.get_json()

    contractor_response = client.post(
        "/finance/workforce/contractors",
        headers=headers,
        json={
            "full_name": "Dexter Build",
            "default_rate": 45,
            "tax_id": "CON-8899",
        },
    )
    assert contractor_response.status_code == 201
    contractor_payload = contractor_response.get_json()

    project_response = client.post(
        "/finance/projects",
        headers=headers,
        json={
            "project_code": "JOB-001",
            "name": "Warehouse Upgrade",
            "customer_name": "Orbit Stores",
            "budget_revenue": 5000,
            "budget_cost": 3000,
        },
    )
    assert project_response.status_code == 201
    project_payload = project_response.get_json()

    time_response = client.post(
        "/finance/workforce/time",
        headers=headers,
        json={
            "employee_id": employee_payload["id"],
            "project_id": project_payload["id"],
            "work_date": "2026-03-13",
            "hours": 8,
            "hourly_cost": 20,
            "billable_rate": 55,
            "description": "Site supervision",
        },
    )
    assert time_response.status_code == 201

    contractor_time_response = client.post(
        "/finance/workforce/time",
        headers=headers,
        json={
            "contractor_id": contractor_payload["id"],
            "project_id": project_payload["id"],
            "work_date": "2026-03-13",
            "hours": 4,
            "hourly_cost": 45,
            "billable_rate": 75,
            "description": "Equipment setup",
        },
    )
    assert contractor_time_response.status_code == 201

    mileage_response = client.post(
        "/finance/workforce/mileage",
        headers=headers,
        json={
            "employee_id": employee_payload["id"],
            "project_id": project_payload["id"],
            "trip_date": "2026-03-13",
            "miles": 30,
            "rate_per_mile": 0.67,
            "purpose": "Site visit",
        },
    )
    assert mileage_response.status_code == 201

    payroll_response = client.post(
        "/finance/workforce/payroll-runs",
        headers=headers,
        json={
            "period_start": "2026-03-01",
            "period_end": "2026-03-15",
            "pay_date": "2026-03-15",
        },
    )
    assert payroll_response.status_code == 201
    payroll_payload = payroll_response.get_json()
    assert payroll_payload["gross_pay"] == 160.0
    assert payroll_payload["net_cash"] > 0

    item_response = client.post(
        "/finance/inventory/items",
        headers=headers,
        json={
            "sku": "SKU-100",
            "name": "Copper Wire",
            "quantity_on_hand": 5,
            "reorder_point": 10,
            "reorder_quantity": 20,
            "unit_cost": 8,
            "unit_price": 12,
            "preferred_vendor_name": "Parts Depot",
        },
    )
    assert item_response.status_code == 201

    po_response = client.post(
        "/finance/purchase-orders",
        headers=headers,
        json={
            "vendor_name": "Parts Depot",
            "items": [{"sku": "SKU-100", "description": "Copper Wire", "quantity": 10, "unit_cost": 8}],
        },
    )
    assert po_response.status_code == 201
    po_payload = po_response.get_json()

    submit_po_response = client.post(
        f"/finance/purchase-orders/{po_payload['id']}/submit",
        headers=headers,
    )
    assert submit_po_response.status_code == 200

    receive_po_response = client.post(
        f"/finance/purchase-orders/{po_payload['id']}/receive",
        headers=headers,
        json={"items": [{"line_id": po_payload["items"][0]["id"], "quantity": 10}]},
    )
    assert receive_po_response.status_code == 200
    received_po_payload = receive_po_response.get_json()
    assert received_po_payload["status"] == "received"

    project_cost_response = client.post(
        "/finance/projects/costs",
        headers=headers,
        json={
            "project_id": project_payload["id"],
            "entry_type": "revenue",
            "description": "Milestone billing",
            "amount": 2000,
            "work_date": "2026-03-15",
        },
    )
    assert project_cost_response.status_code == 201

    project_summary_response = client.get("/finance/projects/summary", headers=headers)
    assert project_summary_response.status_code == 200
    project_summary_payload = project_summary_response.get_json()
    assert project_summary_payload["items"][0]["actual_revenue"] >= 2000.0
    assert project_summary_payload["items"][0]["actual_cost"] > 0

    inventory_summary_response = client.get("/finance/inventory/summary", headers=headers)
    assert inventory_summary_response.status_code == 200
    inventory_summary_payload = inventory_summary_response.get_json()
    assert inventory_summary_payload["inventory_value"] == 120.0
    assert inventory_summary_payload["item_count"] == 1

    workforce_summary_response = client.get("/finance/workforce/overview", headers=headers)
    assert workforce_summary_response.status_code == 200
    workforce_summary_payload = workforce_summary_response.get_json()
    assert workforce_summary_payload["employee_count"] == 1
    assert workforce_summary_payload["contractor_count"] == 1

    toolkit_response = client.get("/finance/accountant/toolkit", headers=headers)
    assert toolkit_response.status_code == 200
    toolkit_payload = toolkit_response.get_json()
    assert toolkit_payload["inventory"]["inventory_value"] == 120.0
    assert toolkit_payload["projects"]["total_margin"] > 0
    assert toolkit_payload["workforce"]["employee_count"] == 1
