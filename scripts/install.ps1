# Copilot Buddy one-line installer for Windows.
#
#   irm https://raw.githubusercontent.com/shrestha-tripathi/copilot-buddy/main/scripts/install.ps1 | iex
#
# Override with $env:INSTALL_DIR / $env:VERSION before piping.

$ErrorActionPreference = 'Stop'

$Repo       = if ($env:REPO)        { $env:REPO }        else { 'shrestha-tripathi/copilot-buddy' }
$InstallDir = if ($env:INSTALL_DIR) { $env:INSTALL_DIR } else { Join-Path $HOME 'bin' }
$Version    = if ($env:VERSION)     { $env:VERSION }     else { 'latest' }

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Bold($m) { Write-Host $m -ForegroundColor Green }

# --- prerequisites
if (-not (Get-Command copilot -ErrorAction SilentlyContinue)) {
  throw "GitHub Copilot CLI not found on PATH. Install it first: https://docs.github.com/en/copilot/github-copilot-in-the-cli"
}

# --- detect arch
$arch = if ([Environment]::Is64BitOperatingSystem) { 'amd64' } else { throw 'unsupported arch' }
$asset = "copilot-buddy_windows_$arch.exe"

if ($Version -eq 'latest') {
  $url = "https://github.com/$Repo/releases/latest/download/$asset"
} else {
  $url = "https://github.com/$Repo/releases/download/$Version/$asset"
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$target = Join-Path $InstallDir 'copilot-buddy.exe'

Info "Downloading $asset from $url"
Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $target

# --- PATH check
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not ($userPath -split ';' | Where-Object { $_ -ieq $InstallDir })) {
  Write-Host "warning: $InstallDir is not on your user PATH. Add it with:" -ForegroundColor Yellow
  Write-Host "  [Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$InstallDir', 'User')"
}

Bold ""
Bold "✓ copilot-buddy installed to $target"
Bold ""
@"
Next steps:

  1. Start the daemon — it'll mint a bearer token on first run:

       copilot-buddy.exe --origins chrome-extension://<extension-id>

  2. Load the Chrome extension:

       a. Download copilot-buddy-extension-<version>.zip from
          https://github.com/$Repo/releases/latest
       b. Unzip it.
       c. Open chrome://extensions, enable Developer mode,
          click "Load unpacked", and pick the unzipped folder.
       d. Copy the extension id, restart the daemon with
          --origins chrome-extension://<id>.

  3. Click the toolbar icon to open the side panel and paste the
     bearer token (printed by the daemon on first launch, also stored
     in %USERPROFILE%\.copilot-buddy\config.json).

For autostart at logon see docs/install/install-windows.ps1.
"@ | Write-Host
