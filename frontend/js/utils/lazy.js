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