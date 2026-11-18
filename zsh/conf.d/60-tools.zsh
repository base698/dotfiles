# Optional tools: each loads only if it's installed here.
autoload -Uz compinit && compinit -i

export NVM_DIR="$HOME/.nvm"
[[ -s $NVM_DIR/nvm.sh ]] && source "$NVM_DIR/nvm.sh"
[[ -s $NVM_DIR/bash_completion ]] && source "$NVM_DIR/bash_completion"

[[ -f $HOME/.deno/env ]] && source "$HOME/.deno/env"

if [[ -d $HOME/google-cloud-sdk ]]; then
  source "$HOME/google-cloud-sdk/path.zsh.inc"
  source "$HOME/google-cloud-sdk/completion.zsh.inc"
fi

if [[ -x $HOME/miniconda3/bin/conda ]]; then
  eval "$("$HOME/miniconda3/bin/conda" shell.zsh hook 2>/dev/null)"
fi

# Gas Town (managed by gt)
[[ -f $HOME/.config/gastown/shell-hook.sh ]] && source "$HOME/.config/gastown/shell-hook.sh"
