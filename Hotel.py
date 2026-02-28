from flask import Flask,request,jsonify
from flask_cors import CORS
import psycopg2, jwt, datetime, bcrypt, redis
from functools import wraps
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_talisman import Talisman
from flask_socketio import SocketIO

# ================= APP SETUP =================
app = Flask(__name__)
CORS(app)
Talisman(app)
socketio = SocketIO(app,cors_allowed_origins="*")

limiter = Limiter(get_remote_address, app=app,
                  default_limits=["200 per day","50 per hour"])

SECRET = "SUPER_SECRET_KEY"

# ================= DATABASE =================
con = psycopg2.connect(
    database="kisehotel",
    user="postgres",
    password="password",
    host="localhost",
    port="5432"
)

def query(q,args=(),one=False):
    cur = con.cursor()
    cur.execute(q,args)
    try:
        data = cur.fetchall()
    except:
        data = None
    con.commit()
    cur.close()
    return (data[0] if data else None) if one else data

# ================= REDIS CACHE =================
cache = redis.Redis(host="localhost",port=6379)

# ================= AUTH DECORATOR =================
def token_required(f):
    @wraps(f)
    def decorated(*args,**kwargs):
        t=request.headers.get("Authorization")
        if not t:
            return {"error":"missing token"},401
        try:
            data = jwt.decode(t,SECRET,algorithms=["HS256"])
            request.user=data
        except:
            return {"error":"invalid token"},403
        return f(*args,**kwargs)
    return decorated

# ================= AUDIT LOGGER =================
def log_action(user,action):
    query(
        "INSERT INTO audit_logs(user_name,action) VALUES(%s,%s)",
        (user,action)
    )

# ================= LOGIN =================
@app.route("/login",methods=["POST"])
@limiter.limit("5 per minute")
def login():
    d=request.json
    user=query("SELECT * FROM users WHERE username=%s",
               (d["username"],),one=True)

    if user and bcrypt.checkpw(d["password"].encode(),user[2].encode()):
        token = jwt.encode({
            "user":user[1],
            "role":user[3],
            "exp": datetime.datetime.utcnow()+datetime.timedelta(hours=2)
        },SECRET,algorithm="HS256")

        return {"token":token,"role":user[3]}
    return {"error":"invalid"},401

# ================= CREATE USER =================
@app.route("/create-user",methods=["POST"])
@token_required
def create_user():
    d=request.json
    hashed=bcrypt.hashpw(d["password"].encode(),bcrypt.gensalt()).decode()

    query(
        "INSERT INTO users(username,password,role) VALUES(%s,%s,%s)",
        (d["username"],hashed,d["role"])
    )

    log_action(request.user["user"],"created user")
    return {"msg":"user created"}

# ================= ROOMS =================
@app.route("/rooms")
@token_required
def rooms():

    cached = cache.get("rooms")

    if cached:
        return {"source":"cache","data":cached.decode()}

    data = query("SELECT * FROM rooms")
    cache.set("rooms",str(data),ex=60)

    return {"source":"database","data":data}

# ================= ADD ROOM =================
@app.route("/rooms",methods=["POST"])
@token_required
def add_room():
    d=request.json
    query(
        "INSERT INTO rooms(number,type,price,status) VALUES(%s,%s,%s,%s)",
        (d["number"],d["type"],d["price"],"Available")
    )

    log_action(request.user["user"],"added room")
    cache.delete("rooms")
    return {"msg":"room added"}

# ================= BOOKINGS =================
@app.route("/book",methods=["POST"])
@token_required
def book():
    d=request.json

    query(
        "INSERT INTO bookings(guest_id,room_id,check_in,check_out,status) VALUES(%s,%s,%s,%s,%s)",
        (d["guest_id"],d["room_id"],d["check_in"],d["check_out"],"Booked")
    )

    query(
        "UPDATE rooms SET status='Occupied' WHERE id=%s",
        (d["room_id"],)
    )

    log_action(request.user["user"],"created booking")

    socketio.emit("new_booking",{"msg":"New booking created"})

    return {"msg":"booking confirmed"}

# ================= STATS =================
@app.route("/stats")
@token_required
def stats():
    total = query("SELECT COUNT(*) FROM rooms",one=True)[0]
    occ = query("SELECT COUNT(*) FROM rooms WHERE status='Occupied'",one=True)[0]

    return {
        "total_rooms":total,
        "occupied":occ,
        "available":total-occ
    }

# ================= PAYMENTS =================
@app.route("/pay",methods=["POST"])
@token_required
def pay():
    d=request.json

    query(
        "INSERT INTO payments(booking_id,amount,method) VALUES(%s,%s,%s)",
        (d["booking_id"],d["amount"],d["method"])
    )

    log_action(request.user["user"],"payment recorded")

    return {"msg":"payment saved"}

# ================= SERVER =================
if __name__=="__main__":
    socketio.run(app,debug=True)