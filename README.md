# Financial Dashboard

Flask + React financial analysis SaaS.

## Repo Layout

```text
PythonProject1/
├── backend/
│   ├── Financial dashboard back end.py
│   ├── requirements.txt
│   ├── render.yaml
│   ├── Procfile
│   ├── .env.example
│   └── instance/
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── .env.example
│   ├── sample-data.csv
│   └── src/
│       ├── FinancialApp.jsx
│       └── main.jsx
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Local Run

### Backend

```bash
cd backend
pip install -r requirements.txt
python "Financial dashboard back end.py"
```

Backend default URL: `http://127.0.0.1:5000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend default URL: `http://localhost:5173`

Set `VITE_API_URL` in `frontend/.env` if your backend URL differs.

## API Endpoints

- `POST /register`
- `POST /login`
- `POST /analyze` (JWT)
- `GET /analytics` (JWT)
- `GET /user-count` (JWT)
- `POST /invite` (JWT, owner/admin)
- `POST /apikey` (JWT)
- `GET /admin/users` (JWT, owner)
- `GET /health`

## Environment Variables

Backend (`backend/.env`):

- `DATABASE_URL` (default: `sqlite:///saas.db`)
- `JWT_SECRET_KEY` (required in production)
- `FLASK_ENV` (`development` or `production`)
- `CORS_ORIGINS` (optional, comma-separated)

Supabase example:

```env
DATABASE_URL=postgresql://postgres:YOUR_SUPABASE_DB_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=require
```

Frontend (`frontend/.env`):

- `VITE_API_URL`

## Deployment

Use [DEPLOYMENT.md](DEPLOYMENT.md) for the complete Supabase + Render + Vercel steps.

## Docker Compose

```bash
docker compose up --build
```

Starts local dev stack (Postgres + Flask + Vite).

## Notes

- Free tier analysis limit is currently `5` reports per organization.
- Uploads expect CSV columns: `type` and `amount`.
