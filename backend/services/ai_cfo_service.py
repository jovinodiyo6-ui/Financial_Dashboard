from services.finance_service import calculate_finance_summary, calculate_tax_summary
from services.reporting_service import (
    build_accounting_overview,
    build_workforce_overview,
    build_inventory_summary,
    build_project_summary,
)
from services.statement_service import build_financial_statements


def _round(value):
    return round(float(value or 0), 2)


def _pct(value):
    if value is None:
        return "n/a"
    return f"{round(float(value) * 100, 1)}%"


def _status_from_alerts(alerts):
    if any(alert["severity"] == "high" for alert in alerts):
        return "critical"
    if any(alert["severity"] in {"medium", "warning"} for alert in alerts):
        return "warning"
    return "healthy"


def build_company_ai_snapshot(company):
    finance = calculate_finance_summary(company)
    statements = build_financial_statements(company)
    tax = calculate_tax_summary(company)
    accounting = build_accounting_overview(company)
    workforce = build_workforce_overview(company)
    inventory = build_inventory_summary(company)
    projects = build_project_summary(company)

    health = statements["health"]
    profit_or_loss = statements["profit_or_loss"]
    financial_position = statements["financial_position"]
    cash_flow = statements["cash_flow"]

    revenue = _round(max(float(finance["revenue"]), float(profit_or_loss["revenue"]["total"])))
    expenses = _round(max(float(finance["expenses"]), revenue - float(profit_or_loss["current_period_result"] or 0)))
    cash_balance = _round(cash_flow["ending_cash"])
    current_assets = _round(financial_position["current_assets"]["total"])
    current_liabilities = _round(financial_position["current_liabilities"]["total"])
    current_ratio = round(current_assets / current_liabilities, 2) if current_liabilities > 0 else None
    working_capital = _round(current_assets - current_liabilities)

    monthly_revenue = _round(
        max(
            revenue,
            float(finance["collected_this_month"] or 0),
            float(finance["open_receivables"] or 0) * 0.35 if finance["open_receivables"] else 0,
            0,
        )
    )
    monthly_expenses = _round(
        max(
            expenses,
            float(finance["paid_this_month"] or 0),
            float(finance["current_liabilities"] or 0) / 3 if finance["current_liabilities"] else 0,
            1.0,
        )
    )
    monthly_net_cash_generation = _round(monthly_revenue - monthly_expenses)
    cash_runway_months = round(cash_balance / monthly_expenses, 1) if monthly_expenses > 0 else None
    tax_drag = _round(max(float(tax["net_tax_due"] or 0), 0.0) / 3) if float(tax["net_tax_due"] or 0) > 0 else 0.0

    projected_cash = cash_balance
    forecast = []
    for month_number in range(1, 4):
        projected_cash = _round(projected_cash + monthly_net_cash_generation - tax_drag)
        forecast.append(
            {
                "month": month_number,
                "label": f"{month_number * 30} days",
                "projected_cash": projected_cash,
            }
        )

    return {
        "company_id": company.id,
        "company_name": company.name,
        "business_type": company.business_type,
        "metrics": {
            "cash_balance": cash_balance,
            "current_assets": current_assets,
            "current_liabilities": current_liabilities,
            "current_ratio": current_ratio,
            "working_capital": working_capital,
            "revenue": revenue,
            "expenses": expenses,
            "gross_margin_pct": health.get("gross_margin_pct"),
            "net_margin_pct": health.get("net_margin_pct"),
            "monthly_revenue": monthly_revenue,
            "monthly_expenses": monthly_expenses,
            "monthly_net_cash_generation": monthly_net_cash_generation,
            "cash_runway_months": cash_runway_months,
        },
        "finance": finance,
        "tax": tax,
        "workforce": workforce,
        "inventory": {
            "inventory_value": inventory["inventory_value"],
            "low_stock_count": inventory["low_stock_count"],
            "open_purchase_orders": inventory["open_purchase_orders"],
        },
        "projects": {
            "total_revenue": projects["total_revenue"],
            "total_cost": projects["total_cost"],
            "total_margin": projects["total_margin"],
        },
        "accounting": {
            "trial_balance_balanced": accounting["trial_balance"]["balanced"],
            "trial_balance_difference": accounting["trial_balance"]["difference"],
        },
        "statements": statements,
        "data_quality_flags": list(finance.get("data_quality_flags") or []),
        "forecast": forecast,
    }


