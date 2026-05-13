import fs from "node:fs";
import path from "node:path";

import { ignoredNames, textExtensions } from "./config.js";
import { git, isGitRepo } from "./git.js";
import { escapeTags, highlightLineForFile } from "./highlight.js";

export function colorStatus(code) {
  if (code.includes("M")) return "{yellow-fg}M{/yellow-fg}";
  if (code.includes("A") || code.includes("?")) return "{green-fg}+{/green-fg}";
  if (code.includes("D")) return "{red-fg}-{/red-fg}";
  if (code.includes("R")) return "{blue-fg}R{/blue-fg}";
  return "{gray-fg}.{/gray-fg}";
}

export function buildFileTree(root, maxEntries = 700) {
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

export function gitStatusMap(cwd) {
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

export function decorateFileLabels(entries, statusMap) {
  return entries.map((entry) => {
    if (entry.type !== "file") return entry.label;
    const status = statusMap.get(entry.relative);
    return status ? `${colorStatus(status)} ${entry.label}` : `  ${entry.label}`;
  });
}

export function readFilePreview(entry) {
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

export function readContextPreview(entry, radius = 8) {
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

export function gitDiffForFile(cwd, entry) {
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
