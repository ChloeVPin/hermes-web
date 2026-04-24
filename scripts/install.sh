#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Hermes-Web - Cross-platform installer
# ═══════════════════════════════════════════════════════════════════════
#
# Supports: Linux (all distros), macOS (Intel + Apple Silicon),
#           WSL, Termux/Android, FreeBSD
#
# Usage:
#   bash scripts/install.sh              # from cloned repo
#   bash <(curl -sL https://raw.githubusercontent.com/ChloeVPin/hermes-web/main/scripts/install.sh)
#
# Re-running this script updates everything without wiping data.
#
set -euo pipefail

# ── Handle piped stdin (curl | bash), redirect prompts to /dev/tty ──
if [ ! -t 0 ]; then
    exec < /dev/tty || { echo "Cannot read from terminal. Run: bash scripts/install.sh"; exit 1; }
fi

# ── ANSI colors (Hermes brand: #ffac02 orange, #170d02 dark) ─────────
GOLD='\033[1;38;2;255;172;2m'
AMBER='\033[0;38;2;255;172;2m'
BRONZE='\033[0;38;2;205;127;50m'
GREEN='\033[0;32m'
RED='\033[0;38;2;251;44;54m'
YELLOW='\033[1;38;2;255;230;137m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
RST='\033[0m'

# ── Verbose mode ───────────────────────────────────────────────────────
VERBOSE="${VERBOSE:-0}"

# ── Static output system (no scrolling) ───────────────────────────────
# Track step statuses for static display
declare -A STEP_STATUS
declare -a STEP_ORDER
STATIC_TOTAL=0
STATIC_EXTRA_LINES=0

register_step() {
    local id="$1" name="$2"
    STEP_STATUS["$id"]="pending"
    STEP_ORDER+=("$id:$name")
}

print_static_header() {
    echo -e "\n${DIM}Installation progress:${RST}"
    for entry in "${STEP_ORDER[@]}"; do
        IFS=':' read -r id name <<< "$entry"
        echo -e "  ○ ${name}"
    done
    STATIC_TOTAL=${#STEP_ORDER[@]}
}

update_step_status() {
    local id="$1" status="$2"
    STEP_STATUS["$id"]="$status"

    # Select icon and color
    local icon="○" color="${RST}"
    case "$status" in
        loading) icon="⏳"; color="${AMBER}" ;;
        complete) icon="✓"; color="${GREEN}" ;;
        failed) icon="✗"; color="${RED}" ;;
    esac

    # Find this step's index (0-based)
    local idx=0 step_name=""
    for entry in "${STEP_ORDER[@]}"; do
        IFS=':' read -r step_id name <<< "$entry"
        if [ "$step_id" = "$id" ]; then
            step_name="$name"
            break
        fi
        idx=$((idx + 1))
    done

    # Move cursor up to the correct line, overwrite, move back down
    local lines_up=$((STATIC_TOTAL - idx + STATIC_EXTRA_LINES))
    printf '\033[%dA' "$lines_up"      # move up
    printf '\033[2K'                    # clear line
    echo -e "  ${color}${icon}${RST} ${step_name}"
    if [ $((lines_up - 1)) -gt 0 ]; then
        printf '\033[%dB' "$((lines_up - 1))"  # move back down
    fi
}

# ── Output helpers (only used in verbose mode) ─────────────────────────
step()    { 
    if [ "$VERBOSE" -eq 1 ]; then
        echo -e "${AMBER}→${RST} $*"
    fi
}
ok()      { 
    if [ "$VERBOSE" -eq 1 ]; then
        echo -e "${GREEN}✓${RST} $*"
    fi
}
warn()    {
    echo -e "${YELLOW}⚠${RST} $*"
    [ "$VERBOSE" -eq 0 ] && [ "$STATIC_TOTAL" -gt 0 ] && STATIC_EXTRA_LINES=$((STATIC_EXTRA_LINES + 1))
}
fail()    {
    echo -e "${RED}✗${RST} $*"
    [ "$VERBOSE" -eq 0 ] && [ "$STATIC_TOTAL" -gt 0 ] && STATIC_EXTRA_LINES=$((STATIC_EXTRA_LINES + 1))
}
fatal()   { fail "$@"; exit 1; }

# Print a message below the step list and track the extra line
static_msg() {
    echo -e "$@"
    STATIC_EXTRA_LINES=$((STATIC_EXTRA_LINES + 1))
}

# Show a prompt below the step list and track the line it uses
static_prompt() {
    local varname="$1" prompt="$2"
    read -rp "$(echo -e "$prompt")" "$varname"
    STATIC_EXTRA_LINES=$((STATIC_EXTRA_LINES + 1))
}
info()    { 
    if [ "$VERBOSE" -eq 1 ]; then
        echo -e "${DIM}  $*${RST}"
    fi
}
divider() { 
    if [ "$VERBOSE" -eq 1 ]; then
        echo -e "${BRONZE}$(printf '─%.0s' $(seq 1 60))${RST}"
    fi
}

# ── Retry wrapper for network operations ─────────────────────────────
retry() {
    local max_attempts="${RETRY_MAX:-3}" delay="${RETRY_DELAY:-2}" attempt=1
    while [ "$attempt" -le "$max_attempts" ]; do
        if "$@" ; then
            return 0
        fi
        if [ "$attempt" -lt "$max_attempts" ]; then
            if [ "$VERBOSE" -eq 1 ]; then
                warn "Attempt $attempt/$max_attempts failed, retrying in ${delay}s..."
            fi
            sleep "$delay"
            delay=$((delay * 2))
        fi
        attempt=$((attempt + 1))
    done
    return 1
}

# ── Cleanup trap for Ctrl+C ──────────────────────────────────────────
_cleanup_on_interrupt() {
    echo ""
    warn "Installation interrupted."
    info "You can safely re-run this script to continue where you left off."
    exit 130
}
trap _cleanup_on_interrupt INT

# ── Disk space check (need ~500MB for node_modules + build) ──────────
check_disk_space() {
    local dir="$1" min_mb="${2:-500}"
    local avail_kb
    avail_kb=$(df -k "$dir" 2>/dev/null | awk 'NR==2 {print $4}')
    if [ -n "$avail_kb" ] && [ "$avail_kb" -lt "$((min_mb * 1024))" ]; then
        local avail_mb=$((avail_kb / 1024))
        warn "Low disk space: ${avail_mb}MB available, ${min_mb}MB recommended"
        info "Installation may fail. Free up space or press Enter to try anyway."
        read -r
        [ "$VERBOSE" -eq 0 ] && [ "$STATIC_TOTAL" -gt 0 ] && STATIC_EXTRA_LINES=$((STATIC_EXTRA_LINES + 1))
    fi
}

# ── Internet connectivity check ──────────────────────────────────────
check_internet() {
    if command -v curl &>/dev/null; then
        curl -sf --max-time 5 https://github.com >/dev/null 2>&1 && return 0
    elif command -v wget &>/dev/null; then
        wget -q --timeout=5 --spider https://github.com 2>/dev/null && return 0
    fi
    return 1
}


