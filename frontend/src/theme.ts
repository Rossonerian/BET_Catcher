export type Theme = "light" | "dark";

export const THEME_KEY = "verity-theme";

function storedTheme(): Theme | null {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

/** System preference; jsdom has no matchMedia, so it falls back to light. */
function systemTheme(): Theme {
  if (typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Stored choice if it is "light" or "dark", otherwise the system preference. */
export function getInitialTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

/** Sets data-theme on <html>; persists the choice unless persist is false (e.g. on first mount). */
export function applyTheme(theme: Theme, persist = true): void {
  document.documentElement.dataset.theme = theme;
  if (!persist) return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked: the theme still applies for this page view.
  }
}
