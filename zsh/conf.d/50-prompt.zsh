# Prompt, rebuilt before each command:
#   (venv) ✔ ~/dir [branch|✚staged…changed ?untracked]
#   12:34:56 $
autoload -Uz add-zsh-hook colors && colors

_dotfiles_prompt() {
  local rc=$? env="" mark git="" branch st staged changed untracked
  [[ -n $VIRTUAL_ENV ]] && env+="(${VIRTUAL_ENV:t}) "
  [[ -n $CONDA_DEFAULT_ENV ]] && env+="(%F{cyan}$CONDA_DEFAULT_ENV%f) "
  (( rc == 0 )) && mark='✔' || mark='%F{red}✖%f'
  if branch=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null); then
    st=$(git status --porcelain 2>/dev/null)
    staged=$(grep -c '^[AMDRC]' <<<"$st")
    changed=$(grep -c '^.[AMDRC]' <<<"$st")
    untracked=$(grep -c '^??' <<<"$st")
    git="[${branch//\%/%%}"
    (( staged + changed )) && git+="|✚${staged}…${changed}"
    (( untracked )) && git+=" ?${untracked}"
    git+="] "
  fi
  PROMPT="${env}${mark} %~ ${git}"$'\n''%* $ '
}
add-zsh-hook precmd _dotfiles_prompt