# ── Banner ───────────────────────────────────────────────────────────
show_banner() {
    # Detect terminal size
    local cols=80
    if command -v tput &>/dev/null; then
        cols=$(tput cols 2>/dev/null || echo 80)
    fi

    # Use simple banner for small terminals
    if [ "$cols" -lt 60 ]; then
        echo ""
        echo -e "${GOLD}Hermes-Web${RST} - Web Interface Installer"
        echo ""
        return
    fi

    # Use full ASCII art for larger terminals
    echo ""
    echo -e "${GOLD}██╗  ██╗███████╗██████╗ ███╗   ███╗███████╗███████╗${RST}"
    echo -e "${GOLD}██║  ██║██╔════╝██╔══██╗████╗ ████║██╔════╝██╔════╝${RST}"
    echo -e "${AMBER}███████║█████╗  ██████╔╝██╔████╔██║█████╗  ███████╗${RST}"
    echo -e "${AMBER}██╔══██║██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══╝  ╚════██║${RST}"
    echo -e "${BRONZE}██║  ██║███████╗██║  ██║██║ ╚═╝ ██║███████╗███████║${RST}"
    echo -e "${BRONZE}╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚══════╝${RST}"
        echo -e "${DIM}Web Interface Installer${RST}"
    echo ""
}

# ── Detect environment ───────────────────────────────────────────────
detect_platform() {
    OS="$(uname -s 2>/dev/null || echo Unknown)"
    ARCH="$(uname -m 2>/dev/null || echo unknown)"
    DISTRO=""
    PKG_MGR=""
    IS_TERMUX=false
    IS_WSL=false
    IS_MACOS=false
    IS_LINUX=false
    IS_ROOT=false

    [ "$(id -u 2>/dev/null)" = "0" ] && IS_ROOT=true

    # Termux
    if [ -n "${TERMUX_VERSION:-}" ] || [[ "${PREFIX:-}" == *"com.termux"* ]]; then
        IS_TERMUX=true
        DISTRO="termux"
        PKG_MGR="pkg"
    fi

    # WSL
    if grep -qi "microsoft\|wsl" /proc/version 2>/dev/null; then
        IS_WSL=true
    fi

    case "$OS" in
        Darwin)
            IS_MACOS=true
            DISTRO="macos"
            MACOS_VER="$(sw_vers -productVersion 2>/dev/null || echo "unknown")"
            MACOS_ARCH="$ARCH"
            if [ "$ARCH" = "arm64" ]; then
                MACOS_ARCH="Apple Silicon"
            elif [ "$ARCH" = "x86_64" ]; then
                MACOS_ARCH="Intel"
            fi
            if command -v brew &>/dev/null; then
                PKG_MGR="brew"
            fi
            ;;
        Linux)
            IS_LINUX=true
            if [ "$IS_TERMUX" = false ]; then
                if [ -f /etc/os-release ]; then
                    . /etc/os-release
                    DISTRO="${ID:-linux}"
                elif [ -f /etc/alpine-release ]; then
                    DISTRO="alpine"
                elif [ -f /etc/arch-release ]; then
                    DISTRO="arch"
                else
                    DISTRO="linux"
                fi

                # Package manager detection
                if command -v apt-get &>/dev/null; then
                    PKG_MGR="apt"
                elif command -v dnf &>/dev/null; then
                    PKG_MGR="dnf"
                elif command -v yum &>/dev/null; then
                    PKG_MGR="yum"
                elif command -v pacman &>/dev/null; then
                    PKG_MGR="pacman"
                elif command -v zypper &>/dev/null; then
                    PKG_MGR="zypper"
                elif command -v apk &>/dev/null; then
                    PKG_MGR="apk"
                elif command -v xbps-install &>/dev/null; then
                    PKG_MGR="xbps"
                elif command -v emerge &>/dev/null; then
                    PKG_MGR="portage"
                elif command -v nix-env &>/dev/null; then
                    PKG_MGR="nix"
                fi
            fi
            ;;
        FreeBSD)
            IS_LINUX=false
            DISTRO="freebsd"
            PKG_MGR="pkg_freebsd"
            ;;
        *)
            fatal "Unsupported OS: $OS"
            ;;
    esac
}

print_platform() {
    local label="$OS $ARCH"
    if [ "$IS_MACOS" = true ]; then
        label="macOS $MACOS_VER ($MACOS_ARCH)"
    elif [ "$IS_TERMUX" = true ]; then
        label="Android/Termux"
    elif [ "$IS_WSL" = true ]; then
        label="WSL ($DISTRO)"
    elif [ -n "$DISTRO" ]; then
        label="Linux ($DISTRO, $ARCH)"
    fi
    ok "Platform: ${BOLD}$label${RST}"
}

# ── Prerequisite helpers ─────────────────────────────────────────────
cmd_exists() { command -v "$1" &>/dev/null; }

check_version() {
    local cmd="$1" min="$2"
    local ver
    ver=$("$cmd" --version 2>/dev/null | sed 's/^v//' | grep -oE '[0-9]+\.[0-9]+' | head -1)
    if [ -z "$ver" ]; then return 1; fi
    local major minor min_major min_minor
    major=$(echo "$ver" | cut -d. -f1)
    minor=$(echo "$ver" | cut -d. -f2)
    min_major=$(echo "$min" | cut -d. -f1)
    min_minor=$(echo "$min" | cut -d. -f2)
    [ "$major" -gt "$min_major" ] || { [ "$major" -eq "$min_major" ] && [ "$minor" -ge "$min_minor" ]; }
}

install_hint() {
    local pkg="$1"
    case "$PKG_MGR" in
        apt)     info "sudo apt update && sudo apt install -y $pkg" ;;
        dnf)     info "sudo dnf install -y $pkg" ;;
        yum)     info "sudo yum install -y $pkg" ;;
        pacman)  info "sudo pacman -S --noconfirm $pkg" ;;
        zypper)  info "sudo zypper install -y $pkg" ;;
        apk)     info "sudo apk add $pkg" ;;
        xbps)    info "sudo xbps-install -y $pkg" ;;
        portage) info "sudo emerge $pkg" ;;
        nix)     info "nix-env -iA nixpkgs.$pkg" ;;
        brew)    info "brew install $pkg" ;;
        pkg)     info "pkg install $pkg" ;;
        pkg_freebsd) info "pkg install $pkg" ;;
        *)       info "Install $pkg using your system package manager" ;;
    esac
}

pkg_install() {
    local pkg="$1"
    local pkg_name="${2:-$1}"  # alternate name for some package managers

    if [ "$IS_ROOT" = true ] || [ "$IS_TERMUX" = true ]; then
        case "$PKG_MGR" in
            apt)     apt-get update -qq && apt-get install -y -qq "$pkg" ;;
            dnf)     dnf install -y -q "$pkg" ;;
            yum)     yum install -y -q "$pkg" ;;
            pacman)  pacman -S --noconfirm --needed "$pkg" ;;
            zypper)  zypper install -y "$pkg" ;;
            apk)     apk add --quiet "$pkg" ;;
            xbps)    xbps-install -y "$pkg" ;;
            pkg)     pkg install -y "$pkg" ;;
            pkg_freebsd) pkg install -y "$pkg" ;;
            *)       return 1 ;;
        esac
    elif command -v sudo &>/dev/null; then
        case "$PKG_MGR" in
            apt)     sudo apt-get update -qq && sudo apt-get install -y -qq "$pkg" ;;
            dnf)     sudo dnf install -y -q "$pkg" ;;
            yum)     sudo yum install -y -q "$pkg" ;;
            pacman)  sudo pacman -S --noconfirm --needed "$pkg" ;;
            zypper)  sudo zypper install -y "$pkg" ;;
            apk)     sudo apk add --quiet "$pkg" ;;
            xbps)    sudo xbps-install -y "$pkg" ;;
            pkg_freebsd) sudo pkg install -y "$pkg" ;;
            *)       return 1 ;;
        esac
    elif [ "$PKG_MGR" = "brew" ]; then
        brew install "$pkg" 2>/dev/null
    else
        return 1
    fi
}

