param(
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"

& $Python -m pip install -r accounting_system/requirements.txt
& $Python -m pip install -r accounting_system/requirements-build.txt

& $Python -m PyInstaller `
  --noconfirm `
  --onefile `
  --windowed `
  --name AccountingSystem `
  --paths . `
  accounting_system/launcher.py

Write-Host "Build complete: dist/AccountingSystem.exe"

