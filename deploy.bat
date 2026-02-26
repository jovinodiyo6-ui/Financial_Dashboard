@echo off
REM Deployment Script for Financial Dashboard

echo.
echo ===== Financial Dashboard Deployment =====
echo.

REM Check if git is configured
git config user.name >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Git not configured. Please run:
    echo   git config --global user.name "Your Name"
    echo   git config --global user.email "your@email.com"
    echo.
    pause
    exit /b 1
)

echo [1/5] Setting up GitHub remote...
cd c:\Users\JOVIN\PycharmProjects\PythonProject1
git remote add origin https://github.com/jovinodiyo6-ui/Financial_dashboard.git 2>nul || git remote set-url origin https://github.com/jovinodiyo6-ui/Financial_dashboard.git

echo [2/5] Committing any pending changes...
git add .
git commit -m "Deployment update" 2>nul || echo (no changes to commit)

echo.
echo [3/5] Ready to push to GitHub
echo.
echo To complete the push, you need your GitHub Personal Access Token:
echo.
echo Step 1: Get your token
echo   - Go to: https://github.com/settings/tokens
echo   - Click: Generate new token (classic)
echo   - Scopes: Check "repo"
echo   - Click: Generate token
echo   - Copy the token (save it somewhere safe)
echo.
echo Step 2: Push to GitHub
echo   - Run: git push -u origin main
echo   - When prompted for password, paste your token
echo.

echo.
echo [4/5] Heroku Setup Instructions
echo.
echo   1. Install Heroku CLI: https://devcenter.heroku.com/articles/heroku-cli
echo   2. Run: heroku login
echo   3. Run: heroku create financial-dashboard-saas
echo   4. Run: heroku addons:create heroku-postgresql:hobby-dev -a financial-dashboard-saas
echo   5. Run: heroku config:set JWT_SECRET_KEY=your_secret_key -a financial-dashboard-saas
echo   6. Run: git push heroku main
echo.

echo [5/5] Frontend Deployment (Optional)
echo.
echo   For React frontend on Vercel:
echo   1. Go to: https://vercel.com
echo   2. Import your GitHub repository
echo   3. Update API URL in frontend/src/FinancialApp.jsx
echo.

echo.
echo Run "git push -u origin main" when you have your GitHub token
echo.
