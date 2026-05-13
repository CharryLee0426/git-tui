import { agentModel } from "./config.js";
import { currentCommit } from "./commit.js";
import { git, gitBranch, isGitRepo } from "./git.js";

function truncate(value, limit) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[truncated ${text.length - limit} chars]`;
}

function commitContext(state, layout, selectedFileEntry) {
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

export async function callOpenAIAgent(prompt, state, layout, selectedFileEntry) {
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
              commitContext(state, layout, selectedFileEntry),
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
