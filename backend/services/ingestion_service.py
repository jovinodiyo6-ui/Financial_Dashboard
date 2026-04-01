import re
from pathlib import Path

import pandas as pd

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    import docx
except ImportError:
    docx = None


LEDGER_COLUMN_ALIASES = {
    "account": {"account", "name", "account name", "description", "particulars"},
    "type": {"type"},
    "subtype": {"subtype", "class", "category"},
    "amount": {"amount", "value"},
    "debit": {"debit", "dr"},
    "credit": {"credit", "cr"},
    "depreciation": {"depreciation", "depreciation_amount"},
}


def normalize_column_label(value):
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def detect_column_role(column):
    key = normalize_column_label(column)
    for role, aliases in LEDGER_COLUMN_ALIASES.items():
        if key in aliases:
            return role
    return None


def uploaded_file_seek(uploaded_file):
    seek = getattr(uploaded_file, "seek", None)
    if callable(seek):
        seek(0)
        return

    stream = getattr(uploaded_file, "stream", None)
    if stream is not None and hasattr(stream, "seek"):
        stream.seek(0)


def read_tabular_dataframe(uploaded_file, reader, **kwargs):
    frame = reader(uploaded_file, **kwargs)
    roles = {detect_column_role(column) for column in frame.columns}
    roles.discard(None)

    if not roles and frame.shape[1] <= 2:
        uploaded_file_seek(uploaded_file)
        return reader(uploaded_file, header=None, **kwargs)

    return frame


def is_blank_cell(value):
    if value is None:
        return True
    if isinstance(value, float) and pd.isna(value):
        return True
    return str(value).strip() == ""


def parse_numeric_cell(value):
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if pd.isna(value):
            return None
        return float(value)

    text = str(value).strip()
    if not text:
        return None

    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1].strip()

    if text.endswith("-"):
        negative = True
        text = text[:-1].strip()

    text = re.sub(r"(?i)\b(dr|cr)\b", "", text)
    text = re.sub(r"\([^)]*\)", "", text).strip()
    text = text.replace(",", "").replace("$", "").replace("€", "").replace("£", "").strip()
    if not text:
        return None

    try:
        number = float(text)
    except ValueError:
        return None
    return -number if negative else number


def normalize_account_key(account_name):
    return re.sub(r"[^a-z0-9]+", " ", str(account_name or "").strip().lower()).strip()


def should_skip_derived_label(account_name):
    key = normalize_account_key(account_name)
    if not key:
        return True

    derived_labels = {
        "cost of raw materials consumed",
        "prime cost",
        "factory overheads",
        "total factory overheads",
        "cost of goods manufactured",
    }
    return key in derived_labels


def _title_account_name(raw_name, fallback):
    cleaned = re.sub(r"\s+", " ", str(raw_name or "").strip())
    return cleaned.title() if cleaned else fallback


