from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from sqlalchemy.exc import OperationalError
import hashlib
import datetime
import json
import os
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

allowed_origins = os.getenv("CORS_ORIGINS", "*")
CORS(app, origins=[o.strip() for o in allowed_origins.split(",") if o.strip()] if allowed_origins != "*" else "*")

# ---------------- CONFIG ----------------

# Support both SQLite (dev) and PostgreSQL (production)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///saas.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
if DATABASE_URL.startswith("postgresql://") and "sslmode=" not in DATABASE_URL:
    separator = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{separator}sslmode=require"

JWT_SECRET = os.getenv("JWT_SECRET_KEY", "")
ENV = os.getenv("FLASK_ENV", "development")

if ENV == "production" and not JWT_SECRET:
    raise RuntimeError("JWT_SECRET_KEY must be set in production")

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["JWT_SECRET_KEY"] = JWT_SECRET or "dev-only-secret-change-me"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024  # 5 MB upload cap

db = SQLAlchemy(app)
jwt = JWTManager(app)
bcrypt = Bcrypt(app)

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
    data = db.Column(db.Text, nullable=False)


class APIKey(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    key_hash = db.Column(db.String(200), nullable=False)


class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    action = db.Column(db.String(200), nullable=False)
    time = db.Column(db.DateTime, default=datetime.datetime.utcnow)


with app.app_context():
    # Avoid multi-worker startup races in production. In production, schema
    # should be managed explicitly (migrations/init job), not at app import time.
    if ENV != "production":
        try:
            db.create_all()
        except OperationalError as exc:
            if "already exists" not in str(exc).lower():
                raise

# ---------------- LIMITS ----------------

FREE_USAGE_LIMIT = 5

# ---------------- HELPERS ----------------

def error_response(message, status=400):
    return {"error": message}, status


def get_user_from_token():
    try:
        user_id = int(get_jwt_identity())
    except (TypeError, ValueError):
        return None
    return db.session.get(User, user_id)


def log(user_id, action):
    db.session.add(AuditLog(user_id=user_id, action=action))
    db.session.commit()


def hash_key(raw_key):
    return hashlib.sha256(raw_key.encode()).hexdigest()


def calc(df):
    required = {"type", "amount"}
    missing = required.difference(df.columns)
    if missing:
        raise ValueError(f"missing required columns: {', '.join(sorted(missing))}")

    df = df.copy()
    df["type"] = df["type"].astype(str).str.lower().str.strip()
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")

    if df["amount"].isna().any():
        raise ValueError("amount column must contain numeric values")

    return {
        "revenue": float(df.loc[df["type"] == "revenue", "amount"].sum()),
        "expenses": float(df.loc[df["type"] == "expense", "amount"].sum()),
    }


# ---------------- AUTH ----------------

@app.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    org_name = (data.get("org") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not org_name or not email or not password:
        return error_response("org, email, and password are required")

    if User.query.filter_by(email=email).first():
        return error_response("email already exists", 409)

    org = Organization(name=org_name)
    db.session.add(org)
    db.session.commit()

    hashed_password = bcrypt.generate_password_hash(password).decode()

    user = User(email=email, password=hashed_password, role="owner", org_id=org.id)
    db.session.add(user)
    db.session.commit()

    return {"msg": "registered"}


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return error_response("email and password are required")

    user = User.query.filter_by(email=email).first()

    if not user or not bcrypt.check_password_hash(user.password, password):
        return error_response("bad login", 401)

    return {"token": create_access_token(identity=str(user.id))}


# ---------------- INVITE USER ----------------

@app.route("/invite", methods=["POST"])
@jwt_required()
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

    user = User(email=invite_email, password=hashed_password, role="member", org_id=me.org_id)
    db.session.add(user)
    db.session.commit()

    log(me.id, "invited user")
    return {"msg": "user added"}


# ---------------- REPORT ENGINE ----------------

@app.route("/analyze", methods=["POST"])
@jwt_required()
def analyze():
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

    try:
        df = pd.read_csv(uploaded_file)
        result = calc(df)
    except Exception as exc:
        return error_response(f"invalid csv: {exc}")

    org.usage += 1
    db.session.commit()

    db.session.add(Report(org_id=org.id, data=json.dumps(result)))
    db.session.commit()

    log(user.id, "generated report")
    return result


# ---------------- API KEY ----------------

@app.route("/apikey", methods=["POST"])
@jwt_required()
def create_key():
    user = get_user_from_token()
    if not user:
        return error_response("invalid token", 401)

    raw = os.urandom(24).hex()

    db.session.add(APIKey(org_id=user.org_id, key_hash=hash_key(raw)))
    db.session.commit()

    log(user.id, "created api key")
    return {"api_key": raw}


# ---------------- ANALYTICS ----------------

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

    count = User.query.filter_by(org_id=org.id).count()
    return {"user_count": count}


# ---------------- ADMIN USERS ----------------

@app.route("/admin/users")
@jwt_required()
def users():
    me = get_user_from_token()
    if not me:
        return error_response("invalid token", 401)

    if me.role != "owner":
        return error_response("owner only", 403)

    return jsonify([
        {"email": user.email, "role": user.role}
        for user in User.query.filter_by(org_id=me.org_id)
    ])


# ---------------- HEALTH ----------------

@app.route("/")
def home():
    return {"status": "FULL SAAS RUNNING"}


@app.route("/health")
def health():
    return {"status": "ok", "env": ENV}


# ---------------- RUN ----------------

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = ENV == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
