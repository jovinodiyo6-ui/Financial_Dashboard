# Financial Dashboard - SaaS Application

This project is organized into **backend** and **frontend** folders for clean separation of concerns.

## Project Structure

```
PythonProject1/
├── backend/                          # Flask API Server
│   ├── Financial dashboard back end.py  # Main Flask app with API endpoints
│   ├── Financial_dashboard.py        # Dashboard utilities
│   ├── Correlation.py                # Data analysis utilities
│   ├── transactions.db               # SQLite database
│   ├── instance/                     # Flask instance folder
│   └── saas.db                       # SaaS database
│
├── frontend/                         # React+Vite Frontend
│   ├── package.json                  # Dependencies and scripts
│   ├── sample-data.csv               # Sample data for testing
│   └── src/
│       ├── FinancialApp.jsx         # Main React component (with live user count)
│       ├── main.jsx                  # Entry point
│       └── index.html                # HTML template
│
└── README.md                         # This file
```

## Setup Instructions

### Backend Setup

1. **Navigate to backend folder:**
   ```bash
   cd backend
   ```

2. **Install Python dependencies:**
   ```bash
   pip install flask flask-sqlalchemy flask-jwt-extended flask-bcrypt flask-cors pandas
   ```

3. **Run the Flask server:**
   ```bash
   python "Financial dashboard back end.py"
   ```
   
   The backend will be available at `http://127.0.0.1:5000`

### Frontend Setup

1. **Navigate to frontend folder:**
   ```bash
   cd frontend
   ```

2. **Install Node dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```
   
   The frontend will be available at `http://localhost:5173` (or similar - check terminal)

4. **Build for production:**
   ```bash
   npm run build
   ```

## API Endpoints

- `POST /register` - Register new organization and user
- `POST /login` - Login user
- `POST /analyze` - Upload CSV and generate financial report
- `GET /analytics` - Get organization analytics
- `GET /user-count` - Get live user count (polls every 3 seconds from frontend)
- `POST /invite` - Invite new user to organization
- `POST /apikey` - Create API key
- `GET /admin/users` - List organization users (admin only)

## Running the Full Stack

**Terminal 1 - Backend:**
```bash
cd backend
python "Financial dashboard back end.py"
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Then open your browser to the frontend URL shown in Terminal 2.

## Features

✅ User registration and authentication  
✅ Financial data analysis from CSV uploads  
✅ Real-time user count tracking  
✅ Organization-based multi-tenancy  
✅ Report generation and analytics dashboard  
✅ API key management  
✅ Audit logging  

## Database

- **SQLite** for application data (`saas.db`)
- **SQLite** for transaction data (`transactions.db`)

