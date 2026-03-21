from __future__ import annotations

from collections import defaultdict

from extensions import db
from models import JournalEntry, JournalLine, LedgerAccount
from services.reporting_service import build_trial_balance, normalized_trial_balance_amount
from utils import iso_date


POSTED_STATUSES = {"posted", "reversed"}


def _round(value):
    return round(float(value or 0), 2)


def _trial_amount(item):
    return _round(max(0.0, normalized_trial_balance_amount(item)))


def _line_item(item):
    return {
        "code": item.get("code", ""),
        "name": item.get("name") or item.get("account", ""),
        "category": item.get("category", ""),
        "subtype": item.get("subtype", ""),
        "amount": _trial_amount(item),
    }


def _sum_amount(items):
    return _round(sum(float(item.get("amount") or 0) for item in items))


def _classify_expense(item):
    code = str(item.get("code") or "").strip()
    name = str(item.get("name") or "").strip().lower()
    subtype = str(item.get("subtype") or "").strip().lower()

    if code == "5000" or "cost of goods sold" in name:
        return "cost_of_sales"
    if subtype == "appropriation":
        return "appropriation"
    if code == "5300" or "tax" in name:
        return "tax"
    if subtype == "other":
        return "other"
    return "operating"


def _build_profit_or_loss(trial_balance):
    revenue_items = []
    cost_of_sales_items = []
    operating_expense_items = []
    other_expense_items = []
    tax_expense_items = []
    appropriation_items = []

    for item in trial_balance["items"]:
        category = str(item.get("category") or "").strip().lower()
        if category == "revenue":
            revenue_items.append(_line_item(item))
            continue
        if category != "expense":
            continue

        bucket = _classify_expense(item)
        line = _line_item(item)
        if bucket == "cost_of_sales":
            cost_of_sales_items.append(line)
        elif bucket == "tax":
            tax_expense_items.append(line)
        elif bucket == "appropriation":
            appropriation_items.append(line)
        elif bucket == "other":
            other_expense_items.append(line)
        else:
            operating_expense_items.append(line)

    revenue_total = _sum_amount(revenue_items)
    cost_of_sales_total = _sum_amount(cost_of_sales_items)
    gross_profit = _round(revenue_total - cost_of_sales_total)
    operating_expenses_total = _sum_amount(operating_expense_items)
    other_expenses_total = _sum_amount(other_expense_items)
    profit_before_tax = _round(gross_profit - operating_expenses_total - other_expenses_total)
    tax_expense_total = _sum_amount(tax_expense_items)
    profit_after_tax = _round(profit_before_tax - tax_expense_total)
    appropriation_total = _sum_amount(appropriation_items)
    current_period_result = _round(
        revenue_total
        - cost_of_sales_total
        - operating_expenses_total
        - other_expenses_total
        - tax_expense_total
        - appropriation_total
    )

    return {
        "revenue": {"items": revenue_items, "total": revenue_total},
        "cost_of_sales": {"items": cost_of_sales_items, "total": cost_of_sales_total},
        "gross_profit": gross_profit,
        "operating_expenses": {"items": operating_expense_items, "total": operating_expenses_total},
        "other_expenses": {"items": other_expense_items, "total": other_expenses_total},
        "profit_before_tax": profit_before_tax,
        "tax_expense": {"items": tax_expense_items, "total": tax_expense_total},
        "profit_after_tax": profit_after_tax,
        "appropriations": {"items": appropriation_items, "total": appropriation_total},
        "current_period_result": current_period_result,
        "residual_profit_after_appropriation": _round(profit_after_tax - appropriation_total),
    }


def _bucket_items(trial_balance, *, category, subtype=None):
    result = []
    for item in trial_balance["items"]:
        if str(item.get("category") or "").strip().lower() != category:
            continue
        if subtype is not None and str(item.get("subtype") or "").strip().lower() != subtype:
            continue
        result.append(_line_item(item))
    return result


def _build_financial_position(trial_balance, profit_or_loss):
    current_assets = _bucket_items(trial_balance, category="asset", subtype="current")
    non_current_assets = _bucket_items(trial_balance, category="asset", subtype="non-current")
    current_liabilities = _bucket_items(trial_balance, category="liability", subtype="current")
    non_current_liabilities = _bucket_items(trial_balance, category="liability", subtype="non-current")
    equity_items = _bucket_items(trial_balance, category="equity")

    current_year_earnings = _round(profit_or_loss["current_period_result"])
    equity_total = _round(_sum_amount(equity_items) + current_year_earnings)
    total_assets = _round(_sum_amount(current_assets) + _sum_amount(non_current_assets))
    total_liabilities = _round(_sum_amount(current_liabilities) + _sum_amount(non_current_liabilities))
    balance_difference = _round(total_assets - total_liabilities - equity_total)

    return {
        "current_assets": {"items": current_assets, "total": _sum_amount(current_assets)},
        "non_current_assets": {"items": non_current_assets, "total": _sum_amount(non_current_assets)},
        "total_assets": total_assets,
        "current_liabilities": {
            "items": current_liabilities,
            "total": _sum_amount(current_liabilities),
        },
        "non_current_liabilities": {
            "items": non_current_liabilities,
            "total": _sum_amount(non_current_liabilities),
        },
        "total_liabilities": total_liabilities,
        "equity": {
            "items": equity_items,
            "current_year_earnings": current_year_earnings,
            "total": equity_total,
        },
        "balanced": abs(balance_difference) < 0.01,
        "difference": balance_difference,
    }


