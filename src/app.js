import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import blessed from "blessed";

function detectTheme() {
  const requested = String(process.env.GUITUI_THEME || "auto").toLowerCase();
  if (requested === "light" || requested === "dark") return requested;

  const colorFgBg = process.env.COLORFGBG || "";
  const background = Number(colorFgBg.split(";").at(-1));
  if (Number.isFinite(background)) {
    return background >= 7 && background <= 15 ? "light" : "dark";
  }

  return "dark";
}

function createPalette() {
  const theme = detectTheme();
  const transparent = "default";
  if (theme === "light") {
    return {
      theme,
      bg: transparent,
      surface: transparent,
      surface3: "#E5E7EB",
      border: "#9CA3AF",
      borderActive: "#0284C7",
      text: "#111827",
      muted: "#6B7280",
      primary: "#0369A1",
      primaryStrong: "#0284C7",
      success: "#15803D",
      textTag: "black",
      selectedFg: "white",
      selectedTag: "white"
    };
  }

  return {
    theme,
    bg: transparent,
    surface: transparent,
    surface3: "#182331",
    border: "#273241",
    borderActive: "#7DD3FC",
    text: "#E6EDF3",
    muted: "#8B949E",
    primary: "#7DD3FC",
    primaryStrong: "#38BDF8",
    success: "#4ADE80",
    textTag: "white",
    selectedFg: "black",
    selectedTag: "black"
  };
}

const palette = createPalette();

const tabs = ["Repository", "Commit", "Issues", "Agents", "Search", "Help"];
const ignoredNames = new Set([".git", "node_modules", "dist", "build", "target", ".next", ".turbo"]);
const agentModel = process.env.OPENAI_MODEL || "gpt-5";
const textExtensions = new Set([
  ".c", ".cc", ".cpp", ".css", ".go", ".h", ".html", ".java", ".js", ".json", ".jsx",
  ".lock", ".md", ".mjs", ".py", ".rs", ".sh", ".sql", ".toml", ".ts", ".tsx", ".txt",
  ".yaml", ".yml", ".zsh"
]);

const languageHighlighters = [
  {
    name: "python",
    extensions: new Set([".py"]),
    lineComment: "#",
    keywords: new Set([
      "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
      "elif", "else", "except", "False", "finally", "for", "from", "global", "if", "import",
      "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass", "raise", "return",
      "True", "try", "while", "with", "yield"
    ]),
    builtins: new Set([
      "dict", "enumerate", "filter", "float", "int", "len", "list", "map", "open", "print",
      "range", "set", "str", "sum", "tuple", "type"
    ])
  },
  {
    name: "javascript",
    extensions: new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]),
    lineComment: "//",
    keywords: new Set([
      "async", "await", "break", "case", "catch", "class", "const", "continue", "debugger",
      "default", "delete", "do", "else", "export", "extends", "finally", "for", "from",
      "function", "if", "import", "in", "instanceof", "let", "new", "of", "return", "static",
      "switch", "throw", "try", "typeof", "var", "void", "while", "yield"
    ]),
    builtins: new Set([
      "Array", "Boolean", "Date", "Error", "JSON", "Map", "Math", "Number", "Object",
      "Promise", "RegExp", "Set", "String", "console", "document", "process", "window"
    ])
  },
  {
    name: "go",
    extensions: new Set([".go"]),
    lineComment: "//",
    keywords: new Set([
      "break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough",
      "for", "func", "go", "goto", "if", "import", "interface", "map", "package", "range",
      "return", "select", "struct", "switch", "type", "var"
    ]),
    builtins: new Set([
      "append", "bool", "byte", "cap", "close", "complex64", "complex128", "copy", "delete",
      "error", "false", "float32", "float64", "int", "int8", "int16", "int32", "int64",
      "iota", "len", "make", "new", "nil", "panic", "print", "println", "real", "recover",
      "rune", "string", "true", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr"
    ])
  }
];

const helpTopics = [
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
      "Python, JavaScript, TypeScript, and Go files are syntax highlighted in previews and context snippets.",
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

function box(options) {
  return blessed.box({
    tags: true,
    border: { type: "line" },
    style: {
      fg: palette.text,
      bg: palette.surface,
      border: { fg: palette.border },
      focus: {
        border: { fg: palette.borderActive },
        label: { fg: palette.primaryStrong, bold: true }
      },
      label: { fg: palette.primary, bold: true }
    },
    padding: { left: 1, right: 1 },
    ...options
  });
}

function list(options) {
  return blessed.list({
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    scrollbar: { ch: " ", track: { bg: palette.surface }, style: { bg: palette.primaryStrong } },
    style: {
      fg: palette.text,
      bg: palette.surface,
      selected: { bg: palette.primaryStrong, fg: palette.selectedFg, bold: true },
      item: { hover: { bg: palette.surface3, fg: palette.text } },
      border: { fg: palette.border },
      focus: {
        border: { fg: palette.borderActive },
        selected: { bg: palette.primary, fg: palette.selectedFg, bold: true },
        label: { fg: palette.primaryStrong, bold: true }
      },
      label: { fg: palette.primary, bold: true }
    },
    border: { type: "line" },
    padding: { left: 1, right: 1 },
    ...options
  });
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000
    }).trimEnd();
  } catch {
    return "";
  }
}

function gitOk(args, cwd) {
  try {
    const result = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 3000
    });
    return result !== null;
  } catch {
    return false;
  }
}

function command(args, cwd) {
  try {
    return execFileSync(args[0], args.slice(1), {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000
    }).trimEnd();
  } catch {
    return "";
  }
}

function commandExists(name, cwd) {
  return Boolean(command(["which", name], cwd));
}

function isGitRepo(cwd) {
  return git(["rev-parse", "--is-inside-work-tree"], cwd) === "true";
}

function gitBranch(cwd) {
  return git(["branch", "--show-current"], cwd) || "no-git";
}

function gitBranches(cwd) {
  const output = git(["branch", "--all", "--format=%(HEAD)%09%(refname:short)"], cwd);
  if (!output) return [];
  return output.split("\n").map((line) => {
    const [head = "", name = ""] = line.split("\t");
    return { name, current: head.trim() === "*" };
  }).filter((branch) => branch.name);
}

function branchSummary(cwd) {
  if (!isGitRepo(cwd)) return "no-git";
  const branches = gitBranches(cwd);
  const current = branches.find((branch) => branch.current)?.name || gitBranch(cwd);
  const localCount = branches.filter((branch) => !branch.name.startsWith("remotes/")).length;
  const remoteCount = branches.length - localCount;
  return `${current}  ${localCount} local/${remoteCount} remote`;
}

function escapeTags(value) {
  return String(value).replaceAll("{", "\\{").replaceAll("}", "\\}");
}

function colorTag(color, value) {
  if (!value) return "";
  return `{${color}-fg}${escapeTags(value)}{/${color}-fg}`;
}

function truncate(value, limit) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[truncated ${text.length - limit} chars]`;
}

function highlighterForFile(filePath) {
  const ext = path.extname(filePath || "").toLowerCase();
  return languageHighlighters.find((language) => language.extensions.has(ext));
}

function findCommentIndex(line, marker) {
  if (!marker) return -1;
  let quote = "";
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line.slice(index, index + marker.length);
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (next === marker) return index;
  }
  return -1;
}

function consumeString(line, start) {
  const quote = line[start];
  let index = start + 1;
  let escaped = false;
  while (index < line.length) {
    const char = line[index];
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === quote) {
      index += 1;
      break;
    }
    index += 1;
  }
  return index;
}

function highlightCodeLine(line, language) {
  if (!language) return escapeTags(line);
  const commentIndex = findCommentIndex(line, language.lineComment);
  const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";
  let result = "";
  let index = 0;

  while (index < code.length) {
    const char = code[index];
    if (char === "\"" || char === "'" || char === "`") {
      const end = consumeString(code, index);
      result += colorTag("green", code.slice(index, end));
      index = end;
      continue;
    }

    const number = code.slice(index).match(/^(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)/);
    if (number) {
      result += colorTag("magenta", number[0]);
      index += number[0].length;
      continue;
    }

    const word = code.slice(index).match(/^[A-Za-z_$][\w$]*/);
    if (word) {
      const value = word[0];
      if (language.keywords.has(value)) result += colorTag("blue", value);
      else if (language.builtins.has(value)) result += colorTag("cyan", value);
      else result += escapeTags(value);
      index += value.length;
      continue;
    }

    result += escapeTags(char);
    index += 1;
  }

  return result + (comment ? colorTag("gray", comment) : "");
}

function highlightLineForFile(filePath, line) {
  return highlightCodeLine(line, highlighterForFile(filePath));
}

function clipVisible(value, start, width) {
  const text = String(value || "");
  if (start <= 0 && text.length <= width) return text;
  return text.slice(start, start + width);
}

function colorStatus(code) {
  if (code.includes("M")) return "{yellow-fg}M{/yellow-fg}";
  if (code.includes("A") || code.includes("?")) return "{green-fg}+{/green-fg}";
  if (code.includes("D")) return "{red-fg}-{/red-fg}";
  if (code.includes("R")) return "{blue-fg}R{/blue-fg}";
  return "{gray-fg}.{/gray-fg}";
}

