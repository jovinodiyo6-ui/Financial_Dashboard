# Deployment Guide

This guide covers deploying the Financial Dashboard SaaS to GitHub, Vercel (frontend), Render (backend), and a cloud database.

## Prerequisites

- GitHub account (https://github.com)
- Vercel account (https://vercel.com)
- Render account (https://render.com)
- ElephantSQL or Railway for PostgreSQL database

---

## Step 1: Push to GitHub

### 1.1 Create a GitHub Repository

1. Go to https://github.com/new
2. Create a new repository named `financial-dashboard`
3. Do NOT initialize with README (we already have one)

### 1.2 Push Your Code

```bash
cd c:\Users\JOVIN\PycharmProjects\PythonProject1

# Add GitHub remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/financial-dashboard.git
git branch -M main
git push -u origin main
```

**Note:** You may need to authenticate:
- For HTTPS: Use GitHub Personal Access Token (Settings > Developer settings > Personal access tokens)
- For SSH: Configure SSH key (https://docs.github.com/en/authentication/connecting-to-github-with-ssh)

---

## Step 2: Set Up Cloud Database (Supabase)

### Getting Started with Supabase

1. Go to https://supabase.com/
2. Click "Start your project" or "Sign In"
3. Sign up with GitHub (easiest option)

### Create a New Project

1. Click "New project"
2. Fill in:
   - **Project name:** `financial-dashboard`
   - **Password:** Create a strong password
   - **Region:** Choose closest to you
3. Click "Create new project" and wait for it to initialize (2-3 minutes)

### Get Your Database Connection String

1. Once created, go to **Settings** → **Database**
2. Copy the **Connection String** (under "URI")
3. It will look like: `postgresql://postgres:[PASSWORD]@db.[PROJECT-ID].supabase.co:5432/postgres`
4. **Replace [PASSWORD] with your database password** from step 2 above
5. Save this URL as your `DATABASE_URL`

**Example:**
```
postgresql://postgres:your-strong-password@db.example.supabase.co:5432/postgres
```

---

## Step 3: Deploy Backend to Render

### 3.1 Create Render Service

1. Go to https://render.com/ and sign up
2. Click "New +" and select "Web Service"
3. Connect your GitHub account and select `financial-dashboard` repository
4. Configure as follows:
   - **Name:** `financial-dashboard-api`
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r backend/requirements.txt`
   - **Start Command:** `cd backend && python "Financial dashboard back end.py"`
   - **Root Directory:** (leave empty)

### 3.2 Set Environment Variables

In Render dashboard, go to your service and click "Environment":

```
DATABASE_URL=postgresql://postgres:your-password@db.project-id.supabase.co:5432/postgres
JWT_SECRET_KEY=your-super-secret-key-here-change-this
FLASK_ENV=production
PORT=5000
```

Replace `DATABASE_URL` with your Supabase connection string (make sure to include your password).

### 3.3 Deploy

Click "Create Web Service" and Render will automatically deploy. Wait for the deployment to complete.

**Your backend URL will be something like:**
```
https://financial-dashboard-api.onrender.com
```

---

## Step 4: Deploy Frontend to Vercel

### 4.1 Create Vercel Project

1. Go to https://vercel.com/dashboard
2. Click "New Project"
3. Import your GitHub `financial-dashboard` repository
4. Configure:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

### 4.2 Set Environment Variables

Before deploying, add environment variable:

- **Name:** `VITE_API_URL`
- **Value:** `https://financial-dashboard-api.onrender.com` (replace with your Render backend URL)

### 4.3 Deploy

Click "Deploy" and Vercel will build and deploy your frontend.

**Your frontend URL will be something like:**
```
https://financial-dashboard.vercel.app
```

---

## Step 5: Update Backend Database

Once deployed, initialize the cloud database with the schema:

```bash
cd backend

# With local Flask server pointing to cloud database:
# First, set environment variable:
set DATABASE_URL=postgresql://user:password@host/dbname

# Then run Flask to create tables:
python "Financial dashboard back end.py"
```

Or use Python shell to initialize:

```python
from Financial\ dashboard\ back\ end import app, db

with app.app_context():
    db.create_all()
    print("Database initialized!")
```

---

## Step 6: Test the Application

1. Open your Vercel frontend URL: `https://financial-dashboard.vercel.app`
2. Try registering a new account
3. Test the dashboard functionality
4. Check the live user count updates

---

## Environment Variables Summary

### Frontend (.env or Vercel)
```
VITE_API_URL=https://financial-dashboard-api.onrender.com
```

### Backend (.env or Render)
```
DATABASE_URL=postgresql://postgres:your-password@db.project-id.supabase.co:5432/postgres
JWT_SECRET_KEY=your-secret-key-here
FLASK_ENV=production
PORT=5000
```

Get `DATABASE_URL` from Supabase: Settings → Database → Connection String → URI

---

## Troubleshooting

### Frontend can't reach backend
- Check `VITE_API_URL` in Vercel environment variables
- Check CORS is enabled in Flask (line 12 of backend)
- Ensure Render backend is running

### Database connection errors
- Verify `DATABASE_URL` format and credentials
- Make sure password is correct in connection string
- Check IP allowlist in Supabase (go to Settings → Database → Allowed IPs, add 0.0.0.0/0)
- Test connection using `psql` or database client

### Backend deployment fails
- Check build logs in Render dashboard
- Ensure `requirements.txt` is in `backend/` folder
- Verify Python version compatibility

### Database tables not created
- Run initialization script in Render shell
- Or update backend code to auto-create on startup

---

## Next Steps

1. **Monitor deployments:**
   - Render: https://render.com/dashboard
   - Vercel: https://vercel.com/dashboard

2. **Scale when needed:**
   - Vercel: Upgrade to paid plan
   - Render: Upgrade database tier
   - Add more replicas for reliability

3. **Security improvements:**
   - Rotate `JWT_SECRET_KEY`
   - Use stronger passwords in database
   - Enable HTTPS (automatic on both platforms)
   - Add rate limiting to API

4. **Monitoring:**
   - Set up error tracking (Sentry)
   - Monitor database query performance
   - Track API response times

---

## Helpful Links

- [Supabase Documentation](https://supabase.com/docs)
- [Render Documentation](https://render.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Flask-SQLAlchemy with PostgreSQL](https://flask-sqlalchemy.palletsprojects.com/en/3.0.x/)

