import fs from "node:fs";
import path from "node:path";

import { git, gitBranch, gitOk, isGitRepo } from "./git.js";
import { escapeTags } from "./highlight.js";
import { colorStatus } from "./repository.js";

export function commitEntries(cwd) {
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

export function commitItems(state) {
  return state.commits.map((entry) => entry.label);
}

export function selectedCommit(state, layout) {
  return state.commits[layout.center.selected];
}

export function colorPatch(output) {
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

export function renderCommitDetails(cwd, commit) {
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

export function currentCommit(state, layout) {
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

export function statusItems(cwd) {
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

export function changedFileEntries(state) {
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

export function commitPanelItems(state) {
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

export function commitDiffForFile(cwd, entry) {
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
