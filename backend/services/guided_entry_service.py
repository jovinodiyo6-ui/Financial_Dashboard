from __future__ import annotations

from extensions import db
from models import CompanyPartner, LedgerAccount
from services.accounting_engine import post_journal_entry, seed_chart_of_accounts, serialize_journal_entry
from utils import parse_money


GUIDED_ACCOUNT_DEFINITIONS = [
    {"code": "1210", "name": "Raw Materials Inventory", "category": "asset", "subtype": "current", "normal_balance": "debit"},
    {"code": "1220", "name": "Work in Progress Inventory", "category": "asset", "subtype": "current", "normal_balance": "debit"},
    {"code": "1230", "name": "Finished Goods Inventory", "category": "asset", "subtype": "current", "normal_balance": "debit"},
    {"code": "2210", "name": "Wages Payable", "category": "liability", "subtype": "current", "normal_balance": "credit"},
    {"code": "2310", "name": "Income Tax Payable", "category": "liability", "subtype": "current", "normal_balance": "credit"},
    {"code": "2500", "name": "Long-Term Loans", "category": "liability", "subtype": "non-current", "normal_balance": "credit"},
    {"code": "3200", "name": "Owner Drawings", "category": "equity", "subtype": "contra-equity", "normal_balance": "debit"},
    {"code": "3300", "name": "Profit and Loss Appropriation", "category": "equity", "subtype": "appropriation", "normal_balance": "debit"},
    {"code": "3400", "name": "Share Capital", "category": "equity", "subtype": "equity", "normal_balance": "credit"},
    {"code": "3420", "name": "Dividends", "category": "equity", "subtype": "contra-equity", "normal_balance": "debit"},
    {"code": "3500", "name": "Historical Balance Adjustment", "category": "equity", "subtype": "equity", "normal_balance": "debit"},
    {"code": "4300", "name": "Interest on Drawings Revenue", "category": "revenue", "subtype": "other", "normal_balance": "credit"},
    {"code": "5230", "name": "Interest on Capital Expense", "category": "expense", "subtype": "appropriation", "normal_balance": "debit"},
    {"code": "5240", "name": "Partner Salary Expense", "category": "expense", "subtype": "appropriation", "normal_balance": "debit"},
]


def _money(value, field_name):
    if value in {None, ""}:
        return 0.0
    return parse_money(value, field_name)


def _ensure_account(company, definition):
    account = LedgerAccount.query.filter_by(company_id=company.id, code=definition["code"]).first()
    if account:
        return account

    account = LedgerAccount(
        org_id=company.org_id,
        company_id=company.id,
        code=definition["code"],
        name=definition["name"],
        category=definition["category"],
        subtype=definition.get("subtype"),
        normal_balance=definition.get("normal_balance", "debit"),
        description=definition.get("description"),
        is_system=False,
        is_active=True,
    )
    db.session.add(account)
    db.session.flush()
    return account


def _ensure_partner_accounts(company):
    partners = CompanyPartner.query.filter_by(company_id=company.id).order_by(CompanyPartner.display_order.asc()).all()
    result = []
    for index, partner in enumerate(partners, start=1):
        capital_code = f"30{index + 10:02d}"
        drawings_code = f"32{index + 10:02d}"
        capital = _ensure_account(
            company,
            {
                "code": capital_code,
                "name": f"{partner.name} Capital",
                "category": "equity",
                "subtype": "equity",
                "normal_balance": "credit",
            },
        )
        drawings = _ensure_account(
            company,
            {
                "code": drawings_code,
                "name": f"{partner.name} Drawings",
                "category": "equity",
                "subtype": "contra-equity",
                "normal_balance": "debit",
            },
        )
        result.append(
            {
                "name": partner.name,
                "capital_code": capital.code,
                "drawings_code": drawings.code,
            }
        )
    return result


def _seed_guided_accounts(company):
    seed_chart_of_accounts(company)
    for definition in GUIDED_ACCOUNT_DEFINITIONS:
        _ensure_account(company, definition)
    return _ensure_partner_accounts(company)


def _line(account_code, *, debit=0.0, credit=0.0, description=""):
    debit_amount = round(float(debit or 0), 2)
    credit_amount = round(float(credit or 0), 2)
    if debit_amount <= 0 and credit_amount <= 0:
        return None
    return {
        "account_code": account_code,
        "debit": debit_amount,
        "credit": credit_amount,
        "description": description,
    }