# ── Locate hermes-web project root ─────────────────────────────────
find_project_root() {
    # If we're already inside the repo
    if [ -f "${BASH_SOURCE[0]:-}" ]; then
        local script_dir
        script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        if [ -f "$script_dir/../package.json" ]; then
            PROJECT_ROOT="$(cd "$script_dir/.." && pwd)"
            return
        fi
    fi

    # Check current directory
    if [ -f "package.json" ] && grep -q "hermes-web" package.json 2>/dev/null; then
        PROJECT_ROOT="$(pwd)"
        return
    fi

    # Not inside repo, we need to clone
    PROJECT_ROOT=""
}

# ── Locate hermes-agent ─────────────────────────────────────────────
find_hermes_agent() {
    HERMES_AGENT_DIR="${HERMES_AGENT_DIR:-}"

    if [ -n "$HERMES_AGENT_DIR" ] && [ -d "$HERMES_AGENT_DIR/tui_gateway" ]; then
        return
    fi

    local candidates=(
        "${PROJECT_ROOT:+$PROJECT_ROOT/../hermes-agent}"
        "$HOME/hermes-agent"
        "$HOME/Desktop/hermes-agent"
        "$HOME/Projects/hermes-agent"
        "$HOME/dev/hermes-agent"
        "$HOME/src/hermes-agent"
        "$HOME/code/hermes-agent"
        "/opt/hermes-agent"
    )

    for c in "${candidates[@]}"; do
        [ -z "$c" ] && continue
        if [ -d "$c/tui_gateway" ]; then
            HERMES_AGENT_DIR="$(cd "$c" && pwd)"
            return
        fi
    done

    # Fallback: search for hermes-agent in common locations (handles renamed dirs like hermes-agent-1588)
    if command -v find &>/dev/null; then
        local found
        found=$(find "$HOME" -maxdepth 2 -type d -name "hermes-agent*" 2>/dev/null | head -1)
        if [ -n "$found" ] && [ -d "$found/tui_gateway" ]; then
            HERMES_AGENT_DIR="$(cd "$found" && pwd)"
            return
        fi
    fi

    HERMES_AGENT_DIR=""
}

# ── Resolve Python from hermes-agent venv ────────────────────────────
find_python() {
    PYTHON_BIN=""

    if [ -n "$HERMES_AGENT_DIR" ]; then
        local candidates=(
            "$HERMES_AGENT_DIR/.venv/bin/python"
            "$HERMES_AGENT_DIR/.venv/bin/python3"
            "$HERMES_AGENT_DIR/venv/bin/python"
            "$HERMES_AGENT_DIR/venv/bin/python3"
        )
        for c in "${candidates[@]}"; do
            if [ -x "$c" ]; then
                PYTHON_BIN="$c"
                return
            fi
        done
    fi

    if cmd_exists python3; then
        PYTHON_BIN="python3"
    elif cmd_exists python; then
        PYTHON_BIN="python"
    fi
}

# ═══════════════════════════════════════════════════════════════════════
# MAIN INSTALLATION FLOW
# ═══════════════════════════════════════════════════════════════════════

