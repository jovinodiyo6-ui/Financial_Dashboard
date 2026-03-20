import datetime
import hashlib

def iso_date(value):
    return value.isoformat() if value else None

def parse_iso_date(raw_value, field_name, default=None):
    if raw_value in {None, ""}:
        return default
    if isinstance(raw_value, datetime.datetime):
        return raw_value.date()
    if isinstance(raw_value, datetime.date):
        return raw_value
    try:
        return datetime.date.fromisoformat(str(raw_value))
    except ValueError as exc:
        raise ValueError(f"{field_name} must be in YYYY-MM-DD format") from exc

def parse_money(value, field_name):
    try:
        amount = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be numeric") from exc
    return round(amount, 2)

def parse_bool(value, default=False):
    if value in {None, ""}:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}

def hash_key(raw_key):
    return hashlib.sha256(raw_key.encode()).hexdigest()

def today_utc_date():
    return datetime.datetime.now(datetime.UTC).date()
