from __future__ import annotations

from datetime import datetime

from accounting_system.database import connect


def record_activity(username: str, action: str, module: str = "system") -> None:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO user_activity(username, action, module, time) VALUES (?, ?, ?, ?)",
        (username, action, module, datetime.now().isoformat(timespec="seconds")),
    )
    conn.commit()
    conn.close()


def start_session(username: str) -> None:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM active_sessions WHERE username = ?", (username,))
    cursor.execute(
        "INSERT INTO active_sessions(username, login_time) VALUES(?, ?)",
        (username, datetime.now().isoformat(timespec="seconds")),
    )
    conn.commit()
    conn.close()


def end_session(username: str) -> None:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM active_sessions WHERE username = ?", (username,))
    conn.commit()
    conn.close()


def active_user_count() -> int:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) AS cnt FROM active_sessions")
    count = int(cursor.fetchone()["cnt"])
    conn.close()
    return count


def recent_activity(limit: int = 8) -> list[dict]:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT username, action, module, time
        FROM user_activity
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,),
    )
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