main() {
    show_banner
    
    # Register all installation steps for static output
    register_step "detect" "Detecting platform"
    register_step "locate" "Locating hermes-web"
    register_step "agent" "Locating hermes-agent"
    register_step "prereq" "Checking prerequisites"
    register_step "frontend" "Installing frontend"
    register_step "bridge" "Building bridge"
    register_step "patches" "Applying speed patches"
    register_step "launcher" "Creating launcher"
    register_step "command" "Registering command"
    
    # Print static header or use verbose mode
    if [ "$VERBOSE" -eq 1 ]; then
        divider
    else
        print_static_header
    fi
    
    # ── Step 1: Detect platform ──────────────────────────────────────
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "detect" "loading"
    else
        step "Detecting platform..."
    fi
    detect_platform
    if [ "$VERBOSE" -eq 1 ]; then
        print_platform
    fi
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "detect" "complete"
    else
        ok "Platform detected"
    fi

    # Check internet early
    if ! check_internet; then
        warn "No internet connection detected."
        info "The installer needs internet to clone repos and install packages."
        info "If you're on a restricted network, press Enter to try anyway."
        read -r
        [ "$VERBOSE" -eq 0 ] && [ "$STATIC_TOTAL" -gt 0 ] && STATIC_EXTRA_LINES=$((STATIC_EXTRA_LINES + 1))
    fi

    # ── Step 2: Find project root ────────────────────────────────────
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "locate" "loading"
    else
        step "Locating hermes-web..."
    fi
    find_project_root

    FRESH_CLONE=false
    if [ -z "$PROJECT_ROOT" ]; then
        if [ "$VERBOSE" -eq 1 ]; then
            step "hermes-web not found locally, cloning from GitHub..."
        fi
        local clone_dir="${HERMES_WEB_DIR:-$HOME/hermes-web}"
        if [ -d "$clone_dir/.git" ]; then
            if [ "$VERBOSE" -eq 1 ]; then
                step "Existing clone found at $clone_dir, pulling updates..."
            fi
            if [ "$VERBOSE" -eq 1 ]; then
                (cd "$clone_dir" && git pull --ff-only 2>/dev/null) || warn "git pull failed, continuing with existing code"
            else
                (cd "$clone_dir" && git pull --ff-only >/dev/null 2>&1) || true
            fi
            PROJECT_ROOT="$clone_dir"
        else
            if ! cmd_exists git; then
                fatal "git is required to clone hermes-web. Install it first."
            fi
            retry git clone --depth 1 git@github.com:ChloeVPin/hermes-web.git "$clone_dir" 2>/dev/null \
                || fatal "Failed to clone hermes-web. Check your internet connection."
            PROJECT_ROOT="$clone_dir"
            FRESH_CLONE=true
        fi
    else
        # Existing repo, pull updates if it's a git repo
        if [ -d "$PROJECT_ROOT/.git" ]; then
            if [ "$VERBOSE" -eq 1 ]; then
                step "Checking for updates..."
            fi
            local old_hash new_hash
            old_hash=$(cd "$PROJECT_ROOT" && git rev-parse HEAD 2>/dev/null || echo "none")
            if [ "$VERBOSE" -eq 1 ]; then
                (cd "$PROJECT_ROOT" && git pull --ff-only 2>/dev/null) || warn "git pull failed (you may have local changes)"
            else
                (cd "$PROJECT_ROOT" && git pull --ff-only >/dev/null 2>&1) || true
            fi
            new_hash=$(cd "$PROJECT_ROOT" && git rev-parse HEAD 2>/dev/null || echo "none")
            if [ "$old_hash" != "$new_hash" ]; then
                if [ "$VERBOSE" -eq 1 ]; then
                    ok "Updated"
                fi
            else
                if [ "$VERBOSE" -eq 1 ]; then
                    ok "Already up to date"
                fi
            fi
        fi
    fi
    
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "locate" "complete"
    else
        ok "hermes-web: ${BOLD}$PROJECT_ROOT${RST}"
    fi

    # ── Step 3: Find hermes-agent ────────────────────────────────────
    if [ "$VERBOSE" -eq 1 ]; then
        divider
    fi
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "agent" "loading"
    else
        step "Locating hermes-agent..."
    fi
    find_hermes_agent

    if [ -z "$HERMES_AGENT_DIR" ]; then
        if [ "$VERBOSE" -eq 1 ]; then
            echo ""
            warn "hermes-agent not found!"
            echo ""
            info "hermes-web needs hermes-agent to work."
            info "Either:"
            info "  1. Clone it:  git clone https://github.com/NousResearch/hermes-agent.git"
            info "  2. Set:       export HERMES_AGENT_DIR=/path/to/hermes-agent"
            echo ""
        fi

        if [ "$VERBOSE" -eq 0 ]; then
            static_msg ""
            static_msg "${AMBER}→${RST} hermes-agent not found"
        fi

        local reply
        static_prompt reply "${AMBER}→${RST} Clone hermes-agent next to hermes-web? [Y/n] "
        if [[ "${reply:-Y}" =~ ^[Yy]$ ]]; then
            local agent_dest="$PROJECT_ROOT/../hermes-agent"
            if [ -d "$agent_dest/.git" ]; then
                if [ "$VERBOSE" -eq 1 ]; then
                    step "Existing clone found, pulling updates..."
                fi
                if [ "$VERBOSE" -eq 1 ]; then
                    (cd "$agent_dest" && git pull --ff-only 2>/dev/null) || true
                else
                    (cd "$agent_dest" && git pull --ff-only >/dev/null 2>&1) || true
                fi
                HERMES_AGENT_DIR="$(cd "$agent_dest" && pwd)"
            else
                if [ "$VERBOSE" -eq 1 ]; then
                    step "Cloning hermes-agent (this may take a moment)..."
                fi
                retry git clone --depth 1 https://github.com/NousResearch/hermes-agent.git "$agent_dest" 2>/dev/null \
                    || fatal "Failed to clone hermes-agent. Check your internet connection."
                HERMES_AGENT_DIR="$(cd "$agent_dest" && pwd)"
                
                # Auto-run setup-hermes.sh to set up hermes-agent
                if [ -f "$HERMES_AGENT_DIR/setup-hermes.sh" ]; then
                    if [ "$VERBOSE" -eq 1 ]; then
                        step "Setting up hermes-agent..."
                    fi
                    (cd "$HERMES_AGENT_DIR" && bash setup-hermes.sh >/dev/null 2>&1)
                    if [ "$VERBOSE" -eq 1 ]; then
                        ok "hermes-agent set up"
                    fi
                else
                    # Manual setup if setup-hermes.sh doesn't exist
                    if [ "$VERBOSE" -eq 1 ]; then
                        step "Setting up hermes-agent venv..."
                    fi
                    (cd "$HERMES_AGENT_DIR" && python3 -m venv venv >/dev/null 2>&1)
                    (cd "$HERMES_AGENT_DIR" && source venv/bin/activate && pip install -e . >/dev/null 2>&1)
                    if [ "$VERBOSE" -eq 1 ]; then
                        ok "hermes-agent venv set up"
                    fi
                fi
            fi
        else
            fatal "Cannot continue without hermes-agent."
        fi
    else
        # Update if git repo
        if [ -d "$HERMES_AGENT_DIR/.git" ]; then
            if [ "$VERBOSE" -eq 1 ]; then
                (cd "$HERMES_AGENT_DIR" && git pull --ff-only 2>/dev/null) || true
            else
                (cd "$HERMES_AGENT_DIR" && git pull --ff-only >/dev/null 2>&1) || true
            fi
        fi
    fi
    
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "agent" "complete"
    else
        ok "hermes-agent: ${BOLD}$HERMES_AGENT_DIR${RST}"
    fi

    # ── Step 5: Configure hermes-agent API key ──────────────────────────
    if [ "$VERBOSE" -eq 1 ]; then
        divider
    fi
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "apikey" "loading"
    else
        step "Configuring hermes-agent API key..."
    fi

    local hermes_config_dir="$HOME/.hermes"
    local hermes_env_file="$hermes_config_dir/.env"
    
    mkdir -p "$hermes_config_dir"
    
    # Check if API key already configured
    if [ -f "$hermes_env_file" ] && grep -q "OPENROUTER_API_KEY=\|OPENAI_API_KEY=\|ANTHROPIC_API_KEY=\|GOOGLE_API_KEY=" "$hermes_env_file"; then
        if [ "$VERBOSE" -eq 1 ]; then
            ok "API key already configured"
        fi
    else
        if [ "$VERBOSE" -eq 1 ]; then
            info "No API key found in $hermes_env_file"
            info "You can configure it later by running:"
            info "  echo 'OPENROUTER_API_KEY=your-key' >> $hermes_env_file"
        fi
    fi
    
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "apikey" "complete"
    fi

    # ── Step 6: Check prerequisites ──────────────────────────────────
    if [ "$VERBOSE" -eq 1 ]; then
        divider
    fi
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "prereq" "loading"
    else
        step "Checking prerequisites..."
        echo ""
    fi

    MISSING_REQUIRED=()
    MISSING_OPTIONAL=()

    # Git
    if cmd_exists git; then
        if [ "$VERBOSE" -eq 1 ]; then
            ok "git $(git --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
        fi
    else
        MISSING_REQUIRED+=("git")
        if [ "$VERBOSE" -eq 1 ]; then
            fail "git not found"
        fi
    fi

    # Node.js
    if cmd_exists node && check_version node 18.0; then
        if [ "$VERBOSE" -eq 1 ]; then
            ok "node $(node --version 2>/dev/null)"
        fi
    elif cmd_exists node; then
        if [ "$VERBOSE" -eq 1 ]; then
            fail "node found but version too old (need 18+)"
        fi
        MISSING_REQUIRED+=("node")
    else
        MISSING_REQUIRED+=("node")
        if [ "$VERBOSE" -eq 1 ]; then
            fail "node not found (need 18+)"
        fi
    fi

    # npm
    if cmd_exists npm; then
        if [ "$VERBOSE" -eq 1 ]; then
            ok "npm $(npm --version 2>/dev/null)"
        fi
    else
        MISSING_REQUIRED+=("npm")
        if [ "$VERBOSE" -eq 1 ]; then
            fail "npm not found"
        fi
    fi

    # Python
    find_python
    if [ -n "$PYTHON_BIN" ]; then
        local py_ver
        py_ver=$($PYTHON_BIN --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
        if [ -n "$py_ver" ]; then
            local py_major py_minor
            py_major=$(echo "$py_ver" | cut -d. -f1)
            py_minor=$(echo "$py_ver" | cut -d. -f2)
            if [ "$py_major" -lt 3 ] || { [ "$py_major" -eq 3 ] && [ "$py_minor" -lt 10 ]; }; then
                if [ "$VERBOSE" -eq 1 ]; then
                    fail "python $py_ver found but too old (need 3.10+)"
                fi
                MISSING_REQUIRED+=("python3")
            else
                if [ "$VERBOSE" -eq 1 ]; then
                    ok "python $py_ver ($PYTHON_BIN)"
                fi
            fi
        else
            if [ "$VERBOSE" -eq 1 ]; then
                warn "python version detection failed"
            fi
            MISSING_OPTIONAL+=("python3")
        fi
    else
        if [ "$VERBOSE" -eq 1 ]; then
            warn "python not found (Python bridge won't work without it)"
        fi
        MISSING_OPTIONAL+=("python3")
    fi

    # Rust (optional)
    HAS_RUST=false
    if cmd_exists cargo && cmd_exists rustc; then
        HAS_RUST=true
        if [ "$VERBOSE" -eq 1 ]; then
            ok "rust $(rustc --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1) ${DIM}(optional, enables fast bridge)${RST}"
        fi
    else
        if [ "$VERBOSE" -eq 1 ]; then
            info "rust not found ${DIM}(optional, install via https://rustup.rs for faster bridge)${RST}"
        fi
    fi

    if [ "$VERBOSE" -eq 1 ]; then
        echo ""
    fi

    # Handle missing required deps
    if [ ${#MISSING_REQUIRED[@]} -gt 0 ]; then
        fail "Missing required dependencies: ${MISSING_REQUIRED[*]}"
        if [ "$VERBOSE" -eq 1 ]; then
            echo ""
        fi
        for dep in "${MISSING_REQUIRED[@]}"; do
            if [ "$VERBOSE" -eq 1 ]; then
                case "$dep" in
                    git)
                        info "Install git:"
                        install_hint "git"
                        ;;
                    node|npm)
                        info "Install Node.js 18+ (includes npm):"
                        if [ "$IS_MACOS" = true ]; then
                            info "brew install node"
                        elif [ "$IS_TERMUX" = true ]; then
                            info "pkg install nodejs"
                        else
                            info "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
                            info "sudo apt install -y nodejs"
                            info "  OR: https://nodejs.org/en/download/"
                        fi
                        ;;
                esac
            fi
        done
        if [ "$VERBOSE" -eq 1 ]; then
            echo ""
        fi

        local reply
        static_prompt reply "${AMBER}→${RST} Attempt to auto-install missing dependencies? [Y/n] "
        if [[ "${reply:-Y}" =~ ^[Yy]$ ]]; then
            # Install comprehensive system dependencies first (Linux only)
            if [ "$IS_LINUX" = true ] && [ "$PKG_MGR" = "apt" ]; then
                if [ "$VERBOSE" -eq 1 ]; then
                    step "Installing comprehensive system dependencies..."
                fi
                apt-get update -qq >/dev/null 2>&1
                apt-get install -y -qq \
                    build-essential \
                    curl \
                    wget \
                    git \
                    python3 \
                    python3-pip \
                    python3-venv \
                    python3-dev \
                    pkg-config \
                    libssl-dev \
                    libffi-dev \
                    >/dev/null 2>&1
                if [ "$VERBOSE" -eq 1 ]; then
                    ok "System dependencies installed"
                fi
            fi
            
            for dep in "${MISSING_REQUIRED[@]}"; do
                if [ "$VERBOSE" -eq 1 ]; then
                    step "Installing $dep..."
                fi
                case "$dep" in
                    git)
                        pkg_install git || fatal "Failed to install git. Install manually and re-run."
                        if [ "$VERBOSE" -eq 1 ]; then
                            ok "git installed"
                        fi
                        ;;
                    node|npm)
                        if [ "$IS_MACOS" = true ] && [ "$PKG_MGR" = "brew" ]; then
                            brew install node 2>/dev/null || fatal "Failed to install node via brew"
                        elif [ "$IS_TERMUX" = true ]; then
                            pkg install -y nodejs 2>/dev/null || fatal "Failed to install node"
                        elif [ "$PKG_MGR" = "apt" ]; then
                            if cmd_exists curl; then
                                curl -fsSL https://deb.nodesource.com/setup_20.x 2>/dev/null | sudo -E bash - 2>/dev/null
                                sudo apt-get install -y -qq nodejs 2>/dev/null || fatal "Failed to install node"
                            else
                                sudo apt-get update -qq && sudo apt-get install -y -qq nodejs npm 2>/dev/null \
                                    || fatal "Failed to install node"
                            fi
                        elif [ "$PKG_MGR" = "pacman" ]; then
                            pkg_install nodejs || fatal "Failed to install node"
                            pkg_install npm || true
                        elif [ "$PKG_MGR" = "dnf" ] || [ "$PKG_MGR" = "yum" ]; then
                            pkg_install nodejs || fatal "Failed to install node"
                        elif [ "$PKG_MGR" = "apk" ]; then
                            pkg_install nodejs || fatal "Failed to install node"
                            pkg_install npm || true
                        elif [ "$IS_MACOS" = true ]; then
                            # macOS without brew, use the official installer
                            if [ "$VERBOSE" -eq 1 ]; then
                                step "Downloading Node.js installer for macOS..."
                            fi
                            local node_pkg="/tmp/node-installer.pkg"
                            local node_arch="x64"
                            [ "$ARCH" = "arm64" ] && node_arch="arm64"
                            curl -fsSL "https://nodejs.org/dist/v20.18.0/node-v20.18.0-darwin-${node_arch}.tar.gz" -o /tmp/node.tar.gz 2>/dev/null \
                                && mkdir -p "$HOME/.local" && tar xzf /tmp/node.tar.gz -C "$HOME/.local" --strip-components=1 \
                                && rm -f /tmp/node.tar.gz \
                                || fatal "Failed to install Node.js. Install from https://nodejs.org"
                        else
                            fatal "Cannot auto-install Node.js for your system. Install it from https://nodejs.org"
                        fi
                        if [ "$VERBOSE" -eq 1 ]; then
                            ok "node installed"
                        fi
                        ;;
                esac
            done
            if [ "$VERBOSE" -eq 1 ]; then
                echo ""
            fi
        else
            fatal "Cannot continue without: ${MISSING_REQUIRED[*]}"
        fi
    fi
    
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "prereq" "complete"
    else
        ok "Prerequisites checked"
    fi

    # ── Step 7: Install frontend dependencies ─────────────────────────────────────
    if [ "$VERBOSE" -eq 1 ]; then
        divider
    fi
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "frontend" "loading"
    else
        check_disk_space "$PROJECT_ROOT" 500
        step "Installing frontend dependencies..."
    fi

    # Check if node_modules is up to date (skip if package.json hasn't changed)
    local need_npm=true
    if [ -d "$PROJECT_ROOT/node_modules" ] && [ -f "$PROJECT_ROOT/node_modules/.package-lock.json" ]; then
        if [ "$PROJECT_ROOT/package.json" -ot "$PROJECT_ROOT/node_modules/.package-lock.json" ] 2>/dev/null; then
            need_npm=false
            if [ "$VERBOSE" -eq 1 ]; then
                ok "npm packages already up to date"
            fi
        fi
    fi

    if [ "$need_npm" = true ]; then
        if [ "$VERBOSE" -eq 1 ]; then
            (cd "$PROJECT_ROOT" && retry npm install --prefer-offline --no-audit --no-fund --loglevel=error) \
                || fatal "npm install failed. Check your internet connection and disk space."
        else
            (cd "$PROJECT_ROOT" && retry npm install --prefer-offline --no-audit --no-fund --loglevel=error >/dev/null 2>&1) \
                || fatal "npm install failed. Check your internet connection and disk space."
        fi
        if [ "$VERBOSE" -eq 1 ]; then
            ok "npm packages installed"
        fi
    fi

    if [ "$VERBOSE" -eq 1 ]; then
        step "Building frontend..."
    fi

    # Skip rebuild if dist is newer than src
    local need_build=true
    if [ -d "$PROJECT_ROOT/dist" ] && [ -f "$PROJECT_ROOT/package.json" ]; then
        if [ "$PROJECT_ROOT/package.json" -ot "$PROJECT_ROOT/dist" ] 2>/dev/null; then
            need_build=false
            if [ "$VERBOSE" -eq 1 ]; then
                ok "Frontend already built (dist newer than package.json)"
            fi
        fi
    fi

    if [ "$need_build" = true ]; then
        if [ "$VERBOSE" -eq 1 ]; then
            (cd "$PROJECT_ROOT" && npx vite build 2>&1 | tail -3) \
                || fatal "Frontend build failed"
        else
            (cd "$PROJECT_ROOT" && npx vite build >/dev/null 2>&1) \
                || fatal "Frontend build failed"
        fi
        if [ "$VERBOSE" -eq 1 ]; then
            ok "Frontend built"
        fi
    fi
    
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "frontend" "complete"
    fi

    # ── Step 8: Build Python bridge ─────────────────────────────────────────
    if [ "$VERBOSE" -eq 1 ]; then
        divider
    fi
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "bridge" "loading"
    else
        step "Building bridge..."
    fi

    BRIDGE_TYPE=""
    BRIDGE_BIN=""

    if [ "$HAS_RUST" = true ] && [ -f "$PROJECT_ROOT/bridge-rs/Cargo.toml" ]; then
        if [ "$VERBOSE" -eq 1 ]; then
            step "Building Rust bridge (high-performance)..."
        fi

        # Skip rebuild if binary exists and is newer than Cargo.toml
        local need_rust_build=true
        if [ -f "$PROJECT_ROOT/bridge-rs/target/release/hermes-bridge" ]; then
            if [ "$PROJECT_ROOT/bridge-rs/Cargo.toml" -ot "$PROJECT_ROOT/bridge-rs/target/release/hermes-bridge" ] 2>/dev/null; then
                need_rust_build=false
                if [ "$VERBOSE" -eq 1 ]; then
                    ok "Rust bridge already built"
                fi
            fi
        fi

        local cargo_ok=false
        if [ "$need_rust_build" = true ]; then
            if [ "$VERBOSE" -eq 1 ]; then
                (cd "$PROJECT_ROOT/bridge-rs" && cargo build --release 2>&1 | tail -2) && cargo_ok=true
            else
                (cd "$PROJECT_ROOT/bridge-rs" && cargo build --release >/dev/null 2>&1) && cargo_ok=true
            fi
        else
            cargo_ok=true
        fi
        if [ "$cargo_ok" = true ]; then
            BRIDGE_BIN="$PROJECT_ROOT/bridge-rs/target/release/hermes-bridge"
            if [ -f "$BRIDGE_BIN" ]; then
                local bridge_size
                bridge_size=$(du -h "$BRIDGE_BIN" | cut -f1)
                if [ "$VERBOSE" -eq 1 ]; then
                    ok "Rust bridge built (${bridge_size} binary)"
                fi
                BRIDGE_TYPE="rust"
            fi
        fi

        if [ -z "$BRIDGE_TYPE" ]; then
            if [ "$VERBOSE" -eq 1 ]; then
                warn "Rust bridge build failed, falling back to Python bridge"
            fi
        fi
    fi

    if [ -z "$BRIDGE_TYPE" ] && [ -n "$PYTHON_BIN" ]; then
        if [ "$VERBOSE" -eq 1 ]; then
            step "Setting up Python bridge..."
        fi
        
        # Ensure pip is available
        if ! $PYTHON_BIN -m pip --version >/dev/null 2>&1; then
            if [ "$IS_LINUX" = true ]; then
                if command -v apt-get &>/dev/null; then
                    apt-get update -qq && apt-get install -y python3-pip >/dev/null 2>&1
                fi
            fi
            # If apt fails, try ensurepip
            if ! $PYTHON_BIN -m pip --version >/dev/null 2>&1; then
                $PYTHON_BIN -m ensurepip --upgrade --default-pip >/dev/null 2>&1
            fi
        fi
        
        # Install websockets using pip (with ensurepip if needed)
        local pip_installed=false
        
        # Try pip install (need websockets>=13.0 for asyncio support)
        if $PYTHON_BIN -m pip install 'websockets>=13.0' --quiet 2>/dev/null; then
            pip_installed=true
        else
            # Try with --break-system-packages flag (PEP 668)
            if $PYTHON_BIN -m pip install 'websockets>=13.0' --break-system-packages --quiet 2>/dev/null; then
                pip_installed=true
            fi
            
            # If that failed, try ensurepip then pip
            if [ "$pip_installed" = false ]; then
                if $PYTHON_BIN -m ensurepip --upgrade --default-pip >/dev/null 2>&1; then
                    if $PYTHON_BIN -m pip install 'websockets>=13.0' --quiet 2>/dev/null; then
                        pip_installed=true
                    else
                        # Try with --break-system-packages after ensurepip
                        if $PYTHON_BIN -m pip install 'websockets>=13.0' --break-system-packages --quiet 2>/dev/null; then
                            pip_installed=true
                        fi
                    fi
                fi
            fi
        fi
        
        # If pip fails, try apt install (but warn about old version)
        if [ "$pip_installed" = false ]; then
            if [ "$IS_LINUX" = true ]; then
                if command -v apt-get &>/dev/null; then
                    apt-get update -qq && apt-get install -y python3-websockets >/dev/null 2>&1 && pip_installed=true
                    if [ "$pip_installed" = true ]; then
                        # Check if apt version is too old
                        local ws_version
                        ws_version=$($PYTHON_BIN -c "import websockets; print(websockets.__version__)" 2>/dev/null || echo "0")
                        if [ "$ws_version" != "0" ]; then
                            local major minor
                            major=$(echo "$ws_version" | cut -d. -f1)
                            minor=$(echo "$ws_version" | cut -d. -f2)
                            if [ "$major" -lt 13 ]; then
                                if [ "$VERBOSE" -eq 1 ]; then
                                    warn "apt installed websockets $ws_version (need 13.0+), upgrading via pip"
                                fi
                                $PYTHON_BIN -m pip install --upgrade 'websockets>=13.0' >/dev/null 2>&1 && pip_installed=true
                            fi
                        fi
                    fi
                fi
            fi
        fi
        
        if [ "$pip_installed" = true ]; then
            # Verify the installation actually works
            if $PYTHON_BIN -c "from websockets.asyncio.server import serve" 2>/dev/null; then
                if [ "$VERBOSE" -eq 1 ]; then
                    ok "Python bridge ready"
                fi
                BRIDGE_TYPE="python"
            else
                pip_installed=false
                if [ "$VERBOSE" -eq 1 ]; then
                    warn "websockets installed but asyncio module not available (need 13.0+)"
                fi
            fi
        fi
        
        if [ "$pip_installed" = false ]; then
            if [ "$VERBOSE" -eq 1 ]; then
                fail "Could not install websockets>=13.0 for Python bridge"
                info "Manual install: $PYTHON_BIN -m pip install 'websockets>=13.0'"
                info "Or install Rust for faster bridge: https://rustup.rs"
            else
                static_msg "ERROR: Could not install websockets for Python bridge"
                static_msg "Run: $PYTHON_BIN -m pip install 'websockets>=13.0'"
                static_msg "Or install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
            fi
        fi
    fi

    if [ -z "$BRIDGE_TYPE" ]; then
        if [ "$VERBOSE" -eq 1 ]; then
            warn "No bridge available! Install either Rust or Python."
            info "Rust:   https://rustup.rs"
            info "Python: https://python.org"
        fi
    fi
    
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "bridge" "complete"
    fi

    # ── Step 9: Apply speed patches to hermes-agent ──────────────────────────────────
    if [ "$VERBOSE" -eq 1 ]; then
        divider
    fi
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "patches" "loading"
    else
        step "Applying speed patches to hermes-agent..."
    fi

    if [ -n "$PYTHON_BIN" ] && [ -f "$PROJECT_ROOT/patches/apply_speed.py" ]; then
        if [ "$VERBOSE" -eq 1 ]; then
            $PYTHON_BIN "$PROJECT_ROOT/patches/apply_speed.py" --hermes-dir="$HERMES_AGENT_DIR" 2>&1 \
                || warn "Speed patches failed (non-fatal)"
        else
            $PYTHON_BIN "$PROJECT_ROOT/patches/apply_speed.py" --hermes-dir="$HERMES_AGENT_DIR" >/dev/null 2>&1 \
                || true
        fi
    else
        if [ "$VERBOSE" -eq 1 ]; then
            info "Skipping speed patches (no Python or patch script not found)"
        fi
    fi
    
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "patches" "complete"
    fi

    # ── Step 10: Create launcher ───────────────────────────────────────
    if [ "$VERBOSE" -eq 1 ]; then
        divider
    fi
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "launcher" "loading"
    else
        step "Creating launcher..."
    fi

    local launcher="$PROJECT_ROOT/start.sh"
    cat > "$launcher" << 'LAUNCHER_HEAD'
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER_HEAD

    # Embed discovered paths
    cat >> "$launcher" << LAUNCHER_VARS
