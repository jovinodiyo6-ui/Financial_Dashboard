from pathlib import Path
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
from functools import wraps
import hashlib
import datetime
import json
import os
import pandas as pd
from dotenv import load_dotenv
from io import StringIO

try:
    import pdfplumber
except Exception:  # pragma: no cover - optional dependency
    pdfplumber = None

try:
    import docx
except Exception:  # pragma: no cover - optional dependency
    docx = None

try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
except Exception:  # pragma: no cover - runtime fallback for missing optional dependency
    Limiter = None

    def get_remote_address():
        return "0.0.0.0"

load_dotenv()

app = Flask(__name__)

allowed_origins = os.getenv("CORS_ORIGINS", "*")
CORS(app, origins=[o.strip() for o in allowed_origins.split(",") if o.strip()] if allowed_origins != "*" else "*")

# ---------------- CONFIG ----------------

# Support both SQLite (dev) and PostgreSQL (production)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///saas.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
if DATABASE_URL.startswith("postgresql://") and "sslmode=" not in DATABASE_URL:
    separator = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{separator}sslmode=require"
if DATABASE_URL.startswith("postgresql+psycopg://") and "sslmode=" not in DATABASE_URL:
    separator = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{separator}sslmode=require"

JWT_SECRET = os.getenv("JWT_SECRET_KEY", "")
ENV = os.getenv("FLASK_ENV", "development")

if ENV == "production" and not JWT_SECRET:
    print("WARNING: JWT_SECRET_KEY is missing in production; using development fallback secret.")
if ENV == "production" and DATABASE_URL.startswith("sqlite"):
    print("WARNING: production DATABASE_URL is SQLite. Configure PostgreSQL for reliability.")

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["JWT_SECRET_KEY"] = JWT_SECRET or "dev-only-secret-change-me"
app.config["SECRET_KEY"] = os.getenv("FLASK_SECRET_KEY", JWT_SECRET or "dev-flask-secret-change-me")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = datetime.timedelta(days=7)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024  # 5 MB upload cap
app.config["SESSION_COOKIE_SECURE"] = ENV == "production"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_pre_ping": True,
    "pool_recycle": 300,
    "pool_timeout": 20,
    "pool_size": 5,
    "max_overflow": 5,
}

db = SQLAlchemy(app)
jwt = JWTManager(app)
bcrypt = Bcrypt(app)
if Limiter:
    limiter = Limiter(
        key_func=get_remote_address,
        default_limits=[],
        storage_uri=os.getenv("RATE_LIMIT_STORAGE_URI", "memory://"),
    )
    limiter.init_app(app)
else:
    class _NoopLimiter:
        def limit(self, _rule):
            def _decorator(fn):
                return fn

            return _decorator

    limiter = _NoopLimiter()

# ---------------- DATABASE ----------------

class Organization(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    usage = db.Column(db.Integer, default=0)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    org_id = db.Column(db.Integer, nullable=False)


class Report(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    company_id = db.Column(db.Integer, nullable=True)
    data = db.Column(db.Text, nullable=False)


class Company(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    business_type = db.Column(db.String(50), nullable=False, default="sole_proprietor")


class APIKey(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    key_hash = db.Column(db.String(200), nullable=False)


class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    action = db.Column(db.String(200), nullable=False)
    time = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
    )


class ActiveSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, unique=True, nullable=False)
    last_seen = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.UTC),
        nullable=False,
    )


with app.app_context():
    # Avoid multi-worker startup races in production. In production, schema
    # should be managed explicitly (migrations/init job), not at app import time.
    if ENV != "production":
        try:
            db.create_all()
            inspector = db.inspect(db.engine)
            report_columns = {column["name"] for column in inspector.get_columns("report")}
            if "company_id" not in report_columns:
                db.session.execute(text("ALTER TABLE report ADD COLUMN company_id INTEGER"))
                db.session.commit()
        except OperationalError as exc:
            if "already exists" not in str(exc).lower():
                raise

# ---------------- LIMITS ----------------

FREE_USAGE_LIMIT = 5
MAINTENANCE_DEFAULT_MESSAGE = "[System Under Maintainance]"
VALID_ROLES = {"owner", "admin", "accountant", "manager", "cashier", "member"}

