from functools import wraps
from flask_jwt_extended import get_jwt_identity
from extensions import db
from models import User, Organization
from constants import PLAN_DEFINITIONS

def get_user_from_token():
    try:
        user_id = int(get_jwt_identity())
    except (TypeError, ValueError):
        return None
    return db.session.get(User, user_id)

def roles_required(*allowed_roles):
    allowed = set(allowed_roles)
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = get_user_from_token()
            if not user:
                return {"error": "invalid token"}, 401
            if user.role not in allowed:
                return {"error": "not allowed"}, 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator

def get_plan_definition(plan_code=None):
    normalized_code = str(plan_code or "free").strip().lower()
    return PLAN_DEFINITIONS.get(normalized_code, PLAN_DEFINITIONS["free"])

def org_has_plan(org, minimum_plan):
    ordering = {"free": 0, "pro": 1, "ai": 2}
    current_rank = ordering.get(str(org.plan_code or "free").strip().lower(), 0)
    required_rank = ordering.get(str(minimum_plan).strip().lower(), 0)
    return current_rank >= required_rank

def plan_required(minimum_plan):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = get_user_from_token()
            if not user:
                return {"error": "invalid token"}, 401
            org = db.session.get(Organization, user.org_id)
            if not org_has_plan(org, minimum_plan):
                plan = get_plan_definition(minimum_plan)
                return {"error": f"{plan['label']} plan required"}, 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
