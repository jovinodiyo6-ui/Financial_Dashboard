import datetime
import os

from sqlalchemy import inspect, text


SCHEMA_UPGRADES = {
    "organization": {
        "usage": "INTEGER DEFAULT 0",
        "plan_code": "VARCHAR(20) DEFAULT 'free'",
        "subscription_status": "VARCHAR(20) DEFAULT 'free'",
        "stripe_customer_id": "VARCHAR(120)",
        "stripe_subscription_id": "VARCHAR(120)",
        "max_companies": "INTEGER DEFAULT 1",
        "ai_assistant_enabled": "BOOLEAN DEFAULT FALSE",
        "subscription_updated_at": "TIMESTAMP",
    },
    "user": {
        "default_company_id": "INTEGER",
    },
    "company": {
        "business_type": "VARCHAR(50) DEFAULT 'sole_proprietor'",
    },
}


def _env_flag(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def ensure_startup_schema(db):
    inspector = inspect(db.engine)
    existing_tables = set(inspector.get_table_names())

    for table_name, columns in SCHEMA_UPGRADES.items():
        if table_name not in existing_tables:
            continue

        existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
        for column_name, definition in columns.items():
            if column_name in existing_columns:
                continue
            db.session.execute(
                text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")
            )

    db.session.commit()


def build_system_status_payload():
    full_version = (
        os.getenv("RENDER_GIT_COMMIT")
        or os.getenv("VERCEL_GIT_COMMIT_SHA")
        or os.getenv("GIT_COMMIT")
        or "dev"
    )
    environment = os.getenv("FLASK_ENV") or os.getenv("ENVIRONMENT") or "production"
    maintenance = _env_flag("SYSTEM_MAINTENANCE", default=False)
    default_message = (
        "System maintenance is active. Some actions may be temporarily unavailable."
        if maintenance
        else "System operating normally."
    )

    return {
        "maintenance": maintenance,
        "message": os.getenv("SYSTEM_MAINTENANCE_MESSAGE", default_message),
        "environment": environment,
        "version": full_version[:7] if full_version != "dev" else full_version,
        "build": full_version,
        "generated_at": datetime.datetime.now(datetime.UTC).isoformat(),
    }