function buildFileTree(root, maxEntries = 700) {
  const entries = [];

  function walk(dir, depth) {
    if (entries.length >= maxEntries) return;

    let dirents = [];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    dirents
      .filter((entry) => !ignoredNames.has(entry.name))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .forEach((entry) => {
        if (entries.length >= maxEntries) return;
        const absolute = path.join(dir, entry.name);
        const relative = path.relative(root, absolute) || ".";
        const indent = "  ".repeat(depth);
        if (entry.isDirectory()) {
          entries.push({ type: "dir", absolute, relative, label: `${indent}{blue-fg}▸{/blue-fg} ${escapeTags(entry.name)}/` });
          walk(absolute, depth + 1);
          return;
        }
        if (entry.isFile()) {
          entries.push({ type: "file", absolute, relative, label: `${indent}{green-fg}•{/green-fg} ${escapeTags(entry.name)}` });
        }
      });
  }

  walk(root, 0);
  return entries;
}

function gitStatusMap(cwd) {
  const map = new Map();
  const output = git(["status", "--short"], cwd);
  if (!output) return map;
  output.split("\n").forEach((line) => {
    const code = line.slice(0, 2);
    const file = line.slice(3).replace(/^.* -> /, "");
    map.set(file, code);
  });
  return map;
}

function decorateFileLabels(entries, statusMap) {
  return entries.map((entry) => {
    if (entry.type !== "file") return entry.label;
    const status = statusMap.get(entry.relative);
    return status ? `${colorStatus(status)} ${entry.label}` : `  ${entry.label}`;
  });
}

function readFilePreview(entry) {
  if (!entry) return "{gray-fg}No file selected.{/gray-fg}";
  if (entry.type === "dir") return `{bold}${escapeTags(entry.relative)}/{/bold}\n\nDirectory selected. Choose a file to preview its contents.`;

  let stat;
  try {
    stat = fs.statSync(entry.absolute);
  } catch (error) {
    return `{red-fg}Unable to read ${escapeTags(entry.relative)}{/red-fg}\n${escapeTags(error.message)}`;
  }

  if (stat.size > 500_000) {
    return `{yellow-fg}${escapeTags(entry.relative)} is ${Math.round(stat.size / 1024)} KB.{/yellow-fg}\nLarge file preview is capped to keep the TUI responsive.`;
  }

  const ext = path.extname(entry.absolute).toLowerCase();
  if (!textExtensions.has(ext) && stat.size > 0) {
    const buffer = fs.readFileSync(entry.absolute);
    if (buffer.includes(0)) {
      return `{yellow-fg}${escapeTags(entry.relative)} appears to be binary.{/yellow-fg}\nSize: ${stat.size} bytes`;
    }
  }

  let content = fs.readFileSync(entry.absolute, "utf8");
  if (content.length > 80_000) content = `${content.slice(0, 80_000)}\n\n... preview truncated ...`;
  const lines = content.split("\n");
  const width = String(lines.length).length;
  return [
    `{bold}{blue-fg}${escapeTags(entry.relative)}{/blue-fg}{/bold}`,
    `{gray-fg}${stat.size} bytes{/gray-fg}`,
    "",
    ...lines.map((line, index) => `{gray-fg}${String(index + 1).padStart(width, " ")} │{/gray-fg} ${highlightLineForFile(entry.absolute, line)}`)
  ].join("\n");
}

function readContextPreview(entry, radius = 8) {
  if (!entry?.line) return readFilePreview(entry);

  let content = "";
  try {
    content = fs.readFileSync(entry.absolute, "utf8");
  } catch (error) {
    return `{red-fg}Unable to read ${escapeTags(entry.relative)}{/red-fg}\n${escapeTags(error.message)}`;
  }

  const lines = content.split("\n");
  const start = Math.max(1, entry.line - radius);
  const end = Math.min(lines.length, entry.line + radius);
  const width = String(end).length;
  const body = [];
  for (let line = start; line <= end; line += 1) {
    const current = lines[line - 1] ?? "";
    const prefix = String(line).padStart(width, " ");
    const text = `{gray-fg}${prefix} │{/gray-fg} ${highlightLineForFile(entry.absolute, current)}`;
    body.push(line === entry.line ? `{blue-bg}${text}{/blue-bg}` : text);
  }

  return [
    `{bold}{blue-fg}${escapeTags(entry.relative)}:${entry.line}{/blue-fg}{/bold}`,
    entry.summary ? escapeTags(entry.summary) : "",
    "",
    ...body
  ].join("\n");
}

function gitDiffForFile(cwd, entry) {
  if (!entry || entry.type !== "file" || !isGitRepo(cwd)) return "";
  const diff = git(["diff", "--", entry.relative], cwd);
  const staged = git(["diff", "--cached", "--", entry.relative], cwd);
  const combined = [diff, staged && `Staged changes:\n${staged}`].filter(Boolean).join("\n\n");
  if (!combined) return "";

  return combined.split("\n").map((line) => {
    const escaped = escapeTags(line);
    if (line.startsWith("+") && !line.startsWith("+++")) return `{green-fg}${escaped}{/green-fg}`;
    if (line.startsWith("-") && !line.startsWith("---")) return `{red-fg}${escaped}{/red-fg}`;
    if (line.startsWith("@@")) return `{blue-fg}${escaped}{/blue-fg}`;
    return escaped;
  }).join("\n");
}

function commitEntries(cwd) {
  if (!isGitRepo(cwd)) {
    return [
      { type: "note", label: "{yellow-fg}This directory is not a Git repository.{/yellow-fg}" },
      { type: "note", label: "The file browser still works." },
      { type: "note", label: "" },
      { type: "note", label: "Run inside a repo to see commits, branch status, and diffs." }
    ];
  }

  const output = git([
    "log",
    "--graph",
    "--decorate",
    "--all",
    "--date=relative",
    "--pretty=format:%h%x09%H%x09%D%x09%an%x09%ar%x09%s",
    "-n",
    "80"
  ], cwd);
  if (!output) return [{ type: "note", label: "{yellow-fg}No commits found yet.{/yellow-fg}" }];
  const currentBranch = gitBranch(cwd);
  return output.split("\n").map((line) => {
    const [graphAndShort = "", hash = "", decorations = "", author = "", age = "", subject = ""] = line.split("\t");
    if (!hash) return null;
    const short = graphAndShort.trim().split(/\s+/).at(-1) || hash.slice(0, 7);
    const graph = graphAndShort.slice(0, Math.max(0, graphAndShort.lastIndexOf(short)));
    const onCurrentBranch = currentBranch !== "no-git" && gitOk(["merge-base", "--is-ancestor", hash, currentBranch], cwd);
    const branchLabel = decorations
      ? `  {gray-fg}${escapeTags(author)}  ${escapeTags(age)}  ${escapeTags(decorations)}{/gray-fg}`
      : `  {gray-fg}${escapeTags(author)}  ${escapeTags(age)}{/gray-fg}`;
    const subjectLabel = onCurrentBranch ? `{bold}{green-fg}${escapeTags(subject)}{/green-fg}{/bold}` : escapeTags(subject);
    const hashLabel = onCurrentBranch ? `{green-bg}{black-fg}${escapeTags(short)}{/black-fg}{/green-bg}` : `{blue-fg}${escapeTags(short)}{/blue-fg}`;
    return {
      type: "commit",
      hash,
      short,
      subject,
      decorations,
      currentBranch: onCurrentBranch,
      label: `{green-fg}${escapeTags(graph || "* ")}{/green-fg}${hashLabel} ${subjectLabel}\n${branchLabel}`
    };
  }).filter(Boolean);
}

function commitItems(state) {
  return state.commits.map((entry) => entry.label);
}

function selectedCommit(state, layout) {
  return state.commits[layout.center.selected];
}

function colorPatch(output) {
  return output.split("\n").map((line) => {
    const escaped = escapeTags(line);
    if (line.startsWith("commit ")) return `{blue-fg}${escaped}{/blue-fg}`;
    if (line.startsWith("Author:") || line.startsWith("AuthorDate:") || line.startsWith("Commit:") || line.startsWith("CommitDate:")) return `{gray-fg}${escaped}{/gray-fg}`;
    if (line.startsWith("diff --git")) return `{blue-fg}${escaped}{/blue-fg}`;
    if (line.startsWith("@@")) return `{cyan-fg}${escaped}{/cyan-fg}`;
    if (line.startsWith("+") && !line.startsWith("+++")) return `{green-fg}${escaped}{/green-fg}`;
    if (line.startsWith("-") && !line.startsWith("---")) return `{red-fg}${escaped}{/red-fg}`;
    return escaped;
  }).join("\n");
}

function commitMetadata(cwd, hash) {
  const output = git([
    "show",
    "-s",
    "--date=relative",
    "--format=%H%x00%h%x00%an%x00%ae%x00%ar%x00%ad%x00%P%x00%D%x00%B",
    hash
  ], cwd);
  const [full = hash, short = hash.slice(0, 7), author = "", email = "", relativeDate = "", date = "", parents = "", decorations = "", ...messageParts] = output.split("\0");
  const message = messageParts.join("\0").trim();
  const [subject = "", ...bodyLines] = message.split("\n");
  return {
    full,
    short,
    author,
    email,
    relativeDate,
    date,
    parents,
    decorations,
    subject,
    body: bodyLines.join("\n").trim()
  };
}

function commitFileChanges(cwd, hash) {
  const output = git(["show", "--format=", "--numstat", "--find-renames", "--color=never", hash], cwd);
  if (!output) return [];
  return output.split("\n").filter(Boolean).map((line) => {
    const [added = "-", deleted = "-", ...pathParts] = line.split("\t");
    const file = pathParts.join("\t").replace(/^.* => /, "").replace(/[{}]/g, "");
    const addedCount = Number(added);
    const deletedCount = Number(deleted);
    return {
      file,
      added,
      deleted,
      addedCount: Number.isFinite(addedCount) ? addedCount : 0,
      deletedCount: Number.isFinite(deletedCount) ? deletedCount : 0
    };
  }).sort((a, b) => a.file.localeCompare(b.file));
}

