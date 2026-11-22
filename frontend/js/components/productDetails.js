/**
 * Product page: main section behavior.
 *
 *  1. Color tint     (panel takes the photo's main color)
 *  2. Counting price
 *  3. Stock meter
 *  4. 3D tilt + depth
 *  5. Quantity buttons
 *  6. Opening sections (accordion)
 *  7. Zoom window
 *  8. Add to cart    (fill → "Added ✓" → photo flies to the cart)
 *
 * HTML: pages/product/details.html · Styles: css/product/details.css
 */
import { averageColorWhenLoaded } from "../utils/color.js";
import { addProductToCart } from "./cartActions.js";

import { formatPrice } from "../utils/format.js";
import { hasFinePointer, prefersReducedMotion } from "../utils/motion.js";

const STOCK_FULL = 30;        // stock at which the meter is full
const COUNT_MS = 900;         // price counting time
const COUNT_DELAY_MS = 450;   // wait for the name before counting
const TILT_DEG = 18;          // max card tilt
const DEPTH_PX = 14;          // max photo shift inside the card
const ZOOM_SCALE = 2.2;       // how much the zoom window enlarges
const DONE_MS = 1800;         // how long "Added ✓" stays

/** Start the product page. Called once by product.js. */
export function initProductDetails() {
    const root = document.querySelector("[data-product]");
    if (!root) return;

    const stock = Number(root.dataset.stock) || 0;
    const productId = Number(root.dataset.productId);

    setupColor(root);
    setupPriceCount(root);
    setupStockMeter(root, stock);
    setupTilt(root);
    setupQuantity(root, stock);
    setupAccordion(root);
    setupZoom();
    setupAddToCart(root, productId);
}

/* ------------------------------------------------------------------ 1. Color tint */
async function setupColor(root) {
    const photo = root.querySelector("[data-photo]");
    const panel = root.querySelector("[data-panel]");
    if (!photo || !panel) return;
    const color = await averageColorWhenLoaded(photo);
    if (color) panel.style.setProperty("--product-color", color);
}

/* ------------------------------------------------------------------ 2. Counting price */
function setupPriceCount(root) {
    const node = root.querySelector("[data-count-price]");
    if (!node || prefersReducedMotion()) return;

    const end = Number(node.dataset.countPrice);
    node.textContent = formatPrice(0);

    setTimeout(() => {
        const start = performance.now();
        const step = (now) => {
            const progress = Math.min((now - start) / COUNT_MS, 1);
            const eased = 1 - Math.pow(1 - progress, 3);   // fast first, slow at the end
            node.textContent = formatPrice(end * eased);
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }, COUNT_DELAY_MS);
}

/* ------------------------------------------------------------------ 3. Stock meter */
function setupStockMeter(root, stock) {
    const meter = root.querySelector("[data-stock-meter]");
    if (!meter) return;
    const level = Math.min(stock / STOCK_FULL, 1) * 100;
    // Two frames later, so the bar animates from 0 to its level
    requestAnimationFrame(() => requestAnimationFrame(() => {
        meter.style.setProperty("--stock-level", `${level}%`);
    }));
}

/* ------------------------------------------------------------------ 4. 3D tilt + depth */
function setupTilt(root) {
    const panel = root.querySelector("[data-panel]");
    const card = root.querySelector("[data-zoom-open]");
    const photo = root.querySelector("[data-photo]");
    if (!panel || !card || prefersReducedMotion() || !hasFinePointer()) return;

    let frame = null;
    const set = (x, y) => {
        card.style.setProperty("--tilt-y", `${x * TILT_DEG}deg`);
        card.style.setProperty("--tilt-x", `${-y * TILT_DEG}deg`);
        photo?.style.setProperty("--depth-x", `${-x * DEPTH_PX}px`);
        photo?.style.setProperty("--depth-y", `${-y * DEPTH_PX}px`);
    };

    panel.addEventListener("pointermove", (event) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            const box = panel.getBoundingClientRect();
            set((event.clientX - box.left) / box.width - 0.5, (event.clientY - box.top) / box.height - 0.5);
        });
    });
    panel.addEventListener("pointerleave", () => {
        cancelAnimationFrame(frame);
        set(0, 0);
    });
}

