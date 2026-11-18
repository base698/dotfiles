# Aliases. Git shortcuts call git aliases (see git/gitconfig) so both stay in one place.
alias ll='ls -la'
alias f='find . -name'
alias g='grep -E'
alias s='git st'
alias l='git log'
alias lg='git lg'

if [[ $OSTYPE == darwin* ]]; then
  alias cb=pbcopy
elif (( $+commands[xclip] )); then
  alias cb='xclip -selection clipboard'
fi

(( $+commands[gsed] )) && alias sed=gsed
(( $+commands[shuf] )) || alias shuf="perl -MList::Util=shuffle -e 'print shuffle(<STDIN>);'"

# Remote hosts rarely know local terminal types (Ghostty, kitty, ...).
alias ssh='TERM=xterm-256color command ssh'
alias dockerkill='docker kill $(docker ps -q); docker rm $(docker ps -a -q)'