def infer_trial_balance_account(account_name):
    raw_name = str(account_name or "").strip()
    key = normalize_account_key(raw_name)
    title = _title_account_name(raw_name, "Unclassified Entry")

    if not key:
        return {"account": "Unclassified Entry", "type": "expense", "subtype": "operating"}

    exact_mappings = [
        ({"stock 1 october 19x8", "opening stock"}, {"account": "Opening Stock", "type": "asset", "subtype": "current"}),
        ({"opening raw materials"}, {"account": "Raw Materials Opening Stock", "type": "asset", "subtype": "current"}),
        ({"closing raw materials"}, {"account": "Closing Raw Materials", "type": "asset", "subtype": "current"}),
        ({"opening work in progress wip", "opening work in progress"}, {"account": "Opening Work in Progress", "type": "asset", "subtype": "current"}),
        ({"closing work in progress wip", "closing work in progress"}, {"account": "Closing Work in Progress", "type": "asset", "subtype": "current"}),
        ({"returns inwards"}, {"account": "Returns Inwards", "type": "expense", "subtype": "operating"}),
        ({"returns outwards"}, {"account": "Returns Outwards", "type": "expense", "subtype": "operating"}),
        ({"carriage outwards"}, {"account": "Carriage Outwards", "type": "expense", "subtype": "operating"}),
        ({"carriage inwards"}, {"account": "Carriage Inwards", "type": "expense", "subtype": "operating"}),
        ({"salaries and wages"}, {"account": "Payroll Expenses", "type": "expense", "subtype": "operating"}),
        ({"rent"}, {"account": "Rent Expense", "type": "expense", "subtype": "operating"}),
        ({"insurance"}, {"account": "Insurance Expense", "type": "expense", "subtype": "operating"}),
        ({"motor expenses"}, {"account": "Motor Expenses", "type": "expense", "subtype": "operating"}),
        ({"office expenses"}, {"account": "Office Expenses", "type": "expense", "subtype": "operating"}),
        ({"lighting and heating expenses"}, {"account": "Lighting And Heating Expenses", "type": "expense", "subtype": "operating"}),
        ({"general expenses"}, {"account": "General Expenses", "type": "expense", "subtype": "operating"}),
        ({"premises"}, {"account": "Premises", "type": "asset", "subtype": "non-current"}),
        ({"motor vehicles"}, {"account": "Motor Vehicles", "type": "asset", "subtype": "non-current"}),
        ({"fixtures and fittings"}, {"account": "Fixtures And Fittings", "type": "asset", "subtype": "non-current"}),
        ({"debtors"}, {"account": "Accounts Receivable", "type": "asset", "subtype": "current"}),
        ({"creditors"}, {"account": "Accounts Payable", "type": "liability", "subtype": "current"}),
        ({"cash at bank"}, {"account": "Cash and Cash Equivalents", "type": "asset", "subtype": "current"}),
        ({"capital"}, {"account": "Owner Capital", "type": "capital", "subtype": "equity"}),
        ({"drawings"}, {"account": "Drawings", "type": "drawings", "subtype": "equity"}),
        ({"direct manufacturing labor"}, {"account": "Direct Manufacturing Labor", "type": "expense", "subtype": "operating"}),
        ({"factory indirect labor"}, {"account": "Factory Indirect Labor", "type": "expense", "subtype": "operating"}),
        ({"depreciation of factory equipment"}, {"account": "Depreciation of Factory Equipment", "type": "expense", "subtype": "operating"}),
    ]
    for aliases, mapping in exact_mappings:
        if key in aliases:
            return mapping

    if "factory utilit" in key:
        return {"account": "Factory Utilities", "type": "expense", "subtype": "operating"}
    if "purchase of raw materials" in key:
        return {"account": "Purchases of Raw Materials", "type": "expense", "subtype": "operating"}
    if "purchase" in key:
        return {"account": "Purchases", "type": "expense", "subtype": "operating"}
    if "sales" in key or "turnover" in key:
        return {"account": "Sales Revenue", "type": "revenue", "subtype": "operating"}
    if "salary" in key or "wages" in key or "payroll" in key:
        return {"account": "Payroll Expenses", "type": "expense", "subtype": "operating"}
    if "rent" in key:
        return {"account": "Rent Expense", "type": "expense", "subtype": "operating"}
    if "inventory" in key or "stock" in key:
        return {"account": "Inventory", "type": "asset", "subtype": "current"}
    if "cash" in key or "bank" in key:
        return {"account": "Cash and Cash Equivalents", "type": "asset", "subtype": "current"}
    if "creditor" in key or "accounts payable" in key:
        return {"account": "Accounts Payable", "type": "liability", "subtype": "current"}
    if "debtor" in key or "accounts receivable" in key:
        return {"account": "Accounts Receivable", "type": "asset", "subtype": "current"}
    if any(keyword in key for keyword in {"equipment", "fixture", "vehicle", "premises", "property", "plant"}):
        return {"account": title, "type": "asset", "subtype": "non-current"}
    if any(keyword in key for keyword in {"capital", "equity"}):
        return {"account": title, "type": "capital", "subtype": "equity"}
    if "drawing" in key:
        return {"account": title, "type": "drawings", "subtype": "equity"}
    if any(keyword in key for keyword in {"income", "revenue"}):
        return {"account": title, "type": "revenue", "subtype": "other"}
    if any(keyword in key for keyword in {"liability", "payable"}):
        return {"account": title, "type": "liability", "subtype": "current"}
    if any(keyword in key for keyword in {"asset", "receivable"}):
        return {"account": title, "type": "asset", "subtype": "current"}
    if any(keyword in key for keyword in {"expense", "cost"}):
        return {"account": title, "type": "expense", "subtype": "operating"}

    return {"account": title, "type": "expense", "subtype": "operating"}


def default_subtype_for(ledger_type):
    ledger_type = str(ledger_type or "").strip().lower()
    if ledger_type == "asset":
        return "current"
    if ledger_type == "liability":
        return "current"
    if ledger_type in {"expense", "revenue"}:
        return "operating"
    if ledger_type in {"equity", "capital", "drawings"}:
        return "equity"
    return ""


def aggregate_ledger_dataframe(df):
    grouped = (
        df.groupby(["account", "type", "subtype"], as_index=False, dropna=False)[["amount", "depreciation"]]
        .sum()
        .sort_values(["type", "account"], kind="stable")
        .reset_index(drop=True)
    )
    grouped["amount"] = grouped["amount"].round(2)
    grouped["depreciation"] = grouped["depreciation"].round(2)
    return grouped


def _normalize_amount_series(values):
    return pd.Series(values).apply(parse_numeric_cell).fillna(0.0).astype(float)


