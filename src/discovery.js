import fs from "node:fs";
import path from "node:path";

import { isGitRepo } from "./git.js";
import { escapeTags } from "./highlight.js";
import { command, commandExists } from "./shell.js";

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

export function issueItems(state) {
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

export function searchProject(state, query) {
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
