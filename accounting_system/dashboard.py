from __future__ import annotations

import matplotlib.pyplot as plt
from matplotlib.dates import DateFormatter
import pandas as pd

from accounting_system.database import connect


def sales_chart() -> None:
    conn = connect()
    data = pd.read_sql_query("SELECT date, total FROM sales ORDER BY date", conn)
    conn.close()

    if data.empty:
        print("No sales available yet.")
        return

    data["date"] = pd.to_datetime(data["date"])
    grouped = data.groupby(data["date"].dt.date)["total"].sum().reset_index()
    grouped["date"] = pd.to_datetime(grouped["date"])

    fig, ax = plt.subplots(figsize=(9, 4.5))
    ax.plot(grouped["date"], grouped["total"], marker="o")
    ax.set_title("Sales Performance")
    ax.set_xlabel("Date")
    ax.set_ylabel("Sales Total")
    ax.xaxis.set_major_formatter(DateFormatter("%Y-%m-%d"))
    plt.xticks(rotation=30, ha="right")
    plt.tight_layout()
    plt.show()

