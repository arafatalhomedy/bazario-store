/**
 * Checkout v4: the brain of the page.
 *
 *  1. Load        basket → receipt (items, subtotal, rolling total) or the empty message
 *  2. Autofill    logged-in customers: name + last delivery details, never overwriting typing
 *  3. Live        "Ship to" + little route update while typing
 *  4. Progress    "N of 4", ✓ + light sweep on finished cards, button wakes up
 *  5. Hold        hold 1 second (mouse, touch, Space/Enter): liquid fill
 *  6. Send        POST /api/orders/ → stamp, truck leaves, dots burst → Done page
 *
 * HTML: pages/checkout/{heading,bento}.html · Styles: css/checkout/bento.css
 * The server checks everything again; this file only makes it friendly.
 */
import { getCart } from "../api/cart.js";
import { apiRequest } from "../api/client.js";
import { placeOrder } from "../api/orders.js";
import { el } from "../utils/dom.js";
import { formatPrice } from "../utils/format.js";
import { prefersReducedMotion } from "../utils/motion.js";
import { groupByCategory } from "../utils/categories.js";
import { setCartCount } from "./header.js";
import { showOrderPlaced } from "./orderPlaced.js";

const HOLD_MS = 1100;      // how long to hold the button
const GO_DONE_MS = 1500;   // time to enjoy the celebration before the Done page
const MAX_LINES = 4;       // items shown in the receipt
const BURST_DOTS = 24;     // coloured dots when the order is placed

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
    colors: [],            // category colours, for the burst
    holding: null,
    sending: false,
    doneGroups: new Set(),
};

/** Start the checkout page. Called once by pages/checkout.js. */
export function initCheckout() {
    const root = document.querySelector("[data-checkout]");
    if (!root) return;

    ui = {
        root,
        reduced: prefersReducedMotion(),
        count: root.querySelector("[data-checkout-count]"),
        progressText: root.querySelector("[data-progress-text]"),
        progressFill: root.querySelector("[data-progress-fill]"),
        form: root.querySelector("[data-checkout-form]"),
        groups: [...root.querySelectorAll("[data-group]")],
        youHint: root.querySelector("[data-you-hint]"),
        items: root.querySelector("[data-summary-items]"),
        subtotal: root.querySelector("[data-summary-subtotal]"),
        total: root.querySelector("[data-summary-total]"),
        shipName: root.querySelector("[data-ship-name]"),
        shipAddress: root.querySelector("[data-ship-address]"),
        shipCity: root.querySelector("[data-ship-city]"),
        route: root.querySelector("[data-route]"),
        hold: root.querySelector("[data-hold]"),
        holdFill: root.querySelector("[data-hold-fill]"),
        holdLabel: root.querySelector("[data-hold-label]"),
        stamp: root.querySelector("[data-stamp]"),
        formError: root.querySelector("[data-form-error]"),
    };
    ui.inputs = Object.fromEntries(Object.keys(RULES).map((name) => [name, ui.form.elements[name]]));

    setupFields();
    setupHold();
    loadSummary();
    autofill();
    updateProgress();
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
    state.colors = groupByCategory(items).map((group) => group.color);
    ui.count.textContent = `Delivery details for ${plural(cart.total_quantity, "item")}`;
    ui.subtotal.textContent = formatPrice(cart.subtotal);

    const lines = items.slice(0, MAX_LINES).map((item, index) => {
        const line = el("li", { className: "co-item" }, [
            el("img", { attrs: { src: item.product.thumbnail, alt: "", width: "80", height: "80", decoding: "async" } }),
            el("span", { className: "co-item__name", text: item.product.name }, [
                el("small", { text: `× ${item.quantity}` }),
            ]),
            el("span", { className: "co-item__price", text: formatPrice(item.line_total) }),
        ]);
        line.style.setProperty("--i", index);
        return line;
    });
    if (items.length > MAX_LINES) {
        const more = el("li", {
            className: "co-item co-item--more",
            text: `and ${plural(items.length - MAX_LINES, "more product")}`,
        });
        more.style.setProperty("--i", MAX_LINES);
        lines.push(more);
    }
    ui.items.replaceChildren(...lines);

    state.total = Number(cart.total);
    rollTotal(ui.total, formatPrice(state.total));
    updateProgress();
}

/** "$116.00" → each digit spins in like a slot machine. */
function rollTotal(node, text) {
    node.setAttribute("aria-label", text);
    if (ui.reduced) {
        node.textContent = text;
        return;
    }
    const parts = [...text].map((char, index) => {
        if (!/\d/.test(char)) return el("span", { text: char, attrs: { "aria-hidden": "true" } });
        const strip = el("span", { className: "odo__strip" }, [
            ...Array.from({ length: 10 }, (_, n) => el("span", { text: String(n) })),
            el("span", { text: char }),
        ]);
        strip.style.transitionDelay = `${0.3 + index * 0.07}s`;
        return el("span", { className: "odo__digit", attrs: { "aria-hidden": "true" } }, [strip]);
    });
    node.replaceChildren(...parts);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        node.querySelectorAll(".odo__strip").forEach((strip) => { strip.style.transform = "translateY(-10em)"; });
    }));
}

