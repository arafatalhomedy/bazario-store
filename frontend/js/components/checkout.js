/**
 * Checkout page: the brain of the bento form.
 *
 *  1. Load       get the basket → "Your order" tile (or the empty message)
 *  2. Fields     same rules as the server; errors under each field
 *  3. Progress   ✓ + light sweep on finished tiles, "N of 4" bump, button wakes up
 *  4. Hold       hold 1 second (mouse, touch, Space/Enter) to place the order
 *  5. Send       POST /api/orders/ → stamp + colour burst + truck leaves → Done page
 *  6. Spotlight  a soft glow follows the mouse inside each tile
 *
 * HTML: pages/checkout/*.html · Styles: css/checkout/bento.css
 * The server checks everything again; this file only makes it friendly.
 */
import { getCart } from "../api/cart.js";
import { placeOrder } from "../api/orders.js";
import { el } from "../utils/dom.js";
import { formatPrice } from "../utils/format.js";
import { hasFinePointer, prefersReducedMotion } from "../utils/motion.js";
import { groupByCategory } from "./basket.js";
import { setCartCount } from "./header.js";

const HOLD_MS = 1000;      // how long to hold the button
const COUNT_MS = 1100;     // total counting time
const GO_DONE_MS = 1500;   // time to enjoy the celebration before the Done page
const MAX_PHOTOS = 4;      // floating photos
const MAX_LINES = 5;       // lines in the item list
const BURST_DOTS = 22;     // coloured dots when the order is placed

// The same rules as the server (CheckoutSerializer)
const RULES = {
    full_name: (v) => v.length >= 2 || "Enter your full name.",
    phone: (v) => {
        const digits = v.replace(/\D/g, "");
        return (/^[0-9+()\-\s]+$/.test(v) && digits.length >= 7 && digits.length <= 15) || "Enter a real phone number.";
    },
    city: (v) => v.length >= 2 || "Enter your city.",
    street: (v) => v.length >= 5 || "Add the street and building.",
    note: (v) => v.length <= 300 || "Keep the note under 300 characters.",
};
const REQUIRED = ["full_name", "phone", "city", "street"];

let ui = null;
const state = {
    total: 0,
    colors: [],          // category colours, for the burst
    holding: null,
    sending: false,
    doneCount: -1,       // last "N of 4", to bump only on change
    doneGroups: new Set(),
};

/** Start the checkout page. Called once by pages/checkout.js. */
export function initCheckout() {
    const root = document.querySelector("[data-checkout]");
    if (!root) return;

    ui = {
        root,
        count: root.querySelector("[data-checkout-count]"),
        form: root.querySelector("[data-checkout-form]"),
        tiles: [...root.querySelectorAll(".tile")],
        groups: [...root.querySelectorAll("[data-group]")],
        photos: root.querySelector("[data-summary-photos]"),
        total: root.querySelector("[data-summary-total]"),
        meta: root.querySelector("[data-summary-meta]"),
        bar: root.querySelector("[data-summary-bar]"),
        subtotal: root.querySelector("[data-summary-subtotal]"),
        road: root.querySelector(".road"),
        readyCount: root.querySelector("[data-ready-count]"),
        readyFill: root.querySelector("[data-ready-fill]"),
        hold: root.querySelector("[data-hold]"),
        holdFill: root.querySelector("[data-hold-fill]"),
        holdLabel: root.querySelector("[data-hold-label]"),
        stamp: root.querySelector("[data-stamp]"),
        formError: root.querySelector("[data-form-error]"),
    };
    ui.inputs = Object.fromEntries(Object.keys(RULES).map((name) => [name, ui.form.elements[name]]));

    // The item list lives under the split bar in "Your order"
    ui.items = el("ul", { className: "summary__items", attrs: { "aria-label": "Items in your order" } });
    ui.bar.after(ui.items);

    setupFields();
    setupHold();
    setupSpotlight();
    loadSummary();
}

/* ------------------------------------------------------------------ 1. Load */
async function loadSummary() {
    try {
        const cart = await getCart();
        const items = cart.items || [];
        const notice = cart.notices?.join(" ");

        ui.root.dataset.state = items.length ? "ready" : "empty";
        setCartCount(cart.total_quantity, { bump: false });

        if (!items.length) {
            ui.count.textContent = notice || "Your basket is empty";
            return;
        }

        renderSummary(cart, items);
        if (notice) ui.count.textContent = notice;
        updateProgress();
    } catch {
        ui.count.textContent = "We couldn't load your order. Please refresh the page.";
    }
}

