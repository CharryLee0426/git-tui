import { execFileSync } from "node:child_process";

export function command(args, cwd) {
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

export function commandExists(name, cwd) {
  return Boolean(command(["which", name], cwd));
}
