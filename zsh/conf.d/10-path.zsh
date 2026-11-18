# PATH. Entries that don't exist on this machine are dropped, duplicates removed.
typeset -U path

# Homebrew goes AFTER the system dirs, so Apple's git/vim/curl and an installed
# python.org python3 keep winning. Flip DOTFILES_BREW_FIRST=1 in ~/.zshenv to prefer brew.
for _p in /opt/homebrew /usr/local; do
  [[ -x $_p/bin/brew ]] && { export HOMEBREW_PREFIX=$_p; break; }
done
unset _p

[[ -z $GOPATH && -d $HOME/workspaces/go-workspace ]] && export GOPATH="$HOME/workspaces/go-workspace"
export GOPATH="${GOPATH:-$HOME/go}"

# Ahead of the system/Homebrew defaults.
path=(
  $HOME/.opencode/bin
  /opt/nvim/bin
  ${HOMEBREW_PREFIX:+$HOMEBREW_PREFIX/opt/postgresql@16/bin}
  $path
)
if [[ -n $HOMEBREW_PREFIX && -n $DOTFILES_BREW_FIRST ]]; then
  path=($HOMEBREW_PREFIX/bin $HOMEBREW_PREFIX/sbin $path)
fi
# After them.
path+=(
  ${HOMEBREW_PREFIX:+$HOMEBREW_PREFIX/bin}
  ${HOMEBREW_PREFIX:+$HOMEBREW_PREFIX/sbin}
  /usr/local/sbin
  $HOME/bin
  $HOME/.local/bin
  /usr/local/go/bin
  $GOPATH/bin
  $HOME/.cargo/bin
  $HOME/.deno/bin
  ${HOMEBREW_PREFIX:+$HOMEBREW_PREFIX/opt/iftop/sbin}
)
path=($^path(N-/))
export PATH