function renderSummary(cart, items) {
    const groups = groupByCategory(items);
    const subtotal = Number(cart.subtotal);
    state.colors = groups.map((group) => group.color);

    ui.count.textContent = `Delivery details for ${plural(cart.total_quantity, "item")}`;
    ui.meta.textContent = `${plural(cart.total_quantity, "item")} · ${plural(groups.length, "category", "categories")}`;
    ui.subtotal.textContent = formatPrice(cart.subtotal);

    // Floating photos: up to 4, then "+N"
    const photos = items.slice(0, MAX_PHOTOS).map((item, index) => {
        const img = el("img", {
            className: "summary__photo",
            attrs: { src: item.product.thumbnail, alt: "", width: "80", height: "80", decoding: "async" },
        });
        img.style.setProperty("--i", index);
        return img;
    });
    if (items.length > MAX_PHOTOS) {
        photos.push(el("span", { className: "summary__more", text: `+${items.length - MAX_PHOTOS}` }));
    }
    ui.photos.replaceChildren(...photos);

    // Split bar in the basket's category colours
    ui.bar.replaceChildren(...groups.map((group, index) => {
        const piece = el("span", { className: "summary__seg" });
        piece.style.setProperty("--share", subtotal > 0 ? (group.subtotal / subtotal).toFixed(4) : "0");
        piece.style.setProperty("--seg-color", group.color);
        piece.style.setProperty("--i", index);
        return piece;
    }));
    ui.bar.setAttribute(
        "aria-label",
        `Order total by category: ${groups.map((g) => `${g.name} ${Math.round((g.subtotal / subtotal) * 100)}%`).join(", ")}`,
    );

    // Item list: each line slides in one by one
    const lines = items.slice(0, MAX_LINES).map((item, index) => {
        const line = el("li", { className: "summary__item" }, [
            el("img", { attrs: { src: item.product.thumbnail, alt: "", width: "80", height: "80", decoding: "async" } }),
            el("span", { className: "summary__item-name", text: item.product.name }, [
                el("small", { text: `× ${item.quantity}` }),
            ]),
            el("span", { className: "summary__item-price", text: formatPrice(item.line_total) }),
        ]);
        line.style.setProperty("--i", index);
        return line;
    });
    if (items.length > MAX_LINES) {
        const more = el("li", {
            className: "summary__item summary__item--more",
            text: `and ${plural(items.length - MAX_LINES, "more product")}`,
        });
        more.style.setProperty("--i", MAX_LINES);
        lines.push(more);
    }
    ui.items.replaceChildren(...lines);

    state.total = Number(cart.total);
    countUp(ui.total, state.total);
}

function countUp(node, end) {
    if (prefersReducedMotion()) {
        node.textContent = formatPrice(end);
        return;
    }
    const start = performance.now();
    const step = (now) => {
        const progress = Math.min((now - start) / COUNT_MS, 1);
        node.textContent = formatPrice(end * (1 - Math.pow(1 - progress, 3)));
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

/* ------------------------------------------------------------------ 2. Fields */
function setupFields() {
    for (const [name, input] of Object.entries(ui.inputs)) {
        input.addEventListener("input", () => {
            showError(name, "");
            ui.formError.textContent = "";
            updateProgress();
        });
        // Errors only when leaving a field you typed in (never while typing)
        input.addEventListener("blur", () => {
            if (input.value.trim()) showError(name, check(name));
        });
    }

    // Enter in a field: never send by accident, guide to the hold button instead
    ui.form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (event.submitter === ui.hold) return;   // the hold button handles itself
        if (showAllErrors()) {
            ui.hold.focus();
            ui.formError.textContent = "Now press and hold the button to place your order.";
        }
    });
}

/** "" when valid, otherwise the message. */
function check(name) {
    const result = RULES[name](ui.inputs[name].value.trim());
    return result === true ? "" : result;
}

function showError(name, message) {
    const field = ui.inputs[name].closest(".field");
    const error = ui.root.querySelector(`[data-error-for="${name}"]`);
    error.textContent = message;
    ui.inputs[name].setAttribute("aria-invalid", String(Boolean(message)));
    field.classList.remove("is-invalid");
    if (message) restartClass(field, "is-invalid");   // shake again
}

/** Show every problem; focus the first one. Returns true when all is valid. */
function showAllErrors() {
    let first = null;
    for (const name of Object.keys(RULES)) {
        const message = check(name);
        showError(name, message);
        if (message && !first) first = ui.inputs[name];
    }
    first?.focus();
    return !first;
}

/* ------------------------------------------------------------------ 3. Progress */
function updateProgress() {
    const done = REQUIRED.filter((name) => !check(name)).length;
    const ready = done === REQUIRED.length && !check("note");

    // ✓ on finished tiles, plus a one-time light sweep when a tile becomes finished
    ui.groups.forEach((group, index) => {
        const names = [...group.querySelectorAll("input")].map((input) => input.name);
        const finished = names.every((name) => !check(name));
        group.classList.toggle("is-done", finished);
        if (finished && !state.doneGroups.has(index)) restartClass(group, "is-celebrate");
        if (finished) state.doneGroups.add(index);
        else state.doneGroups.delete(index);
    });

    // "N of 4 details" bumps only when the number changes
    if (done !== state.doneCount) {
        if (state.doneCount !== -1) restartClass(ui.readyCount, "is-bump");
        state.doneCount = done;
    }
    ui.readyCount.textContent = `${done} of ${REQUIRED.length} details`;
    ui.readyFill.style.setProperty("--ready", String(done / REQUIRED.length));
    ui.hold.classList.toggle("is-ready", ready);

    if (!state.sending && !state.holding) {
        ui.holdLabel.textContent = ready ? `Hold to place order · ${formatPrice(state.total)}` : "Fill in your details";
    }
}

