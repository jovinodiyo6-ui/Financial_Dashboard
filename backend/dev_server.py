import os

from app import app, socketio


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_ENV", "development") == "development"
    socketio.run(app, host="0.0.0.0", port=port, debug=debug)
