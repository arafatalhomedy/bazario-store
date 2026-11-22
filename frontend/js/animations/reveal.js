/**
 * Fade + slide elements in when they scroll into view.
 * Mark elements with the `data-reveal` attribute.
 */
import { prefersReducedMotion } from "../utils/motion.js";

let observer = null;

export function initReveal() {
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
        document.documentElement.classList.add("no-reveal");
        return;
    }

    observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            }
        }
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });

    observeReveal(document.querySelectorAll("[data-reveal]"));
}

/** Watch new elements (e.g. product cards added after loading). */
export function observeReveal(nodes) {
    for (const node of nodes) {
        if (observer) observer.observe(node);
        else node.classList.add("is-visible");
    }
}