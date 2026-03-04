from __future__ import annotations

import tkinter as tk
from tkinter import messagebox

from accounting_system.activity import record_activity, start_session
from accounting_system.database import connect, create_tables
from accounting_system.main import dashboard


def check_login(username: str, password: str) -> bool:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM users WHERE username = ? AND password = ?",
        (username, password),
    )
    ok = cursor.fetchone() is not None
    conn.close()
    return ok


def launch_login() -> None:
    create_tables()
    root = tk.Tk()
    root.title("Login")
    root.geometry("320x220")

    tk.Label(root, text="Accounting System Login", font=("Arial", 13, "bold")).pack(pady=10)
    tk.Label(root, text="Username").pack(anchor="w", padx=18)
    entry_user = tk.Entry(root)
    entry_user.pack(fill="x", padx=18, pady=3)
    entry_user.insert(0, "admin")

    tk.Label(root, text="Password").pack(anchor="w", padx=18)
    entry_pass = tk.Entry(root, show="*")
    entry_pass.pack(fill="x", padx=18, pady=3)
    entry_pass.insert(0, "admin123")

    def on_login() -> None:
        username = entry_user.get().strip()
        if check_login(username, entry_pass.get()):
            start_session(username)
            record_activity(username, "Logged in")
            root.destroy()
            dashboard(username)
        else:
            messagebox.showerror("Login Failed", "Invalid username or password")

    tk.Button(root, text="Login", command=on_login).pack(fill="x", padx=18, pady=14)
    tk.Label(root, text="Default: admin / admin123", fg="gray").pack()
    root.mainloop()


if __name__ == "__main__":
    launch_login()
