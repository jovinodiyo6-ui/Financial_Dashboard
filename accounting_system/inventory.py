from __future__ import annotations

from accounting_system.database import connect


def add_item(name: str, quantity: float, cost: float, price: float) -> None:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO inventory(name, quantity, cost, price) VALUES(?, ?, ?, ?)",
        (name, quantity, cost, price),
    )
    conn.commit()
    conn.close()


def update_stock(item_id: int, qty: float) -> None:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE inventory SET quantity = quantity + ? WHERE id = ?",
        (qty, item_id),
    )
    conn.commit()
    conn.close()


def list_items() -> list[dict]:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, quantity, cost, price FROM inventory ORDER BY name")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def get_item(item_id: int) -> dict | None:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, name, quantity, cost, price FROM inventory WHERE id = ?",
        (item_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

