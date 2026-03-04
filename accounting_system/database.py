from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "accounting.db"


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def create_tables() -> None:
    conn = connect()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'cashier'
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS inventory(
            id INTEGER PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            quantity REAL NOT NULL DEFAULT 0,
            cost REAL NOT NULL DEFAULT 0,
            price REAL NOT NULL DEFAULT 0
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS sales(
            id INTEGER PRIMARY KEY,
            item_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            total REAL NOT NULL,
            date TEXT NOT NULL,
            customer TEXT NOT NULL DEFAULT 'Walk-in Customer',
            FOREIGN KEY(item_id) REFERENCES inventory(id)
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS expenses(
            id INTEGER PRIMARY KEY,
            description TEXT NOT NULL,
            amount REAL NOT NULL
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS accounts(
            id INTEGER PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS journal_entries(
            id INTEGER PRIMARY KEY,
            date TEXT NOT NULL,
            description TEXT NOT NULL
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS journal_lines(
            id INTEGER PRIMARY KEY,
            entry_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            debit REAL NOT NULL DEFAULT 0,
            credit REAL NOT NULL DEFAULT 0,
            FOREIGN KEY(entry_id) REFERENCES journal_entries(id),
            FOREIGN KEY(account_id) REFERENCES accounts(id)
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS active_sessions(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            login_time TEXT NOT NULL
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS user_activity(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            action TEXT NOT NULL,
            module TEXT NOT NULL DEFAULT 'system',
            time TEXT NOT NULL
        )
        """
    )

    _seed_defaults(cursor)
    conn.commit()
    conn.close()


def _seed_defaults(cursor: sqlite3.Cursor) -> None:
    cursor.execute(
        "INSERT OR IGNORE INTO users(username, password, role) VALUES(?, ?, ?)",
        ("admin", "admin123", "admin"),
    )

    default_accounts = [
        ("Cash", "Asset"),
        ("Inventory", "Asset"),
        ("Accounts Payable", "Liability"),
        ("Sales Revenue", "Revenue"),
        ("Operating Expenses", "Expense"),
        ("Owner Equity", "Equity"),
    ]
    cursor.executemany(
        "INSERT OR IGNORE INTO accounts(name, type) VALUES(?, ?)",
        default_accounts,
    )
