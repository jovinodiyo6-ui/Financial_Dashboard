from services.finance_service import calculate_finance_summary, calculate_tax_summary
from services.reporting_service import (
    build_accounting_overview,
    build_workforce_overview,
    build_inventory_summary,
    build_project_summary,
    aggregate_org_reports,
    normalized_trial_balance_amount,
)

def build_company_ai_snapshot(company):
    finance = calculate_finance_summary(company)
    tax = calculate_tax_summary(company)
    accounting = build_accounting_overview(company)
    workforce = build_workforce_overview(company)
    inventory = build_inventory_summary(company)
    projects = build_project_summary(company)
    reports = aggregate_org_reports(company.org_id, company.id)

    trial_items = accounting["trial_balance"]["items"]
    current_assets = round(
        sum(
            max(0.0, normalized_trial_balance_amount(item))
            for item in trial_items
            if item["category"] == "asset" and item["subtype"] == "current"
        ),
        2,
    )
    current_liabilities = round(
        sum(
            max(0.0, normalized_trial_balance_amount(item))
            for item in trial_items
            if item["category"] == "liability" and item["subtype"] == "current"
        ),
        2,
    )
    cash_balance = round(
        sum(max(0.0, normalized_trial_balance_amount(item)) for item in trial_items if item["code"] == "1000"),
        2,
    )
    annual_revenue = round(float(reports.get("revenue", 0) or 0), 2)
    annual_expenses = round(float(reports.get("expenses", 0) or 0), 2)
    monthly_inflow = round(max(float(finance["collected_this_month"]), annual_revenue / 12 if annual_revenue else 0), 2)
    baseline_outflow = float(finance["paid_this_month"]) + float(workforce["payroll_this_month"])
    fallback_outflow = annual_expenses / 12 if annual_expenses else (float(finance["open_payables"]) / 3 if finance["open_payables"] else 0)
    monthly_outflow = round(max(baseline_outflow, fallback_outflow, 1.0), 2)
    current_ratio = round(current_assets / current_liabilities, 2) if current_liabilities > 0 else None
    cash_runway_months = round(cash_balance / monthly_outflow, 1) if monthly_outflow > 0 else None

    tax_drag = round(max(float(tax["net_tax_due"]), 0.0) / 3, 2) if float(tax["net_tax_due"]) > 0 else 0.0
    projected_cash = cash_balance
    forecast = []
    for month_number in range(1, 4):
        projected_cash = round(projected_cash + monthly_inflow - monthly_outflow - tax_drag, 2)
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
        "metrics": {
            "cash_balance": cash_balance,
            "current_assets": current_assets,
            "current_liabilities": current_liabilities,
            "current_ratio": current_ratio,
            "annual_revenue": annual_revenue,
            "annual_expenses": annual_expenses,
            "monthly_inflow": monthly_inflow,
            "monthly_outflow": monthly_outflow,
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
        "forecast": forecast,
    }


def build_ai_cfo_alerts(snapshot):
    finance = snapshot["finance"]
    tax = snapshot["tax"]
    inventory = snapshot["inventory"]
    workforce = snapshot["workforce"]
    metrics = snapshot["metrics"]
    alerts = []

    if metrics["current_ratio"] is not None and metrics["current_ratio"] < 1:
        alerts.append(
            {
                "severity": "high",
                "title": "Liquidity risk",
                "message": f"Current ratio is {metrics['current_ratio']}, so short-term obligations are outpacing liquid assets.",
                "recommendation": "Accelerate collections, delay discretionary spend, and review payable timing this week.",
            }
        )
    if float(finance["overdue_receivables"]) > 0:
        alerts.append(
            {
                "severity": "medium",
                "title": "Collections pressure",
                "message": f"There are {finance['overdue_invoice_count']} overdue invoices totaling {round(float(finance['overdue_receivables']), 2)}.",
                "recommendation": "Trigger a collections sequence and escalate the oldest invoices to the owner or finance lead.",
            }
        )
    if float(finance["overdue_payables"]) > 0:
        alerts.append(
            {
                "severity": "medium",
                "title": "Supplier obligations overdue",
                "message": f"Overdue payables total {round(float(finance['overdue_payables']), 2)} across {finance['overdue_bill_count']} bills.",
                "recommendation": "Prioritize critical vendors and schedule payment rails before terms deteriorate.",
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
                "message": f"Estimated net tax due is {round(float(tax['net_tax_due']), 2)} in {tax['jurisdiction_code']}.",
                "recommendation": "Reserve cash now and prepare the filing pack before the next statutory deadline.",
            }
        )
    if snapshot["forecast"] and snapshot["forecast"][-1]["projected_cash"] < 0:
        alerts.append(
            {
                "severity": "high",
                "title": "Projected cash shortfall",
                "message": f"Cash is forecast to fall to {snapshot['forecast'][-1]['projected_cash']} within 90 days.",
                "recommendation": "Cut non-essential outflow, pull collections forward, or line up short-term financing immediately.",
            }
        )
    if float(workforce["contractor_1099_exposure"]) >= 600:
        alerts.append(
            {
                "severity": "low",
                "title": "1099 review",
                "message": f"Contractor exposure this period is {round(float(workforce['contractor_1099_exposure']), 2)}.",
                "recommendation": "Confirm contractor tax details now so year-end compliance does not become a scramble.",
            }
        )

    return alerts


def build_ai_cfo_overview(company):
    snapshot = build_company_ai_snapshot(company)
    alerts = build_ai_cfo_alerts(snapshot)
    top_actions = [alert["recommendation"] for alert in alerts[:4]]
    metrics = snapshot["metrics"]
    narrative = (
        f"{company.name} is carrying {metrics['cash_balance']} in cash with "
        f"{snapshot['finance']['open_receivables']} outstanding receivables and "
        f"{snapshot['finance']['open_payables']} open payables. "
        f"Projected 90-day cash is {snapshot['forecast'][-1]['projected_cash'] if snapshot['forecast'] else metrics['cash_balance']}."
    )
    return {
        **snapshot,
        "alerts": alerts,
        "top_actions": top_actions,
        "narrative": narrative,
    }

def answer_ai_cfo_question(question, overview):
    lowered = str(question or "").strip().lower()
    metrics = overview["metrics"]
    finance = overview["finance"]
    tax = overview["tax"]
    inventory = overview["inventory"]
    workforce = overview["workforce"]

    if "profit" in lowered or "margin" in lowered:
        return (
            f"Recorded annual revenue is {metrics['annual_revenue']} against expenses of {metrics['annual_expenses']}. "
            f"Project margin currently stands at {overview['projects']['total_margin']}."
        )
    if "cash" in lowered or "runway" in lowered or "liquidity" in lowered:
        return (
            f"Cash balance is {metrics['cash_balance']} with a monthly outflow run rate of {metrics['monthly_outflow']}. "
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
    if overview["top_actions"]:
        return f"{overview['narrative']} Top action: {overview['top_actions'][0]}"
    return overview["narrative"]
