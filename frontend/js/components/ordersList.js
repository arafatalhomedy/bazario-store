/**
 * Your orders: filters, counters, tilt, Track by number.
 * Django already rendered the cards; this file only adds behaviour and motion.
 *
 *  1. Counts           per-status counts + counters that count up
 *  2. Filters          sliding pill, cards leave / return, ?status= in the address
 *  3. Tilt             cards follow the mouse in 3D
 *  4. Track by number  BZ- digit slots + phone → that order's details page
 *
 * HTML: pages/orders/*.html · Styles: css/orders/orders.css
 */
import { trackOrder } from "../api/orders.js";
import { hasFinePointer, prefersReducedMotion } from "../utils/motion.js";

const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
const LABELS = {
    pending: "pending",
    confirmed: "confirmed",
    shipped: "on the way",
    delivered: "delivered",
    cancelled: "cancelled",
};
const LEAVE_MS = 300;    // card shrink time (same as orders.css)
const COUNT_MS = 900;    // counters counting time
const TILT_DEG = 8;
const DIGITS = 6;

let ui = null;

/** Start the Your orders page. Called once by pages/orders.js. */
export function initOrdersList() {
    const root = document.querySelector("[data-orders]");
    if (!root) return;

    ui = {
        root,
        cards: [...root.querySelectorAll(".order-card")],
        filters: root.querySelector("[data-filters]"),
        pill: root.querySelector("[data-filter-pill]"),
        empty: root.querySelector("[data-filter-empty]"),
    };

    setupCounts();
    setupFilters();
    setupTilt();
    setupTrack();
}

/* ------------------------------------------------------------------ 1. Counts */
function setupCounts() {
    const counts = { all: ui.cards.length };
    STATUSES.forEach((status) => {
        counts[status] = ui.cards.filter((card) => card.dataset.status === status).length;
    });

    ui.root.querySelectorAll("[data-count]").forEach((node) => {
        node.textContent = String(counts[node.dataset.count] ?? 0);
    });
    ui.root.querySelectorAll("[data-stat]").forEach((node) => {
        countUp(node, counts[node.dataset.stat] ?? 0);
    });
}

function countUp(node, end) {
    if (prefersReducedMotion() || end === 0) {
        node.textContent = String(end);
        return;
    }
    const start = performance.now() + 400;   // wait for the counters to rise in
    const step = (now) => {
        const progress = Math.max(0, Math.min((now - start) / COUNT_MS, 1));
        node.textContent = String(Math.round(end * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

/* ------------------------------------------------------------------ 2. Filters */
function setupFilters() {
    if (!ui.filters) return;
    const buttons = [...ui.filters.querySelectorAll("[data-filter]")];

    // Start from ?status= in the address (only known values are accepted)
    const fromUrl = new URLSearchParams(window.location.search).get("status");
    const first = buttons.find((button) => button.dataset.filter === fromUrl) || buttons[0];

    buttons.forEach((button) => {
        button.addEventListener("click", () => choose(button, buttons));
    });

    // Place the pill without animating the first time
    ui.pill.style.transition = "none";
    choose(first, buttons, { initial: true });
    requestAnimationFrame(() => { ui.pill.style.transition = ""; });
    window.addEventListener("resize", () => movePill(buttons.find((b) => b.getAttribute("aria-pressed") === "true")));
}

function choose(button, buttons, { initial = false } = {}) {
    const filter = button.dataset.filter;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    movePill(button);
    if (!initial) button.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });

    // Remember the filter in the address (status only, never personal data)
    const url = new URL(window.location.href);
    if (filter === "all") url.searchParams.delete("status");
    else url.searchParams.set("status", filter);
    window.history.replaceState(null, "", url);

    showCards(filter, initial);
}

function movePill(button) {
    if (!button || !ui.pill) return;
    ui.pill.style.setProperty("--x", `${button.offsetLeft}px`);
    ui.pill.style.setProperty("--w", `${button.offsetWidth}px`);
}

function showCards(filter, initial) {
    const matches = (card) => filter === "all" || card.dataset.status === filter;
    const reduced = prefersReducedMotion();

    // Cards that don't match shrink away, then hide
    ui.cards.forEach((card) => {
        if (!matches(card) && !card.hidden) {
            if (initial || reduced) {
                card.hidden = true;
            } else {
                card.classList.add("is-leaving");
                setTimeout(() => { card.hidden = true; card.classList.remove("is-leaving"); }, LEAVE_MS);
            }
        }
    });

    // Matching cards rise in again, one by one
    const shown = ui.cards.filter(matches);
    setTimeout(() => {
        shown.forEach((card, index) => {
            const wasHidden = card.hidden;
            card.hidden = false;
            if (wasHidden && !reduced) {
                card.style.setProperty("--i", String(index));
                card.style.animation = "none";
                void card.offsetWidth;      // restart the entrance animation
                card.style.animation = "";
            }
        });
    }, initial || reduced ? 0 : LEAVE_MS);

    if (ui.empty) {
        ui.empty.hidden = shown.length > 0 || ui.cards.length === 0;
        ui.empty.textContent = filter === "all" ? "" : `No ${LABELS[filter]} orders right now.`;
    }
}

/* ------------------------------------------------------------------ 3. Tilt */
function setupTilt() {
    if (prefersReducedMotion() || !hasFinePointer()) return;
    for (const card of ui.cards) {
        let frame = null;
        card.addEventListener("pointermove", (event) => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const box = card.getBoundingClientRect();
                const x = (event.clientX - box.left) / box.width - 0.5;
                const y = (event.clientY - box.top) / box.height - 0.5;
                card.style.setProperty("--ry", `${x * TILT_DEG}deg`);
                card.style.setProperty("--rx", `${-y * TILT_DEG}deg`);
            });
        });
        card.addEventListener("pointerleave", () => {
            cancelAnimationFrame(frame);
            card.style.setProperty("--ry", "0deg");
            card.style.setProperty("--rx", "0deg");
        });
    }
}

