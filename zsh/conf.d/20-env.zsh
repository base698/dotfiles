# Environment and line editing.
export EDITOR="${EDITOR:-vim}"
# zsh picks the vi keymap when EDITOR contains "vi", which breaks ctrl+a/e/k/r.
bindkey -e

export CLICOLOR=1
export LSCOLORS=ExFxCxDxBxegedabagacad
export COMPUTERNAME="${COMPUTERNAME:-$(hostname -s)}"

# Ghostty's TERM is unknown to most remote hosts; fall back when its terminfo is missing.
if [[ $TERM == xterm-ghostty ]] && ! infocmp xterm-ghostty &>/dev/null; then
  export TERM=xterm-256color
fi
