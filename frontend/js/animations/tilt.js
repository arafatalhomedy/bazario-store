/**
 * 3D tilt + light glare that follows the mouse over product cards.
 * Uses one listener on the grid, so cards added later work too.
 * Disabled on touch screens and when reduced motion is on.
 */
import { hasFinePointer, prefersReducedMotion } from "../utils/motion.js";

const MAX_TILT_DEG = 7;

export function initTilt(container, selector = ".card") {
    if (!container || prefersReducedMotion() || !hasFinePointer()) return;

    let frame = null;

    container.addEventListener("pointermove", (event) => {
        const card = event.target.closest(selector);
        if (!card || card.closest(".skeleton")) return;

        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            const rect = card.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width;
            const y = (event.clientY - rect.top) / rect.height;

            card.style.setProperty("--tilt-x", `${(0.5 - y) * MAX_TILT_DEG}deg`);
            card.style.setProperty("--tilt-y", `${(x - 0.5) * MAX_TILT_DEG}deg`);
            card.style.setProperty("--glare-x", `${x * 100}%`);
            card.style.setProperty("--glare-y", `${y * 100}%`);
            card.classList.add("is-tilting");
        });
    });

    container.addEventListener("pointerout", (event) => {
        const card = event.target.closest(selector);
        if (!card || card.contains(event.relatedTarget)) return;

        cancelAnimationFrame(frame);
        card.classList.remove("is-tilting");
        card.style.removeProperty("--tilt-x");
        card.style.removeProperty("--tilt-y");
    });
}