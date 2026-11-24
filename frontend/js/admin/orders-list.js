/**
 * Admin Orders list:
 *  1. Search does nothing when the box is empty (or the same search) — the box shakes instead
 *  2. "/" anywhere jumps into the search box
 *  3. Header counters count up
 */
(function () {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const form = document.getElementById("changelist-search");
    const input = document.getElementById("searchbar");

    if (form && input) {
        const current = (new URLSearchParams(window.location.search).get("q") || "").trim();

        form.addEventListener("submit", (event) => {
            const value = input.value.trim();
            // Nothing new to search: stay on the page
            if (value === current) {
                event.preventDefault();
                input.focus();
                input.classList.remove("is-shake");
                void input.offsetWidth;   // restart the shake
                input.classList.add("is-shake");
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key !== "/" || event.target.closest("input, textarea, select, [contenteditable]")) return;
            event.preventDefault();
            input.focus();
        });
    }

    if (reduced) return;
    document.querySelectorAll("[data-bz-count]").forEach((node, index) => {
        const end = Number(node.textContent.trim()) || 0;
        if (!end) return;
        const start = performance.now() + 250 + index * 80;
        const tick = (now) => {
            const t = Math.max(0, Math.min((now - start) / 800, 1));
            node.textContent = String(Math.round(end * (1 - Math.pow(1 - t, 3))));
            if (t < 1) requestAnimationFrame(tick);
        };
        node.textContent = "0";
        requestAnimationFrame(tick);
    });
})();