function commitDiffBlocks(cwd, hash) {
  const output = git(["show", "--format=", "--patch", "--find-renames", "--color=never", hash], cwd);
  if (!output) return [];
  const blocks = output.split(/\n(?=diff --git )/).filter(Boolean);
  return blocks.map((block) => {
    const firstLine = block.split("\n")[0] || "";
    const match = firstLine.match(/^diff --git a\/(.+) b\/(.+)$/);
    const file = match?.[2] || firstLine.replace(/^diff --git /, "");
    return { file, block };
  }).sort((a, b) => a.file.localeCompare(b.file));
}

function diffStatus(block) {
  if (block.includes("\nnew file mode ")) return { label: "ADDED", color: "green" };
  if (block.includes("\ndeleted file mode ")) return { label: "DELETED", color: "red" };
  if (block.includes("\nrename from ")) return { label: "RENAMED", color: "cyan" };
  return { label: "MODIFIED", color: "yellow" };
}

function compactPatch(block, maxLines = 90) {
  const lines = block.split("\n");
  const keep = [];
  let skippedHeader = false;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) continue;
    if (line.startsWith("index ") || line.startsWith("similarity index ")) continue;
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;
    if (!skippedHeader && (line.startsWith("new file mode ") || line.startsWith("deleted file mode "))) {
      keep.push(line);
      skippedHeader = true;
      continue;
    }
    keep.push(line);
    if (keep.length >= maxLines) {
      keep.push(`... patch truncated after ${maxLines} lines ...`);
      break;
    }
  }
  return keep.join("\n").trim();
}

function renderFileChangeBlock(file, diff) {
  const status = diff ? diffStatus(diff.block) : { label: "CHANGED", color: "blue" };
  const added = file?.added === "-" ? "binary" : `+${file?.added ?? 0}`;
  const deleted = file?.deleted === "-" ? "binary" : `-${file?.deleted ?? 0}`;
  const fileName = file?.file || diff?.file || "unknown";
  const patch = diff ? compactPatch(diff.block) : "";
  const patchLines = patch
    ? colorPatch(patch).split("\n").map((line) => `{gray-fg}│{/gray-fg} ${line}`)
    : ["{gray-fg}│ No textual patch available for this file.{/gray-fg}"];

  return [
    `{gray-fg}┌────────────────────────────────────────────────────────────{/gray-fg}`,
    `{gray-fg}│{/gray-fg} {${status.color}-fg}${status.label.padEnd(8)}{/${status.color}-fg} {bold}{blue-fg}${escapeTags(fileName)}{/blue-fg}{/bold}`,
    `{gray-fg}│{/gray-fg} {green-fg}${escapeTags(String(added)).padStart(8)}{/green-fg} {red-fg}${escapeTags(String(deleted)).padStart(8)}{/red-fg}`,
    `{gray-fg}├────────────────────────────────────────────────────────────{/gray-fg}`,
    ...patchLines,
    `{gray-fg}└────────────────────────────────────────────────────────────{/gray-fg}`
  ].join("\n");
}

function renderCommitDetails(cwd, commit) {
  const meta = commitMetadata(cwd, commit.hash);
  const files = commitFileChanges(cwd, commit.hash);
  const diffs = commitDiffBlocks(cwd, commit.hash);
  const currentBranch = gitBranch(cwd);
  const onCurrentBranch = currentBranch !== "no-git" && gitOk(["merge-base", "--is-ancestor", commit.hash, currentBranch], cwd);
  const totalAdded = files.reduce((sum, file) => sum + file.addedCount, 0);
  const totalDeleted = files.reduce((sum, file) => sum + file.deletedCount, 0);
  const refs = meta.decorations ? meta.decorations.split(", ").filter(Boolean) : [];
  const parents = meta.parents ? meta.parents.split(" ").filter(Boolean) : [];

  const diffByFile = new Map(diffs.map((diff) => [diff.file, diff]));
  const allFiles = files.length ? files : diffs.map((diff) => ({
    file: diff.file,
    added: "0",
    deleted: "0",
    addedCount: 0,
    deletedCount: 0
  }));
  const fileBlocks = allFiles.length
    ? allFiles.map((file) => renderFileChangeBlock(file, diffByFile.get(file.file)))
    : ["{gray-fg}No file-level changes reported.{/gray-fg}"];

  return [
    `{bold}{blue-fg}${escapeTags(meta.subject || commit.subject)}{/blue-fg}{/bold}`,
    "",
    `{gray-fg}Hash{/gray-fg}     ${escapeTags(meta.full)}`,
    `{gray-fg}Short{/gray-fg}    {blue-fg}${escapeTags(meta.short)}{/blue-fg}`,
    `{gray-fg}Branch{/gray-fg}   {green-fg}${escapeTags(currentBranch)}{/green-fg}${onCurrentBranch ? "  {green-fg}contains this commit{/green-fg}" : "  {yellow-fg}not on current branch{/yellow-fg}"}`,
    `{gray-fg}Author{/gray-fg}   ${escapeTags(meta.author)} ${meta.email ? `{gray-fg}<${escapeTags(meta.email)}>{/gray-fg}` : ""}`,
    `{gray-fg}When{/gray-fg}     ${escapeTags(meta.relativeDate)}  {gray-fg}${escapeTags(meta.date)}{/gray-fg}`,
    ...(parents.length ? [`{gray-fg}Parents{/gray-fg}  ${parents.map((parent) => `{blue-fg}${escapeTags(parent.slice(0, 7))}{/blue-fg}`).join(" ")}`] : []),
    ...(refs.length ? [`{gray-fg}Refs{/gray-fg}     ${refs.map((ref) => `{green-fg}${escapeTags(ref)}{/green-fg}`).join("  ")}`] : []),
    "",
    ...(meta.body ? ["{bold}Message{/bold}", escapeTags(meta.body), ""] : []),
    `{bold}Files changed{/bold}  ${allFiles.length} files  {green-fg}+${totalAdded}{/green-fg}  {red-fg}-${totalDeleted}{/red-fg}`,
    "",
    ...fileBlocks
  ].join("\n");
}

function showSelectedCommit(state, layout, screen, focusDetails = false) {
  const commit = selectedCommit(state, layout);
  if (!commit || commit.type !== "commit") {
    layout.right.setLabel(" Commit Details ");
    layout.right.setContent(isGitRepo(state.cwd) ? "{yellow-fg}No commit selected.{/yellow-fg}" : "Run inside a Git repository to inspect commits.");
    state.mode = "No commit selected";
    renderHeader(layout.header, state);
    screen.render();
    return;
  }

  layout.right.setLabel(` Commit ${commit.short}: j/k scroll, c graph `);
  layout.right.setContent(renderCommitDetails(state.cwd, commit));
  layout.right.setScroll(0);
  state.mode = `Commit: ${commit.short} ${commit.subject}`;
  renderHeader(layout.header, state);
  if (focusDetails) layout.right.focus();
  screen.render();
}

function currentCommit(state, layout) {
  const selected = selectedCommit(state, layout);
  if (selected?.type === "commit") return selected;
  const head = git(["rev-parse", "HEAD"], state.cwd);
  if (!head) return null;
  return {
    type: "commit",
    hash: head,
    short: head.slice(0, 7),
    subject: git(["show", "-s", "--format=%s", head], state.cwd)
  };
}

function commitContext(state, layout) {
  if (!isGitRepo(state.cwd)) {
    return [
      `cwd: ${state.cwd}`,
      "git: not a repository",
      "",
      "Visible file preview is still available, but commit analysis requires a Git repository."
    ].join("\n");
  }

  const commit = currentCommit(state, layout);
  const branch = gitBranch(state.cwd);
  const status = git(["status", "--short"], state.cwd) || "clean";
  const remotes = git(["remote", "-v"], state.cwd);
  const recent = git(["log", "--oneline", "--decorate", "-n", "12"], state.cwd);
  const selectedFileEntry = selectedFile(state, layout);
  const selectedFileDiff = selectedFileEntry?.type === "file" ? [
    git(["diff", "--", selectedFileEntry.relative], state.cwd),
    git(["diff", "--cached", "--", selectedFileEntry.relative], state.cwd)
  ].filter(Boolean).join("\n\n") : "";
  const show = commit ? git([
    "show",
    "--format=fuller",
    "--stat",
    "--patch",
    "--find-renames",
    "--color=never",
    "--max-count=1",
    commit.hash
  ], state.cwd) : "";

  return [
    `cwd: ${state.cwd}`,
    `branch: ${branch}`,
    `selected_commit: ${commit ? `${commit.short} ${commit.subject}` : "none"}`,
    "",
    "git status --short:",
    status,
    "",
    "remotes:",
    remotes || "none",
    "",
    "recent commits:",
    recent || "none",
    "",
    selectedFileEntry ? `selected file: ${selectedFileEntry.relative}` : "selected file: none",
    selectedFileDiff ? `selected file diff:\n${truncate(selectedFileDiff, 18_000)}` : "selected file diff: none",
    "",
    "selected commit show:",
    truncate(show || "none", 45_000)
  ].join("\n");
}

function agentInstructions() {
  return [
    "You are a pragmatic git assistant embedded in a terminal UI for developers.",
    "Your primary job is to help the developer understand the current commit, its intent, risk, changed files, review points, and follow-up commands.",
    "Use the provided repository snapshot as the source of truth for local git facts.",
    "Use web search only when the developer asks for external or current information, such as library behavior, API docs, CVEs, release notes, or upstream project details.",
    "Be concise and action-oriented. Prefer bullets when comparing risks or files. Mention exact commit hashes, file paths, and commands when useful.",
    "If the snapshot is incomplete, say what local command would answer the missing detail."
  ].join("\n");
}