def normalize_structured_ledger_dataframe(df):
    rename_map = {}
    debit_column = None
    credit_column = None

    for column in df.columns:
        role = detect_column_role(column)
        if role in {"account", "type", "subtype", "amount", "depreciation"} and role not in rename_map.values():
            rename_map[column] = role
        elif role == "debit" and debit_column is None:
            debit_column = column
        elif role == "credit" and credit_column is None:
            credit_column = column

    normalized = df.rename(columns=rename_map).copy().dropna(how="all")
    has_amount_like_column = "amount" in normalized.columns or debit_column is not None or credit_column is not None
    has_identifier = "account" in normalized.columns or "type" in normalized.columns
    if not has_amount_like_column or not has_identifier:
        raise ValueError("invalid csv: expected ledger columns such as account/type and amount")

    if "amount" not in normalized.columns:
        debit_values = _normalize_amount_series(normalized[debit_column]) if debit_column is not None else 0.0
        credit_values = _normalize_amount_series(normalized[credit_column]) if credit_column is not None else 0.0
        normalized["amount"] = debit_values.abs() + credit_values.abs()
    else:
        normalized["amount"] = normalized["amount"].apply(parse_numeric_cell)

    if "account" not in normalized.columns:
        normalized["account"] = normalized["type"].fillna("").astype(str).str.strip().replace("", pd.NA)
        normalized["account"] = normalized["account"].fillna("Unclassified").astype(str).str.title()

    inferred = pd.DataFrame(normalized["account"].fillna("").map(infer_trial_balance_account).tolist())

    if "type" not in normalized.columns:
        normalized["type"] = inferred["type"]
    else:
        normalized["type"] = (
            normalized["type"]
            .astype(str)
            .str.strip()
            .str.lower()
            .replace({"": pd.NA, "nan": pd.NA})
            .fillna(inferred["type"])
        )

    if "subtype" not in normalized.columns:
        normalized["subtype"] = inferred["subtype"]
    else:
        normalized["subtype"] = (
            normalized["subtype"]
            .astype(str)
            .str.strip()
            .str.lower()
            .replace({"": pd.NA, "nan": pd.NA})
            .fillna(inferred["subtype"])
        )

    normalized["subtype"] = normalized["subtype"].fillna(normalized["type"].map(default_subtype_for))

    if "depreciation" not in normalized.columns:
        normalized["depreciation"] = 0.0
    else:
        normalized["depreciation"] = normalized["depreciation"].apply(parse_numeric_cell).fillna(0.0)

    normalized["amount"] = normalized["amount"].fillna(0.0).astype(float)
    if normalized["amount"].abs().sum() == 0 and normalized["depreciation"].abs().sum() == 0:
        raise ValueError("invalid csv: no numeric ledger values were found")

    return normalized[["account", "type", "subtype", "amount", "depreciation"]].reset_index(drop=True)


def normalize_trial_balance_dataframe(df):
    entries = []
    pending_account = None

    for row in df.itertuples(index=False, name=None):
        cells = [value for value in row if not is_blank_cell(value)]
        if not cells:
            continue

        parsed_cells = [parse_numeric_cell(value) for value in cells]
        numeric_values = [value for value in parsed_cells if value is not None]
        text_values = [str(value).strip() for value, parsed in zip(cells, parsed_cells) if parsed is None]

        if text_values and not numeric_values:
            label = text_values[0]
            pending_account = None if should_skip_derived_label(label) else label
            continue

        if numeric_values and pending_account and not text_values:
            details = infer_trial_balance_account(pending_account)
            entries.append({**details, "amount": abs(float(numeric_values[-1])), "depreciation": 0.0})
            pending_account = None
            continue

        if text_values and numeric_values:
            label = text_values[0]
            if should_skip_derived_label(label):
                pending_account = None
                continue
            details = infer_trial_balance_account(label)
            entries.append({**details, "amount": abs(float(numeric_values[-1])), "depreciation": 0.0})
            pending_account = None
            continue

    if not entries:
        raise ValueError("could not detect ledger rows")

    return aggregate_ledger_dataframe(pd.DataFrame(entries))


def normalize_ledger_dataframe(df):
    column_roles = {detect_column_role(column) for column in df.columns}
    column_roles.discard(None)

    if column_roles:
        return normalize_structured_ledger_dataframe(df)
    return normalize_trial_balance_dataframe(df)


def is_manufacturing_schedule_dataframe(df):
    normalized_columns = [normalize_column_label(column) for column in df.columns]
    if normalized_columns and normalized_columns[0] == "particulars":
        return True

    flat_labels = " ".join(
        normalize_account_key(value)
        for value in df.iloc[:, 0].tolist()
        if not is_blank_cell(value)
    )
    return "raw materials" in flat_labels and "work in progress" in flat_labels


