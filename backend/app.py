import importlib.util
from pathlib import Path


backend_file = Path(__file__).with_name("Financial dashboard back end.py")
spec = importlib.util.spec_from_file_location("financial_dashboard_backend", backend_file)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

app = module.app