function extractResponseText(response) {
  if (response.output_text) return response.output_text;
  const parts = [];
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
      if (content.type === "text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function extractSources(response) {
  const sources = new Map();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value.type === "url_citation" && value.url) {
      sources.set(value.url, value.title || value.url);
    }
    if (value.url && value.title && String(value.url).startsWith("http")) {
      sources.set(value.url, value.title);
    }
    Object.values(value).forEach(visit);
  };
  visit(response.output);
  visit(response.sources);
  return [...sources.entries()].slice(0, 8).map(([url, title]) => ({ url, title }));
}

async function callOpenAIAgent(prompt, state, layout) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return [
      "OPENAI_API_KEY is not set, so the hosted git assistant cannot run yet.",
      "",
      "Set it and restart this TUI:",
      "  export OPENAI_API_KEY=sk-...",
      "",
      "The agent will send the selected commit, working-tree status, recent commits, and selected-file diff to the OpenAI Responses API with web search available."
    ].join("\n");
  }

  const payload = {
    model: agentModel,
    instructions: agentInstructions(),
    tools: [{ type: "web_search" }],
    tool_choice: "auto",
    include: ["web_search_call.action.sources"],
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Repository snapshot:",
              "```text",
              commitContext(state, layout),
              "```",
              "",
              "Developer request:",
              prompt
            ].join("\n")
          }
        ]
      }
    ]
  };
  if (state.agentResponseId) payload.previous_response_id = state.agentResponseId;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.error?.message || response.statusText || "OpenAI API request failed";
    throw new Error(`${response.status} ${message}`);
  }

  state.agentResponseId = body.id || state.agentResponseId;
  const text = extractResponseText(body) || "No text returned by the model.";
  const sources = extractSources(body);
  if (!sources.length) return text;
  return [
    text,
    "",
    "Sources:",
    ...sources.map((source, index) => `${index + 1}. ${source.title} - ${source.url}`)
  ].join("\n");
}

function statusItems(cwd) {
  if (!isGitRepo(cwd)) return ["No Git repository detected.", "File preview is available from the left panel."];
  const status = git(["status", "--short"], cwd);
  if (!status) return ["{green-fg}Working tree clean.{/green-fg}"];
  return status.split("\n").map((line) => {
    const code = line.slice(0, 2);
    const file = escapeTags(line.slice(3));
    return `${colorStatus(code)} ${file}`;
  });
}

function isStagedStatus(code) {
  return Boolean(code && code[0] && code[0] !== " " && code[0] !== "?");
}

function changedFileEntries(state) {
  return [...state.statusMap.entries()].map(([file, code]) => {
    const staged = isStagedStatus(code);
    const unstaged = code === "??" || (code[1] && code[1] !== " ");
    const stagedLabel = staged ? "{green-fg}S{/green-fg}" : "{gray-fg}.{/gray-fg}";
    const unstagedLabel = unstaged ? "{yellow-fg}U{/yellow-fg}" : "{gray-fg}.{/gray-fg}";
    return {
      type: "file",
      relative: file,
      absolute: path.join(state.cwd, file),
      statusCode: code,
      staged,
      unstaged,
      label: `${stagedLabel}${unstagedLabel} ${escapeTags(file)}`
    };
  }).sort((a, b) => a.relative.localeCompare(b.relative));
}

function commitPanelItems(state) {
  if (!isGitRepo(state.cwd)) return ["No Git repository detected."];
  const branch = gitBranch(state.cwd);
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], state.cwd);
  const changed = changedFileEntries(state);
  const staged = changed.filter((entry) => entry.staged);
  const unstaged = changed.filter((entry) => entry.unstaged);
  const message = state.commitMessage?.trim();
  return [
    `{bold}Commit form{/bold}`,
    `Branch: {green-fg}${escapeTags(branch)}{/green-fg}`,
    `Upstream: ${upstream ? escapeTags(upstream) : "none"}`,
    "",
    `Staged: {green-fg}${staged.length}{/green-fg}    Unstaged: {yellow-fg}${unstaged.length}{/yellow-fg}`,
    "",
    "{bold}Message{/bold}",
    message ? escapeTags(message) : "{gray-fg}No commit message yet. Press m or run /message <text>.{/gray-fg}",
    "",
    "{bold}Actions{/bold}",
    "Enter on file: preview diff",
    "s: stage selected file",
    "u: unstage selected file",
    "m: edit commit message",
    "c: create commit",
    "r: refresh"
  ];
}

function scanIssueItems(state) {
  const markers = ["TODO", "FIXME", "HACK", "BUG"];
  const issues = [];
  for (const entry of state.files) {
    if (issues.length >= 200 || entry.type !== "file") continue;
    let content = "";
    try {
      const stat = fs.statSync(entry.absolute);
      if (stat.size > 500_000) continue;
      content = fs.readFileSync(entry.absolute, "utf8");
    } catch {
      continue;
    }
    content.split("\n").forEach((line, index) => {
      if (issues.length >= 200) return;
      const marker = markers.find((candidate) => line.includes(candidate));
      if (marker) {
        issues.push({
          ...entry,
          type: "issue",
          line: index + 1,
          summary: `${marker}: ${line.trim()}`,
          label: `{yellow-fg}${marker.padEnd(5)}{/yellow-fg} ${escapeTags(entry.relative)}:${index + 1}`
        });
      }
    });
  }
  return issues;
}

function issueItems(state) {
  if (commandExists("gh", state.cwd) && isGitRepo(state.cwd)) {
    const output = command(["gh", "issue", "list", "--limit", "30", "--json", "number,title,state,labels"], state.cwd);
    if (output) {
      try {
        const issues = JSON.parse(output);
        if (issues.length) {
          return issues.map((issue) => ({
            type: "github-issue",
            relative: `#${issue.number}`,
            absolute: state.cwd,
            summary: issue.title,
            label: `#${String(issue.number).padEnd(5)} ${escapeTags(issue.title)}  {blue-fg}${escapeTags(issue.state)}{/blue-fg}`
          }));
        }
      } catch {
        // Fall through to local markers.
      }
    }
  }

  const localIssues = scanIssueItems(state);
  if (localIssues.length) return localIssues;
  return [{
    type: "note",
    relative: "No local issues",
    absolute: state.cwd,
    summary: "No TODO/FIXME/HACK/BUG markers found. GitHub issues require gh.",
    label: "{green-fg}No local TODO/FIXME markers found{/green-fg}"
  }];
}

function searchProject(state, query) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (commandExists("rg", state.cwd)) {
    const output = command(["rg", "--line-number", "--color", "never", "--glob", "!node_modules", "--glob", "!.git", trimmed], state.cwd);
    if (output) {
      return output.split("\n").slice(0, 300).map((line) => {
        const [file, lineNo, ...rest] = line.split(":");
        const absolute = path.join(state.cwd, file);
        return {
          type: "search",
          relative: file,
          absolute,
          line: Number(lineNo),
          summary: rest.join(":").trim(),
          label: `{blue-fg}${escapeTags(file)}:${lineNo}{/blue-fg} ${escapeTags(rest.join(":").trim())}`
        };
      });
    }
  }

  const lower = trimmed.toLowerCase();
  const results = [];
  for (const entry of state.files) {
    if (results.length >= 300 || entry.type !== "file") continue;
    let content = "";
    try {
      const stat = fs.statSync(entry.absolute);
      if (stat.size > 500_000) continue;
      content = fs.readFileSync(entry.absolute, "utf8");
    } catch {
      continue;
    }
    content.split("\n").forEach((line, index) => {
      if (results.length >= 300) return;
      if (line.toLowerCase().includes(lower)) {
        results.push({
          ...entry,
          type: "search",
          line: index + 1,
          summary: line.trim(),
          label: `{blue-fg}${escapeTags(entry.relative)}:${index + 1}{/blue-fg} ${escapeTags(line.trim())}`
        });
      }
    });
  }
  return results;
}

function createLayout(screen, state) {
  const header = box({
    parent: screen,
    mouse: true,
    top: 0,
    left: 0,
    width: "100%",
    height: 5,
    border: "line",
    padding: { left: 1, right: 1 },
    content: "",
    style: {
      fg: palette.text,
      bg: palette.bg,
      border: { fg: palette.border },
      label: { fg: palette.primary, bold: true }
    }
  });

  const sidebar = list({
    parent: screen,
    label: " Files ",
    top: 5,
    left: 0,
    width: "30%",
    height: "100%-8",
    items: decorateFileLabels(state.files, state.statusMap)
  });

  const center = list({
    parent: screen,
    label: " Git ",
    top: 5,
    left: "30%",
    width: "28%",
    height: "100%-8",
    items: commitItems(state)
  });

  const right = box({
    parent: screen,
    label: " File Preview ",
    top: 5,
    left: "58%",
    width: "42%",
    height: "100%-8",
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    content: readFilePreview(state.files[0])
  });

  const input = blessed.textbox({
    parent: screen,
    label: " Ask agent or run /command ",
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    inputOnFocus: true,
    tags: true,
    border: { type: "line" },
    style: {
      fg: palette.text,
      bg: palette.surface,
      border: { fg: palette.primary },
      focus: { border: { fg: palette.success }, label: { fg: palette.success, bold: true } },
      label: { fg: palette.primary, bold: true }
    },
    padding: { left: 1, right: 1 }
  });

  const editor = box({
    parent: screen,
    label: " Editor ",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    hidden: true,
    scrollable: false,
    keys: true,
    mouse: true,
    padding: { left: 1, right: 1 }
  });

  return { header, sidebar, center, right, input, editor };
}

