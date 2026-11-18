#!/usr/bin/env bash
# Install these dotfiles on this machine. Safe to re-run.
#   ./install.sh          symlink mods (a `git pull` updates them live)
#   ./install.sh --copy   copy instead of symlinking
set -euo pipefail

repo="$(cd "$(dirname "$0")" && pwd)"
mode=link
[[ "${1:-}" == "--copy" ]] && mode=copy
app="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
stamp="$(date +%s)"

need() { command -v "$1" >/dev/null 2>&1 || echo "  note: '$1' not found (brew install $2)"; }

if [[ -d "$app" ]]; then
  echo "Herdr App ($app)"
  need fd fd; need rg ripgrep
  mkdir -p "$app/mods" "$app/.dotfiles-backup"
  for src in "$repo"/herdr-app/mods/*/; do
    src="${src%/}"; name="$(basename "$src")"; dst="$app/mods/$name"
    if [[ -L "$dst" ]]; then
      rm "$dst"
    elif [[ -e "$dst" ]]; then
      # Not left inside mods/: Herdr would load the backup as another mod.
      mv "$dst" "$app/.dotfiles-backup/$name.$stamp"
      echo "  moved existing $name to .dotfiles-backup/$name.$stamp"
    fi
    if [[ $mode == link ]]; then ln -s "$src" "$dst"; else cp -R "$src" "$dst"; fi
    echo "  mod $name ($mode)"
    if command -v herdr-app >/dev/null 2>&1; then herdr-app check "$dst" | sed 's/^/  /'; fi
  done
  python3 "$repo/scripts/merge-keys.py" "$app/keys.json" "$repo/herdr-app/keys.json"
else
  echo "Herdr App not found at $app; skipping (open it once, then re-run)"
fi
