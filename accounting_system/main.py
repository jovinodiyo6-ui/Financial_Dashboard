from __future__ import annotations

import tkinter as tk
from tkinter import messagebox, ttk

from accounting_system.activity import active_user_count, end_session, recent_activity, record_activity
from accounting_system import dashboard as chart_dashboard
from accounting_system.database import create_tables
from accounting_system.inventory import add_item, list_items
from accounting_system.invoice_pdf import generate_invoice
from accounting_system.reports import balance_sheet, income_statement, inventory_value, total_sales, trial_balance
from accounting_system.sales import sell_item


class AccountingDashboard:
    def __init__(self, username: str) -> None:
        create_tables()
        self.username = username
        self.root = tk.Tk()
        self.root.title("Accounting & Inventory System")
        self.root.geometry("900x600")
        self.root.protocol("WM_DELETE_WINDOW", self.handle_logout)

        self._build_ui()
        self.refresh_inventory()
        self.refresh_live_widgets()

    def _build_ui(self) -> None:
        title = tk.Label(
            self.root,
            text=f"Accounting Dashboard - User: {self.username}",
            font=("Arial", 18, "bold"),
        )
        title.pack(pady=10)

        stats = tk.Frame(self.root)
        stats.pack(fill="x", padx=12)
        self.active_users_label = tk.Label(stats, text="Active Users: 0", font=("Arial", 12, "bold"))
        self.active_users_label.pack(side="left", padx=6)
        self.live_sales_label = tk.Label(stats, text="Total Sales: 0.00", font=("Arial", 12))
        self.live_sales_label.pack(side="left", padx=12)
        self.live_inventory_label = tk.Label(stats, text="Inventory Value: 0.00", font=("Arial", 12))
        self.live_inventory_label.pack(side="left", padx=12)
        tk.Button(stats, text="Logout", command=self.handle_logout).pack(side="right", padx=8)

        body = tk.Frame(self.root)
        body.pack(fill="both", expand=True, padx=12, pady=10)

        left = tk.LabelFrame(body, text="Inventory", padx=8, pady=8)
        left.pack(side="left", fill="both", expand=True)
        right = tk.LabelFrame(body, text="Actions", padx=8, pady=8)
        right.pack(side="right", fill="both", expand=True)

        self.inventory_tree = ttk.Treeview(
            left,
            columns=("id", "name", "qty", "cost", "price"),
            show="headings",
            height=18,
        )
        for col, width in [("id", 50), ("name", 180), ("qty", 90), ("cost", 90), ("price", 90)]:
            self.inventory_tree.heading(col, text=col.upper())
            self.inventory_tree.column(col, width=width)
        self.inventory_tree.pack(fill="both", expand=True)

        add_frame = tk.LabelFrame(right, text="Add Inventory Item", padx=8, pady=8)
        add_frame.pack(fill="x", pady=6)

        self.item_name = self._labeled_entry(add_frame, "Name")
        self.item_qty = self._labeled_entry(add_frame, "Quantity")
        self.item_cost = self._labeled_entry(add_frame, "Cost")
        self.item_price = self._labeled_entry(add_frame, "Price")
        tk.Button(add_frame, text="Add Item", command=self.handle_add_item).pack(fill="x", pady=4)

        sale_frame = tk.LabelFrame(right, text="Sell Item", padx=8, pady=8)
        sale_frame.pack(fill="x", pady=6)
        self.sale_item_id = self._labeled_entry(sale_frame, "Item ID")
        self.sale_qty = self._labeled_entry(sale_frame, "Quantity")
        self.sale_customer = self._labeled_entry(sale_frame, "Customer")
        self.sale_customer.insert(0, "Walk-in Customer")
        tk.Button(sale_frame, text="Sell + Generate Invoice", command=self.handle_sell).pack(fill="x", pady=4)

        report_frame = tk.LabelFrame(right, text="Reports", padx=8, pady=8)
        report_frame.pack(fill="x", pady=6)
        tk.Button(report_frame, text="Sales Chart", command=chart_dashboard.sales_chart).pack(fill="x", pady=2)
        tk.Button(report_frame, text="Total Sales", command=self.show_total_sales).pack(fill="x", pady=2)
        tk.Button(report_frame, text="Inventory Value", command=self.show_inventory_value).pack(fill="x", pady=2)
        tk.Button(report_frame, text="Income Statement", command=self.show_income_statement).pack(fill="x", pady=2)
        tk.Button(report_frame, text="Balance Sheet", command=self.show_balance_sheet).pack(fill="x", pady=2)
        tk.Button(report_frame, text="Trial Balance", command=self.show_trial_balance).pack(fill="x", pady=2)

        activity_frame = tk.LabelFrame(right, text="Recent Activity", padx=8, pady=8)
        activity_frame.pack(fill="both", expand=True, pady=6)
        self.activity_list = tk.Listbox(activity_frame, height=10)
        self.activity_list.pack(fill="both", expand=True)

    @staticmethod
    def _labeled_entry(parent: tk.Widget, label: str) -> tk.Entry:
        tk.Label(parent, text=label).pack(anchor="w")
        entry = tk.Entry(parent)
        entry.pack(fill="x", pady=2)
        return entry

    def refresh_inventory(self) -> None:
        for row in self.inventory_tree.get_children():
            self.inventory_tree.delete(row)
        for item in list_items():
            self.inventory_tree.insert(
                "",
                "end",
                values=(item["id"], item["name"], item["quantity"], item["cost"], item["price"]),
            )

    def handle_add_item(self) -> None:
        try:
            add_item(
                self.item_name.get().strip(),
                float(self.item_qty.get()),
                float(self.item_cost.get()),
                float(self.item_price.get()),
            )
            self.refresh_inventory()
            record_activity(self.username, f"Added inventory item: {self.item_name.get().strip()}", module="inventory")
            messagebox.showinfo("Success", "Item added.")
        except Exception as exc:
            messagebox.showerror("Error", str(exc))

    def handle_sell(self) -> None:
        try:
            result = sell_item(
                int(self.sale_item_id.get()),
                float(self.sale_qty.get()),
                self.sale_customer.get().strip() or "Walk-in Customer",
            )
            invoice_path = generate_invoice(
                invoice_id=result["sale_id"],
                customer=result["customer"],
                items=[(result["item"], result["quantity"], result["unit_price"])],
                total=result["total"],
            )
            self.refresh_inventory()
            record_activity(
                self.username,
                f"Created invoice #{result['sale_id']} for {result['customer']}",
                module="sales",
            )
            messagebox.showinfo(
                "Sale Complete",
                f"Invoice total: {result['total']:.2f}\nSaved invoice: {invoice_path}",
            )
        except Exception as exc:
            messagebox.showerror("Error", str(exc))

    def show_total_sales(self) -> None:
        record_activity(self.username, "Viewed total sales", module="reports")
        messagebox.showinfo("Total Sales", f"{total_sales():.2f}")

    def show_inventory_value(self) -> None:
        record_activity(self.username, "Viewed inventory value", module="reports")
        messagebox.showinfo("Inventory Value", f"{inventory_value():.2f}")

    def show_income_statement(self) -> None:
        record_activity(self.username, "Viewed income statement", module="reports")
        report = income_statement()
        messagebox.showinfo(
            "Income Statement",
            f"Revenue: {report['revenue']:.2f}\nExpenses: {report['expenses']:.2f}\nNet Profit: {report['net_profit']:.2f}",
        )

    def show_balance_sheet(self) -> None:
        record_activity(self.username, "Viewed balance sheet", module="reports")
        report = balance_sheet()
        messagebox.showinfo(
            "Balance Sheet",
            f"Assets: {report['assets']:.2f}\nLiabilities: {report['liabilities']:.2f}\nEquity: {report['equity']:.2f}",
        )

    def show_trial_balance(self) -> None:
        record_activity(self.username, "Viewed trial balance", module="reports")
        rows = trial_balance()
        if not rows:
            messagebox.showinfo("Trial Balance", "No entries found.")
            return
        text = "\n".join(
            f"{row['account']}: Dr {row['total_debit']:.2f} | Cr {row['total_credit']:.2f}" for row in rows
        )
        messagebox.showinfo("Trial Balance", text)

    def refresh_live_widgets(self) -> None:
        self.active_users_label.config(text=f"Active Users: {active_user_count()}")
        self.live_sales_label.config(text=f"Total Sales: {total_sales():.2f}")
        self.live_inventory_label.config(text=f"Inventory Value: {inventory_value():.2f}")

        self.activity_list.delete(0, tk.END)
        for item in recent_activity(limit=8):
            self.activity_list.insert(
                tk.END,
                f"{item['time']} | {item['username']} -> {item['action']}",
            )
        self.root.after(5000, self.refresh_live_widgets)

    def handle_logout(self) -> None:
        record_activity(self.username, "Logged out")
        end_session(self.username)
        self.root.destroy()

    def run(self) -> None:
        self.root.mainloop()


def dashboard(username: str) -> None:
    AccountingDashboard(username).run()


if __name__ == "__main__":
    dashboard("admin")
