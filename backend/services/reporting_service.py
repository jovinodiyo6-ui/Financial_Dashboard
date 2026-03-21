from extensions import db
from models import (
    JournalLine, JournalEntry, LedgerAccount, Project, ProjectCostEntry, TimeEntry, MileageEntry,
    InventoryMovement, InventoryItem, PurchaseOrder, EmployeeProfile, ContractorProfile, PayrollRun,
    Report, PurchaseOrderLine
)
from services.accounting_engine import seed_chart_of_accounts, serialize_ledger_account, serialize_journal_entry
from shared.accounting_core import build_trial_balance_report
from utils import today_utc_date, iso_date
import datetime
import json

def build_trial_balance(company):
    seed_chart_of_accounts(company)
    accounts = LedgerAccount.query.filter_by(company_id=company.id).order_by(LedgerAccount.code.asc()).all()
    lines = (
        db.session.query(JournalLine, JournalEntry)
        .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        .filter(JournalEntry.company_id == company.id, JournalEntry.status.in_(["posted", "reversed"]))
        .all()
    )
    serialized_accounts = [serialize_ledger_account(account) for account in accounts]
    account_lookup = {account["id"]: account for account in serialized_accounts}
    journal_lines = [
        {
            "account_id": line.account_id,
            "account_code": account_lookup.get(line.account_id, {}).get("code", ""),
            "account_name": account_lookup.get(line.account_id, {}).get("name", ""),
            "debit": float(line.debit or 0),
            "credit": float(line.credit or 0),
        }
        for line, _entry in lines
    ]
    return build_trial_balance_report(serialized_accounts, journal_lines)

def normalized_trial_balance_amount(item):
    amount = float(item.get("net_balance", 0) or 0)
    return round(-amount if item.get("normal_balance") == "credit" else amount, 2)

def build_accounting_overview(company):
    trial_balance = build_trial_balance(company)
    recent_entries = (
        JournalEntry.query.filter_by(company_id=company.id)
        .order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())
        .limit(8)
        .all()
    )
    return {
        "account_count": len(trial_balance["items"]),
        "journal_count": JournalEntry.query.filter_by(company_id=company.id).count(),
        "reporting_locked": not trial_balance["balanced"],
        "trial_balance": trial_balance,
        "recent_entries": [serialize_journal_entry(entry) for entry in recent_entries],
    }


def build_account_register(company, account):
    lines = (
        db.session.query(JournalLine, JournalEntry)
        .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        .filter(
            JournalEntry.company_id == company.id,
            JournalEntry.status.in_(["posted", "reversed"]),
            JournalLine.account_id == account.id,
        )
        .order_by(JournalEntry.entry_date.asc(), JournalEntry.id.asc(), JournalLine.line_number.asc(), JournalLine.id.asc())
        .all()
    )

    running_balance = 0.0
    items = []
    for line, entry in lines:
        signed_amount = float(line.debit or 0) - float(line.credit or 0)
        if account.normal_balance == "credit":
            signed_amount = -signed_amount
        running_balance = round(running_balance + signed_amount, 2)
        items.append(
            {
                "entry_id": entry.id,
                "entry_number": entry.entry_number,
                "entry_date": iso_date(entry.entry_date),
                "memo": entry.memo,
                "reference": entry.reference or "",
                "description": line.description or "",
                "debit": round(float(line.debit or 0), 2),
                "credit": round(float(line.credit or 0), 2),
                "running_balance": running_balance,
            }
        )

    return {
        "account": serialize_ledger_account(account),
        "ending_balance": running_balance,
        "items": items,
    }

def serialize_project(project):
    return {
        "id": project.id,
        "project_code": project.project_code,
        "name": project.name,
        "customer_name": project.customer_name or "",
        "status": project.status,
        "budget_revenue": round(float(project.budget_revenue or 0), 2),
        "budget_cost": round(float(project.budget_cost or 0), 2),
        "notes": project.notes or "",
    }