# ---------------- HELPERS ----------------

def error_response(message, status=400):
    return {"error": message}, status


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cache-Control"] = "no-store"
    if request.is_secure or request.headers.get("X-Forwarded-Proto", "").lower() == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.errorhandler(429)
def ratelimit_handler(_):
    return error_response("too many requests, try again later", 429)


def safe_commit():
    try:
        db.session.commit()
        return True
    except SQLAlchemyError:
        db.session.rollback()
        return False


def get_user_from_token():
    try:
        user_id = int(get_jwt_identity())
    except (TypeError, ValueError):
        return None
    return db.session.get(User, user_id)


def build_access_token(user):
    return create_access_token(
        identity=str(user.id),
        additional_claims={
            "email": user.email,
            "org_id": user.org_id,
            "role": user.role,
        },
    )


def roles_required(*allowed_roles):
    allowed = set(allowed_roles)

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = get_user_from_token()
            if not user:
                return error_response("invalid token", 401)
            if user.role not in allowed:
                return error_response("not allowed", 403)
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def log(user_id, action):
    db.session.add(AuditLog(user_id=user_id, action=action))
    # Avoid crashing request flow because of non-critical audit logging issues.
    safe_commit()


def hash_key(raw_key):
    return hashlib.sha256(raw_key.encode()).hexdigest()


def touch_session(user_id):
    now = datetime.datetime.now(datetime.UTC)
    session = ActiveSession.query.filter_by(user_id=user_id).first()
    if session:
        session.last_seen = now
    else:
        db.session.add(ActiveSession(user_id=user_id, last_seen=now))
    safe_commit()


def clear_session(user_id):
    session = ActiveSession.query.filter_by(user_id=user_id).first()
    if session:
        db.session.delete(session)
    safe_commit()


def active_user_count_for_org(org_id, online_window_minutes=5):
    cutoff = datetime.datetime.now(datetime.UTC) - datetime.timedelta(minutes=online_window_minutes)
    return (
        db.session.query(ActiveSession.id)
        .join(User, ActiveSession.user_id == User.id)
        .filter(User.org_id == org_id, ActiveSession.last_seen >= cutoff)
        .count()
    )


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


def get_or_create_default_company(org_id, name="Main Company"):
    company = Company.query.filter_by(org_id=org_id).order_by(Company.id.asc()).first()
    if company:
        return company

    company = Company(org_id=org_id, name=name, business_type="sole_proprietor")
    db.session.add(company)
    safe_commit()
    return company


def parse_company_id(raw_value):
    if raw_value in {None, ""}:
        return None
    try:
        return int(raw_value)
    except (TypeError, ValueError):
        return None


def resolve_company_for_user(user, raw_company_id=None):
    company_id = parse_company_id(raw_company_id)
    if company_id is None:
        return get_or_create_default_company(user.org_id)
    return Company.query.filter_by(id=company_id, org_id=user.org_id).first()


def maintenance_state():
    enabled = (os.getenv("MAINTENANCE_MODE", "0").strip().lower() in {"1", "true", "yes", "on"})
    message = (os.getenv("MAINTENANCE_MESSAGE", MAINTENANCE_DEFAULT_MESSAGE) or MAINTENANCE_DEFAULT_MESSAGE).strip()
    return {"maintenance": enabled, "message": message}


def default_subtype_for(ledger_type):
    if ledger_type in {"asset", "liability"}:
        return "current"
    if ledger_type in {"revenue", "expense"}:
        return "operating"
    return "equity"


