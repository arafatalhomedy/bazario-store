/**
 * Performance helper (every page):
 * sections that are off screen get .is-offscreen, which pauses their
 * animations (css/core/perf.css). They start again when scrolled into view.
 */
(function () {
    if (!("IntersectionObserver" in window)) return;

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
})();