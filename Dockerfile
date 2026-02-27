FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN python -m pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# Copy app
COPY backend/ .

# Create instance folder
RUN mkdir -p instance

# Run app
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "Financial dashboard back end:app"]
