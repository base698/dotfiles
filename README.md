# dotfiles

Public, portable bits of my setup (macOS, zsh). Right now it holds one
Herdr App mod; more will move in as they're cleaned up.

```sh
git clone https://github.com/base698/dotfiles.git ~/workspaces/dotfiles
cd ~/workspaces/dotfiles && ./install.sh     # or ./install.sh --copy
```

`install.sh` is safe to re-run. It symlinks each mod into
`~/.config/herdr-app/mods/` (so `git pull` updates it live; Herdr hot-reloads)
and **merges** the key bindings into Herdr's `keys.json` rather than replacing it.
Anything it displaces goes to `~/.config/herdr-app/.dotfiles-backup/`.

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
