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
npm run build:release:win
npm run verify:release -- win

$notesFile = New-TemporaryFile
node scripts/extract-changelog.mjs $version | Set-Content $notesFile

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

Remove-Item $notesFile -Force
Write-Host "Done. https://github.com/syfpsy/mnml/releases/tag/$Tag"