HERMES_AGENT_DIR="${HERMES_AGENT_DIR}"
BRIDGE_TYPE="${BRIDGE_TYPE}"
LAUNCHER_VARS

    cat >> "$launcher" << 'LAUNCHER_BODY'

cleanup() {
    [ -n "${BRIDGE_PID:-}" ] && kill "$BRIDGE_PID" 2>/dev/null
    [ -n "${VITE_PID:-}" ] && kill "$VITE_PID" 2>/dev/null
    wait 2>/dev/null
}
trap cleanup EXIT INT TERM

if [ "$BRIDGE_TYPE" = "rust" ] && [ -f "$DIR/bridge-rs/target/release/hermes-bridge" ]; then
    echo -e "\033[0;36m→\033[0m Starting Rust bridge on ws://127.0.0.1:9120"
    HERMES_AGENT_DIR="$HERMES_AGENT_DIR" "$DIR/bridge-rs/target/release/hermes-bridge" &
    BRIDGE_PID=$!
elif [ -f "$DIR/bridge/server.py" ]; then
    PYTHON=""
    for py in "$HERMES_AGENT_DIR/.venv/bin/python" "$HERMES_AGENT_DIR/venv/bin/python" python3 python; do
        if command -v "$py" &>/dev/null 2>&1 || [ -x "$py" ]; then PYTHON="$py"; break; fi
    done
    if [ -n "$PYTHON" ]; then
        echo -e "\033[0;36m→\033[0m Starting Python bridge on ws://127.0.0.1:9120"
        HERMES_AGENT_DIR="$HERMES_AGENT_DIR" "$PYTHON" "$DIR/bridge/server.py" &
        BRIDGE_PID=$!
    else
        echo -e "\033[0;31m✗\033[0m No bridge available. Install Rust or Python."
        exit 1
    fi
