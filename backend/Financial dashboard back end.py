from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_bcrypt import Bcrypt
from flask_cors import CORS
import hashlib, datetime, json, os, pandas as pd
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# ---------------- CONFIG ----------------

# Support both SQLite (dev) and PostgreSQL (production)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///saas.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "supersecret")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)
jwt = JWTManager(app)
bcrypt = Bcrypt(app)

# ---------------- DATABASE ----------------

class Organization(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    usage = db.Column(db.Integer, default=0)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True)
    password = db.Column(db.String(200))
    role = db.Column(db.String(20))
    org_id = db.Column(db.Integer)

class Report(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer)
    data = db.Column(db.Text)

class APIKey(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer)
    key_hash = db.Column(db.String(200))

class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer)
    action = db.Column(db.String(200))
    time = db.Column(db.DateTime, default=datetime.datetime.utcnow)

with app.app_context():
    db.create_all()

# ---------------- LIMITS ----------------

FREE_USAGE_LIMIT = 5

# ---------------- HELPERS ----------------

def log(user,action):
    db.session.add(AuditLog(user_id=user,action=action))
    db.session.commit()

def hash_key(k):
    return hashlib.sha256(k.encode()).hexdigest()

def calc(df):
    return {
        "revenue": float(df[df.type=="revenue"].amount.sum()),
        "expenses": float(df[df.type=="expense"].amount.sum())
    }

# ---------------- AUTH ----------------

@app.route("/register",methods=["POST"])
def register():
    d=request.json

    org=Organization(name=d["org"])
    db.session.add(org)
    db.session.commit()

    pw=bcrypt.generate_password_hash(d["password"]).decode()

    user=User(email=d["email"],password=pw,role="owner",org_id=org.id)
    db.session.add(user)
    db.session.commit()

    return {"msg":"registered"}

@app.route("/login",methods=["POST"])
def login():
    d=request.json
    u=User.query.filter_by(email=d["email"]).first()

    if not u or not bcrypt.check_password_hash(u.password,d["password"]):
        return {"error":"bad login"},401

    return {"token":create_access_token(identity=u.id)}

# ---------------- INVITE USER ----------------

@app.route("/invite",methods=["POST"])
@jwt_required()
def invite():
    me=User.query.get(get_jwt_identity())

    if me.role not in ["owner","admin"]:
        return {"error":"not allowed"},403

    d=request.json
    pw=bcrypt.generate_password_hash("temp123").decode()

    u=User(email=d["email"],password=pw,role="member",org_id=me.org_id)
    db.session.add(u)
    db.session.commit()

    log(me.id,"invited user")
    return {"msg":"user added"}

# ---------------- REPORT ENGINE ----------------

@app.route("/analyze",methods=["POST"])
@jwt_required()
def analyze():

    user=User.query.get(get_jwt_identity())
    org=Organization.query.get(user.org_id)

    if org.usage >= FREE_USAGE_LIMIT:
        return {"error":"limit reached"},403

    df=pd.read_csv(request.files["file"])
    result=calc(df)

    org.usage+=1
    db.session.commit()

    db.session.add(Report(org_id=org.id,data=json.dumps(result)))
    db.session.commit()

    log(user.id,"generated report")
    return result

# ---------------- API KEY ----------------

@app.route("/apikey",methods=["POST"])
@jwt_required()
def create_key():
    user=User.query.get(get_jwt_identity())
    raw=os.urandom(24).hex()

    db.session.add(APIKey(org_id=user.org_id,key_hash=hash_key(raw)))
    db.session.commit()

    return {"api_key":raw}

# ---------------- ANALYTICS ----------------

@app.route("/analytics")
@jwt_required()
def analytics():

    user=User.query.get(get_jwt_identity())
    org=Organization.query.get(user.org_id)

    return {
        "usage":org.usage,
        "reports":Report.query.filter_by(org_id=org.id).count(),
        "users":User.query.filter_by(org_id=org.id).count()
    }

# ---------------- LIVE USER COUNT ----------------

@app.route("/user-count")
@jwt_required()
def user_count():
    user=User.query.get(get_jwt_identity())
    org=Organization.query.get(user.org_id)
    
    count=User.query.filter_by(org_id=org.id).count()
    return {"user_count":count}

# ---------------- ADMIN USERS ----------------

@app.route("/admin/users")
@jwt_required()
def users():
    me=User.query.get(get_jwt_identity())
    if me.role!="owner":
        return {"error":"owner only"},403

    return jsonify([
        {"email":u.email,"role":u.role}
        for u in User.query.filter_by(org_id=me.org_id)
    ])

# ---------------- HEALTH ----------------

@app.route("/")
def home():
    return {"status":"FULL SAAS RUNNING"}

# ---------------- RUN ----------------

if __name__=="__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
