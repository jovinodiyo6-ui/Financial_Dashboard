from functools import wraps
import datetime
import os

import bcrypt
import jwt
import psycopg2
import redis
import stripe
from flask import Flask, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_socketio import SocketIO
from flask_talisman import Talisman

app = Flask(__name__)
CORS(app)
Talisman(app, force_https=False)
socketio = SocketIO(app, cors_allowed_origins="*")

limiter = Limiter(get_remote_address, app=app, default_limits=["200 per day", "50 per hour"])

SECRET = os.getenv("JWT_SECRET", "SUPER_SECRET_KEY")
DB_NAME = os.getenv("DB_NAME", "kisehotel")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")

stripe.api_key = STRIPE_SECRET_KEY

con = psycopg2.connect(
    database=DB_NAME,
    user=DB_USER,
    password=DB_PASSWORD,
    host=DB_HOST,
    port=DB_PORT,
)


def query(q, args=(), one=False):
    cur = con.cursor()
    cur.execute(q, args)
    try:
        data = cur.fetchall()
    except Exception:
        data = None
    con.commit()
    cur.close()
    return (data[0] if data else None) if one else data


cache = redis.Redis(host=REDIS_HOST, port=REDIS_PORT)


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization")
        if not token:
            return {"error": "missing token"}, 401
        try:
            data = jwt.decode(token, SECRET, algorithms=["HS256"])
            request.user = data
        except Exception:
            return {"error": "invalid token"}, 403
        return f(*args, **kwargs)

    return decorated


def log_action(user_id, action):
    query("INSERT INTO audit_logs(user_id,action) VALUES(%s,%s)", (user_id, action))


@app.route("/health", methods=["GET"])
def health():
    return {"status": "ok"}


@app.route("/login", methods=["POST"])
@limiter.limit("5 per minute")
def login():
    d = request.json or {}
    user = query(
        "SELECT id, branch_id, username, password, role FROM users WHERE username=%s",
        (d.get("username", ""),),
        one=True,
    )

    if user and bcrypt.checkpw(d.get("password", "").encode(), user[3].encode()):
        token = jwt.encode(
            {
                "user_id": user[0],
                "branch_id": user[1],
                "username": user[2],
                "role": user[4],
                "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=2),
            },
            SECRET,
            algorithm="HS256",
        )
        return {"token": token, "role": user[4]}

    return {"error": "invalid"}, 401


@app.route("/create-user", methods=["POST"])
@token_required
def create_user():
    if request.user.get("role") != "admin":
        return {"error": "forbidden"}, 403

    d = request.json or {}
    hashed = bcrypt.hashpw(d["password"].encode(), bcrypt.gensalt()).decode()
    branch_id = d.get("branch_id") or request.user.get("branch_id")

    query(
        "INSERT INTO users(branch_id,username,password,role) VALUES(%s,%s,%s,%s)",
        (branch_id, d["username"], hashed, d["role"]),
    )

    log_action(request.user["user_id"], "created user")
    return {"msg": "user created"}


@app.route("/rooms")
@token_required
def rooms():
    branch_id = request.user.get("branch_id")
    cache_key = f"rooms:{branch_id}"
    cached = cache.get(cache_key)

    if cached:
        return {"source": "cache", "data": cached.decode()}

    data = query(
        "SELECT id, room_number, room_type, base_price, status FROM rooms WHERE branch_id=%s ORDER BY id DESC",
        (branch_id,),
    )
    cache.set(cache_key, str(data), ex=60)

    return {"source": "database", "data": data}


@app.route("/rooms", methods=["POST"])
@token_required
def add_room():
    if request.user.get("role") not in ("admin", "staff"):
        return {"error": "forbidden"}, 403

    d = request.json or {}
    room_number = d.get("room_number") or d.get("number")
    room_type = d.get("room_type") or d.get("type")
    base_price = d.get("base_price") or d.get("price")

    query(
        "INSERT INTO rooms(branch_id,room_number,room_type,base_price,status) VALUES(%s,%s,%s,%s,%s)",
        (request.user.get("branch_id"), room_number, room_type, base_price, "Available"),
    )

    log_action(request.user["user_id"], "added room")
    cache.delete(f"rooms:{request.user.get('branch_id')}")
    return {"msg": "room added"}


@app.route("/book", methods=["POST"])
@token_required
def book():
    d = request.json or {}

    query(
        "INSERT INTO bookings(branch_id,guest_id,room_id,check_in,check_out,status) VALUES(%s,%s,%s,%s,%s,%s)",
        (
            request.user.get("branch_id"),
            d["guest_id"],
            d["room_id"],
            d["check_in"],
            d["check_out"],
            "Booked",
        ),
    )

    query("UPDATE rooms SET status='Occupied' WHERE id=%s", (d["room_id"],))

    log_action(request.user["user_id"], "created booking")
    socketio.emit("new_booking", {"msg": "New booking created"})
    cache.delete(f"rooms:{request.user.get('branch_id')}")

    return {"msg": "booking confirmed"}


@app.route("/stats")
@token_required
def stats():
    branch_id = request.user.get("branch_id")
    total = query("SELECT COUNT(*) FROM rooms WHERE branch_id=%s", (branch_id,), one=True)[0]
    occ = query(
        "SELECT COUNT(*) FROM rooms WHERE branch_id=%s AND status='Occupied'",
        (branch_id,),
        one=True,
    )[0]

    return {
        "total_rooms": total,
        "occupied": occ,
        "available": total - occ,
    }


@app.route("/pay", methods=["POST"])
@token_required
def pay():
    d = request.json or {}

    query(
        "INSERT INTO payments(booking_id,amount,method) VALUES(%s,%s,%s)",
        (d["booking_id"], d["amount"], d["method"]),
    )

    log_action(request.user["user_id"], "payment recorded")

    return {"msg": "payment saved"}


@app.route("/create-payment", methods=["POST"])
@token_required
def create_payment():
    if not STRIPE_SECRET_KEY:
        return {"error": "Stripe key is not configured"}, 500

    d = request.json or {}
    amount = int(d.get("amount", 5000))
    currency = d.get("currency", "usd")

    intent = stripe.PaymentIntent.create(
        amount=amount,
        currency=currency,
        payment_method_types=["card"],
    )
    return {"clientSecret": intent.client_secret}


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