else
    echo -e "\033[0;31m✗\033[0m Bridge not found."
    exit 1
fi

# Wait for bridge, then verify it started
sleep 1
if ! kill -0 "$BRIDGE_PID" 2>/dev/null; then
    echo -e "\033[0;38;2;251;44;54m✗\033[0m Bridge failed to start. Check port 9120."
    exit 1
fi

# Wait for bridge to be listening on the socket (up to 10 seconds)
max_wait=10 waited=0
while [ $waited -lt $max_wait ]; do
    if command -v ss &>/dev/null && ss -tlnp 2>/dev/null | grep -q ':9120 '; then
        break
    elif command -v lsof &>/dev/null && lsof -i :9120 &>/dev/null; then
        break
    elif command -v nc &>/dev/null && nc -z 127.0.0.1 9120 2>/dev/null; then
        break
    fi
    sleep 1
    waited=$((waited + 1))
done

if [ $waited -ge $max_wait ]; then
    echo -e "\033[0;38;2;251,44,54m✗\033[0m Bridge started but not listening on ws://127.0.0.1:9120 after $max_wait seconds."
    exit 1
fi

# Check if port 5173 is free
if command -v ss &>/dev/null && ss -tlnp 2>/dev/null | grep -q ':5173 '; then
    echo -e "\033[1;38;2;255,230,137m⚠\033[0m Port 5173 already in use, Vite will pick another port"