def read_external_dataframe(uploaded_file):
    filename = (uploaded_file.filename or "").lower()
    suffix = Path(filename).suffix

    if suffix in {".csv", ".txt"}:
        return pd.read_csv(uploaded_file)
    if suffix in {".xls", ".xlsx"}:
        return pd.read_excel(uploaded_file)
    if suffix == ".json":
        return pd.read_json(uploaded_file)
    if suffix == ".pdf":
        if pdfplumber is None:
            raise ValueError("pdf support is not installed")

        rows = []
        with pdfplumber.open(uploaded_file) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables() or []
                for table in tables:
                    rows.extend(table)

                if not tables:
                    text = page.extract_text() or ""
                    for line in text.splitlines():
                        parts = [part.strip() for part in line.split() if part.strip()]
                        if parts:
                            rows.append(parts)

        if not rows:
            raise ValueError("no readable rows found in pdf")

        header, *data_rows = rows
        return pd.DataFrame(data_rows, columns=header) if data_rows else pd.DataFrame(rows)
    if suffix in {".doc", ".docx"}:
        if docx is None:
            raise ValueError("word support is not installed")

        document = docx.Document(uploaded_file)
        rows = []
        for table in document.tables:
            for row in table.rows:
                rows.append([cell.text.strip() for cell in row.cells])

        if rows:
            header, *data_rows = rows
            return pd.DataFrame(data_rows, columns=header) if data_rows else pd.DataFrame(rows)

        text_rows = [line for line in (paragraph.text.strip() for paragraph in document.paragraphs) if line]
        if not text_rows:
            raise ValueError("no readable rows found in word document")
        return pd.read_csv(StringIO("\n".join(text_rows)))

    raise ValueError("unsupported file type; use CSV, XLS, XLSX, TXT, JSON, PDF, or Word")


def normalize_ledger_dataframe(df):
    rename_map = {}
    for column in df.columns:
        key = str(column).strip().lower()
        if key in {"account", "name"}:
            rename_map[column] = "account"
        elif key in {"account name", "description"}:
            rename_map[column] = "account"
        elif key == "type":
            rename_map[column] = "type"
        elif key in {"subtype", "class", "category"}:
            rename_map[column] = "subtype"
        elif key in {"amount", "value", "debit", "dr", "credit", "cr"}:
            rename_map[column] = "amount"
        elif key in {"depreciation", "depreciation_amount"}:
            rename_map[column] = "depreciation"

    normalized = df.rename(columns=rename_map).copy()
    required = {"type", "amount"}
    missing = required.difference(normalized.columns)
    if missing:
        raise ValueError(f"missing required columns: {', '.join(sorted(missing))}")

    normalized["type"] = normalized["type"].astype(str).str.lower().str.strip()
    normalized["amount"] = pd.to_numeric(normalized["amount"], errors="coerce")
    if normalized["amount"].isna().any():
        raise ValueError("amount column must contain numeric values")

    if "account" not in normalized.columns:
        normalized["account"] = normalized["type"].str.title()
    else:
        normalized["account"] = normalized["account"].astype(str).str.strip().replace("", pd.NA)
        normalized["account"] = normalized["account"].fillna(normalized["type"].str.title())

    if "subtype" not in normalized.columns:
        normalized["subtype"] = normalized["type"].map(default_subtype_for)
    else:
        normalized["subtype"] = normalized["subtype"].astype(str).str.lower().str.strip()
        blank_subtype = normalized["subtype"].eq("")
        normalized.loc[blank_subtype, "subtype"] = normalized.loc[blank_subtype, "type"].map(default_subtype_for)

    if "depreciation" not in normalized.columns:
        normalized["depreciation"] = 0.0
    else:
        normalized["depreciation"] = pd.to_numeric(normalized["depreciation"], errors="coerce")
        if normalized["depreciation"].isna().any():
            raise ValueError("depreciation column must contain numeric values")
        if (normalized["depreciation"] < 0).any():
            raise ValueError("depreciation cannot be negative")

    return normalized[["account", "type", "subtype", "amount", "depreciation"]]