function renderHeader(header, state) {
  const nav = tabs.map((tab) => {
    if (tab === state.activeTab) return `{cyan-bg}{${palette.selectedTag}-fg}{bold} ${tab} {/bold}{/${palette.selectedTag}-fg}{/cyan-bg}`;
    return `{gray-fg} ${tab} {/gray-fg}`;
  }).join(" ");

  const repo = path.basename(state.cwd);
  const branch = isGitRepo(state.cwd) ? gitBranch(state.cwd) : "no-git";
  const status = `{green-fg}${escapeTags(branch)}{/green-fg}  {${palette.textTag}-fg}${escapeTags(repo)}{/${palette.textTag}-fg}  {gray-fg}${state.files.length} files{/gray-fg}`;
  const shortcuts = "{gray-fg}1-6 tabs  b files  c commits  a agent  : command  q quit{/gray-fg}";
  header.setContent(`${nav}\n${status}  {gray-fg}│{/gray-fg}  ${escapeTags(state.mode)}\n${shortcuts}`);
}

function activeEntries(state) {
  if (state.viewEntries?.length) return state.viewEntries;
  return state.viewFiles?.length ? state.viewFiles : state.files;
}

function selectedFile(state, layout) {
  return activeEntries(state)[layout.sidebar.selected] || activeEntries(state)[0];
}

function showSelectedFile(state, layout, screen, forceDiff = false) {
  const entry = selectedFile(state, layout);
  if (entry?.type === "note") {
    layout.right.setLabel(" Details ");
    layout.right.setContent(escapeTags(entry.summary));
    state.mode = entry.relative;
    renderHeader(layout.header, state);
    screen.render();
    return;
  }
  if (entry?.type === "github-issue") {
    layout.right.setLabel(" GitHub Issue ");
    layout.right.setContent(`{bold}${escapeTags(entry.relative)}{/bold}\n\n${escapeTags(entry.summary)}`);
    state.mode = `Issue: ${entry.relative}`;
    renderHeader(layout.header, state);
    screen.render();
    return;
  }
  if (entry?.type === "help") {
    layout.right.setLabel(` Help: ${entry.relative} `);
    layout.right.setContent(entry.summary);
    state.mode = `Help: ${entry.relative}`;
    renderHeader(layout.header, state);
    screen.render();
    return;
  }
  const diff = gitDiffForFile(state.cwd, entry);
  layout.right.setLabel(forceDiff || diff ? " File Diff / Preview " : " File Preview ");
  layout.right.setContent(forceDiff && !diff ? "{yellow-fg}No unstaged or staged diff for this file.{/yellow-fg}" : diff || readContextPreview(entry));
  state.mode = entry ? `${entry.type === "dir" ? "Directory" : "File"}: ${entry.relative}` : "No file selected";
  renderHeader(layout.header, state);
  screen.render();
}

function refreshRepository(state, layout, screen, preferredRelative = selectedFile(state, layout)?.relative) {
  state.viewFiles = null;
  state.viewEntries = null;
  state.files = buildFileTree(state.cwd);
  state.statusMap = gitStatusMap(state.cwd);
  layout.sidebar.setItems(decorateFileLabels(state.files, state.statusMap));
  layout.center.setLabel(` Commit Graph: ${branchSummary(state.cwd)} `);
  state.commits = commitEntries(state.cwd);
  layout.center.setItems(commitItems(state));
  const nextIndex = Math.max(0, state.files.findIndex((entry) => entry.relative === preferredRelative));
  layout.sidebar.select(nextIndex);
  showSelectedFile(state, layout, screen);
}

function setRepository(state, layout, screen) {
  state.viewFiles = null;
  state.viewEntries = null;
  layout.sidebar.setLabel(" Files ");
  layout.sidebar.setItems(decorateFileLabels(state.files, state.statusMap));
  layout.sidebar.select(Math.min(layout.sidebar.selected, Math.max(0, state.files.length - 1)));
  layout.center.setLabel(` Commit Graph: ${branchSummary(state.cwd)} `);
  state.commits = commitEntries(state.cwd);
  layout.center.setItems(commitItems(state));
  showSelectedFile(state, layout, screen);
}

function commitDiffForFile(cwd, entry) {
  if (!entry || !isGitRepo(cwd)) return "";
  const unstaged = git(["diff", "--", entry.relative], cwd);
  const staged = git(["diff", "--cached", "--", entry.relative], cwd);
  let untracked = "";
  if (entry.statusCode === "??") {
    try {
      const content = fs.readFileSync(entry.absolute, "utf8");
      untracked = content.split("\n").map((line) => `+${line}`).join("\n");
    } catch {
      untracked = "";
    }
  }
  const combined = [
    unstaged && `{bold}Unstaged{/bold}\n${colorPatch(unstaged)}`,
    staged && `{bold}Staged{/bold}\n${colorPatch(staged)}`,
    untracked && `{bold}Untracked{/bold}\n${colorPatch(untracked)}`
  ].filter(Boolean).join("\n\n");
  return combined || "{yellow-fg}No textual diff for this file.{/yellow-fg}";
}

function setCommit(state, layout, screen, preferredRelative = selectedFile(state, layout)?.relative) {
  state.statusMap = gitStatusMap(state.cwd);
  layout.sidebar.setLabel(" Changed Files ");
  const changed = changedFileEntries(state);
  state.viewFiles = changed.length ? changed : state.files;
  state.viewEntries = null;
  layout.sidebar.setItems(changed.length ? changed.map((entry) => entry.label) : decorateFileLabels(state.files, state.statusMap));
  const nextIndex = Math.max(0, changed.findIndex((entry) => entry.relative === preferredRelative));
  layout.sidebar.select(nextIndex);
  layout.center.setLabel(" Commit ");
  layout.center.setItems(commitPanelItems(state));
  layout.right.setLabel(" File Diff Preview ");
  layout.right.setContent(changed.length
    ? "Select a changed file and press Enter to preview its diff. Press s to stage the selected file."
    : "No changed files detected in this working tree.");
  state.commitPreviewedFile = "";
  screen.render();
}

function refreshCommitView(state, layout, screen, preferredRelative = selectedFile(state, layout)?.relative) {
  setCommit(state, layout, screen, preferredRelative);
  renderHeader(layout.header, state);
}

function previewSelectedCommitFile(state, layout, screen) {
  if (state.activeTab !== "Commit") return false;
  const now = Date.now();
  if (now - (state.commitEnterHandledAt || 0) < 80) return true;
  state.commitEnterHandledAt = now;
  const entry = selectedFile(state, layout);
  if (!entry || entry.type !== "file" || !state.statusMap.has(entry.relative)) return true;

  layout.right.setLabel(` Diff: ${entry.relative} `);
  layout.right.setContent(commitDiffForFile(state.cwd, entry));
  layout.right.setScroll(0);
  layout.right.focus();
  state.commitPreviewedFile = entry.relative;
  state.mode = `Previewing diff: ${entry.relative}`;
  renderHeader(layout.header, state);
  screen.render();
  return true;
}

function stageSelectedFile(state, layout, screen) {
  if (state.activeTab !== "Commit") return;
  const entry = selectedFile(state, layout);
  if (!entry || entry.type !== "file" || !state.statusMap.has(entry.relative)) return;
  const result = git(["add", "--", entry.relative], state.cwd);
  state.mode = result ? `Stage output: ${result}` : `Staged: ${entry.relative}`;
  state.commitPreviewedFile = "";
  refreshCommitView(state, layout, screen, entry.relative);
}

function unstageSelectedFile(state, layout, screen) {
  if (state.activeTab !== "Commit") return;
  const entry = selectedFile(state, layout);
  if (!entry || entry.type !== "file") return;
  git(["restore", "--staged", "--", entry.relative], state.cwd);
  state.mode = `Unstaged: ${entry.relative}`;
  refreshCommitView(state, layout, screen, entry.relative);
}

function createCommitFromForm(state, layout, screen) {
  if (!isGitRepo(state.cwd)) {
    state.mode = "Cannot commit outside a Git repository";
    renderHeader(layout.header, state);
    screen.render();
    return;
  }
  const message = state.commitMessage.trim();
  if (!message) {
    state.mode = "Commit message required. Press m or run /message <text>.";
    renderHeader(layout.header, state);
    screen.render();
    return;
  }
  if (!git(["diff", "--cached", "--name-only"], state.cwd)) {
    state.mode = "No staged files. Press s on changed files to stage them.";
    renderHeader(layout.header, state);
    screen.render();
    return;
  }

  const output = git(["commit", "-m", message], state.cwd);
  state.commitMessage = "";
  state.mode = output ? `Committed: ${output.split("\n").at(-1)}` : "Commit created";
  state.files = buildFileTree(state.cwd);
  refreshCommitView(state, layout, screen);
}

function openInternalEditor(state, layout, screen, entry) {
  if (!entry || entry.type !== "file") {
    state.mode = entry ? `Cannot edit ${entry.type}: ${entry.relative}` : "No file selected";
    renderHeader(layout.header, state);
    screen.render();
    return;
  }

  let content = "";
  try {
    content = fs.readFileSync(entry.absolute, "utf8");
  } catch (error) {
    state.mode = `Unable to open editor: ${error.message}`;
    renderHeader(layout.header, state);
    screen.render();
    return;
  }

  const editor = {
    entry,
    lines: content.split("\n"),
    original: content,
    row: 0,
    col: 0,
    scrollRow: 0,
    scrollCol: 0,
    mode: "normal",
    command: "",
    message: "i insert  :w save  :q quit  :wq save quit  Esc normal",
    dirty: false
  };
  if (!editor.lines.length) editor.lines = [""];
  state.editor = editor;
  layout.editor.show();
  renderEditor(state, layout, screen);
  layout.editor.focus();
}

function editorContent(editor) {
  return editor.lines.join("\n");
}

