/**
 * Performance helper (every page):
 * 1. Sections that are off screen get .is-offscreen, which pauses their
 *    animations (css/core/perf.css). They start again when scrolled into view.
 * 2. Phones: only the product photo flight (card → product page) uses a page
 *    transition. Every other link opens instantly, so the screen never freezes
 *    while the next page loads.
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
})();