def calc(df):
    required = {"type", "amount"}
    missing = required.difference(df.columns)
    if missing:
        raise ValueError(f"missing required columns: {', '.join(sorted(missing))}")

    df = df.copy()
    df["type"] = df["type"].astype(str).str.lower().str.strip()
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    if "subtype" in df.columns:
        df["subtype"] = df["subtype"].astype(str).str.lower().str.strip()
    else:
        df["subtype"] = ""

    if "depreciation" in df.columns:
        df["depreciation"] = pd.to_numeric(df["depreciation"], errors="coerce")
        if df["depreciation"].isna().any():
            raise ValueError("depreciation column must contain numeric values")
        if (df["depreciation"] < 0).any():
            raise ValueError("depreciation cannot be negative")
    else:
        df["depreciation"] = 0.0

    if df["amount"].isna().any():
        raise ValueError("amount column must contain numeric values")

    current_assets = float(
        df.loc[(df["type"] == "asset") & (df["subtype"] != "non-current"), "amount"].sum()
    )
    non_current_assets_gross = float(
        df.loc[(df["type"] == "asset") & (df["subtype"] == "non-current"), "amount"].sum()
    )
    accumulated_depreciation = float(
        df.loc[(df["type"] == "asset") & (df["subtype"] == "non-current"), "depreciation"].sum()
    )
    net_non_current_assets = max(0.0, non_current_assets_gross - accumulated_depreciation)
    total_assets = current_assets + net_non_current_assets

    current_liabilities = float(
        df.loc[(df["type"] == "liability") & (df["subtype"] != "non-current"), "amount"].sum()
    )
    non_current_liabilities = float(
        df.loc[(df["type"] == "liability") & (df["subtype"] == "non-current"), "amount"].sum()
    )
    total_liabilities = current_liabilities + non_current_liabilities

    revenue = float(df.loc[df["type"] == "revenue", "amount"].sum())
    expenses = float(df.loc[df["type"] == "expense", "amount"].sum())

    # Return both snake_case and camelCase keys for easy frontend compatibility.
    return {
        "revenue": revenue,
        "expenses": expenses,
        "assets_current": current_assets,
        "assets_non_current_gross": non_current_assets_gross,
        "accumulated_depreciation": accumulated_depreciation,
        "assets_non_current_net": net_non_current_assets,
        "total_assets": total_assets,
        "liabilities_current": current_liabilities,
        "liabilities_non_current": non_current_liabilities,
        "total_liabilities": total_liabilities,
        "assetsCurrent": current_assets,
        "assetsNonCurrentGross": non_current_assets_gross,
        "nonCurrentAccumulatedDepreciation": accumulated_depreciation,
        "assetsNonCurrent": net_non_current_assets,
        "totalAssets": total_assets,
        "liabilitiesCurrent": current_liabilities,
        "liabilitiesNonCurrent": non_current_liabilities,
        "totalLiabilities": total_liabilities,
        "expense": expenses,
    }


# ---------------- AUTH ----------------

