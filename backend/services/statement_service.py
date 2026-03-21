from __future__ import annotations

import datetime
from collections import defaultdict

from extensions import db
from models import CompanyPartner, JournalEntry, JournalLine, LedgerAccount
from services.reporting_service import build_trial_balance, normalized_trial_balance_amount
from utils import iso_date


POSTED_STATUSES = {"posted", "reversed"}


def _round(value):
    return round(float(value or 0), 2)


def _safe_pct(numerator, denominator):
    denominator_value = float(denominator or 0)
    if denominator_value == 0:
        return None
    return round(float(numerator or 0) / denominator_value, 4)


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


def _posted_entry_payloads(company):
    accounts = LedgerAccount.query.filter_by(company_id=company.id).all()
    account_lookup = {account.id: account for account in accounts}
    entries = (
        JournalEntry.query.filter_by(company_id=company.id)
        .filter(JournalEntry.status.in_(POSTED_STATUSES))
        .order_by(JournalEntry.entry_date.asc(), JournalEntry.id.asc())
        .all()
    )
    if not entries:
        return [], account_lookup

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
        account = account_lookup.get(line.account_id)
        grouped_lines[line.journal_entry_id].append(
            {
                "account_id": line.account_id,
                "account_code": account.code if account else "",
                "account_name": account.name if account else "",
                "category": account.category if account else "",
                "subtype": account.subtype if account else "",
                "debit": _round(line.debit),
                "credit": _round(line.credit),
                "description": line.description or "",
            }
        )

    payload = []
    for entry in entries:
        payload.append(
            {
                "id": entry.id,
                "entry_number": entry.entry_number,
                "entry_date": iso_date(entry.entry_date),
                "memo": entry.memo,
                "reference": entry.reference or "",
                "status": entry.status,
                "lines": grouped_lines.get(entry.id, []),
            }
        )
    return payload, account_lookup


def _activity_by_code(entry_payloads):
    activity = defaultdict(
        lambda: {
            "name": "",
            "category": "",
            "subtype": "",
            "debit": 0.0,
            "credit": 0.0,
        }
    )
    for entry in entry_payloads:
        for line in entry["lines"]:
            bucket = activity[line["account_code"]]
            bucket["name"] = line["account_name"]
            bucket["category"] = line["category"]
            bucket["subtype"] = line["subtype"]
            bucket["debit"] = _round(bucket["debit"] + float(line["debit"] or 0))
            bucket["credit"] = _round(bucket["credit"] + float(line["credit"] or 0))
    return activity


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


def _find_trial_item(trial_balance, code):
    for item in trial_balance["items"]:
        if str(item.get("code") or "").strip() == str(code):
            return item
    return None


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


