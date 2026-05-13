import blessed from "blessed";

import { palette } from "./theme.js";

export function box(options) {
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

export function list(options) {
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