@app.route("/register", methods=["POST"])
@limiter.limit("10 per minute")
def register():
    data = request.get_json(silent=True) or {}
    org_name = (data.get("org") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not org_name or not email or not password:
        return error_response("org, email, and password are required")
    if len(password) < 8:
        return error_response("password must be at least 8 characters")

    if User.query.filter_by(email=email).first():
        return error_response("email already exists", 409)

    hashed_password = bcrypt.generate_password_hash(password).decode()
    try:
        org = Organization(name=org_name)
        db.session.add(org)
        db.session.flush()
        db.session.add(Company(org_id=org.id, name=org_name, business_type="sole_proprietor"))
        user = User(email=email, password=hashed_password, role="owner", org_id=org.id)
        db.session.add(user)
        if not safe_commit():
            return error_response("database error during registration", 503)
    except IntegrityError:
        db.session.rollback()
        return error_response("email already exists", 409)
    except SQLAlchemyError:
        db.session.rollback()
        return error_response("database error during registration", 503)

    return {"msg": "registered"}


@app.route("/login", methods=["POST"])
@limiter.limit("20 per minute")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return error_response("email and password are required")

    user = User.query.filter_by(email=email).first()

    if not user or not bcrypt.check_password_hash(user.password, password):
        return error_response("invalid email or password", 401)

    touch_session(user.id)
    log(user.id, "logged in")
    return {"token": build_access_token(user)}


@app.route("/refresh", methods=["POST"])
@jwt_required()
def refresh():
    user = get_user_from_token()
    if not user:
        return error_response("invalid token", 401)

    touch_session(user.id)
    return {"token": build_access_token(user)}


# ---------------- INVITE USER ----------------

@app.route("/invite", methods=["POST"])
@jwt_required()
@limiter.limit("30 per minute")
def invite():
    me = get_user_from_token()
    if not me:
        return error_response("invalid token", 401)

    if me.role not in ["owner", "admin"]:
        return error_response("not allowed", 403)

    data = request.get_json(silent=True) or {}
    invite_email = (data.get("email") or "").strip().lower()
    if not invite_email:
        return error_response("email is required")

    if User.query.filter_by(email=invite_email).first():
        return error_response("email already exists", 409)

    hashed_password = bcrypt.generate_password_hash("temp123").decode()

    role = (data.get("role") or "member").strip().lower()
    if role not in VALID_ROLES:
        return error_response("invalid role")

    user = User(email=invite_email, password=hashed_password, role=role, org_id=me.org_id)
    db.session.add(user)
    if not safe_commit():
        return error_response("database error while inviting user", 503)

    log(me.id, "invited user")
    return {"msg": "user added"}


# ---------------- REPORT ENGINE ----------------

@app.route("/analyze", methods=["POST"])
@jwt_required()
@limiter.limit("30 per minute")
def analyze():
    status = maintenance_state()
    if status["maintenance"]:
        return error_response(status["message"], 503)

    user = get_user_from_token()
    if not user:
        return error_response("invalid token", 401)

    org = db.session.get(Organization, user.org_id)
    if not org:
        return error_response("organization not found", 404)

    if org.usage >= FREE_USAGE_LIMIT:
        return error_response("limit reached", 403)

    uploaded_file = request.files.get("file")
    if not uploaded_file:
        return error_response("file is required")

    company = resolve_company_for_user(user, request.form.get("company_id"))
    if not company:
        return error_response("company not found", 404)

    try:
        df = read_external_dataframe(uploaded_file)
        lowered_columns = {str(column).strip().lower() for column in df.columns}
        if "type" in lowered_columns and "amount" in lowered_columns:
            df = normalize_ledger_dataframe(df)
        result = calc(df)
    except Exception as exc:
        return error_response(f"invalid file: {exc}")

    org.usage += 1
    db.session.add(Report(org_id=org.id, company_id=company.id, data=json.dumps(result)))
    if not safe_commit():
        return error_response("database error while saving report", 503)

    log(user.id, f"generated report for {company.name}")
    return result


@app.route("/extract-ledger", methods=["POST"])
@jwt_required()
@limiter.limit("30 per minute")
def extract_ledger():
    status = maintenance_state()
    if status["maintenance"]:
        return error_response(status["message"], 503)

    user = get_user_from_token()
    if not user:
        return error_response("invalid token", 401)

    uploaded_file = request.files.get("file")
    if not uploaded_file:
        return error_response("file is required")

    try:
        raw_df = read_external_dataframe(uploaded_file)
        normalized_df = normalize_ledger_dataframe(raw_df)
        summary = calc(normalized_df)
    except Exception as exc:
        return error_response(f"invalid file: {exc}")

    ledger_rows = []
    for idx, row in enumerate(normalized_df.to_dict(orient="records"), start=1):
        ledger_rows.append(
            {
                "id": idx,
                "account": str(row.get("account", "")).strip(),
                "type": str(row.get("type", "")).strip(),
                "subtype": str(row.get("subtype", "")).strip(),
                "amount": float(row.get("amount", 0) or 0),
                "depreciation": float(row.get("depreciation", 0) or 0),
            }
        )

    log(user.id, "extracted external ledger file")
    return {"ledger_rows": ledger_rows, "summary": summary}


@app.route("/companies")
@jwt_required()
def list_companies():
    user = get_user_from_token()
    if not user:
        return error_response("invalid token", 401)

    companies = Company.query.filter_by(org_id=user.org_id).order_by(Company.id.asc()).all()
    if not companies:
        companies = [get_or_create_default_company(user.org_id)]

    return jsonify(
        [
            {
                "id": company.id,
                "name": company.name,
                "business_type": company.business_type,
            }
            for company in companies
        ]
    )


@app.route("/companies", methods=["POST"])
@jwt_required()
@roles_required("owner", "admin")
def create_company():
    user = get_user_from_token()
    if not user:
        return error_response("invalid token", 401)

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    business_type = (data.get("business_type") or "sole_proprietor").strip().lower()

    if not name:
        return error_response("company name is required")
    if business_type not in {"sole_proprietor", "partnership", "manufacturing"}:
        return error_response("invalid business type")

    company = Company(org_id=user.org_id, name=name, business_type=business_type)
    db.session.add(company)
    if not safe_commit():
        return error_response("database error while creating company", 503)

    log(user.id, f"created company {name}")
    return {
        "id": company.id,
        "name": company.name,
        "business_type": company.business_type,
    }, 201


# ---------------- API KEY ----------------

@app.route("/apikey", methods=["POST"])
@jwt_required()
def create_key():
    user = get_user_from_token()
    if not user:
        return error_response("invalid token", 401)

    raw = os.urandom(24).hex()

    db.session.add(APIKey(org_id=user.org_id, key_hash=hash_key(raw)))
    if not safe_commit():
        return error_response("database error while creating API key", 503)

    log(user.id, "created api key")
    return {"api_key": raw}


# ---------------- ANALYTICS ----------------

@app.route("/me")
@jwt_required()
def me():
    user = get_user_from_token()
    if not user:
        return error_response("invalid token", 401)

    company = get_or_create_default_company(user.org_id)
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "org_id": user.org_id,
        "default_company_id": company.id,
        "business_type": company.business_type,
    }


