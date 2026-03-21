from extensions import db
from models import JournalEntry, JournalLine, LedgerAccount
from constants import DEFAULT_CHART_OF_ACCOUNTS
from utils import parse_money, today_utc_date, iso_date
import datetime

def generate_journal_number(company_id):
    next_number = JournalEntry.query.filter_by(company_id=company_id).count() + 1
    return f"JE-{int(company_id):03d}-{next_number:05d}"

def seed_chart_of_accounts(company):
    created = 0
    for template in DEFAULT_CHART_OF_ACCOUNTS:
        existing = LedgerAccount.query.filter_by(company_id=company.id, code=template["code"]).first()
        if existing:
            continue
        db.session.add(
            LedgerAccount(
                org_id=company.org_id,
                company_id=company.id,
                code=template["code"],
                name=template["name"],
                category=template["category"],
                subtype=template.get("subtype"),
                normal_balance=template.get("normal_balance", "debit"),
                description=template.get("description"),
                is_system=True,
                is_active=True,
            )
        )
        created += 1
    if created:
        db.session.flush()
    return created

def get_company_account(company_id, account_id=None, account_code=None):
    if account_id is not None:
        return LedgerAccount.query.filter_by(company_id=company_id, id=account_id).first()
    if account_code:
        return LedgerAccount.query.filter_by(company_id=company_id, code=str(account_code).strip()).first()
    return None

def analyze_journal_lines(company, lines):
    diagnostics = {
        "can_post": False,
        "balanced": False,
        "line_count": len(lines) if isinstance(lines, list) else 0,
        "debit_total": 0.0,
        "credit_total": 0.0,
        "difference": 0.0,
        "blocking_issues": [],
        "line_issues": [],
        "top_contributors": [],
        "error": "",
    }

    if not isinstance(lines, list) or len(lines) < 2:
        diagnostics["blocking_issues"].append("journal entry requires at least two lines")
        diagnostics["error"] = diagnostics["blocking_issues"][0]
        return diagnostics

    contributors = []
    for index, raw_line in enumerate(lines, start=1):
        payload = raw_line or {}
        account = get_company_account(company.id, payload.get("account_id"), payload.get("account_code"))
        line_issue = {
            "line_number": index,
            "account_code": str(payload.get("account_code") or "").strip(),
            "account_name": account.name if account else "",
            "issues": [],
        }

        if not account:
            line_issue["issues"].append("unknown account")

        try:
            debit = parse_money(payload.get("debit", 0), f"journal line {index} debit")
        except ValueError as exc:
            debit = 0.0
            line_issue["issues"].append(str(exc))

        try:
            credit = parse_money(payload.get("credit", 0), f"journal line {index} credit")
        except ValueError as exc:
            credit = 0.0
            line_issue["issues"].append(str(exc))

        if debit > 0 and credit > 0:
            line_issue["issues"].append("line cannot contain both debit and credit")
        if debit <= 0 and credit <= 0:
            line_issue["issues"].append("line must contain a debit or credit amount")

        diagnostics["debit_total"] += debit
        diagnostics["credit_total"] += credit

        if account:
            net_amount = round(debit - credit, 2)
            if abs(net_amount) > 0:
                contributors.append(
                    {
                        "line_number": index,
                        "account_code": account.code,
                        "account_name": account.name,
                        "side": "debit" if net_amount > 0 else "credit",
                        "amount": round(abs(net_amount), 2),
                    }
                )

        if line_issue["issues"]:
            diagnostics["line_issues"].append(line_issue)

    diagnostics["debit_total"] = round(diagnostics["debit_total"], 2)
    diagnostics["credit_total"] = round(diagnostics["credit_total"], 2)
    diagnostics["difference"] = round(diagnostics["debit_total"] - diagnostics["credit_total"], 2)
    diagnostics["balanced"] = diagnostics["difference"] == 0
    diagnostics["top_contributors"] = sorted(
        contributors,
        key=lambda item: item["amount"],
        reverse=True,
    )[:5]

    if diagnostics["line_issues"]:
        diagnostics["blocking_issues"].extend(
            f"line {item['line_number']}: {', '.join(item['issues'])}" for item in diagnostics["line_issues"]
        )

    if diagnostics["difference"] != 0:
        direction = "more debits than credits" if diagnostics["difference"] > 0 else "more credits than debits"
        diagnostics["blocking_issues"].append(
            f"entry is out of balance by {abs(diagnostics['difference']):.2f} ({direction})"
        )

    diagnostics["can_post"] = not diagnostics["blocking_issues"]
    if diagnostics["can_post"]:
        diagnostics["error"] = ""
    elif diagnostics["blocking_issues"]:
        diagnostics["error"] = diagnostics["blocking_issues"][0]
    else:
        diagnostics["error"] = "journal entry cannot be posted"

    return diagnostics

