/**
 * Performance helper (every page):
 * 1. Sections that are off screen get .is-offscreen, which pauses their
 *    animations (css/core/perf.css). They start again when scrolled into view.
 * 2. Phones: only the product photo flight (card → product page) uses a page
 *    transition. Every other link opens instantly, so the screen never freezes
 *    while the next page loads.
 * 3. Phones: while the finger is scrolling, decorations (belt, ribbons, floating
 *    card, spinning badge) pause, so the phone only has to move the page.
 *    They continue a moment after scrolling stops (css/core/perf.css).
 */
(function () {
    /* ---------- 1. Pause off-screen animations ---------- */
    if ("IntersectionObserver" in window) {
        const watch = () => {
            const parts = document.querySelectorAll(
                "main > section, main > div > section, main > div > header, body > footer, footer.footer, [data-pause-offscreen]"
            );
            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => entry.target.classList.toggle("is-offscreen", !entry.isIntersecting));
            }, { rootMargin: "200px 0px" });
            parts.forEach((part) => observer.observe(part));
        };

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", watch, { once: true });
        } else {
            watch();
        }
    }

    /* ---------- 2. Phones: page transition only for the photo flight ---------- */
    const phone = window.matchMedia("(hover: none), (max-width: 820px)");
    window.addEventListener("pageswap", (event) => {
        if (!event.viewTransition || !phone.matches) return;
        // morph.js marks the tapped photo with an inline view-transition-name
        const flying = document.querySelector('[style*="view-transition-name: product-photo"]');
        if (!flying) event.viewTransition.skipTransition();
    });

    /* ---------- 3. Phones: decorations rest while scrolling ---------- */
    const root = document.documentElement;
    let restTimer = 0;
    window.addEventListener("scroll", () => {
        if (!phone.matches) return;
        if (!restTimer) root.classList.add("is-scrolling");
        clearTimeout(restTimer);
        restTimer = setTimeout(() => {
            root.classList.remove("is-scrolling");
            restTimer = 0;
        }, 160);
    }, { passive: true });
})();