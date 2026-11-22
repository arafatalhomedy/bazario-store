/**
 * Magnetic buttons: elements lean toward the mouse.
 * Add the attribute  data-magnetic  to any element to use it.
 * The movement itself is done by CSS (see "Magnetic buttons" in components.css).
 */
import { hasFinePointer, prefersReducedMotion } from "../utils/motion.js";

const STRENGTH = 0.3; // 0 = no pull, 1 = follows the mouse completely

export function initMagnetic(root = document) {
    if (prefersReducedMotion() || !hasFinePointer()) return;

    for (const node of root.querySelectorAll("[data-magnetic]")) {
        node.addEventListener("pointermove", (event) => {
            const rect = node.getBoundingClientRect();
            const x = event.clientX - (rect.left + rect.width / 2);
            const y = event.clientY - (rect.top + rect.height / 2);
            node.style.setProperty("--mx", `${x * STRENGTH}px`);
            node.style.setProperty("--my", `${y * STRENGTH}px`);
        });

        node.addEventListener("pointerleave", () => {
            node.style.setProperty("--mx", "0px");
            node.style.setProperty("--my", "0px");
        });
    }
}