def normalize_journal_lines(company, lines):
    diagnostics = analyze_journal_lines(company, lines)
    if not diagnostics["can_post"]:
        raise ValueError(diagnostics["error"])

    normalized = []

    for index, raw_line in enumerate(lines, start=1):
        payload = raw_line or {}
        account = get_company_account(company.id, payload.get("account_id"), payload.get("account_code"))
        debit = parse_money(payload.get("debit", 0), f"journal line {index} debit")
        credit = parse_money(payload.get("credit", 0), f"journal line {index} credit")

        normalized.append(
            {
                "account_id": account.id,
                "project_id": payload.get("project_id"),
                "description": (payload.get("description") or "").strip() or None,
                "debit": debit,
                "credit": credit,
            }
        )
    return normalized, diagnostics["debit_total"], diagnostics["credit_total"]

def post_journal_entry(company, user, entry_date, memo, lines, source_type="manual", source_id=None, reference=None):
    seed_chart_of_accounts(company)
    normalized_lines, _, _ = normalize_journal_lines(company, lines)
    entry = JournalEntry(
        org_id=company.org_id,
        company_id=company.id,
        entry_number=generate_journal_number(company.id),
        entry_date=entry_date,
        memo=memo,
        reference=(reference or "").strip() or None,
        source_type=(source_type or "manual").strip().lower(),
        source_id=source_id,
        status="posted",
        created_by=user.id,
    )
    db.session.add(entry)
    db.session.flush()

    for index, line in enumerate(normalized_lines, start=1):
        db.session.add(
            JournalLine(
                journal_entry_id=entry.id,
                account_id=line["account_id"],
                project_id=line["project_id"],
                line_number=index,
                description=line["description"],
                debit=line["debit"],
                credit=line["credit"],
            )
        )

    db.session.flush()
    return entry

def post_operational_entry(company, user, source_type, source_id, memo, lines, entry_date=None, reference=None):
    # Check if entry exists
    if source_id:
        existing = JournalEntry.query.filter_by(
            company_id=company.id,
            source_type=(source_type or "").strip().lower(),
            source_id=source_id,
        ).filter(JournalEntry.status.in_(["posted", "reversed"])).first()
        if existing:
            return None

    return post_journal_entry(
        company,
        user,
        entry_date or today_utc_date(),
        memo=memo,
        lines=lines,
        source_type=source_type,
        source_id=source_id,
        reference=reference,
    )

def journal_lines_for(entry_id):
    return JournalLine.query.filter_by(journal_entry_id=entry_id).order_by(JournalLine.line_number.asc(), JournalLine.id.asc()).all()

def serialize_ledger_account(account):
    return {
        "id": account.id,
        "code": account.code,
        "name": account.name,
        "category": account.category,
        "subtype": account.subtype or "",
        "normal_balance": account.normal_balance,
        "is_system": bool(account.is_system),
        "is_active": bool(account.is_active),
        "description": account.description or "",
    }

def serialize_journal_entry(entry):
    lines = []
    for line in journal_lines_for(entry.id):
        account = db.session.get(LedgerAccount, line.account_id)
        lines.append(
            {
                "id": line.id,
                "account_id": line.account_id,
                "account_code": account.code if account else "",
                "account_name": account.name if account else "",
                "project_id": line.project_id,
                "description": line.description or "",
                "debit": round(float(line.debit or 0), 2),
                "credit": round(float(line.credit or 0), 2),
            }
        )

    return {
        "id": entry.id,
        "entry_number": entry.entry_number,
        "entry_date": iso_date(entry.entry_date),
        "memo": entry.memo,
        "reference": entry.reference or "",
        "source_type": entry.source_type,
        "source_id": entry.source_id,
        "status": entry.status,
        "reverses_entry_id": entry.reverses_entry_id,
        "lines": lines,
    }