def _append_entry(entries, memo, lines):
    normalized_lines = [line for line in lines if line]
    if not normalized_lines:
        return
    entries.append({"memo": memo, "lines": normalized_lines})


def _base_operating_entries(entries, inputs):
    cash_sales = _money(inputs.get("cash_sales"), "cash_sales")
    credit_sales = _money(inputs.get("credit_sales"), "credit_sales")
    expenses_paid = _money(inputs.get("expenses_paid"), "expenses_paid")
    purchases_cash = _money(inputs.get("purchases_cash"), "purchases_cash")
    purchases_credit = _money(inputs.get("purchases_credit"), "purchases_credit")
    supplier_payments = _money(inputs.get("supplier_payments"), "supplier_payments")
    customer_collections = _money(inputs.get("customer_collections"), "customer_collections")

    _append_entry(
        entries,
        "Cash sales",
        [
            _line("1000", debit=cash_sales, description="Cash received from sales"),
            _line("4000", credit=cash_sales, description="Sales revenue"),
        ],
    )
    _append_entry(
        entries,
        "Credit sales",
        [
            _line("1100", debit=credit_sales, description="Receivable from customer"),
            _line("4000", credit=credit_sales, description="Sales revenue"),
        ],
    )
    _append_entry(
        entries,
        "Operating expenses paid",
        [
            _line("5200", debit=expenses_paid, description="General business expenses"),
            _line("1000", credit=expenses_paid, description="Cash paid for expenses"),
        ],
    )
    _append_entry(
        entries,
        "Inventory purchased with cash",
        [
            _line("1200", debit=purchases_cash, description="Inventory purchase"),
            _line("1000", credit=purchases_cash, description="Cash paid for inventory"),
        ],
    )
    _append_entry(
        entries,
        "Inventory purchased on credit",
        [
            _line("1200", debit=purchases_credit, description="Inventory purchase"),
            _line("2000", credit=purchases_credit, description="Supplier payable"),
        ],
    )
    _append_entry(
        entries,
        "Supplier payments",
        [
            _line("2000", debit=supplier_payments, description="Pay supplier"),
            _line("1000", credit=supplier_payments, description="Cash paid to supplier"),
        ],
    )
    _append_entry(
        entries,
        "Customer receipts",
        [
            _line("1000", debit=customer_collections, description="Cash collected from customers"),
            _line("1100", credit=customer_collections, description="Receivable settled"),
        ],
    )


def _sole_entries(entries, inputs):
    owner_capital = _money(inputs.get("owner_capital"), "owner_capital")
    additional_capital = _money(inputs.get("additional_capital"), "additional_capital")
    drawings = _money(inputs.get("drawings"), "drawings")

    _base_operating_entries(entries, inputs)

    _append_entry(
        entries,
        "Owner capital introduced",
        [
            _line("1000", debit=owner_capital, description="Owner capital introduced"),
            _line("3000", credit=owner_capital, description="Owner equity"),
        ],
    )
    _append_entry(
        entries,
        "Additional owner capital introduced",
        [
            _line("1000", debit=additional_capital, description="Additional capital introduced"),
            _line("3000", credit=additional_capital, description="Owner equity"),
        ],
    )
    _append_entry(
        entries,
        "Owner drawings",
        [
            _line("3200", debit=drawings, description="Owner drawings"),
            _line("1000", credit=drawings, description="Cash withdrawn by owner"),
        ],
    )


