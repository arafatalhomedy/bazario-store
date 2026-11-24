/**
 * Order details: the motion on top of the order Django already filled in.
 *
 *  1. Ring %       the step percentage in the hero ring counts up
 *  2. Copy         copy the order number
 *  3. Buy again    put a product back in the basket (photo flies to the cart)
 *  4. Barcode      bars made from the order number + receipt tilt
 *  5. Spotlight    soft glow follows the mouse on the detail tiles
 *
 * The hero, journey cards, word roll and item tilt live in orderMotion.js.
 * HTML: pages/order.html + pages/orders/{hero,journey,details}.html
 * Styles: css/orders/order.css + css/orders/order-v4.css
 */
import { el } from "../utils/dom.js";
import { hasFinePointer, prefersReducedMotion } from "../utils/motion.js";
import { addProductToCart } from "./cartActions.js";

const PERCENT_MS = 1500;
const TILT_DEG = 10;
const TOAST_MS = 2200;
const STEPS = { pending: 1, confirmed: 2, shipped: 3, delivered: 4, cancelled: 0 };

let ui = null;

/** Start the order details page. Called once by pages/order.js. */
export function initOrderDetail() {
    const root = document.querySelector("[data-order]");
    if (!root) return;

    ui = {
        root,
        toast: root.querySelector("[data-toast]"),
        reduced: prefersReducedMotion(),
    };

    setupPercent(root.querySelector("[data-percent]"), STEPS[root.dataset.status] ?? 0);
    setupCopy(root.querySelector("[data-copy]"));
    setupBuyAgain(root);
    setupBarcode(root.querySelector("[data-barcode]"));
    setupTilt(root.querySelector("[data-receipt]"));
    setupSpotlight(root);
}

/* ------------------------------------------------------------------ 1. Ring % */
function setupPercent(node, step) {
    if (!node) return;
    const end = step * 25;
    if (ui.reduced || end === 0) {
        node.textContent = `${end}%`;
        return;
    }
    const start = performance.now() + 500;   // same delay as the ring
    const tick = (now) => {
        const t = Math.max(0, Math.min((now - start) / PERCENT_MS, 1));
        node.textContent = `${Math.round(end * (1 - Math.pow(1 - t, 3)))}%`;
        if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
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
            toast("Order number copied");
        } catch {
            toast("Couldn't copy. Select the number and copy it.");
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
            label.textContent = "Copy number";
            button.classList.remove("is-copied");
        }, TOAST_MS);
    });
}

/* ------------------------------------------------------------------ 3. Buy again */
function setupBuyAgain(root) {
    root.querySelectorAll("[data-buy-again]").forEach((button) => {
        const label = button.querySelector("span");
        button.addEventListener("click", async () => {
            if (button.getAttribute("aria-busy") === "true") return;
            button.setAttribute("aria-busy", "true");
            const photo = button.closest(".order-item")?.querySelector("img");

            try {
                await addProductToCart(Number(button.dataset.buyAgain), 1, { photo });
                button.classList.add("is-done");
                label.textContent = "Added ✓";
                toast("Added to your basket");
                setTimeout(() => {
                    button.classList.remove("is-done");
                    label.textContent = "Buy again";
                }, TOAST_MS);
            } catch (error) {
                toast(error?.data?.detail || "Couldn't add it. Please try again.");
            } finally {
                button.removeAttribute("aria-busy");
            }
        });
    });
}

/* ------------------------------------------------------------------ 4. Barcode + tilt */
function setupBarcode(box) {
    if (!box) return;
    const bars = [];
    [...(box.dataset.barcode || "")].forEach((char, c) => {
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

function setupTilt(tile) {
    const paper = tile?.querySelector("[data-receipt-paper]");
    if (!paper || ui.reduced || !hasFinePointer()) return;

    let frame = null;
    tile.addEventListener("pointermove", (event) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            const box = tile.getBoundingClientRect();
            paper.style.setProperty("--ry", `${((event.clientX - box.left) / box.width - 0.5) * TILT_DEG}deg`);
            paper.style.setProperty("--rx", `${-((event.clientY - box.top) / box.height - 0.5) * TILT_DEG}deg`);
        });
    });
    tile.addEventListener("pointerleave", () => {
        paper.style.setProperty("--ry", "0deg");
        paper.style.setProperty("--rx", "0deg");
    });
}

/* ------------------------------------------------------------------ 5. Spotlight */
/** A soft glow follows the mouse inside each detail tile. */
function setupSpotlight(root) {
    if (ui.reduced || !hasFinePointer()) return;
    root.querySelectorAll(".order-tile").forEach((tile) => {
        tile.addEventListener("pointermove", (event) => {
            const box = tile.getBoundingClientRect();
            tile.style.setProperty("--mx", `${event.clientX - box.left}px`);
            tile.style.setProperty("--my", `${event.clientY - box.top}px`);
        });
    });
}

/* ------------------------------------------------------------------ Toast */
let toastTimer = null;
function toast(message) {
    if (!ui.toast) return;
    ui.toast.replaceChildren(el("span", { text: message }));
    ui.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove("is-visible"), TOAST_MS);
}