"""
Compatibility shim for legacy imports in tests and tools.
Exports the Flask app, database instance, pandas namespace, and helper
functions from the current backend implementation in backend/app.py.
"""

from pathlib import Path
import sys

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    # Allow legacy path-based imports to resolve sibling backend modules.
    sys.path.insert(0, str(backend_dir))

from app import app, db  # noqa: F401
import pandas as pd  # noqa: F401
from services.ingestion_service import normalize_ledger_dataframe, calc  # noqa: F401