@app.route("/analytics")
@jwt_required()
def analytics():
    user = get_user_from_token()
    if not user:
        return error_response("invalid token", 401)

    org = db.session.get(Organization, user.org_id)
    if not org:
        return error_response("organization not found", 404)

    return {
        "usage": org.usage,
        "reports": Report.query.filter_by(org_id=org.id).count(),
        "users": User.query.filter_by(org_id=org.id).count(),
        "active_users": active_user_count_for_org(org.id),
    }


@app.route("/dashboard")
@jwt_required()
def dashboard_summary():
    user = get_user_from_token()
    if not user:
        return error_response("invalid token", 401)

    org = db.session.get(Organization, user.org_id)
    if not org:
        return error_response("organization not found", 404)

    company = resolve_company_for_user(user, request.args.get("company_id"))
    report_totals = aggregate_org_reports(org.id, company.id if company else None)
    return {
        "sales": report_totals["revenue"],
        "expenses": report_totals["expenses"],
        "profit": report_totals["profit"],
        "inventory_value": report_totals["total_assets"],
        "active_users": active_user_count_for_org(org.id),
        "company_id": company.id if company else None,
    }


@app.route("/reports/income")
@jwt_required()
@roles_required("owner", "admin", "manager", "accountant")
def income_statement():
    user = get_user_from_token()
    org = db.session.get(Organization, user.org_id)
    if not org:
        return error_response("organization not found", 404)

    totals = aggregate_org_reports(org.id)
    return {
        "revenue": totals["revenue"],
        "expenses": totals["expenses"],
        "profit": totals["profit"],
    }


@app.route("/inventory")
@jwt_required()
def inventory_summary():
    user = get_user_from_token()
    if not user:
        return error_response("invalid token", 401)

    org = db.session.get(Organization, user.org_id)
    if not org:
        return error_response("organization not found", 404)

    totals = aggregate_org_reports(org.id)
    return {
        "inventory_value": totals["total_assets"],
        "note": "Derived from uploaded report assets. Add a dedicated inventory table for item-level stock.",
    }


# ---------------- LIVE USER COUNT ----------------

@app.route("/user-count")
@jwt_required()
def user_count():
    user = get_user_from_token()
    if not user:
        return error_response("invalid token", 401)

    org = db.session.get(Organization, user.org_id)
    if not org:
        return error_response("organization not found", 404)

    count = active_user_count_for_org(org.id)
    registered = User.query.filter_by(org_id=org.id).count()
    return {"user_count": count, "active_users": count, "registered_users": registered}


@app.route("/session/ping", methods=["POST"])
@jwt_required()
def session_ping():
    user = get_user_from_token()
    if not user:
        return error_response("invalid token", 401)

    touch_session(user.id)
    return {"ok": True}