def extract_manufacturing_schedule(df):
    if not is_manufacturing_schedule_dataframe(df):
        return None, None

    rows = []
    summary = {
        "rawMaterialsConsumed": 0.0,
        "primeCost": 0.0,
        "totalFactoryOverheads": 0.0,
        "costOfGoodsManufactured": 0.0,
    }

    for row in df.itertuples(index=False, name=None):
        cells = list(row)
        label = ""
        if cells:
            label = str(cells[0] or "").strip()
        other_values = [parse_numeric_cell(value) for value in cells[1:] if parse_numeric_cell(value) is not None]
        value = abs(float(other_values[-1])) if other_values else None
        normalized_label = normalize_account_key(label)

        if not normalized_label:
            continue

        if normalized_label == "cost of raw materials consumed" and value is not None:
            summary["rawMaterialsConsumed"] = round(value, 2)
            continue
        if normalized_label == "prime cost" and value is not None:
            summary["primeCost"] = round(value, 2)
            continue
        if normalized_label == "total factory overheads" and value is not None:
            summary["totalFactoryOverheads"] = round(value, 2)
            continue
        if normalized_label == "cost of goods manufactured" and value is not None:
            summary["costOfGoodsManufactured"] = round(value, 2)
            continue

        if value is None or should_skip_derived_label(label):
            continue

        details = infer_trial_balance_account(label)
        rows.append({**details, "amount": round(value, 2), "depreciation": 0.0})

    if not rows:
        raise ValueError("could not detect manufacturing ledger rows")

    return aggregate_ledger_dataframe(pd.DataFrame(rows)), summary


def read_external_dataframe(uploaded_file):
    filename = (uploaded_file.filename or "").lower()
    suffix = Path(filename).suffix

    if suffix in {".csv", ".txt"}:
        return read_tabular_dataframe(uploaded_file, pd.read_csv)
    if suffix in {".xls", ".xlsx"}:
        return read_tabular_dataframe(uploaded_file, pd.read_excel)
    if suffix == ".json":
        return pd.read_json(uploaded_file)
    raise ValueError("unsupported file type")


def calc(df):
    normalized = df.copy()
    normalized["type"] = normalized["type"].astype(str).str.lower().str.strip()
    normalized["subtype"] = normalized["subtype"].astype(str).str.lower().str.strip()
    normalized["amount"] = pd.to_numeric(normalized["amount"], errors="coerce").fillna(0.0).abs()
    if "depreciation" not in normalized.columns:
        normalized["depreciation"] = 0.0
    normalized["depreciation"] = pd.to_numeric(normalized["depreciation"], errors="coerce").fillna(0.0).abs()

    revenue = float(normalized.loc[normalized["type"] == "revenue", "amount"].sum())
    expenses = float(normalized.loc[normalized["type"] == "expense", "amount"].sum())

    assets_current = float(
        normalized.loc[
            (normalized["type"] == "asset") & (normalized["subtype"] != "non-current"),
            "amount",
        ].sum()
    )
    assets_non_current_gross = float(
        normalized.loc[
            (normalized["type"] == "asset") & (normalized["subtype"] == "non-current"),
            "amount",
        ].sum()
    )
    accumulated_depreciation = float(normalized["depreciation"].sum())
    assets_non_current_net = max(0.0, assets_non_current_gross - accumulated_depreciation)
    total_assets = assets_current + assets_non_current_net

    liabilities_current = float(
        normalized.loc[
            (normalized["type"] == "liability") & (normalized["subtype"] != "non-current"),
            "amount",
        ].sum()
    )
    liabilities_non_current = float(
        normalized.loc[
            (normalized["type"] == "liability") & (normalized["subtype"] == "non-current"),
            "amount",
        ].sum()
    )
    total_liabilities = liabilities_current + liabilities_non_current
    capital = float(normalized.loc[normalized["type"].isin(["capital", "equity"]), "amount"].sum())
    drawings = float(normalized.loc[normalized["type"] == "drawings", "amount"].sum())

    return {
        "revenue": round(revenue, 2),
        "expenses": round(expenses, 2),
        "profit": round(revenue - expenses, 2),
        "assets_current": round(assets_current, 2),
        "assets_non_current_gross": round(assets_non_current_gross, 2),
        "accumulated_depreciation": round(accumulated_depreciation, 2),
        "assets_non_current_net": round(assets_non_current_net, 2),
        "total_assets": round(total_assets, 2),
        "liabilities_current": round(liabilities_current, 2),
        "liabilities_non_current": round(liabilities_non_current, 2),
        "total_liabilities": round(total_liabilities, 2),
        "capital": round(capital, 2),
        "drawings": round(drawings, 2),
        "net_assets": round(total_assets - total_liabilities, 2),
    }