function closeEditor(state, layout, screen, message = "Editor closed") {
  const entry = state.editor?.entry;
  const activeTab = state.activeTab;
  state.editor = null;
  layout.editor.hide();
  state.statusMap = gitStatusMap(state.cwd);
  state.mode = message;
  if (activeTab === "Commit") {
    setCommit(state, layout, screen, entry?.relative);
    const index = activeEntries(state).findIndex((candidate) => candidate.relative === entry?.relative);
    if (index >= 0) layout.sidebar.select(index);
  } else {
    refreshRepository(state, layout, screen, entry?.relative);
  }
  state.mode = message;
  renderHeader(layout.header, state);
  screen.render();
}

function saveEditor(state) {
  const editor = state.editor;
  fs.writeFileSync(editor.entry.absolute, editorContent(editor), "utf8");
  editor.original = editorContent(editor);
  editor.dirty = false;
  editor.message = `Saved ${editor.entry.relative}`;
}

function renderEditor(state, layout, screen) {
  const editor = state.editor;
  if (!editor) return;

  const innerHeight = Math.max(1, (screen.height || 24) - 5);
  const innerWidth = Math.max(20, (screen.width || 80) - 4);
  const lineNoWidth = String(editor.lines.length).length;
  const codeWidth = Math.max(1, innerWidth - lineNoWidth - 3);

  if (editor.row < editor.scrollRow) editor.scrollRow = editor.row;
  if (editor.row >= editor.scrollRow + innerHeight) editor.scrollRow = editor.row - innerHeight + 1;
  if (editor.col < editor.scrollCol) editor.scrollCol = editor.col;
  if (editor.col >= editor.scrollCol + codeWidth) editor.scrollCol = editor.col - codeWidth + 1;

  const rows = [];
  for (let row = editor.scrollRow; row < Math.min(editor.lines.length, editor.scrollRow + innerHeight); row += 1) {
    const line = editor.lines[row] ?? "";
    const raw = clipVisible(line, editor.scrollCol, codeWidth);
    let highlighted = highlightLineForFile(editor.entry.absolute, raw);
    if (row === editor.row) {
      const cursor = Math.max(0, Math.min(editor.col - editor.scrollCol, raw.length));
      const before = raw.slice(0, cursor);
      const current = raw[cursor] || " ";
      const after = raw.slice(cursor + (raw[cursor] ? 1 : 0));
      highlighted = `${highlightLineForFile(editor.entry.absolute, before)}{black-fg}{white-bg}${escapeTags(current)}{/white-bg}{/black-fg}${highlightLineForFile(editor.entry.absolute, after)}`;
    }
    const number = String(row + 1).padStart(lineNoWidth, " ");
    const gutter = row === editor.row ? `{blue-fg}${number}{/blue-fg}` : `{gray-fg}${number}{/gray-fg}`;
    rows.push(`${gutter} {gray-fg}│{/gray-fg} ${highlighted}`);
  }

  const dirty = editor.dirty ? " [+]" : "";
  const mode = editor.mode === "command" ? `:${editor.command}` : editor.mode.toUpperCase();
  layout.editor.setLabel(` Editor ${editor.entry.relative}${dirty} `);
  layout.editor.setContent([
    ...rows,
    "",
    `{blue-bg}{black-fg} ${mode.padEnd(10)} {/black-fg}{/blue-bg} ${escapeTags(editor.message)}`
  ].join("\n"));
  screen.render();
}

function clampEditorCursor(editor) {
  editor.row = Math.max(0, Math.min(editor.row, editor.lines.length - 1));
  const line = editor.lines[editor.row] ?? "";
  editor.col = Math.max(0, Math.min(editor.col, line.length));
}

function moveEditor(editor, deltaRow, deltaCol) {
  editor.row += deltaRow;
  editor.col += deltaCol;
  clampEditorCursor(editor);
}

function insertText(editor, text) {
  const line = editor.lines[editor.row] ?? "";
  editor.lines[editor.row] = line.slice(0, editor.col) + text + line.slice(editor.col);
  editor.col += text.length;
  editor.dirty = true;
}

function insertNewline(editor) {
  const line = editor.lines[editor.row] ?? "";
  editor.lines.splice(editor.row + 1, 0, line.slice(editor.col));
  editor.lines[editor.row] = line.slice(0, editor.col);
  editor.row += 1;
  editor.col = 0;
  editor.dirty = true;
}

function backspaceEditor(editor) {
  if (editor.col > 0) {
    const line = editor.lines[editor.row] ?? "";
    editor.lines[editor.row] = line.slice(0, editor.col - 1) + line.slice(editor.col);
    editor.col -= 1;
    editor.dirty = true;
    return;
  }
  if (editor.row > 0) {
    const previousLength = editor.lines[editor.row - 1].length;
    editor.lines[editor.row - 1] += editor.lines[editor.row];
    editor.lines.splice(editor.row, 1);
    editor.row -= 1;
    editor.col = previousLength;
    editor.dirty = true;
  }
}

function deleteEditorChar(editor) {
  const line = editor.lines[editor.row] ?? "";
  if (editor.col < line.length) {
    editor.lines[editor.row] = line.slice(0, editor.col) + line.slice(editor.col + 1);
    editor.dirty = true;
  } else if (editor.row < editor.lines.length - 1) {
    editor.lines[editor.row] += editor.lines[editor.row + 1];
    editor.lines.splice(editor.row + 1, 1);
    editor.dirty = true;
  }
}

function deleteEditorLine(editor) {
  editor.lines.splice(editor.row, 1);
  if (!editor.lines.length) editor.lines.push("");
  clampEditorCursor(editor);
  editor.dirty = true;
}

function runEditorCommand(state, layout, screen) {
  const editor = state.editor;
  const commandText = editor.command.trim();
  editor.command = "";
  editor.mode = "normal";

  try {
    if (commandText === "w") {
      saveEditor(state);
    } else if (commandText === "q") {
      if (editor.dirty) editor.message = "Unsaved changes. Use :q! to discard or :wq to save.";
      else closeEditor(state, layout, screen);
    } else if (commandText === "q!") {
      closeEditor(state, layout, screen, `Discarded changes to ${editor.entry.relative}`);
    } else if (commandText === "wq" || commandText === "x") {
      saveEditor(state);
      closeEditor(state, layout, screen, `Saved ${editor.entry.relative}`);
    } else {
      editor.message = `Unknown command: :${commandText}`;
    }
  } catch (error) {
    editor.message = `Command failed: ${error.message}`;
  }
}

function handleEditorKey(ch, key, state, layout, screen) {
  const editor = state.editor;
  if (!editor) return false;
  const name = key?.name || "";

  if (editor.mode === "command") {
    if (name === "escape") {
      editor.command = "";
      editor.mode = "normal";
    } else if (name === "enter") {
      runEditorCommand(state, layout, screen);
    } else if (name === "backspace") {
      editor.command = editor.command.slice(0, -1);
    } else if (ch && !key.ctrl && ch >= " ") {
      editor.command += ch;
    }
    renderEditor(state, layout, screen);
    return true;
  }

  if (editor.mode === "insert") {
    if (name === "escape") editor.mode = "normal";
    else if (name === "left") moveEditor(editor, 0, -1);
    else if (name === "right") moveEditor(editor, 0, 1);
    else if (name === "up") moveEditor(editor, -1, 0);
    else if (name === "down") moveEditor(editor, 1, 0);
    else if (name === "enter") insertNewline(editor);
    else if (name === "backspace") backspaceEditor(editor);
    else if (name === "delete") deleteEditorChar(editor);
    else if (ch && !key.ctrl && ch >= " ") insertText(editor, ch);
    renderEditor(state, layout, screen);
    return true;
  }

  if (name === "escape") {
    editor.message = "Already in normal mode";
  } else if (name === "left" || ch === "h") moveEditor(editor, 0, -1);
  else if (name === "right" || ch === "l") moveEditor(editor, 0, 1);
  else if (name === "up" || ch === "k") moveEditor(editor, -1, 0);
  else if (name === "down" || ch === "j") moveEditor(editor, 1, 0);
  else if (ch === "0") editor.col = 0;
  else if (ch === "$") editor.col = (editor.lines[editor.row] ?? "").length;
  else if (ch === "g") editor.row = 0;
  else if (ch === "G") editor.row = editor.lines.length - 1;
  else if (ch === "i") editor.mode = "insert";
  else if (ch === "a") {
    editor.col = Math.min((editor.lines[editor.row] ?? "").length, editor.col + 1);
    editor.mode = "insert";
  } else if (ch === "o") {
    editor.col = (editor.lines[editor.row] ?? "").length;
    insertNewline(editor);
    editor.mode = "insert";
  } else if (ch === "x") deleteEditorChar(editor);
  else if (ch === "d") {
    if (editor.pending === "d") {
      deleteEditorLine(editor);
      editor.pending = "";
    } else {
      editor.pending = "d";
      editor.message = "d: press d again to delete line";
    }
  } else if (ch === ":") {
    editor.command = "";
    editor.mode = "command";
    editor.pending = "";
  } else {
    editor.pending = "";
  }
  clampEditorCursor(editor);
  renderEditor(state, layout, screen);
  return true;
}

function editSelectedFile(state, layout, screen) {
  const entry = selectedFile(state, layout);
  if (!entry) {
    state.mode = "No file selected";
    renderHeader(layout.header, state);
    screen.render();
    return;
  }
  if (entry.type !== "file") {
    state.mode = `Cannot edit directory: ${entry.relative}`;
    renderHeader(layout.header, state);
    screen.render();
    return;
  }
  openInternalEditor(state, layout, screen, entry);
}

