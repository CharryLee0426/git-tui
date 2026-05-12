# guitui

Keyboard-first Git TUI for browsing a repository, reviewing commits, staging changes, creating commits, editing files, searching code, and asking an OpenAI-powered git assistant about the current work.

## Features

- Repository browser with file preview and syntax highlighting.
- Commit graph across all branches, with current-branch commits highlighted.
- Structured commit detail view with metadata, branch containment, changed files, and per-file patch blocks.
- Commit workflow for previewing diffs, staging files, writing a commit message, and creating commits.
- Built-in Vim-style editor that reuses the TUI syntax highlighter.
- Local issue discovery from TODO, FIXME, HACK, and BUG markers, with optional GitHub issue listing through `gh`.
- Project search using `rg` when available, with a JavaScript fallback.
- OpenAI git assistant using the Responses API with web search available.
- In-app Help tab with keybindings and workflow notes.

## Requirements

- Node.js 20 or newer.
- Git installed and available on `PATH`.
- Optional: `rg` for faster search.
- Optional: GitHub CLI `gh` for GitHub issue data.
- Optional: `OPENAI_API_KEY` for the OpenAI-powered agent.

## Install

```bash
npm install
```

To make `guitui` available from any directory:

```bash
npm run setup-bin
```

By default this creates a symlink at `~/.local/bin/guitui`. If `~/.local/bin` is not on your `PATH`, the script prints the exact shell line to add.

Use a custom bin directory:

```bash
GUITUI_BIN_DIR="$HOME/bin" npm run setup-bin
```

## Run

From this project:

```bash
npm run start
```

Run against another repository:

```bash
node ./bin/guitui.js /path/to/repo
```

If installed as a package, use:

```bash
guitui /path/to/repo
```

## OpenAI Agent

Set your API key before starting the TUI:

```bash
export OPENAI_API_KEY="sk-..."
```

Optionally choose a model:

```bash
export OPENAI_MODEL="gpt-5"
```

The TUI uses your terminal background by default and auto-selects light or dark foreground colors when `COLORFGBG` is available. Override detection when needed:

```bash
export GUITUI_THEME="light" # or "dark"
```

The agent receives local Git context such as selected commit, branch, status, remotes, recent commits, selected file diff, and commit patch. It can use web search when current external information is useful.

## Tabs

### Repository

Browse files, preview code, inspect the commit graph, and review structured commit details. The graph uses all branches and highlights commits contained by the current branch.

### Commit

Review changed files and create commits.

- Press Enter on a changed file to preview its diff in the scrollable right pane.
- Press `s` to stage the selected file.
- Press `u` to unstage the selected file.
- Press `m` to edit the commit message.
- Press `c` to create the commit.

### Issues

Lists GitHub issues when `gh` is installed and authenticated. Otherwise, scans local files for TODO, FIXME, HACK, and BUG markers.

### Agents

Ask natural-language questions about the current repository or selected commit. Slash commands still run locally.

After a response arrives, the transcript pane is focused so you can scroll with `j/k`, PageUp/PageDown, Ctrl-U/Ctrl-D, `g`, and `G`. Press `a` to return to the input, or `v` to focus the transcript again.

### Search

Run `/search <query>` to search project files. Results show surrounding source context.

### Help

Shows in-app usage instructions and keybindings.

## Keybindings

- `1-6`: switch tabs.
- `Tab`, Right, `l`, `]`: next tab.
- `Shift-Tab`, Left, `h`, `[`: previous tab.
- `j/k` or arrows: move in focused lists.
- `b`: focus file browser.
- `c`: in Repository, focus commit graph; in Commit, create commit.
- `a`: focus agent input.
- `v`: focus agent transcript in the Agents tab.
- `Enter`: preview the selected item; in Commit, open the selected file diff preview.
- `d`: show selected file diff.
- `e`: edit selected file in the built-in editor.
- `m`: edit commit message in the Commit tab.
- `s`: stage selected file in the Commit tab.
- `u`: unstage selected file in the Commit tab.
- `r`: refresh.
- `Ctrl-K` or `:`: focus command input.
- `q` or `Ctrl-C`: quit.

Scrollable detail panes support `j/k`, arrows, PageUp/PageDown, Ctrl-U/Ctrl-D, `g`, and `G`.

## Commands

- `/files`: return to the repository browser.
- `/commit`: inspect selected commit.
- `/commit <hash>`: inspect commit by hash prefix.
- `/edit`: edit selected file.
- `/diff`: show selected file diff.
- `/refresh`: reload file tree and Git status.
- `/open <path>`: jump to a file by exact or suffix match.
- `/search <query>`: search file contents.
- `/message <text>`: set Commit tab message.
- `/commit-create`: create a commit from staged files and the current message.
- `/ignore <name>`: hide a directory or file name from the tree.
- `/unignore <name>`: remove a name from the ignore list.
- `git status`: open the Commit tab.

## Built-In Editor

Open a selected file with `e` or `/edit`.

- Normal mode: `h/j/k/l` or arrows move, `0` and `$` jump within a line, `g` and `G` jump to first and last line.
- Normal mode: `i` inserts before cursor, `a` appends after cursor, `o` opens a new line, `x` deletes a character, `dd` deletes a line.
- Insert mode: type normally, Enter inserts a line, Backspace deletes, Esc returns to normal mode.
- Command mode: `:w` saves, `:q` quits if clean, `:q!` discards, `:wq` or `:x` saves and quits.

## Syntax Highlighting

Current built-in highlighting covers:

- Python: `.py`
- JavaScript and TypeScript: `.js`, `.jsx`, `.mjs`, `.ts`, `.tsx`
- Go: `.go`

The highlighter is registry-based so new languages can be added without rewriting preview/editor rendering.

## Verification

```bash
npm run smoke
```
