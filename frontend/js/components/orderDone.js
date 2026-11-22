/**
 * Done page: the motion on top of the order Django already filled in.
 *
 *  1. Slot machine   the order number spins in, digit by digit
 *  2. Copy           copy the order number
 *  3. Barcode        bars made from the order number, drawn in
 *  4. Receipt tilt   the receipt follows the mouse in 3D
 *  5. Journey        current step, growing line, truck parks there
 *  6. Confetti       falls once per order
 *
 * HTML: pages/done/bento.html · Styles: css/checkout/done.css
 */
import { el } from "../utils/dom.js";
import { hasFinePointer, prefersReducedMotion } from "../utils/motion.js";

const STEPS = ["pending", "confirmed", "shipped", "delivered"];
const COLORS = ["#ff6b4a", "#7c5cff", "#16b5a3", "#f2b705", "#ff4f9a", "#3d8bfd"];
const CONFETTI_BITS = 44;
const TILT_DEG = 10;
const COPIED_MS = 2000;

/** Start the Done page. Called once by pages/done.js. */
export function initOrderDone() {
    const root = document.querySelector("[data-done]");
    if (!root) return;

    const reduced = prefersReducedMotion();
    const number = root.querySelector("[data-reel]")?.textContent.trim() || "";

    setupReel(root.querySelector("[data-reel]"), reduced);
    setupCopy(root.querySelector("[data-copy]"));
    setupBarcode(root.querySelector("[data-barcode]"));
    setupTilt(root.querySelector("[data-receipt]"), reduced);
    setupJourney(root.querySelector("[data-journey]"));
    setupConfetti(root.parentElement.querySelector("[data-confetti]") || document.querySelector("[data-confetti]"), number, reduced);
}

/* ------------------------------------------------------------------ 1. Slot machine */
function setupReel(node, reduced) {
    if (!node || reduced) return;
    const text = node.textContent.trim();
    node.setAttribute("aria-label", text);   // screen readers read the real number

    const parts = [...text].map((char, index) => {
        if (!/\d/.test(char)) return el("span", { text: char, attrs: { "aria-hidden": "true" } });

        // A strip 0…9 then the real digit; we slide it up to land on the last one
        const strip = el("span", { className: "reel__strip" }, [
            ...Array.from({ length: 10 }, (_, n) => el("span", { text: String(n) })),
            el("span", { text: char }),
        ]);
        strip.style.transitionDelay = `${0.4 + index * 0.09}s`;
        return el("span", { className: "reel__digit", attrs: { "aria-hidden": "true" } }, [strip]);
    });
    node.replaceChildren(...parts);

    // Two frames later, so the browser sees the start position first
    requestAnimationFrame(() => requestAnimationFrame(() => {
        node.querySelectorAll(".reel__strip").forEach((strip) => {
            strip.style.transform = "translateY(-10em)";   // 10 rows × 1em each…
            strip.style.transform = `translateY(calc(-10 * 1.1em))`; // …each row is 1.1em tall
        });
    }));
}

/* ------------------------------------------------------------------ 2. Copy */
function setupCopy(button) {
    if (!button) return;
    const label = button.querySelector("[data-copy-label]");
    let timer = null;

    button.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(button.dataset.copy);
            label.textContent = "Copied ✓";
            button.classList.add("is-copied");
        } catch {
            label.textContent = "Select and copy";
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
            label.textContent = "Copy";
            button.classList.remove("is-copied");
        }, COPIED_MS);
    });
}

/* ------------------------------------------------------------------ 3. Barcode */
function setupBarcode(box) {
    if (!box) return;
    const code = box.dataset.barcode || "";
    const bars = [];

    // Every character gives 3 bars; widths come from its character code,
    // so the same order always gets the same barcode
    [...code].forEach((char, c) => {
        const value = char.charCodeAt(0);
        for (let b = 0; b < 3; b += 1) {
            const bar = el("span");
            bar.style.setProperty("--w", String(((value >> b) % 3) + 1));
            bar.style.setProperty("--o", (value + b) % 4 === 0 ? "0.25" : "0.9");
            bar.style.setProperty("--i", String(c * 3 + b));
            bars.push(bar);
        }
    });
    box.replaceChildren(...bars);
}

/* ------------------------------------------------------------------ 4. Receipt tilt */
function setupTilt(tile, reduced) {
    const paper = tile?.querySelector("[data-receipt-paper]");
    if (!paper || reduced || !hasFinePointer()) return;

    let frame = null;
    tile.addEventListener("pointermove", (event) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            const box = tile.getBoundingClientRect();
            const x = (event.clientX - box.left) / box.width - 0.5;
            const y = (event.clientY - box.top) / box.height - 0.5;
            paper.style.setProperty("--ry", `${x * TILT_DEG}deg`);
            paper.style.setProperty("--rx", `${-y * TILT_DEG}deg`);
        });
    });
    tile.addEventListener("pointerleave", () => {
        cancelAnimationFrame(frame);
        paper.style.setProperty("--ry", "0deg");
        paper.style.setProperty("--rx", "0deg");
    });
}

/* ------------------------------------------------------------------ 5. Journey */
function setupJourney(journey) {
    if (!journey) return;
    const index = Math.max(0, STEPS.indexOf(journey.dataset.status));

    journey.querySelectorAll("[data-step]").forEach((stop, i) => {
        stop.classList.toggle("is-done", i < index);
        stop.classList.toggle("is-current", i === index);
        if (i === index) stop.setAttribute("aria-current", "step");
    });

    // Line length and truck position (stop centres are 12.5%, 37.5%, 62.5%, 87.5%)
    journey.style.setProperty("--progress", String(index / (STEPS.length - 1)));
    journey.style.setProperty("--truck", `${12.5 + index * 25}%`);
    requestAnimationFrame(() => requestAnimationFrame(() => journey.classList.add("is-ready")));
}

/* ------------------------------------------------------------------ 6. Confetti */
function setupConfetti(box, number, reduced) {
    if (!box || reduced || !number) return;

    // Only once per order (refreshing doesn't throw it again)
    const key = `bazario:confetti:${number}`;
    try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
    } catch {
        /* storage blocked: confetti still falls */
    }

    const bits = Array.from({ length: CONFETTI_BITS }, (_, i) => {
        const bit = el("span", { className: "confetti__bit" });
        bit.style.left = `${Math.random() * 100}%`;
        bit.style.setProperty("--c", COLORS[i % COLORS.length]);
        bit.style.setProperty("--x", `${(Math.random() - 0.5) * 200}px`);
        bit.style.setProperty("--r", `${360 + Math.random() * 540}deg`);
        bit.style.setProperty("--t", `${2.6 + Math.random() * 2}s`);
        bit.style.setProperty("--d", `${0.3 + Math.random() * 1.2}s`);
        return bit;
    });
    box.replaceChildren(...bits);
    setTimeout(() => box.replaceChildren(), 6000);   // clean up
}