/* ------------------------------------------------------------------ 4. Track by number */
function setupTrack() {
    const open = ui.root.querySelector("[data-track-open]");
    const panel = ui.root.querySelector("[data-track-panel]");
    if (!open || !panel) return;

    const form = panel.querySelector("[data-track-form]");
    const close = panel.querySelector("[data-track-close]");
    const digits = panel.querySelector("[data-digits]");
    const slots = [...digits.querySelectorAll(".digits__slot")];
    const input = digits.querySelector(".digits__input");
    const phone = form.elements.phone;
    const error = panel.querySelector("[data-track-error]");
    const submit = panel.querySelector("[data-track-submit]");

    const setOpen = (isOpen) => {
        panel.hidden = !isOpen;
        open.setAttribute("aria-expanded", String(isOpen));
        if (isOpen) input.focus();
        else open.focus();
    };
    open.addEventListener("click", () => setOpen(panel.hidden));
    close.addEventListener("click", () => setOpen(false));
    panel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") setOpen(false);
    });

    // Typing or pasting "BZ-517204" keeps only the 6 digits
    const paint = () => {
        const value = input.value;
        slots.forEach((slot, index) => {
            const char = value[index] || "";
            const wasFilled = slot.classList.contains("is-filled");
            slot.textContent = char;
            slot.classList.toggle("is-filled", Boolean(char));
            if (char && !wasFilled) {
                slot.style.animation = "none";
                void slot.offsetWidth;
                slot.style.animation = "";
            }
            slot.classList.toggle("is-current", index === Math.min(value.length, DIGITS - 1));
        });
    };
    input.addEventListener("input", () => {
        input.value = input.value.toUpperCase().replace(/^BZ-?/, "").replace(/\D/g, "").slice(0, DIGITS);
        error.textContent = "";
        paint();
        if (input.value.length === DIGITS) phone.focus();
    });
    input.addEventListener("focus", paint);
    phone.addEventListener("input", () => { error.textContent = ""; });

    const fail = (message) => {
        error.textContent = message;
        digits.classList.remove("is-shaking");
        void digits.offsetWidth;
        digits.classList.add("is-shaking");
    };

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (input.value.length !== DIGITS) {
            fail("Enter the 6 digits after BZ-.");
            input.focus();
            return;
        }
        if (phone.value.replace(/\D/g, "").length < 7) {
            error.textContent = "Enter the phone number you used for the order.";
            phone.focus();
            return;
        }

        submit.setAttribute("aria-busy", "true");
        try {
            const order = await trackOrder(`BZ-${input.value}`, phone.value.trim());
            // Found: the server now remembers it, so its details page opens
            window.location.href = `/orders/${encodeURIComponent(order.number)}/`;
        } catch (problem) {
            submit.removeAttribute("aria-busy");
            if (problem?.status === 429) fail("Too many tries. Please wait a minute and try again.");
            else if (problem?.data?.detail) fail(problem.data.detail);
            else fail("We couldn't reach the shop. Check your connection and try again.");
        }
    });

    paint();
}