def _classify_cash_flow(counterparty_accounts):
    for account in counterparty_accounts:
        category = str(account.category or "").strip().lower()
        subtype = str(account.subtype or "").strip().lower()
        name = str(account.name or "").strip().lower()
        if category == "equity":
            return "financing"
        if category == "liability" and subtype == "non-current":
            return "financing"
        if category == "liability" and "loan" in name:
            return "financing"
        if category == "asset" and subtype == "non-current":
            return "investing"
    return "operating"


def _build_cash_flow(company, trial_balance):
    accounts = LedgerAccount.query.filter_by(company_id=company.id).all()
    account_lookup = {account.id: account for account in accounts}
    cash_account_ids = {
        account.id
        for account in accounts
        if str(account.code or "").strip() == "1000" or "cash" in str(account.name or "").lower()
    }

    sections = {"operating": [], "investing": [], "financing": []}
    totals = {"operating": 0.0, "investing": 0.0, "financing": 0.0}

    entries = (
        JournalEntry.query.filter_by(company_id=company.id)
        .filter(JournalEntry.status.in_(POSTED_STATUSES))
        .order_by(JournalEntry.entry_date.asc(), JournalEntry.id.asc())
        .all()
    )
    if not entries:
        ending_cash = _round(
            sum(
                _trial_amount(item)
                for item in trial_balance["items"]
                if str(item.get("code") or "").strip() == "1000"
            )
        )
        return {
            "opening_cash": ending_cash,
            "net_change_in_cash": 0.0,
            "ending_cash": ending_cash,
            "operating": {"items": [], "total": 0.0},
            "investing": {"items": [], "total": 0.0},
            "financing": {"items": [], "total": 0.0},
        }

    entry_ids = [entry.id for entry in entries]
    line_rows = (
        db.session.query(JournalLine)
        .filter(JournalLine.journal_entry_id.in_(entry_ids))
        .order_by(
            JournalLine.journal_entry_id.asc(),
            JournalLine.line_number.asc(),
            JournalLine.id.asc(),
        )
        .all()
    )

    grouped_lines = defaultdict(list)
    for line in line_rows:
        grouped_lines[line.journal_entry_id].append(line)

    net_cash_change = 0.0
    for entry in entries:
        lines = grouped_lines.get(entry.id, [])
        cash_delta = _round(
            sum(
                float(line.debit or 0) - float(line.credit or 0)
                for line in lines
                if line.account_id in cash_account_ids
            )
        )
        if abs(cash_delta) < 0.01:
            continue

        counterparty_accounts = [
            account_lookup[line.account_id]
            for line in lines
            if line.account_id not in cash_account_ids and line.account_id in account_lookup
        ]
        section = _classify_cash_flow(counterparty_accounts)
        payload = {
            "entry_id": entry.id,
            "entry_number": entry.entry_number,
            "entry_date": iso_date(entry.entry_date),
            "memo": entry.memo,
            "reference": entry.reference or "",
            "amount": cash_delta,
        }
        sections[section].append(payload)
        totals[section] = _round(totals[section] + cash_delta)
        net_cash_change = _round(net_cash_change + cash_delta)

    ending_cash = _round(
        sum(
            _trial_amount(item)
            for item in trial_balance["items"]
            if str(item.get("code") or "").strip() == "1000"
        )
    )
    opening_cash = _round(ending_cash - net_cash_change)

    return {
        "opening_cash": opening_cash,
        "net_change_in_cash": net_cash_change,
        "ending_cash": ending_cash,
        "operating": {"items": sections["operating"], "total": totals["operating"]},
        "investing": {"items": sections["investing"], "total": totals["investing"]},
        "financing": {"items": sections["financing"], "total": totals["financing"]},
    }


def build_financial_statements(company):
    trial_balance = build_trial_balance(company)
    profit_or_loss = _build_profit_or_loss(trial_balance)
    financial_position = _build_financial_position(trial_balance, profit_or_loss)
    cash_flow = _build_cash_flow(company, trial_balance)

    return {
        "business_type": company.business_type,
        "trial_balance_balanced": bool(trial_balance["balanced"]),
        "trial_balance_difference": _round(trial_balance["difference"]),
        "profit_or_loss": profit_or_loss,
        "financial_position": financial_position,
        "cash_flow": cash_flow,
    }