def build_project_summary(company):
    projects = Project.query.filter_by(company_id=company.id).order_by(Project.updated_at.desc(), Project.id.desc()).all()
    items = []
    total_revenue = 0.0
    total_cost = 0.0
    for project in projects:
        manual_entries = ProjectCostEntry.query.filter_by(project_id=project.id).all()
        time_entries = TimeEntry.query.filter_by(company_id=company.id, project_id=project.id).all()
        mileage_entries = MileageEntry.query.filter_by(company_id=company.id, project_id=project.id).all()
        inventory_movements = InventoryMovement.query.filter_by(company_id=company.id, project_id=project.id).all()

        manual_revenue = sum(float(entry.amount or 0) for entry in manual_entries if entry.entry_type == "revenue")
        manual_cost = sum(float(entry.amount or 0) for entry in manual_entries if entry.entry_type != "revenue")
        time_revenue = sum(float(entry.hours or 0) * float(entry.billable_rate or 0) for entry in time_entries)
        time_cost = sum(float(entry.hours or 0) * float(entry.hourly_cost or 0) for entry in time_entries)
        mileage_cost = sum(float(entry.miles or 0) * float(entry.rate_per_mile or 0) for entry in mileage_entries)
        inventory_cost = sum(abs(float(entry.quantity_delta or 0)) * float(entry.unit_cost or 0) for entry in inventory_movements if float(entry.quantity_delta or 0) < 0)
        actual_revenue = round(manual_revenue + time_revenue, 2)
        actual_cost = round(manual_cost + time_cost + mileage_cost + inventory_cost, 2)
        margin = round(actual_revenue - actual_cost, 2)
        total_revenue += actual_revenue
        total_cost += actual_cost
        items.append(
            {
                **serialize_project(project),
                "actual_revenue": actual_revenue,
                "actual_cost": actual_cost,
                "margin": margin,
                "budget_delta_revenue": round(actual_revenue - float(project.budget_revenue or 0), 2),
                "budget_delta_cost": round(actual_cost - float(project.budget_cost or 0), 2),
            }
        )

    return {
        "items": items,
        "total_revenue": round(total_revenue, 2),
        "total_cost": round(total_cost, 2),
        "total_margin": round(total_revenue - total_cost, 2),
    }

def serialize_inventory_item(item):
    return {
        "id": item.id,
        "sku": item.sku,
        "name": item.name,
        "category": item.category or "",
        "quantity_on_hand": round(float(item.quantity_on_hand or 0), 2),
        "reorder_point": round(float(item.reorder_point or 0), 2),
        "reorder_quantity": round(float(item.reorder_quantity or 0), 2),
        "unit_cost": round(float(item.unit_cost or 0), 2),
        "unit_price": round(float(item.unit_price or 0), 2),
        "inventory_value": round(float(item.quantity_on_hand or 0) * float(item.unit_cost or 0), 2),
        "preferred_vendor_name": item.preferred_vendor_name or "",
        "needs_reorder": float(item.quantity_on_hand or 0) <= float(item.reorder_point or 0),
    }

def serialize_purchase_order(po):
    lines = PurchaseOrderLine.query.filter_by(purchase_order_id=po.id).order_by(PurchaseOrderLine.id.asc()).all()
    return {
        "id": po.id,
        "po_number": po.po_number,
        "vendor_name": po.vendor_name,
        "status": po.status,
        "issue_date": iso_date(po.issue_date),
        "expected_date": iso_date(po.expected_date),
        "notes": po.notes or "",
        "items": [
            {
                "id": line.id,
                "inventory_item_id": line.inventory_item_id,
                "sku": line.sku or "",
                "description": line.description,
                "quantity": round(float(line.quantity or 0), 2),
                "unit_cost": round(float(line.unit_cost or 0), 2),
                "received_quantity": round(float(line.received_quantity or 0), 2),
            }
            for line in lines
        ],
        "ordered_total": round(sum(float(line.quantity or 0) * float(line.unit_cost or 0) for line in lines), 2),
        "received_total": round(sum(float(line.received_quantity or 0) * float(line.unit_cost or 0) for line in lines), 2),
    }

