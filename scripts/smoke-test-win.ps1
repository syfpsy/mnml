#!/usr/bin/env pwsh
# smoke-test-win.ps1 — packaged app survives startup (native bindings OK).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $root "release\win-unpacked\mnml.exe"
if (-not (Test-Path $exe)) {
  Write-Error "Build first: npm run build:release:win (or install to test the setup.exe)"
  exit 1
}
Get-Process mnml -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 1
$p = Start-Process -FilePath $exe -PassThru -WindowStyle Hidden
Start-Sleep 6
if ($p.HasExited) {
  Write-Error "SMOKE FAIL: mnml exited with code $($p.ExitCode)"
  exit 1
}
Get-Process -Name mnml -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "SMOKE OK: mnml survived 6s startup ($exe)"