def build_ai_cfo_alerts(snapshot):
    finance = snapshot["finance"]
    tax = snapshot["tax"]
    inventory = snapshot["inventory"]
    workforce = snapshot["workforce"]
    metrics = snapshot["metrics"]
    data_quality_flags = snapshot["data_quality_flags"]
    alerts = []

    for flag in data_quality_flags:
        alerts.append(
            {
                "severity": "medium",
                "title": "Data quality warning",
                "message": flag,
                "recommendation": "Add missing costs, purchases, or liabilities so the reports reflect real operations.",
            }
        )

    if metrics["current_ratio"] is not None and metrics["current_ratio"] < 1:
        alerts.append(
            {
                "severity": "high",
                "title": "Liquidity risk",
                "message": f"Current ratio is {metrics['current_ratio']}, so short-term obligations are outpacing liquid assets.",
                "recommendation": "Accelerate collections, delay discretionary spend, and review payable timing this week.",
            }
        )
    if metrics["net_margin_pct"] is not None and metrics["net_margin_pct"] > 0.8:
        alerts.append(
            {
                "severity": "medium",
                "title": "Margin looks artificially high",
                "message": f"Net margin is {_pct(metrics['net_margin_pct'])}, which usually means costs are incomplete or understated.",
                "recommendation": "Record cost of sales, operating expenses, and outstanding liabilities before relying on this profit figure.",
            }
        )
    if metrics["net_margin_pct"] is not None and metrics["net_margin_pct"] < 0:
        alerts.append(
            {
                "severity": "high",
                "title": "Business is loss-making",
                "message": f"Net margin is {_pct(metrics['net_margin_pct'])}, so the current operating model is destroying value.",
                "recommendation": "Cut non-essential costs, review pricing, and push collections before cash pressure compounds.",
            }
        )
    if float(finance["overdue_receivables"]) > 0:
        alerts.append(
            {
                "severity": "medium",
                "title": "Collections pressure",
                "message": f"There are {finance['overdue_invoice_count']} overdue invoices totaling {_round(finance['overdue_receivables'])}.",
                "recommendation": "Trigger a collections sequence and escalate the oldest invoices to the owner or finance lead.",
            }
        )
    if float(finance["open_payables"]) > 0:
        alerts.append(
            {
                "severity": "medium",
                "title": "Supplier obligations are building",
                "message": f"Outstanding supplier obligations are {_round(finance['open_payables'])}, with total current liabilities at {_round(finance['current_liabilities'])}.",
                "recommendation": "Schedule supplier settlements and tax reserves before cash becomes constrained.",
            }
        )
    if int(finance["bank_unmatched_count"]) > 0:
        alerts.append(
            {
                "severity": "medium",
                "title": "Bank close backlog",
                "message": f"{finance['bank_unmatched_count']} bank transactions still need reconciliation.",
                "recommendation": "Run the reconciliation workspace and clear unmatched items before month-end reporting.",
            }
        )
    if int(inventory["low_stock_count"]) > 0:
        alerts.append(
            {
                "severity": "medium",
                "title": "Reorder risk",
                "message": f"{inventory['low_stock_count']} inventory items are at or below reorder point.",
                "recommendation": "Release purchase orders for critical SKUs and review safety stock on the fastest movers.",
            }
        )
    if float(tax["net_tax_due"]) > 0:
        alerts.append(
            {
                "severity": "medium",
                "title": "Tax liability due",
                "message": f"Estimated net tax due is {_round(tax['net_tax_due'])} in {tax['jurisdiction_code']}.",
                "recommendation": "Reserve cash now and prepare the filing pack before the next statutory deadline.",
            }
        )
    if snapshot["forecast"] and snapshot["forecast"][-1]["projected_cash"] < 0:
        alerts.append(
            {
                "severity": "high",
                "title": "Projected cash shortfall",
                "message": f"Cash is forecast to fall to {snapshot['forecast'][-1]['projected_cash']} within 90 days.",
                "recommendation": "Increase collections or reduce monthly outflow immediately to avoid a cash crunch.",
            }
        )
    if float(workforce["contractor_1099_exposure"]) >= 600:
        alerts.append(
            {
                "severity": "low",
                "title": "1099 review",
                "message": f"Contractor exposure this period is {_round(workforce['contractor_1099_exposure'])}.",
                "recommendation": "Confirm contractor tax details now so year-end compliance does not become a scramble.",
            }
        )

    return alerts


