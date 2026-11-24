/**
 * Order details v4 motion:
 *  1. Title words roll in, then a light sweeps through them
 *  2. The total counts up
 *  3. A soft glow follows the mouse on the hero and journey
 *  4. Item rows tilt toward the mouse
 * Styles: css/orders/order-v4.css
 */
import { hasFinePointer, prefersReducedMotion } from "../utils/motion.js";

const COUNT_MS = 1000;
const TILT_X = 6;    // degrees left/right
const TILT_Y = 8;    // degrees up/down

export function initOrderMotion() {
    const root = document.querySelector("[data-order]");
    if (!root) return;
    const reduced = prefersReducedMotion();

    splitWords(root.querySelector("[data-od-words]"));
    if (reduced) return;

    countUp(root.querySelector("[data-od-count]"));
    if (!hasFinePointer()) return;
    spotlight(root.querySelectorAll("[data-spot]"));
    tilt(root.querySelectorAll(".order-item"));
}

/* 1. "Pending confirmation." → each word in its own span */
function splitWords(title) {
    if (!title) return;
    const words = title.textContent.trim().split(/\s+/);
    title.setAttribute("aria-label", words.join(" "));
    title.replaceChildren(...words.flatMap((word, index) => {
        const span = document.createElement("span");
        span.className = "od-word";
        span.setAttribute("aria-hidden", "true");
        span.style.setProperty("--i", index);
        span.textContent = word;
        return index ? [document.createTextNode(" "), span] : [span];
    }));
}

/* 2. "$1,234.00" counts up from $0.00 */
function countUp(node) {
    if (!node) return;
    const end = Number(node.textContent.replace(/[^0-9.]/g, ""));
    if (!end) return;
    const format = (value) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const start = performance.now() + 400;

    const tick = (now) => {
        const t = Math.max(0, Math.min((now - start) / COUNT_MS, 1));
        node.textContent = format(end * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(tick);
    };
    node.textContent = format(0);
    requestAnimationFrame(tick);
}

/* 3. Status-coloured glow under the mouse */
function spotlight(cards) {
    cards.forEach((card) => {
        card.addEventListener("pointermove", (event) => {
            const box = card.getBoundingClientRect();
            card.style.setProperty("--mx", `${event.clientX - box.left}px`);
            card.style.setProperty("--my", `${event.clientY - box.top}px`);
        });
    });
}

/* 4. Rows lean toward the mouse */
function tilt(rows) {
    rows.forEach((row) => {
        let frame = 0;
        row.addEventListener("pointermove", (event) => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const box = row.getBoundingClientRect();
                const x = (event.clientX - box.left) / box.width - 0.5;
                const y = (event.clientY - box.top) / box.height - 0.5;
                row.style.setProperty("--tx", `${x * TILT_X}deg`);
                row.style.setProperty("--ty", `${-y * TILT_Y}deg`);
            });
        });
        row.addEventListener("pointerleave", () => {
            row.style.setProperty("--tx", "0deg");
            row.style.setProperty("--ty", "0deg");
        });
    });
}