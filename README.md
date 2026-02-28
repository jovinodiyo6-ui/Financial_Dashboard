# PythonProject2

Hotel dashboard (Flask + React), configured to flow like PythonProject1.

## Repo Layout

```text
PythonProject2/
├── backend/
│   ├── app.py
│   ├── dev_server.py
│   ├── requirements.txt
│   ├── schema.sql
│   ├── .env.example
│   ├── Procfile
│   └── render.yaml
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── .env.example
│   └── src/
│       └── main.jsx
├── Dockerfile
├── docker-compose.yml
├── package.json
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

### Frontend (Only)

```bash
cd frontend
npm install
npm run dev
```

## Docker Compose

```bash
docker compose up --build
```

Starts:
- Postgres (`db`) on `5432`
- Redis on `6379`
- Backend on `5000`
- Frontend on `5173`

## Database Setup

- `backend/schema.sql` includes full schema and sample seed data.
- Seed admin credentials from schema:
  - username: `admin`
  - password: `admin123`

## Endpoints

- `POST /login`
- `POST /create-user` (JWT)
- `GET /rooms` (JWT)
- `POST /rooms` (JWT)
- `POST /book` (JWT)
- `GET /stats` (JWT)
- `POST /pay` (JWT)
- `GET /health`
