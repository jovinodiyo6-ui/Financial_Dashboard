# 🚀 Deployment Guide - Financial Dashboard SaaS

Complete guide for deploying to GitHub, PostgreSQL Database, Heroku, and a Custom Domain.

---

## 📋 Prerequisites

- ✅ GitHub account: https://github.com
- ✅ Heroku account: https://heroku.com (free tier available)
- ✅ Custom domain (optional): GoDaddy, Namecheap, etc.

---

## 🔧 Step 1: Push Code to GitHub

### 1.1 Get Your GitHub Personal Access Token

1. Go to: https://github.com/settings/tokens
2. Click `Generate new token` → `Generate new token (classic)`
3. Give it a name: `Financial Dashboard Deploy`
4. **Select Scopes:**
   - ✓ `repo` (Full control of private repositories)
5. Click `Generate token`
6. **COPY the token immediately** (you won't see it again!)

### 1.2 Push Your Code

Run this in PowerShell:

```powershell
cd c:\Users\JOVIN\PycharmProjects\PythonProject1

# Verify remote is set correctly
git remote -v

# Push to GitHub
git push -u origin main
```

When prompted for password, **paste your GitHub Personal Access Token** (not your password).

✅ **Result:** Your code is now on GitHub!

---

## 🗄️ Step 2: Set Up PostgreSQL Database

### Option A: Heroku PostgreSQL (Recommended - Free tier)

When you create the Heroku app (Step 3), the database URL will be automatically configured.

### Option B: Railway.app (Modern alternative)

1. Go to: https://railway.app
2. Sign in with GitHub
3. Create new project → Add PostgreSQL
4. Get the `DATABASE_URL` connection string
5. Save for Step 3

### Option C: ElephantSQL (External provider)

1. Go to: https://www.elephantsql.com/
2. Create account → New instance
3. Copy the connection string
4. Use in Step 3

---

## ☁️ Step 3: Deploy to Heroku

### 3.1 Install Heroku CLI

Download from: https://devcenter.heroku.com/articles/heroku-cli

Verify installation:
```powershell
heroku --version
```

### 3.2 Log In to Heroku

```powershell
heroku login
```

### 3.3 Create Heroku App

```powershell
heroku create financial-dashboard-saas
```

**Note:** Heroku will assign a random URL like `https://financial-dashboard-saas-xxxxx.herokuapp.com`

### 3.4 Add PostgreSQL Database

```powershell
heroku addons:create heroku-postgresql:hobby-dev -a financial-dashboard-saas
```

✅ This creates a free PostgreSQL database
✅ `DATABASE_URL` environment variable is auto-set

### 3.5 Set Environment Variables

```powershell
heroku config:set JWT_SECRET_KEY=your_super_secret_random_key_here -a financial-dashboard-saas
```

Generate a secure key with:
```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 3.6 Deploy Your Code

```powershell
git push heroku main
```

This will:
- Install dependencies from `requirements.txt`
- Run the app using `Procfile`
- Start your Flask backend

### 3.7 Initialize Database

```powershell
heroku run python -c "from app import db; db.create_all()" -a financial-dashboard-saas
```

### 3.8 View Logs

```powershell
heroku logs --tail -a financial-dashboard-saas
```

### 3.9 Test Your App

```
https://financial-dashboard-saas-xxxxx.herokuapp.com/
```

You should see: `{"status":"FULL SAAS RUNNING"}`

✅ **Result:** Your backend is live on Heroku!

---

## 🌐 Step 4: Connect Custom Domain (Optional)

### 4.1 Buy a Domain

- GoDaddy: https://www.godaddy.com
- Namecheap: https://www.namecheap.com
- Route53 (AWS): https://aws.amazon.com/route53/

### 4.2 Add Domain to Heroku

```powershell
heroku domains:add yourdomain.com -a financial-dashboard-saas
heroku domains:add www.yourdomain.com -a financial-dashboard-saas
```

### 4.3 Update DNS Settings

1. Log into your domain registrar
2. Find DNS settings
3. Add CNAME record:
   - **Name:** www
   - **Points to:** `yourdomain.herokuapp.com`
4. Add A record for root domain (varies by registrar)

**Heroku Help:** https://devcenter.heroku.com/articles/custom-domains-and-ssl

✅ **Result:** Your app is accessible at `yourdomain.com`

---

## 🎨 Step 5: Deploy Frontend (React)

### Option A: Vercel (Recommended)

1. Go to: https://vercel.com
2. Click `Import Project`
3. Select your GitHub repository
4. Configure:
   - **Framework:** Vite
   - **Root Directory:** `frontend/src`
5. Click `Deploy`

### Option B: Netlify

1. Go to: https://netlify.com
2. Connect GitHub → Select repository
3. **Build Command:** `cd frontend/src && npm run build`
4. **Publish Directory:** `frontend/src/dist`

### Step 5.2: Update API URL

In `frontend/src/FinancialApp.jsx`, change:

```javascript
// Before:
const res = await fetch("http://127.0.0.1:5000/login",...

// After:
const res = await fetch("https://financial-dashboard-saas-xxxxx.herokuapp.com/login",...
```

Or use environment variables for flexibility.

---

## 🐳 Alternative: Deploy with Docker

Run locally:
```powershell
docker-compose up
```

This starts:
- PostgreSQL database (port 5432)
- Flask backend (port 5000)
- React frontend (port 5173)

---

## 📊 Quick Heroku Commands Reference

```powershell
# View app info
heroku info -a financial-dashboard-saas

# View environment variables
heroku config -a financial-dashboard-saas

# Set/update variables
heroku config:set KEY=value -a financial-dashboard-saas

# Remove variable
heroku config:unset KEY -a financial-dashboard-saas

# View database
heroku pg:info -a financial-dashboard-saas

# View logs
heroku logs --tail -a financial-dashboard-saas

# Run commands on Heroku
heroku run bash -a financial-dashboard-saas

# Restart app
heroku restart -a financial-dashboard-saas

# Scale dynos (workers)
heroku ps:scale web=1 -a financial-dashboard-saas
```

---

## ✅ Deployment Checklist

- [ ] GitHub Personal Access Token created
- [ ] Code pushed to GitHub
- [ ] Heroku account created
- [ ] Heroku app created
- [ ] PostgreSQL database added
- [ ] Environment variables set (JWT_SECRET_KEY)
- [ ] Backend deployed to Heroku
- [ ] Database initialized
- [ ] Backend tested (check `/` endpoint)
- [ ] Frontend deployed to Vercel/Netlify
- [ ] API URL updated in frontend
- [ ] Custom domain configured (if needed)

---

## 🆘 Troubleshooting

### Build fails with dependency errors
```powershell
heroku build-cache:clear -a financial-dashboard-saas
git push heroku main
```

### Database connection error
```powershell
heroku config -a financial-dashboard-saas
# Verify DATABASE_URL is set
heroku pg:info -a financial-dashboard-saas
```

### Port binding error
The Procfile is configured to use port 5000. Heroku will assign the correct port via `$PORT` environment variable.

### CORS errors on frontend
Make sure backend allows requests from your frontend domain. Check `CORS(app)` in Flask backend.

---

## 📚 Further Reading

- Heroku Docs: https://devcenter.heroku.com/
- Flask Deployment: https://flask.palletsprojects.com/en/2.3.x/deploying/
- PostgreSQL: https://www.postgresql.org/
- Vercel Docs: https://vercel.com/docs

---

**Status:** ✅ Ready for deployment!  
**Next Step:** Run `git push -u origin main` with your GitHub token
