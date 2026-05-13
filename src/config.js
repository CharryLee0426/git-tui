export const tabs = ["Repository", "Commit", "Issues", "Agents", "Search", "Help"];

export const ignoredNames = new Set([".git", "node_modules", "dist", "build", "target", ".next", ".turbo"]);

export const agentModel = process.env.OPENAI_MODEL || "gpt-5";

export const textExtensions = new Set([
  ".c", ".cc", ".cpp", ".css", ".go", ".h", ".html", ".java", ".js", ".json", ".jsx",
  ".lock", ".md", ".mjs", ".py", ".rs", ".sh", ".sql", ".toml", ".ts", ".tsx", ".txt",
  ".yaml", ".yml", ".zsh"
]);

export const helpTopics = [
  {
    title: "Quick start",
    content: [
      "{bold}Quick start{/bold}",
      "Run `guitui` from a Git repository, or pass a path: `guitui /path/to/repo`.",
      "Use the left panel to browse files, the middle panel for the active tool, and the right panel for details.",
      "The bottom input accepts natural-language agent questions and slash commands."
    ]
  },
  {
    title: "Navigation",
    content: [
      "{bold}Navigation{/bold}",
      "1-6 switches directly to a tab.",
      "Tab, right arrow, l, or ] moves to the next tab.",
      "Shift-tab, left arrow, h, or [ moves to the previous tab.",
      "j/k or arrow keys move through focused lists.",
      "b focuses the file browser. c focuses the commit graph. a focuses the agent input.",
      "Enter previews the selected file, issue, search result, or commit details depending on focus.",
      "q or Ctrl-C quits."
    ]
  },
  {
    title: "Repository view",
    content: [
      "{bold}Repository tab{/bold}",
      "Browse the working directory and inspect file contents.",
      "Python, JavaScript, TypeScript, JSON, and Go files are syntax highlighted in previews and context snippets.",
      "The middle panel shows recent commits when inside a Git repo.",
      "Select a commit and press Enter to show `git show --stat --patch` output.",
      "Press d to show the selected file diff. Press e to open the selected file in the built-in editor.",
      "Press r to refresh the file tree, Git status, and commit list."
    ]
  },
  {
    title: "Editor",
    content: [
      "{bold}Built-in editor{/bold}",
      "Press e or run `/edit` on a file to open the in-TUI editor.",
      "The editor uses the same syntax highlighting as file previews.",
      "Normal mode: h/j/k/l or arrows move, 0 and $ jump within a line, g and G jump to first/last line.",
      "Normal mode: i inserts before cursor, a appends after cursor, o opens a new line, x deletes a character, dd deletes a line.",
      "Insert mode: type normally, Enter inserts a line, Backspace deletes, Esc returns to normal mode.",
      "Command mode: :w saves, :q quits if clean, :q! discards, :wq or :x saves and quits."
    ]
  },
  {
    title: "Commit view",
    content: [
      "{bold}Commit tab{/bold}",
      "Shows changed files from the local working tree.",
      "Press Enter on a changed file to preview its diff in the scrollable right pane.",
      "The middle panel is a commit form with branch, staged count, unstaged count, message, and actions.",
      "Diff previews focus the right pane so j/k, PageUp, and PageDown scroll. Press f or b to return to changed files.",
      "Press s to stage the selected file. Press m to write the commit message. Press c to create the commit. Press u to unstage."
    ]
  },
  {
    title: "Issues view",
    content: [
      "{bold}Issues tab{/bold}",
      "If `gh` is available, lists GitHub issues.",
      "Without `gh`, scans local files for TODO, FIXME, HACK, and BUG markers.",
      "Selecting an item previews the linked issue or surrounding source context."
    ]
  },
  {
    title: "Agents view",
    content: [
      "{bold}Agents tab{/bold}",
      "Type natural language into the bottom input to ask the OpenAI-powered git assistant.",
      "The agent receives local Git context: selected commit, branch, status, remotes, recent commits, selected file diff, and commit patch.",
      "The agent can use web search for current external information such as API docs, release notes, CVEs, or upstream behavior.",
      "Slash commands in the input remain local and do not call the agent."
    ]
  },
  {
    title: "Search view",
    content: [
      "{bold}Search tab{/bold}",
      "Use `/search <query>` to search project text.",
      "Search uses ripgrep when available, otherwise falls back to an internal text scan.",
      "Selecting a result opens surrounding source context."
    ]
  },
  {
    title: "Commands",
    content: [
      "{bold}Commands{/bold}",
      "/files returns to the repository file browser.",
      "/commit shows the selected commit. `/commit <hash>` jumps to a matching commit.",
      "/edit opens the selected file in the built-in editor.",
      "/diff shows unstaged and staged diff for the selected file.",
      "/refresh reloads file tree and Git status.",
      "/open <path> jumps to a file by exact or suffix match.",
      "/search <query> searches file contents.",
      "/message <text> sets the Commit tab message.",
      "/commit-create creates a commit from staged files and the current message.",
      "/ignore <name> hides a directory or file name from the tree.",
      "/unignore <name> removes a name from the ignore list.",
      "git status opens the Commit tab."
    ]
  },
  {
    title: "Environment",
    content: [
      "{bold}Environment{/bold}",
      "Set OPENAI_API_KEY before starting the app to enable the hosted agent.",
      "Set OPENAI_MODEL to override the default model.",
      "Set GUITUI_THEME=light or GUITUI_THEME=dark to override automatic terminal color detection.",
      "The built-in editor is used for `e` and `/edit`.",
      "Install and authenticate GitHub CLI `gh` for GitHub pull request and issue data."
    ]
  }
];
