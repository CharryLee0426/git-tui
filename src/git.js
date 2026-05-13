import { execFileSync } from "node:child_process";

export function git(args, cwd) {
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

export function gitOk(args, cwd) {
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

export function isGitRepo(cwd) {
  return git(["rev-parse", "--is-inside-work-tree"], cwd) === "true";
}

export function gitBranch(cwd) {
  return git(["branch", "--show-current"], cwd) || "no-git";
}

export function gitBranches(cwd) {
  const output = git(["branch", "--all", "--format=%(HEAD)%09%(refname:short)"], cwd);
  if (!output) return [];
  return output.split("\n").map((line) => {
    const [head = "", name = ""] = line.split("\t");
    return { name, current: head.trim() === "*" };
  }).filter((branch) => branch.name);
}

export function branchSummary(cwd) {
  if (!isGitRepo(cwd)) return "no-git";
  const branches = gitBranches(cwd);
  const current = branches.find((branch) => branch.current)?.name || gitBranch(cwd);
  const localCount = branches.filter((branch) => !branch.name.startsWith("remotes/")).length;
  const remoteCount = branches.length - localCount;
  return `${current}  ${localCount} local/${remoteCount} remote`;
}
