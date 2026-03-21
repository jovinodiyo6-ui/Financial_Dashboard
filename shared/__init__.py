"""Shared domain logic reused by the desktop app and the Flask backend."""

from shared.accounting_core import analyze_entry_lines, build_trial_balance_report, infer_normal_balance

__all__ = ["analyze_entry_lines", "build_trial_balance_report", "infer_normal_balance"]