/* ------------------------------------------------------------------ 2. Autofill */
async function autofill() {
    let me;
    try {
        me = await apiRequest("/api/account/me/");
    } catch {
        return;   // not important: the customer can simply type
    }
    if (!me?.authenticated) return;

    const values = {
        full_name: me.full_name,
        phone: me.delivery?.phone,
        city: me.delivery?.city,
        street: me.delivery?.street,
    };
    let filled = false;
    for (const [name, value] of Object.entries(values)) {
        const input = ui.inputs[name];
        if (value && !input.value.trim()) {   // never overwrite what the customer typed
            input.value = value;
            filled = true;
        }
    }
    if (filled && ui.youHint) {
        ui.youHint.textContent = me.delivery ? "Filled from your last order" : "Filled from your account";
    }
    updateProgress();
}

/* ------------------------------------------------------------------ 3. Fields + live receipt */
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
        if (showAllErrors()) {
            ui.hold.focus();
            ui.formError.textContent = "Now press and hold the button to place your order.";
        }
    });
}

function value(name) {
    return ui.inputs[name].value.trim();
}

/** "" when valid, otherwise the message. */
function check(name) {
    const result = RULES[name](value(name));
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

/** Ship to + route follow what the customer types. */
function updateShip() {
    const name = value("full_name");
    const address = [value("street"), value("city")].filter(Boolean).join(", ");
    setLine(ui.shipName, name || "Your name", !name);
    setLine(ui.shipAddress, address || "Your address", !address);
    ui.shipCity.textContent = value("city") || "Your door";
    ui.route.classList.toggle("is-ready", !check("city") && !check("street"));
}

function setLine(node, text, empty) {
    if (node.textContent === text) return;
    node.textContent = text;
    node.classList.toggle("is-empty", empty);
    if (!ui.reduced) {
        node.animate(
            [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }],
            { duration: 300, easing: "ease-out" },
        );
    }
}

/* ------------------------------------------------------------------ 4. Progress */
function updateProgress() {
    const done = REQUIRED.filter((name) => !check(name)).length;
    const ready = done === REQUIRED.length && !check("note");

    // ✓ on finished cards, plus a one-time light sweep when a card becomes finished
    ui.groups.forEach((group, index) => {
        const names = [...group.querySelectorAll("input")].map((input) => input.name);
        const finished = names.every((name) => !check(name));
        group.classList.toggle("is-done", finished);
        if (finished && !state.doneGroups.has(index)) restartClass(group, "is-celebrate");
        if (finished) state.doneGroups.add(index);
        else state.doneGroups.delete(index);
    });

    ui.progressText.textContent = `${done} of ${REQUIRED.length}`;
    ui.progressFill.style.width = `${(done / REQUIRED.length) * 100}%`;
    ui.hold.classList.toggle("is-ready", ready && ui.root.dataset.state === "ready");
    updateShip();

    if (!state.sending && !state.holding) {
        ui.holdLabel.textContent = ready ? `Hold to place · ${formatPrice(state.total)}` : "Fill in your details";
    }
}

/* ------------------------------------------------------------------ 5. Hold (liquid) */
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
        ui.formError.textContent = "Fill in the details first.";
        return;
    }

    ui.hold.classList.add("is-holding");
    ui.holdLabel.textContent = "Keep holding…";
    state.holding = ui.holdFill.animate(
        [{ transform: "translateX(-101%)" }, { transform: "translateX(0)" }],
        { duration: HOLD_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
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
    animation.reverse();   // the liquid drains back smoothly
    ui.hold.classList.remove("is-holding");
    updateProgress();
}

/* ------------------------------------------------------------------ 6. Send */
async function send() {
    state.sending = true;
    ui.holdLabel.textContent = "Placing your order…";
    ui.hold.setAttribute("aria-busy", "true");

    const details = Object.fromEntries(Object.keys(RULES).map((name) => [name, value(name)]));

    try {
        placed(await placeOrder(details));
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
    ui.route.classList.add("is-leaving");   // the truck speeds away
    setCartCount(0);
    burst(ui.hold);

    setTimeout(() => {
        if (!showOrderPlaced(order, ui.hold)) window.location.href = `/orders/${encodeURIComponent(order.number)}/`;
    }, ui.reduced ? 300 : GO_DONE_MS);
}

/** Coloured dots explode from the button, in the order's category colours. */
function burst(origin) {
    if (ui.reduced) return;
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
        const distance = 90 + Math.random() * 130;
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

/* ------------------------------------------------------------------ Helpers */
function plural(count, word, many = `${word}s`) {
    return `${count} ${count === 1 ? word : many}`;
}

function restartClass(node, className) {
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
}