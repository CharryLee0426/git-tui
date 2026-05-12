#!/usr/bin/env node

if (process.platform === "darwin" && process.env.TERM === "xterm-256color") {
  process.env.TERM = "xterm";
}

const { run } = await import("../src/app.js");
run();
