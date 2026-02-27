@echo off
REM Deployment Script for Financial Dashboard (Supabase + Render + Vercel)

echo.
echo ===== Financial Dashboard Deployment =====
echo.

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

echo [1/4] Preparing GitHub remote...
cd c:\Users\JOVIN\PycharmProjects\PythonProject1
git remote add origin https://github.com/jovinodiyo6-ui/Financial_dashboard.git 2>nul || git remote set-url origin https://github.com/jovinodiyo6-ui/Financial_dashboard.git

echo [2/4] Committing pending changes...
git add .
git commit -m "Supabase deployment update" 2>nul || echo (no changes to commit)

echo.
echo [3/4] Push to GitHub:
echo   git push -u origin main
echo.
echo [4/4] Configure cloud:
echo   - Database: Supabase (get DATABASE_URL with sslmode=require)
echo   - Backend: Render (rootDir backend, gunicorn start command)
echo   - Frontend: Vercel (rootDir frontend, set VITE_API_URL)
echo.
echo Full instructions: DEPLOYMENT.md
echo.
