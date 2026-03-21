from __future__ import annotations

from accounting_system.database import connect
from shared.accounting_core import build_trial_balance_report, infer_normal_balance


def total_sales() -> float:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute("SELECT COALESCE(SUM(total), 0) AS total FROM sales")
    result = float(cursor.fetchone()["total"])
    conn.close()
    return result


def inventory_value() -> float:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute("SELECT COALESCE(SUM(quantity * cost), 0) AS value FROM inventory")
    result = float(cursor.fetchone()["value"])
    conn.close()
    return result


def total_expenses() -> float:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute("SELECT COALESCE(SUM(amount), 0) AS expenses FROM expenses")
    result = float(cursor.fetchone()["expenses"])
    conn.close()
    return result


def income_statement() -> dict:
    revenue = total_sales()
    expenses = total_expenses()
    return {
        "revenue": revenue,
        "expenses": expenses,
        "net_profit": round(revenue - expenses, 2),
    }


def balance_sheet() -> dict:
    assets = inventory_value()
    income = income_statement()
    equity = income["net_profit"]
    liabilities = 0.0
    return {
        "assets": assets,
        "liabilities": liabilities,
        "equity": equity,
    }


def trial_balance() -> list[dict]:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, type FROM accounts ORDER BY name")
    accounts = [
        {
            "id": row["id"],
            "name": row["name"],
            "account": row["name"],
            "type": row["type"],
            "category": row["type"],
            "normal_balance": infer_normal_balance(row["type"]),
        }
        for row in cursor.fetchall()
    ]
    cursor.execute("SELECT account_id, debit, credit FROM journal_lines")
    lines = [dict(row) for row in cursor.fetchall()]
    conn.close()
    report = build_trial_balance_report(accounts, lines)
    return [
        {
            "account": item["name"],
            "total_debit": item["debit_total"],
            "total_credit": item["credit_total"],
        }
        for item in report["items"]
    ]