@app.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    user = get_user_from_token()
    if not user:
        return error_response("invalid token", 401)

    clear_session(user.id)
    log(user.id, "logged out")
    return {"ok": True}


@app.route("/activity/recent")
@jwt_required()
def recent_activity():
    user = get_user_from_token()
    if not user:
        return error_response("invalid token", 401)

    try:
        limit = int(request.args.get("limit", "8"))
    except ValueError:
        limit = 8
    limit = max(1, min(limit, 50))

    rows = (
        db.session.query(AuditLog, User.email)
        .join(User, AuditLog.user_id == User.id)
        .filter(User.org_id == user.org_id)
        .order_by(AuditLog.time.desc())
        .limit(limit)
        .all()
    )

    return {
        "items": [
            {
                "email": email,
                "action": log_row.action,
                "time": log_row.time.isoformat() if log_row.time else None,
            }
            for log_row, email in rows
        ]
    }


# ---------------- ADMIN USERS ----------------

@app.route("/admin/users")
@jwt_required()
@roles_required("owner", "admin")
def users():
    me = get_user_from_token()
    return jsonify(
        [
            {"id": user.id, "email": user.email, "role": user.role}
            for user in User.query.filter_by(org_id=me.org_id).order_by(User.id.asc())
        ]
    )


@app.route("/admin/users", methods=["POST"])
@jwt_required()
@roles_required("owner", "admin")
@limiter.limit("20 per minute")
def create_user():
    me = get_user_from_token()
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = (data.get("role") or "cashier").strip().lower()

    if not email or not password:
        return error_response("email and password are required")
    if len(password) < 8:
        return error_response("password must be at least 8 characters")
    if role not in VALID_ROLES:
        return error_response("invalid role")
    if User.query.filter_by(email=email).first():
        return error_response("email already exists", 409)

    hashed_password = bcrypt.generate_password_hash(password).decode()
    db.session.add(User(email=email, password=hashed_password, role=role, org_id=me.org_id))
    if not safe_commit():
        return error_response("database error while creating user", 503)

    log(me.id, f"created user {email} with role {role}")
    return {"msg": "user created"}, 201


@app.route("/admin/users/<int:user_id>/role", methods=["PATCH"])
@jwt_required()
@roles_required("owner", "admin")
@limiter.limit("30 per minute")
def update_user_role(user_id):
    me = get_user_from_token()
    data = request.get_json(silent=True) or {}
    role = (data.get("role") or "").strip().lower()
    if role not in VALID_ROLES:
        return error_response("invalid role")

    target = User.query.filter_by(id=user_id, org_id=me.org_id).first()
    if not target:
        return error_response("user not found", 404)
    if target.id == me.id and role not in {"owner", "admin"}:
        return error_response("cannot downgrade your own admin access", 400)

    target.role = role
    if not safe_commit():
        return error_response("database error while updating role", 503)

    log(me.id, f"updated role for {target.email} to {role}")
    return {"msg": "role updated"}


@app.route("/admin/users/<int:user_id>", methods=["DELETE"])
@jwt_required()
@roles_required("owner", "admin")
@limiter.limit("20 per minute")
def delete_user(user_id):
    me = get_user_from_token()
    target = User.query.filter_by(id=user_id, org_id=me.org_id).first()
    if not target:
        return error_response("user not found", 404)
    if target.id == me.id:
        return error_response("cannot delete your own account", 400)

    clear_session(target.id)
    db.session.delete(target)
    if not safe_commit():
        return error_response("database error while deleting user", 503)

    log(me.id, f"deleted user {target.email}")
    return {"msg": "user deleted"}


# ---------------- HEALTH ----------------

@app.route("/")
def home():
    return {"status": "FULL SAAS RUNNING"}


@app.route("/health")
def health():
    try:
        db.session.execute(text("SELECT 1"))
        return {"status": "ok", "env": ENV, "database": "ok"}
    except SQLAlchemyError:
        db.session.rollback()
        return {"status": "degraded", "env": ENV, "database": "error"}, 503


@app.route("/system-status")
def system_status():
    return maintenance_state()


# ---------------- RUN ----------------

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug = ENV == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
