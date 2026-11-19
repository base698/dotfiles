# dotfiles

Public, portable bits of my setup (macOS, zsh): shell, git and Herdr App.
Everything specific to one machine lives in untracked `*.local` files.

```sh
git clone https://github.com/base698/dotfiles.git ~/workspaces/dotfiles
cd ~/workspaces/dotfiles
./install.sh --dry-run        # see what it would change
./install.sh                  # or just some parts: ./install.sh zsh git herdr
```

`install.sh` is safe to re-run. It symlinks files into place (so `git pull`
updates them), moves anything it replaces to `~/.dotfiles-backup/<time>/`, and
creates the per-machine files from their examples only if they don't exist.

| Part | Linked | Per-machine (never committed) |
|---|---|---|
| `zsh` | `~/.zshrc` → `zsh/zshrc`, which loads `zsh/conf.d/*.zsh` | `~/.zshrc.local` (loaded last), `~/.env_secrets` |
| `git` | `~/.gitconfig` → `git/gitconfig` | `~/.gitconfig.local`: name, email, signing key, SSH URL rewrite |
| `herdr` | each mod in `herdr-app/mods/` → `~/.config/herdr-app/mods/` | key bindings are **merged** into Herdr's `keys.json` |

`./install.sh amythest` (opt-in, not part of the default run) hands off to
[Amythest](https://github.com/base698/amythest)'s `scripts/setup-mac.sh` from a
clone at `~/workspaces/amythest` (or `$AMYTHEST_DIR`): local server as a launchd
agent, `amy`, Herdr shortcuts, and the Work collector. Pass its options after
`--`, e.g. `./install.sh amythest -- --vault ~/work-notes`.

## zsh

`conf.d/` in load order: `10-path` (missing dirs dropped, no duplicates; Homebrew
after the system dirs unless `DOTFILES_BREW_FIRST=1`), `20-env`, `30-history`
(50k lines, timestamped), `40-aliases`, `50-prompt`, `60-tools` (nvm, deno,
gcloud, conda, Gas Town: each only if installed).

Prompt: `(venv) ✔ ~/dir [branch|✚staged…changed ?untracked]`, then the time.

Shell shortcuts call git aliases so there's one definition: `s` → `git st`,
`l` → `git log`, `lg` → `git lg`. Also `ll`, `f` (find by name), `g` (grep -E), `cb` (clipboard).

## git

Aliases (`git aliases` lists them): `st co sw ci br pl ps df dc amend unstage`,
`lg` (graph of all branches), `last`, `w` (patches, ignoring whitespace),
`recent` (branches by last commit), `gone` (local branches whose upstream was
deleted; lists only), `root`.

Defaults: `init.defaultBranch=main`, `push.autoSetupRemote`, `fetch.prune`, diff3 conflicts.

## Herdr App: Ctrl+B prefix (`amythest-prefix`) and `tab-history`

tmux-style prefix: press Ctrl+B, then a key (wait, or press `?`, for the list).
Based on Herdr's `tmux-prefix`, plus:

| Key | Does |
|---|---|
| `L` | back to the last tab, in any space; press again to return (like `cd -`) |
| `u` | the agent that most recently started needing you (blocked, or finished while you weren't looking); press again for the next one |
| `a` `A` `f` | Amythest add / workspace / find (when Amythest is set up) |

`tab-history` records visited tabs (shared state `tab.history`) for `L`. Herdr
rebuilds its own layout on every start, so instead of living in the layout it is
a kept 1×1 invisible window, which Herdr reopens on start. `install.sh` opens it
the first time.

## Herdr App: `files-find` (Ctrl+Cmd+F)

A keyboard file browser and finder over the focused pane's folder.
Needs `fd` and `rg` (`brew install fd ripgrep`).

| Mode | Keys |
|---|---|
| **Tree** (default) | `j`/`k` move · `l`/`h` open/close folder · `-` or `u` root up · `C` make the folder the root · `g` repo root · `~` home · `.` hidden files · `R` refresh · `q` close |
| **Name** `/` | fuzzy file names (fd, filtered as you type; space-separated terms) |
| **Text** `?` | content search (rg; plain text, `ctrl-r` for regex) |
| In search | `↑`/`↓` or `ctrl-n`/`ctrl-p` · `tab` switches name ⇄ text · `esc` back to tree · `ctrl-t` show the result in the tree |

Actions on the selected file:

| Key (tree / search) | Does |
|---|---|
| `enter` / `e` / `ctrl-e` | open in your editor in a split beside the pane you came from (text hits open at the line) |
| `t` / `cmd-enter` | open in your editor in a new tab |
| `i` / `ctrl-i` | type the path into the pane you came from (via the clipboard; no Enter) |
| `y` / `ctrl-y` | copy the absolute path |
| `c` / `ctrl-g` | `cd` the pane there (not sent to panes running an agent) |
| `o` / `ctrl-o` | show in Finder |

The editor is `$HERDR_EDITOR`, else `$VISUAL`, else `$EDITOR`, else `vim`,
resolved in an interactive zsh so your `.zshrc` exports apply. The **Edit**
and **Tab** buttons above the preview do the same with the mouse.

Built from the shape of Herdr's own sidebar `files` mod; icons are
[Lucide](https://lucide.dev) (ISC).

## Planned

zsh, tmux, git (with `[include]` for a per-machine `~/.gitconfig.local`),
Neovim, a Brewfile, Herdr core scripts, Claude Code hooks: each scrubbed of
machine-specific paths and kept to things that work on any Mac.