/* ------------------------------------------------------------------ 5. Quantity buttons */
function setupQuantity(root, stock) {
    const input = root.querySelector("[data-qty-input]");
    const minus = root.querySelector("[data-qty-minus]");
    const plus = root.querySelector("[data-qty-plus]");
    const note = root.querySelector("[data-qty-note]");
    if (!input || !minus || !plus) return;

    const max = Math.max(stock, 1);

    const setQuantity = (value) => {
        const clean = Math.min(Math.max(1, Math.round(Number(value) || 1)), max);
        input.value = String(clean);
        minus.disabled = clean <= 1;
        plus.disabled = clean >= max;
        if (note) note.textContent = clean >= max && stock > 0 ? `Only ${stock} in stock` : "";
    };

    minus.addEventListener("click", () => setQuantity(Number(input.value) - 1));
    plus.addEventListener("click", () => setQuantity(Number(input.value) + 1));
    input.addEventListener("change", () => setQuantity(input.value));
    setQuantity(input.value);
}

/* ------------------------------------------------------------------ 6. Opening sections */
function setupAccordion(root) {
    for (const toggle of root.querySelectorAll(".accordion__toggle")) {
        const item = toggle.closest(".accordion__item");
        const panel = item.querySelector(".accordion__panel");

        const setOpen = (open) => {
            item.classList.toggle("is-open", open);
            toggle.setAttribute("aria-expanded", String(open));
            panel.inert = !open; // closed sections are skipped by the Tab key
        };

        setOpen(item.classList.contains("is-open"));
        toggle.addEventListener("click", () => setOpen(!item.classList.contains("is-open")));
    }
}

/* ------------------------------------------------------------------ 7. Zoom window */
function setupZoom() {
    const dialog = document.querySelector("[data-zoom]");
    const openButton = document.querySelector("[data-zoom-open]");
    if (!dialog || !openButton || typeof dialog.showModal !== "function") return;

    const frame = dialog.querySelector("[data-zoom-frame]");
    const closeButton = dialog.querySelector("[data-zoom-close]");
    let zoomed = false;

    const zoomAt = (event) => {
        const box = frame.getBoundingClientRect();
        frame.style.setProperty("--zoom-x", `${((event.clientX - box.left) / box.width) * 100}%`);
        frame.style.setProperty("--zoom-y", `${((event.clientY - box.top) / box.height) * 100}%`);
        frame.style.setProperty("--zoom-scale", String(ZOOM_SCALE));
        zoomed = true;
    };
    const zoomOut = () => {
        frame.style.setProperty("--zoom-scale", "1");
        zoomed = false;
    };

    openButton.addEventListener("click", () => dialog.showModal());
    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close(); // click on the dark background
    });
    dialog.addEventListener("close", zoomOut);

    // Mouse: the zoom follows the pointer
    frame.addEventListener("pointermove", (event) => {
        if (event.pointerType === "mouse") zoomAt(event);
    });
    frame.addEventListener("pointerleave", zoomOut);

    // Touch: tap to zoom in, tap again to zoom out
    frame.addEventListener("click", (event) => {
        if (event.pointerType === "mouse") return;
        if (zoomed) zoomOut();
        else zoomAt(event);
    });
}

/* ------------------------------------------------------------------ 8. Add to cart */
function setupAddToCart(root, productId) {
    const form = root.querySelector("[data-add-form]");
    const button = root.querySelector("[data-add-button]");
    const label = root.querySelector("[data-add-label]");
    const input = root.querySelector("[data-qty-input]");
    const note = root.querySelector("[data-qty-note]");
    if (!form || !button || !label) return;

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (button.disabled || button.classList.contains("is-loading")) return;

        const quantity = Number(input?.value) || 1;
        button.classList.add("is-loading");
        button.setAttribute("aria-busy", "true");
        label.textContent = "Adding…";

        try {

            const photo = root.querySelector("[data-photo]");
            await Promise.all([addProductToCart(productId, quantity, { photo }), wait(500)]);
            button.classList.remove("is-loading");
            button.classList.add("is-done");
            label.textContent = "Added ✓";
        } catch (error) {
            button.classList.remove("is-loading");
            label.textContent = "Try again";
            if (note) note.textContent = error?.data?.detail || "Couldn't add to cart. Please try again.";
        } finally {
            button.removeAttribute("aria-busy");
            setTimeout(() => {
                button.classList.remove("is-done");
                label.textContent = "Add to cart";
            }, DONE_MS);
        }
    });
}



function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}