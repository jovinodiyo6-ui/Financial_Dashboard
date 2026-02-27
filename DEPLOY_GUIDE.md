# Supabase Deployment Quick Guide

See [DEPLOYMENT.md](DEPLOYMENT.md) for full details.

## Required Values

- `DATABASE_URL=postgresql://postgres:YOUR_SUPABASE_DB_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=require`
- `JWT_SECRET_KEY=<strong-random-secret>`
- `VITE_API_URL=https://<your-render-service>.onrender.com`

## Backend (Render)

- Root Directory: `backend`
- Build: `pip install -r requirements.txt`
- Start: `gunicorn -w 4 -b 0.0.0.0:$PORT "Financial dashboard back end:app"`

## Frontend (Vercel)

- Root Directory: `frontend`
- Build: `npm run build`
- Output: `dist`

## Smoke Test

- Backend: `GET /health`
- Frontend: register + login + upload CSV
