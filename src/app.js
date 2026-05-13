import fs from "node:fs";
import path from "node:path";
import blessed from "blessed";

import { callOpenAIAgent } from "./agent.js";
import {
  changedFileEntries,
  commitDiffForFile,
  commitEntries,
  commitItems,
  commitPanelItems,
  renderCommitDetails,
  selectedCommit,
  statusItems
} from "./commit.js";
import { agentModel, helpTopics, ignoredNames, tabs } from "./config.js";
import { issueItems, searchProject } from "./discovery.js";
import { branchSummary, git, gitBranch, isGitRepo } from "./git.js";
import { clipVisible, escapeTags, highlightLineForFile } from "./highlight.js";
import {
  buildFileTree,
  colorStatus,
  decorateFileLabels,
  gitDiffForFile,
  gitStatusMap,
  readContextPreview,
  readFilePreview
} from "./repository.js";
import { commandExists } from "./shell.js";
import { palette } from "./theme.js";
import { box, list } from "./ui.js";

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
      const answer = await callOpenAIAgent(trimmed, state, layout, selectedFile(state, layout));
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
