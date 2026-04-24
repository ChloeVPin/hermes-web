#Requires -Version 5.1
<#
.SYNOPSIS
    Hermes-Web - Windows Installer
.DESCRIPTION
    Cross-architecture installer for Windows (x64, ARM64, x86).
    Supports Windows 10, 11, Server 2019+, and Windows on ARM.

    Re-running this script updates everything without wiping data.
.EXAMPLE
    # From cloned repo:
    powershell -ExecutionPolicy Bypass -File scripts\install.ps1

    # One-liner from internet:
    irm https://raw.githubusercontent.com/ChloeVPin/hermes-web/main/scripts/install.ps1 | iex
#>

[CmdletBinding()]
param(
    [string]$HermesAgentDir = "",
    [string]$HermesWebDir = "",
    [switch]$SkipRust,
    [switch]$SkipPatches,
    [switch]$NoPrompt
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Speed up Invoke-WebRequest

# ── Colors (Hermes gold theme) ───────────────────────────────────────
function Write-Gold    { param($m) Write-Host $m -ForegroundColor Yellow }
function Write-Step    { param($m) Write-Host "→ $m" -ForegroundColor DarkYellow }
function Write-Ok      { param($m) Write-Host "✓ $m" -ForegroundColor Green }
function Write-Warn    { param($m) Write-Host "⚠ $m" -ForegroundColor Yellow }
function Write-Fail    { param($m) Write-Host "✗ $m" -ForegroundColor Red }
function Write-Info    { param($m) Write-Host "  $m" -ForegroundColor DarkGray }
function Write-Divider { Write-Host ("─" * 60) -ForegroundColor DarkYellow }

function Write-Fatal {
    param($m)
    Write-Fail $m
    throw $m
}

# ── Retry wrapper for network operations ─────────────────────────────
function Invoke-WithRetry {
    param(
        [scriptblock]$Action,
        [int]$MaxAttempts = 3,
        [int]$DelaySeconds = 2
    )
    $attempt = 1
    while ($attempt -le $MaxAttempts) {
        try {
            & $Action
            return
        } catch {
            if ($attempt -lt $MaxAttempts) {
                Write-Warn "Attempt $attempt/$MaxAttempts failed, retrying in ${DelaySeconds}s..."
                Start-Sleep -Seconds $DelaySeconds
                $DelaySeconds *= 2
            } else {
                throw
            }
        }
        $attempt++
    }
}

# ── Internet connectivity check ──────────────────────────────────────
function Test-Internet {
    try {
        $null = Invoke-WebRequest -Uri "https://github.com" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# ── Disk space check ─────────────────────────────────────────────────
function Test-DiskSpace {
    param([string]$Path, [int]$MinMB = 500)
    try {
        $drive = (Resolve-Path $Path -ErrorAction SilentlyContinue).Drive
        if (-not $drive) { $drive = (Get-Item $Path).PSDrive }
        $freeGB = [math]::Round($drive.Free / 1GB, 1)
        $freeMB = [math]::Round($drive.Free / 1MB)
        if ($freeMB -lt $MinMB) {
            Write-Warn "Low disk space: ${freeGB}GB free, ${MinMB}MB recommended"
            if (-not $NoPrompt) {
                Read-Host "Press Enter to continue anyway"
            }
        }
    } catch {}
}

# ── Detect Windows Store Python (broken) ─────────────────────────────
function Test-StorePython {
    param([string]$PythonPath)
    if ($PythonPath -match 'WindowsApps') { return $true }
    return $false
}

# ── Banner ───────────────────────────────────────────────────────────
function Show-Banner {
    Write-Host ""
    Write-Gold "██╗  ██╗███████╗██████╗ ███╗   ███╗███████╗███████╗"
    Write-Gold "██║  ██║██╔════╝██╔══██╗████╗ ████║██╔════╝██╔════╝"
    Write-Gold "███████║█████╗  ██████╔╝██╔████╔██║█████╗  ███████╗"
    Write-Gold "██╔══██║██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══╝  ╚════██║"
    Write-Gold "██║  ██║███████╗██║  ██║██║ ╚═╝ ██║███████╗███████║"
    Write-Gold "╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚══════╝"
    Write-Host "                Chat · Windows Installer" -ForegroundColor DarkGray
    Write-Host ""
}

# ── Platform detection ───────────────────────────────────────────────
function Get-Platform {
    $os = [System.Runtime.InteropServices.RuntimeInformation]::OSDescription
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()

    # Fallback for older PS
    if (-not $arch) {
        $arch = $env:PROCESSOR_ARCHITECTURE
    }
    if (-not $os) {
        $os = "Windows $([System.Environment]::OSVersion.Version)"
    }

    $isAdmin = $false
    try {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identity)
        $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch {}

    return @{
        OS      = $os
        Arch    = $arch
        IsAdmin = $isAdmin
        Version = [System.Environment]::OSVersion.Version
    }
}

# ── Command helpers ──────────────────────────────────────────────────
function Test-Command {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-CommandVersion {
    param([string]$Name, [string]$Flag = "--version")
    try {
        $output = & $Name $Flag 2>&1 | Out-String
        if ($output -match '(\d+\.\d+[\.\d]*)') {
            return $Matches[1]
        }
    } catch {}
    return $null
}

function Test-VersionAtLeast {
    param([string]$Current, [string]$Minimum)
    try {
        return ([version]$Current) -ge ([version]$Minimum)
    } catch {
        return $false
    }
}

# ── Find hermes-web project ────────────────────────────────────────
function Find-ProjectRoot {
    # Check if script is inside the repo (won't work with irm | iex)
    $scriptDir = $PSScriptRoot
    if ($scriptDir -and (Test-Path (Join-Path (Split-Path $scriptDir) "package.json") -ErrorAction SilentlyContinue)) {
        return (Resolve-Path (Split-Path $scriptDir)).Path
    }

    # Check current directory
    if (Test-Path "package.json" -ErrorAction SilentlyContinue) {
        $pkg = Get-Content "package.json" -Raw -ErrorAction SilentlyContinue
        if ($pkg -and ($pkg -match "hermes-web")) {
            return (Resolve-Path ".").Path
        }
    }

    # Check common locations (for irm | iex usage where PSScriptRoot is empty)
    $candidates = @(
        (Join-Path $env:USERPROFILE "hermes-web"),
        (Join-Path $env:USERPROFILE "Desktop\hermes-web"),
        (Join-Path $env:USERPROFILE "Projects\hermes-web"),
        (Join-Path $env:USERPROFILE "dev\hermes-web"),
        (Join-Path $env:USERPROFILE "source\repos\hermes-web")
    )
    foreach ($c in $candidates) {
        if (Test-Path (Join-Path $c "package.json") -ErrorAction SilentlyContinue) {
            $pkg = Get-Content (Join-Path $c "package.json") -Raw -ErrorAction SilentlyContinue
            if ($pkg -and ($pkg -match "hermes-web")) {
                return (Resolve-Path $c).Path
            }
        }
    }

    return $null
}

# ── Find hermes-agent ───────────────────────────────────────────────
function Find-HermesAgent {
    param([string]$ProjectRoot)

    if ($HermesAgentDir -and (Test-Path (Join-Path $HermesAgentDir "tui_gateway"))) {
        return (Resolve-Path $HermesAgentDir).Path
    }

    $candidates = @(
        (Join-Path (Split-Path $ProjectRoot) "hermes-agent"),
        (Join-Path $env:USERPROFILE "hermes-agent"),
        (Join-Path $env:USERPROFILE "Desktop\hermes-agent"),
        (Join-Path $env:USERPROFILE "Projects\hermes-agent"),
        (Join-Path $env:USERPROFILE "dev\hermes-agent"),
        (Join-Path $env:USERPROFILE "source\repos\hermes-agent"),
        "C:\hermes-agent"
    )

    foreach ($c in $candidates) {
        if (Test-Path (Join-Path $c "tui_gateway")) {
            return (Resolve-Path $c).Path
        }
    }

    return $null
}

# ── Find Python ──────────────────────────────────────────────────────
function Find-Python {
    param([string]$AgentDir)

    # Check hermes-agent venvs first
    $venvPaths = @(
        (Join-Path $AgentDir ".venv\Scripts\python.exe"),
        (Join-Path $AgentDir "venv\Scripts\python.exe"),
        (Join-Path $AgentDir ".venv\bin\python"),  # WSL-style
        (Join-Path $AgentDir "venv\bin\python")
    )
    foreach ($p in $venvPaths) {
        if (Test-Path $p) { return $p }
    }

    # System Python (skip Windows Store stub)
    foreach ($cmd in @("python", "python3", "py")) {
        if (Test-Command $cmd) {
            $source = (Get-Command $cmd).Source
            if (Test-StorePython $source) {
                continue  # Skip Windows Store stub, it is not real Python
            }
            $ver = Get-CommandVersion $cmd "--version"
            if ($ver -and (Test-VersionAtLeast $ver "3.10")) {
                return $source
            }
        }
    }

    # py launcher (Windows-specific)
    if (Test-Command "py") {
        try {
            $pyPath = & py -3 -c "import sys; print(sys.executable)" 2>$null
            if ($pyPath -and (Test-Path $pyPath)) { return $pyPath }
        } catch {}
    }

    return $null
}

# ── Install missing tools via winget/choco/scoop ────────────────────
function Install-Prerequisite {
    param([string]$Name)

    $installers = @()
    if (Test-Command "winget") { $installers += "winget" }
    if (Test-Command "choco")  { $installers += "choco" }
    if (Test-Command "scoop")  { $installers += "scoop" }

    if ($installers.Count -eq 0) {
        Write-Fail "No package manager found (winget, choco, or scoop)"
        return $false
    }

    $wingetMap = @{
        "git"    = "Git.Git"
        "node"   = "OpenJS.NodeJS.LTS"
        "python" = "Python.Python.3.11"
        "rust"   = "Rustlang.Rustup"
    }
    $chocoMap = @{
        "git"    = "git"
        "node"   = "nodejs-lts"
        "python" = "python311"
        "rust"   = "rustup.install"
    }
    $scoopMap = @{
        "git"    = "git"
        "node"   = "nodejs-lts"
        "python" = "python"
        "rust"   = "rustup"
    }

    foreach ($installer in $installers) {
        try {
            switch ($installer) {
                "winget" {
                    $pkg = $wingetMap[$Name]
                    if ($pkg) {
                        Write-Step "Installing $Name via winget..."
                        & winget install --id $pkg --accept-source-agreements --accept-package-agreements --silent 2>$null
                        if ($LASTEXITCODE -eq 0) { return $true }
                    }
                }
                "choco" {
                    $pkg = $chocoMap[$Name]
                    if ($pkg) {
                        Write-Step "Installing $Name via choco..."
                        & choco install $pkg -y --no-progress 2>$null
                        if ($LASTEXITCODE -eq 0) { return $true }
                    }
                }
                "scoop" {
                    $pkg = $scoopMap[$Name]
                    if ($pkg) {
                        Write-Step "Installing $Name via scoop..."
                        & scoop install $pkg 2>$null
                        if ($LASTEXITCODE -eq 0) { return $true }
                    }
                }
            }
        } catch {
            continue
        }
    }
    return $false
}

# ── Refresh PATH after installs ──────────────────────────────────────
function Update-PathFromRegistry {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

function Main {
    Show-Banner
    Write-Divider

    # ── Step 1: Platform ─────────────────────────────────────────────
    Write-Step "Detecting platform..."
    $platform = Get-Platform
    Write-Ok "Platform: $($platform.OS) ($($platform.Arch))"
    if ($platform.IsAdmin) {
        Write-Info "Running as Administrator"
    }

    # Check internet
    if (-not (Test-Internet)) {
        Write-Warn "No internet connection detected."
        Write-Info "The installer needs internet to clone repos and install packages."
        if (-not $NoPrompt) {
            Read-Host "Press Enter to try anyway"
        }
    }

    # ── Step 2: Find project ─────────────────────────────────────────
    Write-Step "Locating hermes-web..."

    $projectRoot = Find-ProjectRoot

    if (-not $projectRoot) {
        $cloneDir = if ($HermesWebDir) { $HermesWebDir } else { Join-Path $env:USERPROFILE "hermes-web" }

        if (Test-Path (Join-Path $cloneDir ".git")) {
            Write-Step "Existing clone found, pulling updates..."
            Push-Location $cloneDir
            try { & git pull --ff-only 2>$null } catch {}
            Pop-Location
            $projectRoot = $cloneDir
        } else {
            Write-Step "Cloning hermes-web from GitHub..."
            if (-not (Test-Command "git")) {
                Write-Fatal "git is required. Install from https://git-scm.com/download/win"
            }
            Invoke-WithRetry { & git clone --depth 1 git@github.com:ChloeVPin/hermes-web.git $cloneDir 2>$null; if ($LASTEXITCODE -ne 0) { throw "git clone failed" } }
            $projectRoot = $cloneDir
        }
    } else {
        # Update existing
        if (Test-Path (Join-Path $projectRoot ".git")) {
            Write-Step "Checking for updates..."
            Push-Location $projectRoot
            try { & git pull --ff-only 2>$null } catch {}
            Pop-Location
        }
    }
    Write-Ok "hermes-web: $projectRoot"

    # ── Step 3: Find hermes-agent ────────────────────────────────────
    Write-Divider
    Write-Step "Locating hermes-agent..."

    $agentDir = Find-HermesAgent -ProjectRoot $projectRoot

    if (-not $agentDir) {
        Write-Host ""
        Write-Warn "hermes-agent not found!"
        Write-Host ""
        Write-Info "hermes-web needs hermes-agent to work."
        Write-Info "Either:"
        Write-Info "  1. Clone it:  git clone https://github.com/NousResearch/hermes-agent.git"
        Write-Info "  2. Set:       -HermesAgentDir C:\path\to\hermes-agent"
        Write-Host ""

        if (-not $NoPrompt) {
            $reply = Read-Host "→ Clone hermes-agent next to hermes-web? [Y/n]"
            if ($reply -match '^[Yy]?$') {
                $agentDest = Join-Path (Split-Path $projectRoot) "hermes-agent"
                if (Test-Path (Join-Path $agentDest ".git")) {
                    Write-Step "Existing clone found, pulling updates..."
                    Push-Location $agentDest
                    try { & git pull --ff-only 2>$null } catch {}
                    Pop-Location
                    $agentDir = $agentDest
                } else {
                    Write-Step "Cloning hermes-agent..."
                    Invoke-WithRetry { & git clone --depth 1 https://github.com/NousResearch/hermes-agent.git $agentDest 2>$null; if ($LASTEXITCODE -ne 0) { throw "git clone failed" } }
                    $agentDir = $agentDest
                    Write-Host ""
                    Write-Warn "hermes-agent cloned but NOT set up yet."
                    Write-Info "After this installer finishes, run:"
                    Write-Info "  cd $agentDir; .\setup-hermes.sh"
                }
            } else {
                Write-Fatal "Cannot continue without hermes-agent."
            }
        } else {
            Write-Fatal "hermes-agent not found. Use -HermesAgentDir to specify location."
        }
    } else {
        if (Test-Path (Join-Path $agentDir ".git")) {
            Push-Location $agentDir
            try { & git pull --ff-only 2>$null } catch {}
            Pop-Location
        }
    }
    Write-Ok "hermes-agent: $agentDir"

    # ── Step 4: Prerequisites ────────────────────────────────────────
    Write-Divider
    Write-Step "Checking prerequisites..."
    Write-Host ""

    $missingRequired = @()

    # Git
    if (Test-Command "git") {
        Write-Ok "git $(Get-CommandVersion 'git')"
    } else {
        $missingRequired += "git"
        Write-Fail "git not found"
    }

    # Node.js
    $nodeOk = $false
    if (Test-Command "node") {
        $nodeVer = Get-CommandVersion "node"
        if ($nodeVer -and (Test-VersionAtLeast $nodeVer "18.0")) {
            Write-Ok "node v$nodeVer"
            $nodeOk = $true
        } else {
            Write-Fail "node $nodeVer found but need 18+"
        }
    }
    if (-not $nodeOk) {
        $missingRequired += "node"
        if (-not (Test-Command "node")) { Write-Fail "node not found (need 18+)" }
    }

    # npm
    if (Test-Command "npm") {
        Write-Ok "npm $(Get-CommandVersion 'npm')"
    } elseif (-not $nodeOk) {
        # npm comes with node, no separate entry needed
    } else {
        $missingRequired += "node"
        Write-Fail "npm not found"
    }

    # Python
    $pythonBin = Find-Python -AgentDir $agentDir
    if ($pythonBin) {
        $pyVer = Get-CommandVersion $pythonBin
        Write-Ok "python $pyVer ($pythonBin)"
    } else {
        Write-Warn "python not found (Python bridge won't work)"
    }

    # Rust (optional)
    $hasRust = $false
    if (-not $SkipRust -and (Test-Command "cargo") -and (Test-Command "rustc")) {
        $hasRust = $true
        Write-Ok "rust $(Get-CommandVersion 'rustc') (optional, enables fast bridge)"
    } else {
        Write-Info "rust not found (optional, install via https://rustup.rs)"
    }

    Write-Host ""

    # Auto-install missing
    if ($missingRequired.Count -gt 0) {
        Write-Fail "Missing: $($missingRequired -join ', ')"
        Write-Host ""

        $doInstall = $true
        if (-not $NoPrompt) {
            $reply = Read-Host "→ Attempt to auto-install missing dependencies? [Y/n]"
            $doInstall = $reply -match '^[Yy]?$'
        }

        if ($doInstall) {
            foreach ($dep in $missingRequired) {
                $ok = Install-Prerequisite -Name $dep
                if ($ok) {
                    Update-PathFromRegistry
                    Write-Ok "$dep installed"
                } else {
                    Write-Host ""
                    Write-Fail "Could not auto-install $dep."
                    switch ($dep) {
                        "git"  { Write-Info "Download: https://git-scm.com/download/win" }
                        "node" { Write-Info "Download: https://nodejs.org/en/download/" }
                    }
                    Write-Fatal "Install $dep manually and re-run this script."
                }
            }
            Write-Host ""
        } else {
            Write-Fatal "Cannot continue without: $($missingRequired -join ', ')"
        }
    }

    # ── Step 5: Frontend ─────────────────────────────────────────────
    Write-Divider
    Test-DiskSpace -Path $projectRoot -MinMB 500
    Write-Step "Installing frontend dependencies..."

    Push-Location $projectRoot
    try {
        # Check if up to date
        $needNpm = $true
        $lockFile = Join-Path $projectRoot "node_modules\.package-lock.json"
        if ((Test-Path $lockFile) -and (Test-Path "package.json")) {
            $lockTime = (Get-Item $lockFile).LastWriteTime
            $pkgTime = (Get-Item "package.json").LastWriteTime
            if ($pkgTime -lt $lockTime) {
                $needNpm = $false
                Write-Ok "npm packages already up to date"
            }
        }

        if ($needNpm) {
            & npm install --prefer-offline --no-audit --no-fund --loglevel=error 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { Write-Fatal "npm install failed" }
            Write-Ok "npm packages installed"
        }

        Write-Step "Building frontend..."
        & npx vite build 2>&1 | Select-Object -Last 3
        if ($LASTEXITCODE -ne 0) { Write-Fatal "Frontend build failed" }
        Write-Ok "Frontend built"
    } finally {
        Pop-Location
    }

    # ── Step 6: Bridge ───────────────────────────────────────────────
    Write-Divider
    $bridgeType = ""
    $bridgeBin = ""

    $cargoToml = Join-Path $projectRoot "bridge-rs\Cargo.toml"
    if ($hasRust -and (Test-Path $cargoToml)) {
        Write-Step "Building Rust bridge (high-performance)..."
        Push-Location (Join-Path $projectRoot "bridge-rs")
        try {
            & cargo build --release 2>&1 | Select-Object -Last 2
            $bin = Join-Path $projectRoot "bridge-rs\target\release\hermes-bridge.exe"
            if (Test-Path $bin) {
                $size = "{0:N1} MB" -f ((Get-Item $bin).Length / 1MB)
                Write-Ok "Rust bridge built ($size)"
                $bridgeType = "rust"
                $bridgeBin = $bin
            }
        } catch {
            Write-Warn "Rust bridge build failed, falling back to Python"
        } finally {
            Pop-Location
        }
    }

    if (-not $bridgeType -and $pythonBin) {
        Write-Step "Setting up Python bridge..."
        try {
            & $pythonBin -m pip install websockets --quiet 2>$null
        } catch {
            Write-Warn "Could not install websockets"
        }
        Write-Ok "Python bridge ready"
        $bridgeType = "python"
    }

    if (-not $bridgeType) {
        Write-Warn "No bridge available, install Rust or Python"
    }

    # ── Step 7: Speed patches ────────────────────────────────────────
    Write-Divider
    if (-not $SkipPatches -and $pythonBin) {
        $patchScript = Join-Path $projectRoot "patches\apply_speed.py"
        if (Test-Path $patchScript) {
            Write-Step "Applying speed patches to hermes-agent..."
            try {
                & $pythonBin $patchScript "--hermes-dir=$agentDir" 2>&1
            } catch {
                Write-Warn "Speed patches failed (non-fatal)"
            }
        }
    }

    # ── Step 8: Launcher scripts ─────────────────────────────────────
    Write-Divider
    Write-Step "Creating launcher scripts..."

    # Batch file launcher (works everywhere on Windows)
    $batLauncher = Join-Path $projectRoot "start.bat"
    $batContent = @"
@echo off
title Hermes-Web
set HERMES_AGENT_DIR=$agentDir
set DIR=%~dp0

"@
    if ($bridgeType -eq "rust" -and $bridgeBin) {
        $batContent += @"
echo [hermes-web] Starting Rust bridge on ws://127.0.0.1:9120
start /B "" "$bridgeBin"

"@
    } elseif ($pythonBin) {
        $batContent += @"
echo [hermes-web] Starting Python bridge on ws://127.0.0.1:9120
start /B "" "$pythonBin" "%DIR%bridge\server.py"

"@
    }
    $batContent += @"
timeout /t 2 /nobreak >nul
echo [hermes-web] Starting frontend on http://localhost:5173
cd /d "%DIR%"
npx vite --host
"@
    Set-Content -Path $batLauncher -Value $batContent -Encoding UTF8
    Write-Ok "Created start.bat"

    # PowerShell launcher
    $ps1Launcher = Join-Path $projectRoot "start.ps1"
    $ps1Content = @"
`$ErrorActionPreference = "Stop"
`$env:HERMES_AGENT_DIR = "$agentDir"
`$dir = Split-Path `$MyInvocation.MyCommand.Path

    Write-Host "Starting Hermes-Web..." -ForegroundColor Yellow
"@
    if ($bridgeType -eq "rust" -and $bridgeBin) {
        $ps1Content += @"

Write-Host "→ Rust bridge on ws://127.0.0.1:9120" -ForegroundColor Cyan
`$bridge = Start-Process -FilePath "$bridgeBin" -PassThru -WindowStyle Hidden
"@
    } elseif ($pythonBin) {
        $ps1Content += @"

Write-Host "→ Python bridge on ws://127.0.0.1:9120" -ForegroundColor Cyan
`$bridge = Start-Process -FilePath "$pythonBin" -ArgumentList "`$dir\bridge\server.py" -PassThru -WindowStyle Hidden
"@
    }
    $ps1Content += @"

Start-Sleep -Seconds 2
Write-Host "→ Frontend on http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
    Write-Host "  Hermes-Web ready!" -ForegroundColor Yellow
Write-Host "  → http://localhost:5173" -ForegroundColor White
Write-Host ""

try {
    Push-Location `$dir
    & npx vite --host
} finally {
    if (`$bridge) { Stop-Process -Id `$bridge.Id -Force -ErrorAction SilentlyContinue }
    Pop-Location
}
"@
    Set-Content -Path $ps1Launcher -Value $ps1Content -Encoding UTF8
    Write-Ok "Created start.ps1"

    # ── Step 9: PATH registration ────────────────────────────────────
    Write-Step "Registering hermes-web command..."

    $binDir = Join-Path $env:USERPROFILE ".local\bin"
    if (-not (Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir -Force | Out-Null }

    # Create wrapper batch file
    $wrapper = Join-Path $binDir "hermes-web.cmd"
    Set-Content -Path $wrapper -Value "@echo off`npowershell -ExecutionPolicy Bypass -File `"$ps1Launcher`" %*" -Encoding UTF8

    # Add to user PATH if not there
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -notlike "*$binDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$binDir;$userPath", "User")
        $env:Path = "$binDir;$env:Path"
        Write-Ok "Added $binDir to user PATH"
    }
    Write-Ok "hermes-web command registered"

    # ── Done ─────────────────────────────────────────────────────────
    Write-Divider
    Write-Host ""
    Write-Gold "  ⚕ Installation complete!"
    Write-Host ""
    Write-Host "  Start:         " -NoNewline; Write-Host "hermes-web" -ForegroundColor Cyan -NoNewline; Write-Host "  or  " -NoNewline -ForegroundColor DarkGray; Write-Host ".\start.bat" -ForegroundColor Cyan
    Write-Host "  Bridge:        $bridgeType on ws://127.0.0.1:9120" -ForegroundColor DarkGray
    Write-Host "  Frontend:      http://localhost:5173" -ForegroundColor DarkGray
    Write-Host "  hermes-agent:  $agentDir" -ForegroundColor DarkGray
    Write-Host ""

    if (-not $bridgeType) {
        Write-Warn "No bridge available, install Rust (https://rustup.rs) or Python and re-run"
    } elseif ($bridgeType -eq "python") {
        Write-Info "Speed tip: install Rust (https://rustup.rs) and re-run for faster bridge"
    }

    $venvExists = (Test-Path (Join-Path $agentDir "venv")) -or (Test-Path (Join-Path $agentDir ".venv"))
    if (-not $venvExists) {
        Write-Host ""
        Write-Warn "hermes-agent is not set up yet!"
        Write-Info "Run:  cd $agentDir; bash setup-hermes.sh  (or use WSL)"
    }

    Write-Host ""
    Write-Info "Re-run this script anytime to update. Your data is never wiped."
    Write-Host ""

    if (-not $NoPrompt) {
        $reply = Read-Host "→ Start hermes-web now? [Y/n]"
        if ($reply -match '^[Yy]?$') {
            Write-Host ""
            & powershell -ExecutionPolicy Bypass -File $ps1Launcher
        }
    }
}

# Run
try {
    Main
} catch {
    Write-Host ""
    Write-Fail "Installation failed: $_"
    Write-Host ""
    Write-Info "If you need help, open an issue at:"
    Write-Info "  https://github.com/ChloeVPin/hermes-web/issues"
    Write-Host ""
    exit 1
}
