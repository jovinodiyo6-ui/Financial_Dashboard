# Accounting System (Desktop)

This is a self-contained Tkinter + SQLite accounting and inventory app.

## Modules

- `login.py`: login screen (`admin` / `admin123` by default)
- `main.py`: dashboard window
- `database.py`: schema + default seed data
- `inventory.py`: inventory operations
- `sales.py`: sales, stock deduction, and GL posting
- `invoice_pdf.py`: invoice generation (`.pdf`, fallback `.txt`)
- `reports.py`: financial reports
- `dashboard.py`: Matplotlib sales chart
- `ledger.py`: double-entry posting and validation
- `activity.py`: active session + audit activity tracking

## Live Dashboard Features

- Live active user count (refreshes every 5 seconds)
- Recent activity feed (login, logout, inventory, sales, reports)
- Quick KPI strip: active users, total sales, inventory value
- Logout button that removes the user from active sessions

## Install

```bash
pip install -r accounting_system/requirements.txt
```

## Run

```bash
python -m accounting_system.login
```

## Build Windows EXE

```powershell
powershell -ExecutionPolicy Bypass -File accounting_system/build_exe.ps1
```

Output:

- `dist/AccountingSystem.exe`
