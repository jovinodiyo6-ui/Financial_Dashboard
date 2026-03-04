from __future__ import annotations

from accounting_system.database import connect


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
    cursor.execute(
        """
        SELECT a.name AS account,
               COALESCE(SUM(jl.debit), 0) AS total_debit,
               COALESCE(SUM(jl.credit), 0) AS total_credit
        FROM accounts a
        LEFT JOIN journal_lines jl ON jl.account_id = a.id
        GROUP BY a.id, a.name
        ORDER BY a.name
        """
    )
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

