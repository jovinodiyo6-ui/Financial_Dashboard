from __future__ import annotations

from datetime import datetime
from typing import Iterable

from accounting_system.database import connect


LedgerLine = tuple[int, float, float]


def validate_entry(lines: Iterable[LedgerLine]) -> None:
    lines = list(lines)
    debit_total = sum(line[1] for line in lines)
    credit_total = sum(line[2] for line in lines)
    if round(debit_total, 2) != round(credit_total, 2):
        raise ValueError("Debits and credits must balance.")


def post_entry(description: str, lines: Iterable[LedgerLine], date: str | None = None) -> int:
    lines = list(lines)
    validate_entry(lines)

    conn = connect()
    cursor = conn.cursor()

    entry_date = date or datetime.now().isoformat(timespec="seconds")
    cursor.execute(
        "INSERT INTO journal_entries(date, description) VALUES (?, ?)",
        (entry_date, description),
    )
    entry_id = int(cursor.lastrowid)

    cursor.executemany(
        """
        INSERT INTO journal_lines(entry_id, account_id, debit, credit)
        VALUES (?, ?, ?, ?)
        """,
        [(entry_id, account_id, debit, credit) for account_id, debit, credit in lines],
    )

    conn.commit()
    conn.close()
    return entry_id


def account_id_by_name(name: str) -> int:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM accounts WHERE name = ?", (name,))
    row = cursor.fetchone()
    conn.close()
    if row is None:
        raise ValueError(f"Account '{name}' does not exist.")
    return int(row["id"])

