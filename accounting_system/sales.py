from __future__ import annotations

from datetime import datetime

from accounting_system.database import connect
from accounting_system.ledger import account_id_by_name, post_entry


def sell_item(item_id: int, quantity: float, customer: str = "Walk-in Customer") -> dict:
    conn = connect()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT id, name, quantity, cost, price FROM inventory WHERE id = ?",
        (item_id,),
    )
    item = cursor.fetchone()
    if item is None:
        conn.close()
        raise ValueError("Item not found.")

    current_qty = float(item["quantity"])
    price = float(item["price"])
    if quantity <= 0:
        conn.close()
        raise ValueError("Quantity must be greater than zero.")
    if current_qty < quantity:
        conn.close()
        raise ValueError("Insufficient stock.")

    total = round(price * quantity, 2)
    sold_at = datetime.now().isoformat(timespec="seconds")

    cursor.execute(
        "INSERT INTO sales(item_id, quantity, total, date, customer) VALUES(?, ?, ?, ?, ?)",
        (item_id, quantity, total, sold_at, customer),
    )
    sale_id = int(cursor.lastrowid)
    cursor.execute(
        "UPDATE inventory SET quantity = quantity - ? WHERE id = ?",
        (quantity, item_id),
    )
    conn.commit()
    conn.close()

    # Sales entry: Dr Cash, Cr Sales Revenue
    cash = account_id_by_name("Cash")
    revenue = account_id_by_name("Sales Revenue")
    post_entry(
        description=f"Sale #{sale_id} - {item['name']}",
        lines=[(cash, total, 0), (revenue, 0, total)],
        date=sold_at,
    )

    return {
        "sale_id": sale_id,
        "item": item["name"],
        "quantity": quantity,
        "unit_price": price,
        "total": total,
        "customer": customer,
        "date": sold_at,
    }