function setIssues(state, layout, screen) {
  state.viewFiles = null;
  state.viewEntries = issueItems(state);
  layout.sidebar.setLabel(" Issues ");
  layout.sidebar.setItems(state.viewEntries.map((entry) => entry.label));
  layout.sidebar.select(0);
  layout.center.setLabel(" Issue Sources ");
  layout.center.setItems([
    commandExists("gh", state.cwd) ? "{green-fg}gh available{/green-fg}" : "{yellow-fg}gh not installed{/yellow-fg}",
    isGitRepo(state.cwd) ? "{green-fg}Git repository{/green-fg}" : "{yellow-fg}Not a Git repo{/yellow-fg}",
    "Local scan: TODO, FIXME, HACK, BUG",
    "Enter previews source context when available"
  ]);
  showSelectedFile(state, layout, screen);
  screen.render();
}

function setAgents(state, layout, screen) {
  state.viewFiles = null;
  state.viewEntries = null;
  layout.sidebar.setLabel(" Files ");
  layout.sidebar.setItems(decorateFileLabels(state.files, state.statusMap));
  layout.sidebar.select(Math.min(layout.sidebar.selected, Math.max(0, state.files.length - 1)));
  layout.center.setLabel(" Agent ");
  layout.center.setItems([
    `{bold}Model{/bold} ${escapeTags(agentModel)}`,
    process.env.OPENAI_API_KEY ? "{green-fg}OPENAI_API_KEY configured{/green-fg}" : "{yellow-fg}OPENAI_API_KEY missing{/yellow-fg}",
    "Freeform text asks the agent",
    "Slash commands stay local",
    "v focuses transcript",
    "a focuses input",
    "",
    "/commit [hash] inspect commit",
    "/diff          selected file diff",
    "/search <q>    project search",
    "/open <path>   jump to file",
    "/refresh       reload git state"
  ]);
  renderAgentTranscript(state, layout);
  screen.render();
}

function renderAgentTranscript(state, layout) {
  layout.right.setLabel(" OpenAI Git Agent: j/k scroll, a input ");
  if (!state.agentMessages.length) {
    layout.right.setContent([
      "{bold}Ask about the selected commit or working tree.{/bold}",
      "",
      "Examples:",
      "- Explain this commit",
      "- What changed and what should I review?",
      "- Is this dependency API still current?",
      "- Draft a PR summary",
      "",
      `{bold}Current git status{/bold}`,
      ...statusItems(state.cwd)
    ].join("\n"));
    return;
  }

  layout.right.setContent(state.agentMessages.map((message) => {
    const name = message.role === "user" ? "{blue-fg}you{/blue-fg}" : message.role === "error" ? "{red-fg}error{/red-fg}" : "{green-fg}agent{/green-fg}";
    return `${name}\n${escapeTags(message.content)}`;
  }).join("\n\n"));
  layout.right.setScrollPerc(100);
}

function setSearch(state, layout, screen) {
  state.viewFiles = null;
  state.viewEntries = state.searchResults?.length ? state.searchResults : state.files;
  layout.sidebar.setLabel(state.searchQuery ? ` Search: ${state.searchQuery} ` : " Searchable Files ");
  layout.sidebar.setItems(state.searchResults?.length ? state.searchResults.map((entry) => entry.label) : decorateFileLabels(state.files, state.statusMap));
  layout.sidebar.select(0);
  layout.center.setLabel(" Search ");
  layout.center.setItems([
    "/search <query> searches file contents",
    "/open <path> jumps to a file",
    "/refresh reloads files",
    state.searchQuery ? `Current query: ${escapeTags(state.searchQuery)}` : "No search query yet"
  ]);
  showSelectedFile(state, layout, screen);
}

function setHelp(state, layout, screen) {
  state.viewFiles = null;
  state.viewEntries = helpTopics.map((topic) => ({
    type: "help",
    relative: topic.title,
    absolute: state.cwd,
    summary: topic.content.join("\n"),
    label: topic.title
  }));
  layout.sidebar.setLabel(" Help Topics ");
  layout.sidebar.setItems(state.viewEntries.map((entry) => entry.label));
  layout.sidebar.select(Math.min(layout.sidebar.selected, Math.max(0, state.viewEntries.length - 1)));
  layout.center.setLabel(" Help Index ");
  layout.center.setItems([
    "1 Repository",
    "2 Commit",
    "3 Issues",
    "4 Agents",
    "5 Search",
    "6 Help",
    "",
    "a        ask agent",
    "ctrl+k   command prompt",
    "q        quit"
  ]);
  showSelectedFile(state, layout, screen);
  screen.render();
}

function applyView(state, layout, screen) {
  if (state.activeTab === "Repository") setRepository(state, layout, screen);
  if (state.activeTab === "Commit") setCommit(state, layout, screen);
  if (state.activeTab === "Issues") setIssues(state, layout, screen);
  if (state.activeTab === "Agents") setAgents(state, layout, screen);
  if (state.activeTab === "Search") setSearch(state, layout, screen);
  if (state.activeTab === "Help") setHelp(state, layout, screen);
  renderHeader(layout.header, state);
}

function jumpToFile(query, state, layout, screen) {
  const normalized = query.trim();
  const index = state.files.findIndex((entry) => entry.relative === normalized || entry.relative.endsWith(normalized));
  if (index === -1) {
    state.mode = `File not found: ${normalized}`;
    renderHeader(layout.header, state);
    screen.render();
    return;
  }
  state.activeTab = "Repository";
  setRepository(state, layout, screen);
  layout.sidebar.select(index);
  showSelectedFile(state, layout, screen);
  layout.sidebar.focus();
}

async function handleCommand(command, state, layout, screen) {
  const trimmed = command.trim();
  if (!trimmed) return;

  if (!trimmed.startsWith("/") && trimmed !== "git status") {
    if (state.agentBusy) {
      state.mode = "Agent is already working";
      renderHeader(layout.header, state);
      screen.render();
      return;
    }
    state.activeTab = "Agents";
    state.agentBusy = true;
    state.agentMessages.push({ role: "user", content: trimmed });
    state.agentMessages.push({ role: "assistant", content: "Thinking..." });
    state.mode = `Agent: ${trimmed}`;
    setAgents(state, layout, screen);
    renderHeader(layout.header, state);
    screen.render();
    try {
      const answer = await callOpenAIAgent(trimmed, state, layout);
      state.agentMessages[state.agentMessages.length - 1] = { role: "assistant", content: answer };
      state.mode = "Agent response ready";
    } catch (error) {
      state.agentMessages[state.agentMessages.length - 1] = { role: "error", content: error.message };
      state.mode = "Agent request failed";
    } finally {
      state.agentBusy = false;
      state.statusMap = gitStatusMap(state.cwd);
      renderAgentTranscript(state, layout);
      renderHeader(layout.header, state);
      layout.input.clearValue();
      layout.input.setValue("> ");
      layout.right.focus();
      screen.render();
    }
    return;
  }

  if (trimmed === "/files") {
    state.activeTab = "Repository";
    state.mode = "Repository file browser";
    setRepository(state, layout, screen);
  } else if (trimmed === "/edit") {
    editSelectedFile(state, layout, screen);
  } else if (trimmed === "/diff") {
    showSelectedFile(state, layout, screen, true);
  } else if (trimmed === "/commit") {
    state.activeTab = "Repository";
    applyView(state, layout, screen);
    layout.center.focus();
    showSelectedCommit(state, layout, screen, true);
  } else if (trimmed.startsWith("/commit ")) {
    const query = trimmed.slice(8).trim();
    state.activeTab = "Repository";
    applyView(state, layout, screen);
    const index = state.commits.findIndex((entry) => entry.type === "commit" && (entry.hash.startsWith(query) || entry.short === query));
    if (index >= 0) layout.center.select(index);
    layout.center.focus();
    showSelectedCommit(state, layout, screen, true);
  } else if (trimmed === "/refresh") {
    state.mode = "Refreshed files and Git status";
    if (state.activeTab === "Commit") refreshCommitView(state, layout, screen);
    else refreshRepository(state, layout, screen);
  } else if (trimmed.startsWith("/open ")) {
    jumpToFile(trimmed.slice(6), state, layout, screen);
  } else if (trimmed.startsWith("/search ")) {
    state.searchQuery = trimmed.slice(8).trim();
    state.searchResults = searchProject(state, state.searchQuery);
    state.activeTab = "Search";
    state.mode = `Search: ${state.searchQuery}`;
    setSearch(state, layout, screen);
  } else if (trimmed.startsWith("/message ")) {
    state.commitMessage = trimmed.slice(9).trim();
    state.activeTab = "Commit";
    state.mode = state.commitMessage ? "Commit message updated" : "Commit message cleared";
    setCommit(state, layout, screen);
  } else if (trimmed === "/message") {
    state.activeTab = "Commit";
    state.mode = "Usage: /message <commit message>";
    setCommit(state, layout, screen);
  } else if (trimmed === "/commit-create") {
    state.activeTab = "Commit";
    setCommit(state, layout, screen);
    createCommitFromForm(state, layout, screen);
  } else if (trimmed.startsWith("/ignore ")) {
    const name = trimmed.slice(8).trim();
    if (name) ignoredNames.add(name);
    state.mode = name ? `Ignoring: ${name}` : "No ignore name provided";
    refreshRepository(state, layout, screen);
  } else if (trimmed.startsWith("/unignore ")) {
    const name = trimmed.slice(10).trim();
    if (name) ignoredNames.delete(name);
    state.mode = name ? `Not ignoring: ${name}` : "No ignore name provided";
    refreshRepository(state, layout, screen);
  } else if (trimmed === "git status") {
    state.activeTab = "Commit";
    state.mode = "Git status";
    setCommit(state, layout, screen);
  } else {
    state.activeTab = "Agents";
    state.mode = `Command: ${trimmed}`;
    setAgents(state, layout, screen);
  }

  renderHeader(layout.header, state);
  layout.input.clearValue();
  screen.render();
}

