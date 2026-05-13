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

export function createPalette() {
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

export const palette = createPalette();
