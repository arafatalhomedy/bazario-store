/**
 * Lazy start helpers: run heavy work only when it's actually needed.
 */

/** Run `start` once the element is near the screen (right away if it already is). */
export function whenNear(element, start, margin = "400px") {
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
        start();
        return;
    }
    const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        start();
    }, { rootMargin: `${margin} 0px` });
    observer.observe(element);
}

/** Run `start` when the browser has a quiet moment (at the latest after `timeout` ms). */
export function whenIdle(start, timeout = 2500) {
    if ("requestIdleCallback" in window) {
        window.requestIdleCallback(() => start(), { timeout });
    } else {
        setTimeout(start, 1200);
    }
}
/**
 * Sections fade and slide into place the moment they scroll into view.
 * If JavaScript is off, or the visitor prefers less motion, they simply show.
 */
export function revealOnScroll(elements) {
    const list = [...elements].filter(Boolean);
    if (!list.length || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    list.forEach((element) => element.classList.add("bz-reveal"));
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("bz-in");
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.12 });
    list.forEach((element) => observer.observe(element));
}