export function run() {
  const cwd = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: "guitui"
  });
  screen.program.setMouse({ sendFocus: true }, true);
  screen.style = { bg: palette.bg };

  const state = {
    cwd,
    activeTab: "Repository",
    mode: "Repository file browser",
    files: buildFileTree(cwd),
    statusMap: gitStatusMap(cwd),
    commits: commitEntries(cwd),
    viewFiles: null,
    viewEntries: null,
    searchQuery: "",
    searchResults: [],
    agentMessages: [],
    agentBusy: false,
    agentResponseId: "",
    commitMessage: "",
    commitPreviewedFile: "",
    commitEnterHandledAt: 0,
    editor: null
  };
  const layout = createLayout(screen, state);

  renderHeader(layout.header, state);
  setRepository(state, layout, screen);
  layout.input.setValue("> ");
  layout.sidebar.focus();

  layout.sidebar.on("select", () => {
    if (state.activeTab === "Commit") {
      state.commitPreviewedFile = "";
      layout.right.setLabel(" File Diff Preview ");
      layout.right.setContent("Press Enter to preview this file. Press s to stage the selected file.");
      screen.render();
      return;
    }
    showSelectedFile(state, layout, screen);
  });

  layout.sidebar.on("keypress", (_, key = {}) => {
    setTimeout(() => {
      if (state.activeTab === "Commit" && ["enter", "space"].includes(key.name)) {
        previewSelectedCommitFile(state, layout, screen);
        return;
      }
      if (state.activeTab === "Commit") return;
      if (["up", "down", "k", "j", "enter", "space"].includes(key.name)) {
        showSelectedFile(state, layout, screen);
      }
    }, 0);
  });

  layout.center.on("select", () => {
    if (state.activeTab === "Repository") showSelectedCommit(state, layout, screen);
  });

  layout.center.on("keypress", (_, key = {}) => {
    setTimeout(() => {
      if (key.name === "b") {
        layout.sidebar.focus();
        state.mode = "File browser focused";
        renderHeader(layout.header, state);
        screen.render();
        return;
      }
      if (state.activeTab === "Repository" && ["enter", "space"].includes(key.name)) {
        showSelectedCommit(state, layout, screen, true);
      }
    }, 0);
  });

  layout.right.on("keypress", (_, key = {}) => {
    if (state.editor) return;
    const lineStep = Math.max(1, Math.floor((screen.height || 24) / 4));
    if (key.name === "b") {
      layout.sidebar.focus();
      state.mode = "File browser focused";
      renderHeader(layout.header, state);
      screen.render();
      return;
    }
    if (key.name === "c" && state.activeTab === "Repository") {
      layout.center.focus();
      state.mode = "Commit graph focused. Press enter to inspect a commit.";
      renderHeader(layout.header, state);
      screen.render();
      return;
    }
    if (key.name === "f" && state.activeTab === "Commit") {
      layout.sidebar.focus();
      state.mode = "Changed files focused";
      renderHeader(layout.header, state);
      screen.render();
      return;
    }
    if (key.name === "a" && state.activeTab === "Agents") {
      layout.input.setValue("> ");
      layout.input.focus();
      state.mode = "Agent input focused";
      renderHeader(layout.header, state);
      screen.render();
      return;
    }
    if (key.name === "down" || key.name === "j") layout.right.scroll(1);
    else if (key.name === "up" || key.name === "k") layout.right.scroll(-1);
    else if (key.name === "pagedown" || key.name === "C-d" || key.name === "space") layout.right.scroll(lineStep);
    else if (key.name === "pageup" || key.name === "C-u") layout.right.scroll(-lineStep);
    else if (key.name === "home" || key.name === "g") layout.right.setScroll(0);
    else if (key.name === "end" || key.name === "G") layout.right.setScrollPerc(100);
    else return;
    screen.render();
  });

  screen.on("keypress", (ch, key = {}) => {
    if (state.editor) handleEditorKey(ch, key, state, layout, screen);
  });

  layout.input.on("submit", async (value) => {
    layout.input.clearValue();
    layout.input.setValue("> ");
    screen.render();
    await handleCommand(value.replace(/^>\s*/, ""), state, layout, screen);
    if (!state.agentBusy && screen.focused !== layout.input) layout.sidebar.focus();
  });

  layout.input.key("escape", () => {
    layout.input.clearValue();
    layout.input.setValue("> ");
    layout.sidebar.focus();
    state.mode = "Navigation focused";
    renderHeader(layout.header, state);
    screen.render();
  });

  layout.header.on("click", (event) => {
    if (state.editor) return;
    const tab = tabFromX(event.x);
    if (tab) switchTo(tab);
  });

  tabs.forEach((tab, index) => {
    screen.key(`${index + 1}`, () => {
      if (state.editor) return;
      switchTo(tab);
    });
  });

  screen.on("keypress", (_, key = {}) => {
    if (state.editor) return;
    if (screen.focused === layout.input) return;
    if (screen.focused === layout.right) return;
    if (key.name === "tab" || key.name === "right" || key.name === "l" || key.name === "]") switchTab(1);
    if (key.name === "S-tab" || key.name === "left" || key.name === "h" || key.name === "[") switchTab(-1);
  });

  screen.key(["C-k", ":"], () => {
    if (state.editor) return;
    layout.input.setValue("> /");
    layout.input.focus();
    screen.render();
  });
  screen.key("a", () => {
    if (screen.focused === layout.input) return;
    if (state.editor) return;
    state.activeTab = "Agents";
    setAgents(state, layout, screen);
    layout.input.setValue("> ");
    layout.input.focus();
    state.mode = "Agent input focused";
    renderHeader(layout.header, state);
    screen.render();
  });
  screen.key("v", () => {
    if (state.editor) return;
    if (state.activeTab !== "Agents") return;
    layout.right.focus();
    state.mode = "Agent transcript focused";
    renderHeader(layout.header, state);
    screen.render();
  });

  screen.key("enter", () => {
    if (state.editor) return;
    if (screen.focused === layout.sidebar && state.activeTab === "Commit") {
      previewSelectedCommitFile(state, layout, screen);
      return;
    }
    if (screen.focused === layout.sidebar) showSelectedFile(state, layout, screen);
    if (screen.focused === layout.center && state.activeTab === "Repository") showSelectedCommit(state, layout, screen, true);
  });
  screen.key("b", () => {
    if (state.editor) return;
    layout.sidebar.focus();
    state.mode = "File browser focused";
    renderHeader(layout.header, state);
    screen.render();
  });
  screen.key("c", () => {
    if (state.editor) return;
    if (state.activeTab === "Commit") {
      createCommitFromForm(state, layout, screen);
      return;
    }
    if (state.activeTab !== "Repository") switchTo("Repository");
    layout.center.focus();
    state.mode = "Commit graph focused. Press enter to inspect a commit.";
    renderHeader(layout.header, state);
    screen.render();
  });
  screen.key("d", () => {
    if (state.editor) return;
    showSelectedFile(state, layout, screen, true);
  });
  screen.key("e", () => {
    if (state.editor) return;
    editSelectedFile(state, layout, screen);
  });
  screen.key("m", () => {
    if (state.editor) return;
    if (state.activeTab !== "Commit") return;
    layout.input.setValue(`> /message ${state.commitMessage}`);
    layout.input.focus();
    state.mode = "Editing commit message";
    renderHeader(layout.header, state);
    screen.render();
  });
  screen.key("s", () => {
    if (state.editor) return;
    if (state.activeTab !== "Commit") return;
    stageSelectedFile(state, layout, screen);
  });
  screen.key("C", () => {
    if (state.editor) return;
    if (state.activeTab !== "Commit") return;
    createCommitFromForm(state, layout, screen);
  });
  screen.key("u", () => {
    if (state.editor) return;
    if (state.activeTab !== "Commit") return;
    unstageSelectedFile(state, layout, screen);
  });
  screen.key("r", () => {
    if (state.editor) return;
    if (state.activeTab === "Commit") refreshCommitView(state, layout, screen);
    else refreshRepository(state, layout, screen);
  });
  screen.key(["g r"], () => {
    if (state.editor) return;
    switchTo("Repository");
  });
  screen.key(["g p"], () => {
    if (state.editor) return;
    switchTo("Commit");
  });
  screen.key(["g i"], () => {
    if (state.editor) return;
    switchTo("Issues");
  });
  screen.key(["g a"], () => {
    if (state.editor) return;
    switchTo("Agents");
  });
  screen.key(["g s"], () => {
    if (state.editor) return;
    switchTo("Search");
  });
  screen.key(["g h"], () => {
    if (state.editor) return;
    switchTo("Help");
  });
  screen.key(["q", "C-c"], (_, key = {}) => {
    if (state.editor && !(key.ctrl && key.name === "c")) return;
    process.exit(0);
  });

  function switchTab(delta) {
    const current = tabs.indexOf(state.activeTab);
    const next = (current + delta + tabs.length) % tabs.length;
    switchTo(tabs[next]);
  }

  function tabFromX(x) {
    let cursor = 3;
    for (const tab of tabs) {
      const start = cursor;
      const end = start + tab.length + 1;
      if (x >= start && x <= end) return tab;
      cursor = end + 2;
    }
    return null;
  }

  function switchTo(tab) {
    state.activeTab = tab;
    state.mode = `${tab} view`;
    state.viewFiles = null;
    state.viewEntries = null;
    applyView(state, layout, screen);
    layout.sidebar.focus();
    screen.render();
  }

  screen.render();
}