def _partnership_entries(entries, inputs, partner_accounts):
    _base_operating_entries(entries, inputs)

    partners = inputs.get("partners") or []
    profit_allocation_total = _money(inputs.get("profit_allocation_total"), "profit_allocation_total")

    contribution_lines = []
    total_contribution = 0.0
    drawings_lines = []
    total_drawings = 0.0
    interest_capital_lines = []
    total_interest_capital = 0.0
    partner_salary_lines = []
    total_partner_salary = 0.0
    interest_drawings_lines = []
    total_interest_drawings = 0.0
    ratio_total = 0.0
    ratio_partners = []

    partner_lookup = {item["name"]: item for item in partner_accounts}
    for partner in partners:
        name = str(partner.get("name") or "").strip()
        if not name or name not in partner_lookup:
            continue
        accounts = partner_lookup[name]
        ratio = _money(partner.get("ratio"), f"{name} ratio")
        ratio_total += ratio
        ratio_partners.append((accounts, ratio))

        capital_contribution = _money(partner.get("capital_contribution"), f"{name} capital_contribution")
        drawings = _money(partner.get("drawings"), f"{name} drawings")
        interest_on_capital = _money(partner.get("interest_on_capital"), f"{name} interest_on_capital")
        interest_on_drawings = _money(partner.get("interest_on_drawings"), f"{name} interest_on_drawings")
        salary = _money(partner.get("salary"), f"{name} salary")

        contribution_lines.append(_line(accounts["capital_code"], credit=capital_contribution, description=f"{name} capital contribution"))
        total_contribution += capital_contribution
        drawings_lines.append(_line(accounts["drawings_code"], debit=drawings, description=f"{name} drawings"))
        total_drawings += drawings
        interest_capital_lines.append(_line(accounts["capital_code"], credit=interest_on_capital, description=f"{name} interest on capital"))
        total_interest_capital += interest_on_capital
        partner_salary_lines.append(_line(accounts["capital_code"], credit=salary, description=f"{name} partner salary"))
        total_partner_salary += salary
        interest_drawings_lines.append(_line(accounts["drawings_code"], debit=interest_on_drawings, description=f"{name} interest on drawings"))
        total_interest_drawings += interest_on_drawings

    _append_entry(
        entries,
        "Partner capital contributions",
        [_line("1000", debit=total_contribution, description="Cash introduced by partners"), *contribution_lines],
    )
    _append_entry(
        entries,
        "Partner drawings",
        [*drawings_lines, _line("1000", credit=total_drawings, description="Cash withdrawn by partners")],
    )
    _append_entry(
        entries,
        "Interest on capital",
        [_line("5230", debit=total_interest_capital, description="Interest on capital"), *interest_capital_lines],
    )
    _append_entry(
        entries,
        "Partner salaries",
        [_line("5240", debit=total_partner_salary, description="Partner salaries"), *partner_salary_lines],
    )
    _append_entry(
        entries,
        "Interest on drawings",
        [*interest_drawings_lines, _line("4300", credit=total_interest_drawings, description="Interest on drawings income")],
    )

    if profit_allocation_total > 0:
        if ratio_total <= 0 and ratio_partners:
            ratio_total = float(len(ratio_partners))
            ratio_partners = [(accounts, 1.0) for accounts, _ in ratio_partners]
        allocation_lines = []
        running_allocated = 0.0
        for index, (accounts, ratio) in enumerate(ratio_partners, start=1):
            if index == len(ratio_partners):
                share = round(profit_allocation_total - running_allocated, 2)
            else:
                share = round((profit_allocation_total * ratio) / ratio_total, 2)
                running_allocated += share
            allocation_lines.append(_line(accounts["capital_code"], credit=share, description=f"Profit share for {accounts['name']}"))

        _append_entry(
            entries,
            "Profit allocation to partners",
            [_line("3300", debit=profit_allocation_total, description="Profit available for appropriation"), *allocation_lines],
        )