def _build_cash_flow(trial_balance, entry_payloads, account_lookup):
    cash_account_ids = {
        account.id
        for account in account_lookup.values()
        if str(account.code or "").strip() == "1000" or "cash" in str(account.name or "").lower()
    }
    if not entry_payloads:
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

    sections = {"operating": [], "investing": [], "financing": []}
    totals = {"operating": 0.0, "investing": 0.0, "financing": 0.0}
    net_cash_change = 0.0

    for entry in entry_payloads:
        cash_delta = _round(
            sum(
                float(line["debit"] or 0) - float(line["credit"] or 0)
                for line in entry["lines"]
                if line["account_id"] in cash_account_ids
            )
        )
        if abs(cash_delta) < 0.01:
            continue

        counterparty_accounts = [
            account_lookup[line["account_id"]]
            for line in entry["lines"]
            if line["account_id"] not in cash_account_ids and line["account_id"] in account_lookup
        ]
        section = _classify_cash_flow(counterparty_accounts)
        payload = {
            "entry_id": entry["id"],
            "entry_number": entry["entry_number"],
            "entry_date": entry["entry_date"],
            "memo": entry["memo"],
            "reference": entry["reference"],
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


def _build_health_summary(profit_or_loss, financial_position, cash_flow):
    revenue_total = float(profit_or_loss["revenue"]["total"] or 0)
    gross_profit = float(profit_or_loss["gross_profit"] or 0)
    current_result = float(profit_or_loss["current_period_result"] or 0)
    total_assets = float(financial_position["total_assets"] or 0)
    current_assets = float(financial_position["current_assets"]["total"] or 0)
    current_liabilities = float(financial_position["current_liabilities"]["total"] or 0)
    total_liabilities = float(financial_position["total_liabilities"] or 0)
    operating_cash = float(cash_flow["operating"]["total"] or 0)

    return {
        "gross_margin_pct": _safe_pct(gross_profit, revenue_total),
        "net_margin_pct": _safe_pct(current_result, revenue_total),
        "current_ratio": _safe_pct(current_assets, current_liabilities),
        "working_capital": _round(current_assets - current_liabilities),
        "debt_ratio": _safe_pct(total_liabilities, total_assets),
        "operating_cash_flow": _round(operating_cash),
        "cash_conversion_pct": _safe_pct(operating_cash, current_result),
        "statement_quality": "balanced" if financial_position["balanced"] else "attention",
    }


def _build_manufacturing_account(trial_balance, activity):
    raw_materials_balance = _trial_amount(_find_trial_item(trial_balance, "1210") or {})
    work_in_progress_balance = _trial_amount(_find_trial_item(trial_balance, "1220") or {})
    finished_goods_balance = _trial_amount(_find_trial_item(trial_balance, "1230") or {})
    raw_materials_purchases = _round(activity["1210"]["debit"])
    raw_materials_issued = _round(activity["1210"]["credit"])
    direct_labor = _round(activity["2210"]["credit"])
    factory_overheads = _round(activity["2300"]["credit"])
    prime_cost = _round(raw_materials_issued + direct_labor)
    manufacturing_cost_added = _round(raw_materials_issued + direct_labor + factory_overheads)
    cost_of_production = _round(activity["1220"]["credit"])

    return {
        "basis": "activity-driven",
        "raw_materials_purchases": raw_materials_purchases,
        "raw_materials_issued": raw_materials_issued,
        "direct_labor": direct_labor,
        "factory_overheads": factory_overheads,
        "prime_cost": prime_cost,
        "manufacturing_cost_added": manufacturing_cost_added,
        "cost_of_production_transferred": cost_of_production,
        "closing_raw_materials": raw_materials_balance,
        "closing_work_in_progress": work_in_progress_balance,
        "closing_finished_goods": finished_goods_balance,
    }


def _partner_capital_codes(company):
    partners = (
        CompanyPartner.query.filter_by(company_id=company.id)
        .order_by(CompanyPartner.display_order.asc())
        .all()
    )
    items = []
    for index, partner in enumerate(partners, start=1):
        items.append(
            {
                "name": partner.name,
                "capital_code": f"30{index + 10:02d}",
                "drawings_code": f"32{index + 10:02d}",
            }
        )
    return items


def _build_partnership_appropriation(company, profit_or_loss, entry_payloads, activity):
    partner_codes = {item["capital_code"]: item["name"] for item in _partner_capital_codes(company)}
    allocations = defaultdict(float)
    interest_on_capital_allocations = defaultdict(float)
    salary_allocations = defaultdict(float)
    drawings_interest_allocations = defaultdict(float)

    for entry in entry_payloads:
        codes = {line["account_code"] for line in entry["lines"]}
        if "3300" in codes:
            for line in entry["lines"]:
                if line["account_code"] in partner_codes and float(line["credit"] or 0) > 0:
                    allocations[partner_codes[line["account_code"]]] += float(line["credit"] or 0)
        if "5230" in codes:
            for line in entry["lines"]:
                if line["account_code"] in partner_codes and float(line["credit"] or 0) > 0:
                    interest_on_capital_allocations[partner_codes[line["account_code"]]] += float(line["credit"] or 0)
        if "5240" in codes:
            for line in entry["lines"]:
                if line["account_code"] in partner_codes and float(line["credit"] or 0) > 0:
                    salary_allocations[partner_codes[line["account_code"]]] += float(line["credit"] or 0)
        if "4300" in codes:
            for line in entry["lines"]:
                partner_name = partner_codes.get(line["account_code"], "")
                if partner_name and float(line["debit"] or 0) > 0:
                    drawings_interest_allocations[partner_name] += float(line["debit"] or 0)

    profit_before_appropriation = _round(profit_or_loss["profit_after_tax"])
    interest_on_drawings = _round(activity["4300"]["credit"])
    adjusted_profit = _round(profit_before_appropriation + interest_on_drawings)
    interest_on_capital = _round(activity["5230"]["debit"])
    partner_salaries = _round(activity["5240"]["debit"])
    residual_profit = _round(adjusted_profit - interest_on_capital - partner_salaries)

    allocation_items = [
        {"partner": name, "amount": _round(amount)}
        for name, amount in sorted(allocations.items())
    ]
    return {
        "profit_before_appropriation": profit_before_appropriation,
        "interest_on_drawings": {
            "total": interest_on_drawings,
            "items": [
                {"partner": name, "amount": _round(amount)}
                for name, amount in sorted(drawings_interest_allocations.items())
            ],
        },
        "adjusted_profit_available": adjusted_profit,
        "interest_on_capital": {
            "total": interest_on_capital,
            "items": [
                {"partner": name, "amount": _round(amount)}
                for name, amount in sorted(interest_on_capital_allocations.items())
            ],
        },
        "partner_salaries": {
            "total": partner_salaries,
            "items": [
                {"partner": name, "amount": _round(amount)}
                for name, amount in sorted(salary_allocations.items())
            ],
        },
        "residual_profit": residual_profit,
        "profit_share_allocations": {
            "total": _round(sum(float(item["amount"]) for item in allocation_items)),
            "items": allocation_items,
        },
    }


def _build_special_reports(company, trial_balance, profit_or_loss, entry_payloads, activity):
    reports = {}
    business_type = str(company.business_type or "").strip().lower()
    if business_type == "manufacturing":
        reports["manufacturing_account"] = _build_manufacturing_account(trial_balance, activity)
    if business_type == "partnership":
        reports["partnership_appropriation"] = _build_partnership_appropriation(
            company,
            profit_or_loss,
            entry_payloads,
            activity,
        )
    return reports


def build_financial_statements(company):
    trial_balance = build_trial_balance(company)
    entry_payloads, account_lookup = _posted_entry_payloads(company)
    activity = _activity_by_code(entry_payloads)
    profit_or_loss = _build_profit_or_loss(trial_balance)
    financial_position = _build_financial_position(trial_balance, profit_or_loss)
    cash_flow = _build_cash_flow(trial_balance, entry_payloads, account_lookup)
    health = _build_health_summary(profit_or_loss, financial_position, cash_flow)
    special_reports = _build_special_reports(
        company,
        trial_balance,
        profit_or_loss,
        entry_payloads,
        activity,
    )

    return {
        "business_type": company.business_type,
        "generated_at": datetime.datetime.now(datetime.UTC).isoformat(),
        "trial_balance_balanced": bool(trial_balance["balanced"]),
        "trial_balance_difference": _round(trial_balance["difference"]),
        "health": health,
        "profit_or_loss": profit_or_loss,
        "financial_position": financial_position,
        "cash_flow": cash_flow,
        "special_reports": special_reports,
    }
