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

### Run Together (Recommended)

```bash
pip install -r backend/requirements.txt
npm install
npm --prefix frontend install
npm run dev
```

- Backend: `http://127.0.0.1:5000`
- Frontend: `http://localhost:5173`
- Frontend calls backend through Vite proxy (`/api -> 127.0.0.1:5000`)

### Backend (Only)

```bash
cd backend
pip install -r requirements.txt
python dev_server.py
```

Backend default URL: `http://127.0.0.1:5000`

### Frontend (Only)

```bash
cd frontend
npm install
npm run dev
```

Frontend default API base is `/api` (proxied to backend in dev).

### Open on Phone (Same Wi-Fi)

1. Start the app from project root:

```bash
npm run dev
```

2. Find your computer's local IP:

```bash
ipconfig
```

Use the IPv4 address from your active Wi-Fi adapter (for example `192.168.1.20`).

3. On your phone browser, open:

```text
http://<YOUR_COMPUTER_IP>:5173
```

Example: `http://192.168.1.20:5173`

4. If it does not load, allow port `5173` through Windows Firewall for private networks.

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

- `VITE_API_URL` (default: `/api`)
- `VITE_PROXY_TARGET` (default: `http://127.0.0.1:5000`)
- `VITE_GOOGLE_CLIENT_ID` (required to show Google button)

## Deployment

Use [DEPLOYMENT.md](DEPLOYMENT.md) for the complete Supabase + Render + Vercel steps.

## Desktop Accounting System

This repo now also includes a standalone desktop app in `accounting_system/` with:

- Login
- Inventory management
- Sales + invoice generator
- Financial reports (total sales, inventory value, income statement, balance sheet, trial balance)
- Matplotlib dashboard chart
- Double-entry journal posting

Run it with:

```bash
pip install -r accounting_system/requirements.txt
python -m accounting_system.login
```

## Docker Compose

```bash
docker compose up --build
```

Starts local dev stack (Postgres + Flask + Vite).

## Notes

- Free tier analysis limit is currently `5` reports per organization.
- Uploads expect CSV columns: `type` and `amount`.