def _manufacturing_entries(entries, inputs):
    raw_materials_purchases = _money(inputs.get("raw_materials_purchases"), "raw_materials_purchases")
    materials_to_production = _money(inputs.get("materials_to_production"), "materials_to_production")
    direct_labor = _money(inputs.get("direct_labor"), "direct_labor")
    factory_overheads = _money(inputs.get("factory_overheads"), "factory_overheads")
    transfer_to_finished_goods = _money(inputs.get("transfer_to_finished_goods"), "transfer_to_finished_goods")
    cash_sales = _money(inputs.get("cash_sales"), "cash_sales")
    credit_sales = _money(inputs.get("credit_sales"), "credit_sales")
    cost_of_goods_sold = _money(inputs.get("cost_of_goods_sold"), "cost_of_goods_sold")
    closing_inventory_adjustment = _money(inputs.get("closing_inventory_adjustment"), "closing_inventory_adjustment")

    _append_entry(
        entries,
        "Purchase of raw materials",
        [
            _line("1210", debit=raw_materials_purchases, description="Raw materials purchased"),
            _line("2000", credit=raw_materials_purchases, description="Accounts payable for raw materials"),
        ],
    )
    _append_entry(
        entries,
        "Issue raw materials to production",
        [
            _line("1220", debit=materials_to_production, description="Raw materials issued to WIP"),
            _line("1210", credit=materials_to_production, description="Raw materials inventory reduced"),
        ],
    )
    _append_entry(
        entries,
        "Direct labor applied to production",
        [
            _line("1220", debit=direct_labor, description="Direct labor in WIP"),
            _line("2210", credit=direct_labor, description="Wages payable"),
        ],
    )
    _append_entry(
        entries,
        "Factory overheads applied",
        [
            _line("1220", debit=factory_overheads, description="Factory overheads absorbed into WIP"),
            _line("2300", credit=factory_overheads, description="Accrued factory overheads"),
        ],
    )
    _append_entry(
        entries,
        "Transfer completed goods to finished inventory",
        [
            _line("1230", debit=transfer_to_finished_goods, description="Finished goods inventory"),
            _line("1220", credit=transfer_to_finished_goods, description="Work in progress cleared"),
        ],
    )
    _append_entry(
        entries,
        "Cash sales of finished goods",
        [
            _line("1000", debit=cash_sales, description="Cash sale of finished goods"),
            _line("4000", credit=cash_sales, description="Sales revenue"),
        ],
    )
    _append_entry(
        entries,
        "Credit sales of finished goods",
        [
            _line("1100", debit=credit_sales, description="Receivable from sale of finished goods"),
            _line("4000", credit=credit_sales, description="Sales revenue"),
        ],
    )
    _append_entry(
        entries,
        "Record cost of goods sold",
        [
            _line("5000", debit=cost_of_goods_sold, description="Cost of finished goods sold"),
            _line("1230", credit=cost_of_goods_sold, description="Finished goods inventory reduced"),
        ],
    )
    _append_entry(
        entries,
        "Closing inventory adjustment",
        [
            _line("1230", debit=closing_inventory_adjustment, description="Closing inventory adjustment"),
            _line("5000", credit=closing_inventory_adjustment, description="Cost of goods sold reduced"),
        ],
    )


def _company_entries(entries, inputs):
    _base_operating_entries(entries, inputs)

    share_capital = _money(inputs.get("share_capital"), "share_capital")
    retained_earnings = _money(inputs.get("retained_earnings"), "retained_earnings")
    dividends = _money(inputs.get("dividends"), "dividends")
    corporation_tax = _money(inputs.get("corporation_tax"), "corporation_tax")
    long_term_loans = _money(inputs.get("long_term_loans"), "long_term_loans")

    _append_entry(
        entries,
        "Share capital introduced",
        [
            _line("1000", debit=share_capital, description="Cash introduced through share capital"),
            _line("3400", credit=share_capital, description="Share capital"),
        ],
    )
    _append_entry(
        entries,
        "Opening retained earnings",
        [
            _line("3500", debit=retained_earnings, description="Opening retained earnings setup"),
            _line("3100", credit=retained_earnings, description="Retained earnings"),
        ],
    )
    _append_entry(
        entries,
        "Dividend payment",
        [
            _line("3420", debit=dividends, description="Dividends declared or paid"),
            _line("1000", credit=dividends, description="Cash used for dividends"),
        ],
    )
    _append_entry(
        entries,
        "Corporation tax accrual",
        [
            _line("5300", debit=corporation_tax, description="Corporation tax expense"),
            _line("2310", credit=corporation_tax, description="Income tax payable"),
        ],
    )
    _append_entry(
        entries,
        "Long-term loan received",
        [
            _line("1000", debit=long_term_loans, description="Loan proceeds received"),
            _line("2500", credit=long_term_loans, description="Long-term loans"),
        ],
    )


def post_guided_entries(company, user, entry_date, business_type, inputs):
    business_type = (business_type or company.business_type or "sole_proprietor").strip().lower()
    partner_accounts = _seed_guided_accounts(company)
    entries_to_post = []

    if business_type == "sole_proprietor":
        _sole_entries(entries_to_post, inputs)
    elif business_type == "partnership":
        _partnership_entries(entries_to_post, inputs, partner_accounts)
    elif business_type == "manufacturing":
        _manufacturing_entries(entries_to_post, inputs)
    elif business_type == "company":
        _company_entries(entries_to_post, inputs)
    else:
        raise ValueError("unsupported business type")

    created_entries = []
    for payload in entries_to_post:
        entry = post_journal_entry(
            company,
            user,
            entry_date=entry_date,
            memo=payload["memo"],
            lines=payload["lines"],
            source_type="guided",
            reference=f"{business_type}-guided",
        )
        created_entries.append(entry)

    db.session.flush()
    return [serialize_journal_entry(entry) for entry in created_entries]