def _build_ai_narrative(company, snapshot, alerts):
    metrics = snapshot["metrics"]
    finance = snapshot["finance"]

    if metrics["current_ratio"] is not None and metrics["current_ratio"] >= 1.5:
        opening = (
            f"{company.name} has strong short-term liquidity with {_round(metrics['cash_balance'])} in cash "
            f"and a current ratio of {metrics['current_ratio']}."
        )
    elif metrics["current_ratio"] is not None and metrics["current_ratio"] < 1:
        opening = (
            f"{company.name} is under liquidity pressure with only {_round(metrics['cash_balance'])} in cash "
            f"against current liabilities of {_round(metrics['current_liabilities'])}."
        )
    else:
        opening = f"{company.name} is carrying {_round(metrics['cash_balance'])} in cash."

    performance = (
        f"Revenue is {_round(metrics['revenue'])} against expenses of {_round(metrics['expenses'])}, "
        f"which implies a net margin of {_pct(metrics['net_margin_pct'])}."
    )

    if snapshot["data_quality_flags"]:
        caveat = f"However, {snapshot['data_quality_flags'][0]}"
    elif float(finance["open_payables"] or 0) > 0:
        caveat = (
            f"Outstanding payables of {_round(finance['open_payables'])} should be planned into near-term cash decisions."
        )
    else:
        caveat = "The books look structurally cleaner, so the statements are more decision-ready."

    next_move = alerts[0]["recommendation"] if alerts else "Keep recording costs and liabilities so forecasts stay grounded."
    forecast_line = (
        f"Based on the current run rate, 90-day projected cash is "
        f"{snapshot['forecast'][-1]['projected_cash'] if snapshot['forecast'] else _round(metrics['cash_balance'])}."
    )
    return " ".join([opening, performance, caveat, forecast_line, next_move])


def build_ai_cfo_overview(company):
    snapshot = build_company_ai_snapshot(company)
    alerts = build_ai_cfo_alerts(snapshot)
    top_actions = [alert["recommendation"] for alert in alerts[:4]]
    health_status = _status_from_alerts(alerts)
    narrative = _build_ai_narrative(company, snapshot, alerts)

    return {
        **snapshot,
        "alerts": alerts,
        "health_status": health_status,
        "top_actions": top_actions,
        "narrative": narrative,
        "summary": narrative,
    }


def answer_ai_cfo_question(question, overview):
    lowered = str(question or "").strip().lower()
    metrics = overview["metrics"]
    finance = overview["finance"]
    tax = overview["tax"]
    inventory = overview["inventory"]
    workforce = overview["workforce"]
    flags = overview.get("data_quality_flags") or []

    if "profit" in lowered or "margin" in lowered:
        answer = (
            f"Recorded revenue is {metrics['revenue']} against expenses of {metrics['expenses']}, "
            f"so net margin is {_pct(metrics['net_margin_pct'])}."
        )
        if flags:
            answer += f" The biggest caution is: {flags[0]}"
        return answer
    if "cash" in lowered or "runway" in lowered or "liquidity" in lowered:
        return (
            f"Cash balance is {metrics['cash_balance']} with monthly revenue of {metrics['monthly_revenue']} "
            f"and monthly expenses of {metrics['monthly_expenses']}. "
            f"Estimated cash runway is {metrics['cash_runway_months']} months."
        )
    if "tax" in lowered or "vat" in lowered or "filing" in lowered:
        return (
            f"Estimated net tax due is {tax['net_tax_due']} under {tax['jurisdiction_code']}. "
            f"Prepare the next {tax['filing_frequency']} filing before cash is committed elsewhere."
        )
    if "inventory" in lowered or "stock" in lowered or "purchase order" in lowered:
        return (
            f"{inventory['low_stock_count']} items are at reorder risk and there are "
            f"{inventory['open_purchase_orders']} open purchase orders."
        )
    if "payroll" in lowered or "staff" in lowered or "contractor" in lowered:
        return (
            f"Payroll cash this month is {workforce['payroll_this_month']} and contractor 1099 exposure is "
            f"{workforce['contractor_1099_exposure']}."
        )
    if flags:
        return f"{overview['narrative']} Data quality watch: {flags[0]}"
    if overview["top_actions"]:
        return f"{overview['narrative']} Top action: {overview['top_actions'][0]}"
    return overview["narrative"]
