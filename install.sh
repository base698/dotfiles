#!/usr/bin/env bash
# Install these dotfiles on this machine. Safe to re-run.
#
#   ./install.sh                 everything below
#   ./install.sh zsh git         just those parts (zsh, git, herdr)
#   ./install.sh amythest [-- args]
#                                Amythest's own Mac setup (not in the default set):
#                                local server, amy, Herdr shortcuts, collector.
#                                Args after -- go to its scripts/setup-mac.sh,
#                                e.g. -- --vault ~/work-notes
#   ./install.sh --copy herdr    copy Herdr mods instead of symlinking them
#   ./install.sh --dry-run       show what would change
#
# Anything replaced is moved to ~/.dotfiles-backup/<time>/ (Herdr bits to
# ~/.config/herdr-app/.dotfiles-backup/), never deleted.
set -euo pipefail

repo="$(cd "$(dirname "$0")" && pwd)"
copy=0 dry=0 parts=() passthru=()
while (( $# )); do
  arg="$1"; shift
  case "$arg" in
    --) passthru=("$@"); break ;;
    --copy) copy=1 ;;
    --dry-run|-n) dry=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    zsh|git|herdr|amythest) parts+=("$arg") ;;
    *) echo "unknown part: $arg (zsh, git, herdr, amythest)" >&2; exit 2 ;;
  esac
done
(( ${#parts[@]} )) || parts=(zsh git herdr)

stamp="$(date +%Y%m%d-%H%M%S)"
backup="$HOME/.dotfiles-backup/$stamp"

run() { if (( dry )); then echo "  would: $*"; else "$@"; fi; }

# link <repo file> <target>: symlink target -> repo file, moving whatever was there aside.
link() {
  local src="$1" dst="$2"
  if [[ -L "$dst" && "$(readlink "$dst")" == "$src" ]]; then
    echo "  ok      ${dst/#$HOME/~}"; return
  fi
  if [[ -e "$dst" || -L "$dst" ]]; then
    run mkdir -p "$backup"
    run mv "$dst" "$backup/"
    echo "  moved   ${dst/#$HOME/~} -> ${backup/#$HOME/~}/"
  fi
  run mkdir -p "$(dirname "$dst")"
  run ln -s "$src" "$dst"
  echo "  linked  ${dst/#$HOME/~}"
}

# seed <example> <target>: create a per-machine file from its example, never overwrite.
seed() {
  local src="$1" dst="$2"
  if [[ -e "$dst" ]]; then echo "  kept    ${dst/#$HOME/~}"; return; fi
  run cp "$src" "$dst"
  echo "  created ${dst/#$HOME/~} (edit it for this machine)"
}

install_zsh() {
  echo "zsh"
  link "$repo/zsh/zshrc" "$HOME/.zshrc"
  seed "$repo/zsh/zshrc.local.example" "$HOME/.zshrc.local"
}

install_git() {
  echo "git"
  link "$repo/git/gitconfig" "$HOME/.gitconfig"
  if [[ ! -e "$HOME/.gitconfig.local" ]]; then
    seed "$repo/git/gitconfig.local.example" "$HOME/.gitconfig.local"
    echo "  set your identity: git config --file ~/.gitconfig.local user.email you@work.com"
  else
    echo "  kept    ~/.gitconfig.local"
  fi
}

install_herdr() {
  local app="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
  echo "herdr app (${app/#$HOME/~})"
  if [[ ! -d "$app" ]]; then echo "  not installed here; open Herdr App once, then re-run"; return; fi
  for tool in fd:fd rg:ripgrep; do
    command -v "${tool%%:*}" >/dev/null 2>&1 || echo "  note: ${tool%%:*} missing (brew install ${tool##*:})"
  done
  local hb="$app/.dotfiles-backup"
  for src in "$repo"/herdr-app/mods/*/; do
    src="${src%/}"; local name dst; name="$(basename "$src")"; dst="$app/mods/$name"
    if (( ! copy )) && [[ -L "$dst" && "$(readlink "$dst")" == "$src" ]]; then
      echo "  ok      mod $name"
    else
      if [[ -L "$dst" ]]; then run rm "$dst"
      elif [[ -e "$dst" ]]; then
        # Not left inside mods/: Herdr would load the backup as another mod.
        run mkdir -p "$hb"; run mv "$dst" "$hb/$name.$stamp"
        echo "  moved   mod $name -> .dotfiles-backup/$name.$stamp"
      fi
      if (( copy )); then run cp -R "$src" "$dst"; else run ln -s "$src" "$dst"; fi
      echo "  $( (( copy )) && echo copied || echo linked)  mod $name"
    fi
    if (( ! dry )) && command -v herdr-app >/dev/null 2>&1; then herdr-app check "$dst" | sed 's/^/  /'; fi
  done
  if (( dry )); then echo "  would: merge herdr-app/keys.json into keys.json"
  else python3 "$repo/scripts/merge-keys.py" "$app/keys.json" "$repo/herdr-app/keys.json"; fi
  # tab-history is a kept invisible window: open it once and Herdr reopens it on every start.
  # (mod.open toggles, so only when it isn't already open.)
  if (( ! dry )) && command -v herdr-app >/dev/null 2>&1; then
    if herdr-app status 2>/dev/null | python3 -c 'import json,sys; sys.exit(0 if "tab-history" in json.load(sys.stdin).get("overlays", []) else 1)'; then
      echo "  ok      tab-history running"
    elif herdr-app do mod.open --name tab-history >/dev/null 2>&1; then
      echo "  started tab-history"
    else
      echo "  start Herdr App, then re-run to start tab-history"
    fi
  fi
}

install_amythest() {
  local dir="${AMYTHEST_DIR:-$HOME/workspaces/amythest}"
  echo "amythest (${dir/#$HOME/~})"
  if [[ ! -x "$dir/scripts/setup-mac.sh" ]]; then
    echo "  not found: git clone https://github.com/base698/amythest.git ${dir/#$HOME/~}"
    echo "  (or set AMYTHEST_DIR), then re-run"
    return
  fi
  local args=(${passthru[@]+"${passthru[@]}"})
  (( dry )) && args+=(--dry-run)
  "$dir/scripts/setup-mac.sh" ${args[@]+"${args[@]}"}
}

for part in "${parts[@]}"; do "install_$part"; done
(( dry )) && echo "(dry run: nothing changed)"
[[ " ${parts[*]} " == *" zsh "* ]] && (( ! dry )) && echo "open a new shell (or: exec zsh) to load it"
exit 0