elif command -v lsof &>/dev/null && lsof -i :5173 &>/dev/null; then
    echo -e "\033[1;38;2;255,230,137m⚠\033[0m Port 5173 already in use, Vite will pick another port"
fi

echo -e "\033[0;36m→\033[0m Starting frontend on http://localhost:5173"

(cd "$DIR" && npx vite --host 2>/dev/null) &
VITE_PID=$!

echo ""
# Detect terminal size for banner
TERM_COLS=80
command -v tput &>/dev/null && TERM_COLS=$(tput cols 2>/dev/null || echo 80)

echo ""
if [ "$TERM_COLS" -lt 60 ]; then
    # Simple banner for small terminals
    echo -e "\033[1;38;2;255;172;2m  Hermes-Web ready!\033[0m"
    echo ""
    echo -e "  → http://localhost:5173"
    echo -e "  → Bridge: ws://127.0.0.1:9120"
else
    # Full banner for larger terminals
    echo -e "\033[1;38;2;255;172;2m  ╔══════════════════════════════════════╗\033[0m"
    echo -e "\033[1;38;2;255;172;2m  ║\033[0m  Hermes-Web ready!                  \033[1;38;2;255;172;2m║\033[0m"
    echo -e "\033[1;38;2;255;172;2m  ║\033[0m                                      \033[1;38;2;255;172;2m║\033[0m"
    echo -e "\033[1;38;2;255;172;2m  ║\033[0m  → http://localhost:5173             \033[1;38;2;255;172;2m║\033[0m"
    echo -e "\033[1;38;2;255;172;2m  ║\033[0m  → Bridge: ws://127.0.0.1:9120       \033[1;38;2;255;172;2m║\033[0m"
    echo -e "\033[1;38;2;255;172;2m  ╚══════════════════════════════════════╝\033[0m"
fi
echo ""
echo -e "\033[2m  Press Ctrl+C to stop\033[0m"
echo ""

wait
LAUNCHER_BODY

    chmod +x "$launcher"
    if [ "$VERBOSE" -eq 1 ]; then
        ok "Launcher created: ${BOLD}start.sh${RST}"
    fi
    
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "launcher" "complete"
    fi

    # ── Step 11: PATH registration ────────────────────────────────────
    if [ "$VERBOSE" -eq 1 ]; then
        divider
    fi
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "command" "loading"
    else
        step "Registering hermes-web command..."
    fi

    # Determine bin directory
    local bin_dir="$HOME/.local/bin"
    if [ "$IS_TERMUX" = true ]; then
        # Termux: $PREFIX/bin is already on PATH by default
        bin_dir="${PREFIX:-/data/data/com.termux/files/usr}/bin"
    fi
    
    # Create bin directory if it doesn't exist
    if [ ! -d "$bin_dir" ]; then
        mkdir -p "$bin_dir" || {
            warn "Failed to create $bin_dir"
            if [ "$IS_TERMUX" = false ]; then
                warn "hermes-web command may not be available on PATH"
            fi
        }
    fi

    # Create a wrapper script
    local wrapper="$bin_dir/hermes-web"
    cat > "$wrapper" << WRAPPER_EOF
