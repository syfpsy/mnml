#!/usr/bin/env pwsh
# release-local-win.ps1 — build Windows installer and upload to GitHub Releases.
# No GitHub Actions required. Needs Visual Studio Build Tools for native rebuild.
#
# Usage:
#   .\scripts\release-local-win.ps1
#   .\scripts\release-local-win.ps1 -Tag v0.3.0

param(
  [string]$Tag = ""
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$version = (Get-Content package.json | ConvertFrom-Json).version
if (-not $Tag) { $Tag = "v$version" }

Write-Host "[release] mnml $version ($Tag) Windows build"

npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build:release:win
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run verify:release -- win
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$notesFile = Join-Path $env:TEMP "mnml-release-notes-$version.md"
node scripts/write-gh-release-notes.mjs $version --out $notesFile

$releaseExists = $false
try { gh release view $Tag 2>$null; $releaseExists = $true } catch {}

if (-not $releaseExists) {
  gh release create $Tag `
    --title $Tag `
    --notes-file $notesFile `
    --latest
} else {
  Write-Host "[release] release $Tag exists — uploading Windows artifacts"
}

gh release upload $Tag `
  release/mnml-setup.exe `
  release/latest.yml `
  release/mnml-setup.exe.blockmap `
  --clobber

$hasMac = $false
try {
  $assetNames = gh release view $Tag --json assets -q ".assets[].name" 2>$null
  if ($assetNames -match "mnml-mac") { $hasMac = $true }
} catch {}

if ($hasMac) {
  Write-Host "[release] Windows + macOS complete — publishing as latest"
  gh release edit $Tag --draft=false --latest
} else {
  Write-Host "[release] Windows uploaded — publishing as latest (macOS can follow on Mac mini)"
  gh release edit $Tag --draft=false --latest
}

Remove-Item $notesFile -Force -ErrorAction SilentlyContinue
Write-Host "Done. https://github.com/syfpsy/mnml/releases/tag/$Tag"
