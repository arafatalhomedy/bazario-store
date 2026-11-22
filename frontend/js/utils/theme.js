/**
 * Light / dark theme helpers.
 * The FIRST theme is set by the small inline script in index.html <head>
 * (to avoid a white flash). These functions take over after page load.
 */
const STORAGE_KEY = "theme";
const THEME_COLORS = { light: "#f4f1ea", dark: "#0e0e0f" }; // browser bar color on phones
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

/** Which theme is active right now: "light" or "dark". */
export function getTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Switch the whole site to a theme. */
export function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
}

/** Remember the visitor's choice for next time. */
export function saveTheme(theme) {
    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch {
        /* Saving blocked (e.g. private mode): theme still works for this visit */
    }
}

function hasSavedTheme() {
    try {
        return Boolean(localStorage.getItem(STORAGE_KEY));
    } catch {
        return false;
    }
}

/** Follow the device's light/dark setting while the visitor hasn't picked one. */
export function followSystemTheme(onChange) {
    darkQuery.addEventListener("change", (event) => {
        if (hasSavedTheme()) return;
        const theme = event.matches ? "dark" : "light";
        applyTheme(theme);
        onChange?.(theme);
    });
}