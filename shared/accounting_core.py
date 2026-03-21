from __future__ import annotations

from typing import Iterable, Mapping


CREDIT_NORMAL_CATEGORIES = {"liability", "equity", "revenue", "income"}


def infer_normal_balance(category: str | None = None, default: str = "debit") -> str:
    label = str(category or "").strip().lower()
    if not label:
        return default
    return "credit" if label in CREDIT_NORMAL_CATEGORIES else "debit"


def analyze_entry_lines(
    lines: Iterable[Mapping[str, object]] | None,
    *,
    min_line_count: int = 2,
    contributor_limit: int = 5,
) -> dict:
    prepared_lines = [dict(line or {}) for line in (lines or [])]
    diagnostics = {
        "can_post": False,
        "balanced": False,
        "line_count": len(prepared_lines),
        "debit_total": 0.0,
        "credit_total": 0.0,
        "difference": 0.0,
        "blocking_issues": [],
        "line_issues": [],
        "top_contributors": [],
        "error": "",
    }

    if len(prepared_lines) < min_line_count:
        diagnostics["blocking_issues"].append("journal entry requires at least two lines")
        diagnostics["error"] = diagnostics["blocking_issues"][0]
        return diagnostics

    contributors = []
    for index, payload in enumerate(prepared_lines, start=1):
        line_number = int(payload.get("line_number") or index)
        debit = round(float(payload.get("debit") or 0), 2)
        credit = round(float(payload.get("credit") or 0), 2)

        raw_issues = payload.get("issues") or []
        if not isinstance(raw_issues, list):
            raw_issues = [raw_issues]
        issues = [str(issue).strip() for issue in raw_issues if str(issue).strip()]

        if debit > 0 and credit > 0:
            issues.append("line cannot contain both debit and credit")
        if debit <= 0 and credit <= 0:
            issues.append("line must contain a debit or credit amount")

        diagnostics["debit_total"] += debit
        diagnostics["credit_total"] += credit

        net_amount = round(debit - credit, 2)
        if abs(net_amount) > 0:
            contributors.append(
                {
                    "line_number": line_number,
                    "account_code": str(payload.get("account_code") or "").strip(),
                    "account_name": str(
                        payload.get("account_name") or payload.get("account_label") or ""
                    ).strip(),
                    "side": "debit" if net_amount > 0 else "credit",
                    "amount": round(abs(net_amount), 2),
                }
            )

        if issues:
            diagnostics["line_issues"].append(
                {
                    "line_number": line_number,
                    "account_code": str(payload.get("account_code") or "").strip(),
                    "account_name": str(
                        payload.get("account_name") or payload.get("account_label") or ""
                    ).strip(),
                    "issues": issues,
                }
            )

    diagnostics["debit_total"] = round(diagnostics["debit_total"], 2)
    diagnostics["credit_total"] = round(diagnostics["credit_total"], 2)
    diagnostics["difference"] = round(diagnostics["debit_total"] - diagnostics["credit_total"], 2)
    diagnostics["balanced"] = diagnostics["difference"] == 0
    diagnostics["top_contributors"] = sorted(
        contributors,
        key=lambda item: item["amount"],
        reverse=True,
    )[:contributor_limit]

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


def build_trial_balance_report(
    accounts: Iterable[Mapping[str, object]] | None,
    journal_lines: Iterable[Mapping[str, object]] | None,
    *,
    suspect_limit: int = 5,
) -> dict:
    prepared_accounts = [dict(account or {}) for account in (accounts or [])]
    account_lookup = {}
    balances = {}

    for account in prepared_accounts:
        account_id = account.get("id", account.get("account_id"))
        if account_id is None:
            continue
        account_lookup[account_id] = account
        balances[account_id] = {"debit": 0.0, "credit": 0.0}

    unknown_accounts = []
    for raw_line in journal_lines or []:
        payload = dict(raw_line or {})
        account_id = payload.get("account_id")
        if account_id is None:
            continue

        if account_id not in balances:
            synthesized = {
                "id": account_id,
                "code": str(payload.get("account_code") or "").strip(),
                "name": str(payload.get("account_name") or f"Account {account_id}").strip(),
                "category": str(payload.get("category") or "").strip(),
                "normal_balance": infer_normal_balance(payload.get("category")),
            }
            account_lookup[account_id] = synthesized
            balances[account_id] = {"debit": 0.0, "credit": 0.0}
            unknown_accounts.append(synthesized)

        balances[account_id]["debit"] += float(payload.get("debit") or 0)
        balances[account_id]["credit"] += float(payload.get("credit") or 0)

    items = []
    debit_total = 0.0
    credit_total = 0.0

    for account in prepared_accounts + unknown_accounts:
        account_id = account.get("id", account.get("account_id"))
        totals = balances.get(account_id, {"debit": 0.0, "credit": 0.0})
        debit_amount = round(float(totals["debit"] or 0), 2)
        credit_amount = round(float(totals["credit"] or 0), 2)
        net_balance = round(debit_amount - credit_amount, 2)
        normal_balance = str(
            account.get("normal_balance") or infer_normal_balance(account.get("category") or account.get("type"))
        ).strip().lower() or "debit"

        debit_total += debit_amount
        credit_total += credit_amount
        items.append(
            {
                **account,
                "normal_balance": normal_balance,
                "debit_total": debit_amount,
                "credit_total": credit_amount,
                "net_balance": net_balance,
                "normalized_balance": round(-net_balance if normal_balance == "credit" else net_balance, 2),
            }
        )

    difference = round(debit_total - credit_total, 2)
    suspect_accounts = sorted(
        (
            {
                "id": item.get("id"),
                "code": item.get("code", ""),
                "name": item.get("name") or item.get("account", ""),
                "debit_total": item["debit_total"],
                "credit_total": item["credit_total"],
                "net_balance": item["net_balance"],
            }
            for item in items
            if abs(float(item["net_balance"] or 0)) > 0
        ),
        key=lambda item: abs(float(item["net_balance"] or 0)),
        reverse=True,
    )[:suspect_limit]

    return {
        "items": items,
        "debit_total": round(debit_total, 2),
        "credit_total": round(credit_total, 2),
        "difference": difference,
        "balanced": difference == 0,
        "imbalance": {
            "difference": difference,
            "direction": (
                "balanced"
                if difference == 0
                else "debits_exceed_credits"
                if difference > 0
                else "credits_exceed_debits"
            ),
            "suspect_accounts": suspect_accounts,
        },
    }