#!/usr/bin/env bash
exec bash "$PROJECT_ROOT/start.sh" "\$@"
WRAPPER_EOF
    chmod +x "$wrapper"
    if [ "$VERBOSE" -eq 1 ]; then
        ok "hermes-web command → $bin_dir/hermes-web"
    fi

    # Ensure bin dir is on PATH (Termux $PREFIX/bin is already on PATH)
    if [ "$IS_TERMUX" = true ]; then
        # Termux: $PREFIX/bin is on PATH by default, no action needed
        if [ "$VERBOSE" -eq 1 ]; then
            ok "Termux: $bin_dir is on PATH by default"
        fi
    elif ! echo "$PATH" | tr ':' '\n' | grep -q "^$bin_dir$" 2>/dev/null; then
        # Non-Termux: try to add ~/.local/bin to PATH
        local shell_rc=""
        case "${SHELL:-}" in
            *zsh)   shell_rc="$HOME/.zshrc" ;;
            *bash)  shell_rc="$HOME/.bashrc"; [ ! -f "$shell_rc" ] && shell_rc="$HOME/.bash_profile" ;;
            *fish)  shell_rc="$HOME/.config/fish/config.fish" ;;
        esac
        if [ -z "$shell_rc" ]; then
            [ -f "$HOME/.zshrc" ] && shell_rc="$HOME/.zshrc"
            [ -f "$HOME/.bashrc" ] && shell_rc="$HOME/.bashrc"
        fi

        if [ -n "$shell_rc" ]; then
            if ! grep -q 'hermes-web\|\.local/bin' "$shell_rc" 2>/dev/null; then
                echo "" >> "$shell_rc"
                echo "# Hermes-Web" >> "$shell_rc"
                case "$shell_rc" in
                    *fish*)
                        echo 'fish_add_path -g $HOME/.local/bin' >> "$shell_rc"
                        ;;
                    *)
                        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$shell_rc"
                        ;;
                esac
                if [ "$VERBOSE" -eq 1 ]; then
                    ok "Added to PATH in $(basename "$shell_rc")"
                fi
            fi
        else
            warn "Could not detect shell config file"
        fi

        # Warn if still not on PATH after attempting to add it
        if ! echo "$PATH" | tr ':' '\n' | grep -q "^$bin_dir$" 2>/dev/null; then
            warn "$bin_dir is not on PATH. Restart your shell or run: export PATH=\"$bin_dir:\$PATH\""
        fi
    fi
    
    if [ "$VERBOSE" -eq 0 ]; then
        update_step_status "command" "complete"
    fi

    # ── Done ─────────────────────────────────────────────────────────
    if [ "$VERBOSE" -eq 1 ]; then
        divider
    else
        echo ""
    fi
    echo ""
    # Plain-text lines for width calculation (no leading spaces, no ANSI)
    local p1="⚕ Installation complete!"
    local p2="Start:         hermes-web  or  bash $PROJECT_ROOT/start.sh"
    local p3="Bridge:        ${BRIDGE_TYPE:-none} on ws://127.0.0.1:9120"
    local p4="Frontend:      http://localhost:5173"
    local p5="hermes-agent:  $HERMES_AGENT_DIR"

    # Find the widest line
    local max_len=0
    for line in "$p1" "$p2" "$p3" "$p4" "$p5"; do
        [ ${#line} -gt $max_len ] && max_len=${#line}
    done
    local w=$((max_len + 4))  # 2 padding each side

    # Detect terminal size
    local cols=80
    command -v tput &>/dev/null && cols=$(tput cols 2>/dev/null || echo 80)

    # Helper: pad styled text using plain text length for measurement
    box_line() {
        local plain_len=${#1} styled="$2"
        local pad=$((w - plain_len))
        [ $pad -lt 0 ] && pad=0
        local spaces
        printf -v spaces '%*s' "$pad" ''
        echo -e "${GOLD}  ║${RST}  ${styled}${spaces}  ${GOLD}║${RST}"
    }

    if [ "$cols" -lt 60 ]; then
        echo -e "${GOLD}  ⚕ Installation complete!${RST}"
        echo ""
        echo -e "  ${BOLD}Start:${RST}         ${CYAN}hermes-web${RST}"
        echo -e "  ${BOLD}Bridge:${RST}        ${BRIDGE_TYPE:-none} ${DIM}on ws://127.0.0.1:9120${RST}"
        echo -e "  ${BOLD}Frontend:${RST}      ${DIM}http://localhost:5173${RST}"
        echo -e "  ${BOLD}hermes-agent:${RST}  ${DIM}$HERMES_AGENT_DIR${RST}"
    else
        local border
        border=$(printf '═%.0s' $(seq 1 $((w + 4))))
        echo -e "${GOLD}  ╔${border}╗${RST}"
        box_line "$p1" "${GOLD}⚕${RST} Installation complete!"
        box_line "" ""
        box_line "$p2" "${BOLD}Start:${RST}         ${CYAN}hermes-web${RST}  ${DIM}or${RST}  ${CYAN}bash $PROJECT_ROOT/start.sh${RST}"
        box_line "$p3" "${BOLD}Bridge:${RST}        ${BRIDGE_TYPE:-none} ${DIM}on ws://127.0.0.1:9120${RST}"
        box_line "$p4" "${BOLD}Frontend:${RST}      ${DIM}http://localhost:5173${RST}"
        box_line "$p5" "${BOLD}hermes-agent:${RST}  ${DIM}$HERMES_AGENT_DIR${RST}"
        echo -e "${GOLD}  ╚${border}╝${RST}"
    fi
    echo ""
    if [ -z "$BRIDGE_TYPE" ]; then
        warn "No bridge available, install Rust (https://rustup.rs) or Python 3.10+ and re-run"
    elif [ "$BRIDGE_TYPE" = "python" ]; then
        if [ "$VERBOSE" -eq 1 ]; then
            info "Speed tip: install Rust (https://rustup.rs) and re-run for 10x faster bridge startup"
        fi
    fi
    echo ""
    info "Run ${CYAN}VERBOSE=1 bash scripts/install.sh${RST} for detailed logs"
    echo ""

    if [ ! -d "$HERMES_AGENT_DIR/venv" ] && [ ! -d "$HERMES_AGENT_DIR/.venv" ]; then
        echo ""
        warn "hermes-agent is not set up yet!"
        if [ "$VERBOSE" -eq 1 ]; then
            info "Run:  cd $HERMES_AGENT_DIR && bash setup-hermes.sh"
        else
            static_msg "  ${DIM}Run:  cd $HERMES_AGENT_DIR && bash setup-hermes.sh${RST}"
        fi
    fi

    echo ""
    if [ "$VERBOSE" -eq 1 ]; then
        info "Re-run this script anytime to update. Your data is never wiped."
    fi
    echo ""

    # Ask to start
    read -rp "$(echo -e "${AMBER}→${RST} Start hermes-web now? [Y/n] ")" reply
    if [[ "${reply:-Y}" =~ ^[Yy]$ ]]; then
        echo ""
        exec bash "$launcher"
    fi
}

main "$@"