def serialize_inventory_movement(movement):
    item = db.session.get(InventoryItem, movement.inventory_item_id)
    return {
        "id": movement.id,
        "inventory_item_id": movement.inventory_item_id,
        "sku": item.sku if item else "",
        "item_name": item.name if item else "",
        "project_id": movement.project_id,
        "movement_type": movement.movement_type,
        "quantity_delta": round(float(movement.quantity_delta or 0), 2),
        "unit_cost": round(float(movement.unit_cost or 0), 2),
        "reference": movement.reference or "",
        "occurred_at": movement.occurred_at.isoformat() if movement.occurred_at else None,
    }

def build_inventory_summary(company):
    items = InventoryItem.query.filter_by(company_id=company.id).order_by(InventoryItem.name.asc()).all()
    purchase_orders = PurchaseOrder.query.filter_by(company_id=company.id).order_by(PurchaseOrder.id.desc()).limit(12).all()
    movements = InventoryMovement.query.filter_by(company_id=company.id).order_by(InventoryMovement.id.desc()).limit(20).all()
    return {
        "item_count": len(items),
        "inventory_value": round(sum(float(item.quantity_on_hand or 0) * float(item.unit_cost or 0) for item in items), 2),
        "low_stock_count": sum(1 for item in items if float(item.quantity_on_hand or 0) <= float(item.reorder_point or 0)),
        "open_purchase_orders": sum(1 for po in purchase_orders if po.status in {"draft", "ordered", "partial"}),
        "reorder_items": [serialize_inventory_item(item) for item in items if float(item.quantity_on_hand or 0) <= float(item.reorder_point or 0)],
        "items": [serialize_inventory_item(item) for item in items[:20]],
        "purchase_orders": [serialize_purchase_order(po) for po in purchase_orders],
        "movements": [serialize_inventory_movement(movement) for movement in movements],
    }

def build_workforce_overview(company):
    today = today_utc_date()
    month_start = datetime.date(today.year, today.month, 1)
    employees = EmployeeProfile.query.filter_by(company_id=company.id).all()
    contractors = ContractorProfile.query.filter_by(company_id=company.id).all()
    time_entries = TimeEntry.query.filter_by(company_id=company.id).all()
    mileage_entries = MileageEntry.query.filter_by(company_id=company.id).all()
    payroll_runs = PayrollRun.query.filter_by(company_id=company.id).all()

    return {
        "employee_count": sum(1 for row in employees if row.is_active),
        "contractor_count": sum(1 for row in contractors if row.is_active),
        "hours_this_month": round(
            sum(float(row.hours or 0) for row in time_entries if row.work_date and row.work_date >= month_start),
            2,
        ),
        "mileage_this_month": round(
            sum(float(row.miles or 0) for row in mileage_entries if row.trip_date and row.trip_date >= month_start),
            2,
        ),
        "payroll_this_month": round(
            sum(float(run.net_cash or 0) for run in payroll_runs if run.pay_date and run.pay_date >= month_start),
            2,
        ),
        "contractor_1099_exposure": round(
            sum(float(row.hours or 0) * float(row.hourly_cost or 0) for row in time_entries if row.contractor_id),
            2,
        ),
    }

def aggregate_org_reports(org_id, company_id=None):
    query = Report.query.filter_by(org_id=org_id)
    if company_id is not None:
        query = query.filter_by(company_id=company_id)
    reports = query.all()
    revenue_total = 0.0
    expense_total = 0.0
    assets_total = 0.0

    for report in reports:
        try:
            payload = json.loads(report.data or "{}")
        except (TypeError, ValueError):
            payload = {}

        revenue_total += float(payload.get("revenue", 0) or 0)
        expense_total += float(payload.get("expenses", payload.get("expense", 0)) or 0)
        assets_total += float(payload.get("total_assets", payload.get("totalAssets", 0)) or 0)

    return {
        "revenue": round(revenue_total, 2),
        "expenses": round(expense_total, 2),
        "profit": round(revenue_total - expense_total, 2),
        "total_assets": round(assets_total, 2),
    }
