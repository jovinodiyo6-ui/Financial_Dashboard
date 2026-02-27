# Deployment Guide (Supabase)

This project is set up for:
- Database: Supabase Postgres
- Backend: Render (Python web service)
- Frontend: Vercel (Vite)

## 1. Supabase Database

1. Create a Supabase project.
2. Open `Settings -> Database -> Connection string -> URI`.
3. Use this format:

```env
postgresql://postgres:YOUR_SUPABASE_DB_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=require
```

Important:
- Replace `YOUR_SUPABASE_DB_PASSWORD` with the real DB password.
- Keep `?sslmode=require`.

## 2. Backend on Render

Render blueprint is already in `backend/render.yaml`.

Manual settings (if needed):
- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn -w 4 -b 0.0.0.0:$PORT "Financial dashboard back end:app"`

Environment variables:
- `FLASK_ENV=production`
- `JWT_SECRET_KEY=<strong-random-secret>`
- `DATABASE_URL=<supabase-uri-with-sslmode-require>`

## 3. Frontend on Vercel

Project settings:
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`

Environment variable:
- `VITE_API_URL=https://<your-render-service>.onrender.com`

## 4. Verify Deployment

1. Backend health:
   - `https://<render-service>.onrender.com/health`
2. Frontend login/register flow works.
3. Insert/read data from Supabase via app usage (`/register`, `/analyze`).

## 5. Local Supabase Smoke Test (optional)

In PowerShell:

```powershell
cd c:\Users\JOVIN\PycharmProjects\PythonProject1\backend
$env:FLASK_ENV="production"
$env:JWT_SECRET_KEY="replace-with-strong-secret"
$env:DATABASE_URL="postgresql://postgres:YOUR_SUPABASE_DB_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=require"
python "Financial dashboard back end.py"
```

Then open `http://127.0.0.1:5000/health`.

## Notes

- The backend app auto-adds `sslmode=require` for `postgresql://` URLs if missing.
- Keep secrets out of Git; use Render/Vercel env vars for real values.
