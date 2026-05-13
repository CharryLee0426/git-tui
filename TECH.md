# TECH

Technical notes for `guitui`.

## Runtime

- Language: JavaScript ESM.
- Minimum Node.js: 20.
- TUI framework: `blessed`.
- Entry point: `bin/guitui.js`.
- Main orchestration: `src/app.js`.

The executable accepts an optional repository path:

```bash
node ./bin/guitui.js /path/to/repo
```

If no path is passed, it uses `process.cwd()`.

## Architecture

`src/app.js` owns application bootstrapping, shared state, tab routing, and keybindings. Feature logic is split into focused modules:

- `src/config.js`: tabs, ignored names, text extensions, agent model, and help content.
- `src/theme.js`: theme detection and palette creation.
- `src/ui.js`: shared Blessed widget factories.
- `src/shell.js`: generic command wrappers.
- `src/git.js`: Git command wrappers and branch/repo helpers.
- `src/highlight.js`: tag escaping and syntax highlighting.
- `src/repository.js`: file tree building, file previews, context previews, and file diffs.
- `src/commit.js`: commit graph entries, commit detail rendering, working-tree commit helpers, and patch coloring.
- `src/discovery.js`: issue discovery and project search.
- `src/agent.js`: OpenAI request construction, repository context, response parsing, and source extraction.

The UI is organized around a single application state object and a fixed three-pane layout:

- Header: tab navigation and current mode.
- Sidebar: file tree, changed files, issues, search results, or help topics.
- Center: tab-specific control panel, commit graph, or commit form.
- Right pane: file preview, commit detail, diff preview, agent transcript, or help content.
- Bottom input: natural-language agent prompts and slash commands.

The active tab controls how these panes are populated through tab render functions:

- `setRepository`
- `setCommit`
- `setIssues`
- `setAgents`
- `setSearch`
- `setHelp`

`applyView` routes the active tab to the correct render function.

## State Model

The core state includes:

- `cwd`: target repository directory.
- `activeTab`: active top-level view.
- `mode`: short status text rendered in the header.
- `files`: scanned file tree.
- `statusMap`: `git status --short` mapped by file path.
- `commits`: parsed commit graph entries.
- `viewFiles` and `viewEntries`: temporary tab-specific sidebar data.
- `searchQuery` and `searchResults`.
- `agentMessages`, `agentBusy`, `agentResponseId`.
- `commitMessage`, `commitPreviewedFile`.
- `editor`: active built-in editor session, or `null`.

## Git Integration

Git commands are executed through `execFileSync` wrappers:

- `git(args, cwd)` returns stdout or an empty string.
- `gitOk(args, cwd)` returns whether a Git command exits successfully.

Repository features use standard Git commands:

- File status: `git status --short`
- Branch list: `git branch --all --format=...`
- Commit graph: `git log --graph --decorate --all ...`
- Commit metadata: `git show -s --format=...`
- File stats: `git show --numstat`
- Patches: `git show --patch`
- Diffs: `git diff`, `git diff --cached`
- Staging: `git add -- <file>`
- Unstaging: `git restore --staged -- <file>`
- Commit creation: `git commit -m <message>`

## Repository View

`commitEntries` builds a graph across all branches. It parses graph text, hash, decorations, author, age, and subject. Commits contained by the current branch are highlighted.

`renderCommitDetails` turns a selected commit into a structured right-pane document:

- Subject and metadata.
- Full and short hash.
- Current branch containment.
- Author and date.
- Parents and refs.
- Optional commit body.
- Per-file change blocks.

Per-file blocks are produced by `renderFileChangeBlock`, using:

- `commitFileChanges` for `--numstat`.
- `commitDiffBlocks` for per-file patch blocks.
- `diffStatus` for ADDED, MODIFIED, DELETED, and RENAMED labels.
- `compactPatch` to remove noisy headers from each patch preview.

## Commit View

The Commit tab replaces a PR-oriented workflow with a local commit workflow.

Changed files come from `changedFileEntries`, backed by `statusMap`.

File interaction:

1. First Enter previews a selected file diff in the right pane.
2. Second Enter on the same file stages it with `git add`.

Other actions:

- `u`: unstage selected file.
- `m`: populate the bottom input with `/message`.
- `c` or `C`: create commit from staged files.
- `/message <text>`: update commit message.
- `/commit-create`: create commit from command input.

## Syntax Highlighting

Syntax highlighting is intentionally decoupled from file preview and editor rendering.

The `languageHighlighters` registry defines language support:

- `name`
- `extensions`
- `lineComment`
- `keywords`
- `builtins`

Rendering flow:

- `highlighterForFile(filePath)` selects a language by extension.
- `highlightCodeLine(line, language)` tokenizes a single line.
- `highlightLineForFile(filePath, line)` is used by previews, context snippets, and the editor.

Current supported languages:

- Python
- JavaScript and TypeScript
- JSON
- Go

To add a language, add another entry to `languageHighlighters`. Rendering code should not need to change for simple keyword/string/comment highlighting.

## Built-In Editor

The editor is an overlay box that takes over the full screen while active. It stores:

- Target file entry.
- Lines.
- Original content.
- Cursor row and column.
- Scroll row and column.
- Mode: `normal`, `insert`, or `command`.
- Command buffer.
- Dirty flag.

Important functions:

- `openInternalEditor`
- `renderEditor`
- `handleEditorKey`
- `saveEditor`
- `closeEditor`

The editor reuses `highlightLineForFile`, so syntax support is shared with previews.

## Agent Integration

The Agents tab calls the OpenAI Responses API when a freeform input is submitted.

Required environment:

```bash
export OPENAI_API_KEY="sk-..."
```

Optional:

```bash
export OPENAI_MODEL="gpt-5"
```

`callOpenAIAgent` builds a payload with:

- `model`
- `instructions`
- `tools: [{ type: "web_search" }]`
- repository snapshot in the user input
- optional `previous_response_id`

The repository snapshot comes from `commitContext` and includes branch, status, remotes, recent commits, selected-file diff, and selected commit patch.

## Search and Issues

Search:

- Uses `rg --line-number --color never` when available.
- Falls back to scanning text files from the file tree.

Issues:

- Uses `gh issue list` when `gh` is available and the target is a Git repository.
- Falls back to scanning local files for TODO, FIXME, HACK, and BUG markers.

## Key Handling

Most global keys are registered on the Blessed `screen`.

Important focus rules:

- The built-in editor captures keys while `state.editor` is active.
- The right pane has its own scroll bindings.
- Commit diff previews and commit details focus the right pane so scrolling works immediately.
- `b` returns focus to the file list from commit detail/diff panes.
- `c` creates a commit in the Commit tab and focuses the commit graph elsewhere.

## Smoke Test

Use:

```bash
npm run smoke
```

This runs Node syntax checks for the executable and main app file.
