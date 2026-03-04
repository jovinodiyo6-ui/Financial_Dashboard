from __future__ import annotations

from pathlib import Path

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
except Exception:  # pragma: no cover - optional dependency
    canvas = None
    letter = None


def generate_invoice(invoice_id: int, customer: str, items: list[tuple[str, float, float]], total: float) -> Path:
    output_dir = Path(__file__).resolve().parent / "invoices"
    output_dir.mkdir(exist_ok=True)
    invoice_path = output_dir / f"invoice_{invoice_id}.pdf"

    if canvas is None:
        fallback_path = output_dir / f"invoice_{invoice_id}.txt"
        lines = [
            "INVOICE",
            f"Customer: {customer}",
            f"Invoice ID: {invoice_id}",
            "",
        ]
        lines.extend([f"{name} | {qty} x {price}" for name, qty, price in items])
        lines.append("")
        lines.append(f"TOTAL: {total}")
        fallback_path.write_text("\n".join(lines), encoding="utf-8")
        return fallback_path

    pdf = canvas.Canvas(str(invoice_path), pagesize=letter)
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(230, 750, "INVOICE")

    pdf.setFont("Helvetica", 11)
    pdf.drawString(50, 710, f"Customer: {customer}")
    pdf.drawString(50, 690, f"Invoice ID: {invoice_id}")

    y = 650
    for name, qty, price in items:
        pdf.drawString(50, y, f"{name}   {qty} x {price:.2f}")
        y -= 20

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(50, y - 20, f"TOTAL: {total:.2f}")
    pdf.save()
    return invoice_path

