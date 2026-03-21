FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN python -m pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# Copy app
COPY backend/ .
COPY shared/ ./shared/

# Create instance folder
RUN mkdir -p instance

# Run app with single worker and configurable port/timeout (avoids OOM/timeouts on small dynos)
# Using shell form so $PORT expands in Render/Heroku-style envs.
CMD sh -c "gunicorn -w 1 -t 120 -b 0.0.0.0:${PORT:-5000} app:app"
