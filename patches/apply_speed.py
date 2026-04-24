#!/usr/bin/env python3
"""
Hermes-Web - Speed patches for hermes-agent tui_gateway

Non-destructive patches that speed up the gateway without changing behavior:
  1. Use orjson for JSON if available (3-10x faster serialization)
  2. Move update check to background thread (shaves 200-800ms off startup)
  3. Install orjson if pip is available

Usage:
    python patches/apply_speed.py [--hermes-dir /path/to/hermes-agent]
"""

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERMES_DIR = None
for arg in sys.argv[1:]:
    if arg.startswith("--hermes-dir="):
        HERMES_DIR = Path(arg.split("=", 1)[1])
    elif arg == "--hermes-dir" and sys.argv.index(arg) + 1 < len(sys.argv):
        HERMES_DIR = Path(sys.argv[sys.argv.index(arg) + 1])

if HERMES_DIR is None:
    # Auto-detect
    candidates = [
        Path(__file__).resolve().parent.parent.parent / "hermes-agent",
        Path.home() / "hermes-agent",
        Path.home() / "Desktop" / "hermes-agent",
    ]
    for c in candidates:
        if (c / "tui_gateway" / "server.py").exists():
            HERMES_DIR = c
            break

if HERMES_DIR is None or not (HERMES_DIR / "tui_gateway" / "server.py").exists():
    print("[!] hermes-agent not found. Use --hermes-dir=<path>")
    sys.exit(1)

SERVER_PY = HERMES_DIR / "tui_gateway" / "server.py"
ENTRY_PY = HERMES_DIR / "tui_gateway" / "entry.py"
BACKUP_SUFFIX = ".pre-hermes-web-speed"


def backup(path: Path):
    bak = path.with_suffix(path.suffix + BACKUP_SUFFIX)
    if not bak.exists():
        shutil.copy2(path, bak)
        print(f"  [backup] {path.name} → {bak.name}")


def patch_orjson(text: str) -> str:
    """Replace 'import json' with orjson-first fallback."""
    if "orjson" in text:
        print("  [skip] orjson patch already applied")
        return text

    replacement = """# Speed patch (hermes-web): use orjson if available (3-10x faster)
try:
    import orjson as _orjson
    class _json_compat:
        loads = staticmethod(lambda s: _orjson.loads(s))
        dumps = staticmethod(lambda o, **kw: _orjson.dumps(o).decode())
        @staticmethod
        def load(fp, **kw):
            return _orjson.loads(fp.read())
    json = _json_compat  # type: ignore
except ImportError:
    import json"""

    # Only replace the first bare 'import json' line
    patched = text.replace("import json\n", replacement + "\n", 1)
    if patched != text:
        print("  [patched] import json → orjson with fallback")
    return patched


def patch_prefetch(text: str) -> str:
    """Move prefetch_update_check() into a background thread."""
    if "threading.Thread(target=prefetch_update_check" in text:
        print("  [skip] prefetch patch already applied")
        return text

    old = "    prefetch_update_check()"
    new = "    threading.Thread(target=prefetch_update_check, daemon=True).start()"
    if old in text:
        text = text.replace(old, new, 1)
        print("  [patched] prefetch_update_check → background thread")
    return text


def install_orjson():
    """Try to pip-install orjson into the hermes venv."""
    venv_pip = HERMES_DIR / ".venv" / "bin" / "pip"
    if not venv_pip.exists():
        venv_pip = HERMES_DIR / "venv" / "bin" / "pip"
    if not venv_pip.exists():
        print("  [skip] no venv pip found, skipping orjson install")
        return

    try:
        subprocess.run(
            [str(venv_pip), "install", "orjson", "--quiet"],
            check=True,
            capture_output=True,
        )
        print("  [installed] orjson")
    except Exception as e:
        print(f"  [warn] could not install orjson: {e}")


def main():
    print(f"\n[hermes-web speed patches]")
    print(f"  Target: {HERMES_DIR}")
    print()

    # Patch server.py
    print("Patching tui_gateway/server.py:")
    backup(SERVER_PY)
    text = SERVER_PY.read_text()
    text = patch_orjson(text)
    text = patch_prefetch(text)
    SERVER_PY.write_text(text)

    # Patch entry.py (orjson there too if it imports json)
    if ENTRY_PY.exists():
        entry_text = ENTRY_PY.read_text()
        if "import json" in entry_text and "orjson" not in entry_text:
            print("\nPatching tui_gateway/entry.py:")
            backup(ENTRY_PY)
            entry_text = patch_orjson(entry_text)
            ENTRY_PY.write_text(entry_text)

    # Install orjson
    print("\nInstalling orjson:")
    install_orjson()

    print("\n[✓] Speed patches applied. Restart the bridge to take effect.\n")


if __name__ == "__main__":
    main()
