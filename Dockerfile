FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN python -m pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# Copy app
COPY backend/ .

# Run app
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "app:app"]