/* ------------------------------------------------------------------ 4. Hold */
function setupHold() {
    ui.hold.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        startHold();
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((type) => ui.hold.addEventListener(type, stopHold));
    ui.hold.addEventListener("contextmenu", (event) => event.preventDefault()); // long-press menu on phones

    // Keyboard: hold Space or Enter
    ui.hold.addEventListener("keydown", (event) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
            event.preventDefault();
            startHold();
        }
    });
    ui.hold.addEventListener("keyup", (event) => {
        if (event.key === " " || event.key === "Enter") stopHold();
    });
}

function startHold() {
    if (state.sending || state.holding || ui.root.dataset.state !== "ready") return;
    ui.formError.textContent = "";
    if (!showAllErrors()) {
        ui.formError.textContent = "Fill in the details above first.";
        return;
    }

    ui.hold.classList.add("is-holding");
    ui.holdLabel.textContent = "Keep holding…";
    state.holding = ui.holdFill.animate(
        [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
        { duration: HOLD_MS, easing: "linear", fill: "forwards" },
    );
    state.holding.onfinish = () => {
        state.holding = null;
        send();
    };
}

function stopHold() {
    const animation = state.holding;
    if (!animation) return;
    state.holding = null;
    animation.onfinish = null;
    animation.reverse();   // the fill rolls back smoothly
    ui.hold.classList.remove("is-holding");
    updateProgress();
}

/* ------------------------------------------------------------------ 5. Send */
async function send() {
    state.sending = true;
    ui.holdLabel.textContent = "Placing your order…";
    ui.hold.setAttribute("aria-busy", "true");

    const details = Object.fromEntries(
        Object.entries(ui.inputs).map(([name, input]) => [name, input.value.trim()]),
    );

    try {
        const order = await placeOrder(details);
        placed(order);
    } catch (error) {
        failed(error);
    }
}

function placed(order) {
    ui.hold.classList.remove("is-holding", "is-ready");
    ui.hold.classList.add("is-placed");
    ui.hold.disabled = true;
    ui.hold.removeAttribute("aria-busy");
    ui.holdLabel.textContent = `Placed · ${order.number}`;
    ui.stamp.classList.add("is-on");
    ui.road?.classList.add("is-leaving");   // the truck speeds away
    setCartCount(0);
    burst(ui.hold);

    setTimeout(() => {
        window.location.href = `/checkout/done/${encodeURIComponent(order.number)}/`;
    }, prefersReducedMotion() ? 300 : GO_DONE_MS);
}

/** Coloured dots explode from the button, in the order's category colours. */
function burst(origin) {
    if (prefersReducedMotion()) return;
    const box = origin.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const colors = state.colors.length ? state.colors : ["currentColor"];

    for (let i = 0; i < BURST_DOTS; i += 1) {
        const dot = el("span", { className: "burst", attrs: { "aria-hidden": "true" } });
        dot.style.left = `${x}px`;
        dot.style.top = `${y}px`;
        dot.style.setProperty("--c", colors[i % colors.length]);
        document.body.append(dot);

        const angle = (Math.PI * 2 * i) / BURST_DOTS + Math.random() * 0.4;
        const distance = 90 + Math.random() * 120;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance - 40;   // a little upward

        dot.animate(
            [
                { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
                { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4)`, opacity: 0 },
            ],
            { duration: 900 + Math.random() * 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        ).onfinish = () => dot.remove();
    }
}

function failed(error) {
    state.sending = false;
    ui.hold.removeAttribute("aria-busy");
    ui.hold.classList.remove("is-holding");
    ui.holdFill.getAnimations().forEach((animation) => animation.cancel());

    const data = error?.data || {};
    const status = error?.status;

    // Field problems from the server: show them under the right fields
    const fieldNames = Object.keys(RULES).filter((name) => Array.isArray(data[name]));
    fieldNames.forEach((name) => showError(name, data[name][0]));
    if (fieldNames.length) ui.inputs[fieldNames[0]].focus();

    if (status === 429) {
        ui.formError.textContent = "Too many tries. Please wait a minute and try again.";
    } else if (data.detail) {
        ui.formError.textContent = data.detail;   // e.g. "… just sold out. Please check your basket."
        loadSummary();                            // show the updated basket
    } else if (!fieldNames.length) {
        ui.formError.textContent = "We couldn't reach the shop. Check your connection and try again.";
    }
    updateProgress();
}

/* ------------------------------------------------------------------ 6. Spotlight */
function setupSpotlight() {
    if (prefersReducedMotion() || !hasFinePointer()) return;
    for (const tile of ui.tiles) {
        let frame = null;
        tile.addEventListener("pointermove", (event) => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const box = tile.getBoundingClientRect();
                tile.style.setProperty("--mx", `${event.clientX - box.left}px`);
                tile.style.setProperty("--my", `${event.clientY - box.top}px`);
            });
        });
    }
}

/* ------------------------------------------------------------------ Helpers */
function plural(count, word, many = `${word}s`) {
    return `${count} ${count === 1 ? word : many}`;
}

function restartClass(node, className) {
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
}