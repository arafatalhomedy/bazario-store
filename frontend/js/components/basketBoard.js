/**
 * Basket v7: the brain of /cart/.
 *
 *  1. Load       get the basket from the server and draw everything
 *  2. Summary    rolling total, donut by category, legend, Continue button
 *  3. Tabs       filter cards by category (jelly pill)
 *  4. Cards      slim 3D cards, first 6 shown + "Show N more"
 *  5. Quantity   − / + with slot-machine digit + a coin flies into the total
 *  6. Remove     card bursts into bits + "Undo" pill
 *  7. Extras     letters flip in, orbs follow the mouse, cards tilt, magnetic button
 *
 * HTML: pages/cart/board.html · Styles: css/cart/board.css
 * Prices always come from the server. Text from the database goes in with
 * el() (textContent), never innerHTML.
 */
import { addToCart, getCart, removeCartItem, updateCartItem } from "../api/cart.js";
import { el } from "../utils/dom.js";
import { formatPrice } from "../utils/format.js";
import { hasFinePointer, prefersReducedMotion } from "../utils/motion.js";
import { groupByCategory } from "../utils/categories.js";
import { announceCart, CART_UPDATED } from "./cartActions.js";
import { setCartCount } from "./header.js";

const SHOW = 6;            // cards shown before "Show N more"
const MORE_PHOTOS = 4;     // little photos on the Show more button
const REEL_MAX = 99;       // biggest quantity the digit reel can show
const COIN_MS = 700;
const BURST_BITS = 22;
const REMOVE_MS = 330;
const UNDO_MS = 5000;
const NOTICE_MS = 6000;

let ui = null;
const state = {
    cart: null,
    filter: "all",     // category slug or "all"
    open: false,       // "Show more" opened
    listKey: "",       // filter + product ids → rebuild when it changes
    totalShape: "",    // "$0,000.00" pattern of the shown total
    undo: null,
    undoTimer: null,
    reduced: prefersReducedMotion(),
    fine: hasFinePointer(),
};

/** Start the basket page. Called once by pages/cart.js. */
export function initBasketBoard() {
    const root = document.querySelector("[data-basket]");
    if (!root) return;
    const find = (name) => root.querySelector(`[data-${name}]`);

    ui = {
        root,
        count: find("basket-count"),
        title: find("bb-letters"),
        bubble: find("bb-bubble"),
        tabs: find("bb-tabs"),
        pill: find("bb-pill"),
        list: find("bb-list"),
        more: find("bb-more"),
        moreStack: find("bb-more-stack"),
        moreText: find("bb-more-text"),
        donut: find("bb-donut"),
        donutCount: find("bb-donut-count"),
        total: find("bb-total"),
        meta: find("bb-meta"),
        legend: find("bb-legend"),
        subtotal: find("bb-subtotal"),
        go: find("bb-go"),
        notices: find("bb-notices"),
        toast: find("bb-toast"),
        toastText: find("bb-toast-text"),
        undo: find("bb-undo"),
    };

    splitLetters(ui.title);
    addOrbs(root);
    setupList();
    setupMore();
    setupUndo();
    setupGo();

    // "Complete your basket" (or another tab) changed the basket
    document.addEventListener(CART_UPDATED, (event) => {
        if (event.detail && event.detail !== state.cart) render(event.detail);
    });

    load();
}

/* ------------------------------------------------------------------ 1. Load */
async function load() {
    try {
        apply(await getCart(), { first: true });
    } catch {
        ui.count.textContent = "We couldn't load your basket. Please refresh the page.";
    }
}

function apply(cart, options) {
    render(cart, options);
    announceCart(cart);
}

function render(cart, { first = false } = {}) {
    const previous = state.cart;
    state.cart = cart;
    const items = cart.items || [];
    const quantity = cart.total_quantity || 0;
    const groups = groupByCategory(items);

    ui.root.dataset.state = items.length ? "full" : "empty";
    ui.list.removeAttribute("aria-busy");
    ui.count.textContent = items.length
        ? `${plural(quantity, "item")} · ${plural(groups.length, "category", "categories")}`
        : "Nothing here yet";

    setCartCount(quantity, { bump: !first && previous?.total_quantity !== quantity });
    ui.bubble.textContent = String(quantity);
    if (!first) restartClass(ui.bubble, "is-bump");

    renderSummary(cart, items, groups);
    renderTabs(groups);
    renderList(items, groups);
    renderNotices(cart.notices);
}

/* ------------------------------------------------------------------ 2. Summary */
function renderSummary(cart, items, groups) {
    rollTotal(formatPrice(cart.total));
    ui.meta.textContent = `${plural(cart.total_quantity, "item")} · ${plural(groups.length, "category", "categories")}`;
    ui.subtotal.textContent = formatPrice(cart.subtotal);
    ui.donutCount.textContent = String(items.length);
    ui.go.setAttribute("aria-disabled", String(items.length === 0));

    // Donut: one coloured slice per category, with small gaps
    const subtotal = Number(cart.subtotal) || 0;
    let angle = 0;
    const slices = groups.map((group) => {
        const from = angle;
        angle += subtotal ? (group.subtotal / subtotal) * 360 : 0;
        const gap = groups.length > 1 ? 1.5 : 0;
        return `${group.color} ${from + gap}deg ${angle - gap}deg, transparent ${angle - gap}deg ${angle}deg`;
    });
    if (slices.length) ui.donut.style.setProperty("--pie", `conic-gradient(${slices.join(", ")})`);
    else ui.donut.style.removeProperty("--pie");

    ui.legend.replaceChildren(...groups.map((group) => {
        const share = subtotal ? Math.round((group.subtotal / subtotal) * 100) : 0;
        const li = el("li", {}, [el("i", { attrs: { "aria-hidden": "true" } }), el("span", { text: `${group.name} ${share}%` })]);
        li.style.setProperty("--c", group.color);
        return li;
    }));
}

/** "$150.10" → every digit is a reel that spins to its number. */
function rollTotal(text) {
    const shape = text.replace(/\d/g, "0");
    ui.total.setAttribute("aria-label", text);

    if (shape !== state.totalShape || state.reduced) {
        state.totalShape = shape;
        ui.total.replaceChildren(...[...text].map((char) => {
            if (!/\d/.test(char) || state.reduced) return el("span", { text: char, attrs: { "aria-hidden": "true" } });
            const strip = el("b", {}, Array.from({ length: 10 }, (_, k) => el("span", { text: String(k) })));
            const digit = el("span", { className: "bb-digit", attrs: { "aria-hidden": "true" } }, [strip]);
            requestAnimationFrame(() => requestAnimationFrame(() => strip.style.setProperty("--n", char)));
            return digit;
        }));
        return;
    }

    const strips = [...ui.total.querySelectorAll(".bb-digit b")];
    [...text].filter((char) => /\d/.test(char)).forEach((char, index) => strips[index]?.style.setProperty("--n", char));
}

function flashTotal() {
    restartClass(ui.total, "is-flash");
}

/* ------------------------------------------------------------------ 3. Tabs */
function renderTabs(groups) {
    if (state.filter !== "all" && !groups.some((group) => group.slug === state.filter)) state.filter = "all";
    ui.tabs.querySelectorAll(".bb-tab").forEach((tab) => tab.remove());
    if (groups.length < 2) return;   // one category: no tabs needed

    const total = groups.reduce((sum, group) => sum + group.items.length, 0);
    const tabs = [{ slug: "all", name: "All", count: total }, ...groups.map((g) => ({ slug: g.slug, name: g.name, count: g.items.length, color: g.color }))];

    for (const tab of tabs) {
        const button = el("button", {
            className: "bb-tab",
            attrs: { type: "button", "aria-pressed": String(tab.slug === state.filter), "data-filter": tab.slug },
        }, [
            ...(tab.color ? [el("i", { attrs: { "aria-hidden": "true" } })] : []),
            el("span", { text: tab.name }),
            el("em", { text: String(tab.count) }),
        ]);
        if (tab.color) button.style.setProperty("--c", tab.color);
        button.addEventListener("click", () => {
            if (state.filter === tab.slug) return;
            state.filter = tab.slug;
            state.open = false;
            restartClass(ui.pill, "is-stretch");
            render(state.cart);
        });
        ui.tabs.append(button);
    }
    requestAnimationFrame(placePill);
}

function placePill() {
    const active = ui.tabs.querySelector('[aria-pressed="true"]');
    if (!active) return;
    ui.pill.style.left = `${active.offsetLeft}px`;
    ui.pill.style.width = `${active.offsetWidth}px`;
}

/* ------------------------------------------------------------------ 4. Cards */
function renderList(items, groups) {
    const colors = new Map(groups.map((group) => [group.slug, group.color]));
    const visible = items.filter((item) => state.filter === "all" || (item.product.category?.slug || "other") === state.filter);
    const key = `${state.filter}|${visible.map((item) => item.product.id).join(",")}`;

    if (key === state.listKey) {
        updateCards(visible);
    } else {
        state.listKey = key;
        ui.list.replaceChildren(...visible.map((item, index) => buildCard(item, index, colors)));
    }
    showOrHideExtra(visible);
}

function buildCard(item, index, colors) {
    const { product } = item;
    const card = el("li", { className: "bb-card", attrs: { "data-line": String(product.id) } }, [
        el("img", {
            className: "bb-card__photo",
            attrs: { src: product.thumbnail, alt: "", width: "104", height: "104", loading: "lazy", decoding: "async" },
        }),
        el("div", { className: "bb-card__info" }, [
            el("a", { className: "bb-card__name", text: product.name, attrs: { href: productUrl(product) } }),
            el("div", { className: "bb-card__meta" }, [quantityControl(item), priceEach(product)]),
        ]),
        el("div", { className: "bb-card__end" }, [
            el("button", {
                className: "bb-card__remove",
                text: "×",
                attrs: { type: "button", "data-remove": "", "aria-label": `Remove ${product.name}` },
            }),
            el("span", { className: "bb-card__total", text: formatPrice(item.line_total), attrs: { "data-line-total": "" } }),
        ]),
    ]);
    card.style.setProperty("--c", colors.get(product.category?.slug || "other") || "var(--color-accent)");
    card.style.setProperty("--d", String(index % SHOW));
    card.hidden = !state.open && index >= SHOW;
    if (state.fine && !state.reduced) addTilt(card);
    return card;
}

function quantityControl(item) {
    const { product, quantity } = item;
    const top = Math.min(REEL_MAX, Math.max(quantity, item.max_quantity || quantity));
    const strip = el("b", {}, Array.from({ length: top + 1 }, (_, k) => el("span", { text: String(k) })));
    strip.style.setProperty("--n", String(quantity));

    return el("div", { className: "bb-qty", attrs: { "data-qty": "", role: "group", "aria-label": `Quantity of ${product.name}` } }, [
        el("button", {
            text: "−",
            attrs: { type: "button", "data-step": "-1", "aria-label": `One less ${product.name}`, disabled: quantity <= 1 ? "" : null },
        }),
        el("span", { className: "bb-reel", attrs: { "data-reel": "", "aria-label": String(quantity) } }, [strip]),
        el("button", {
            text: "+",
            attrs: { type: "button", "data-step": "1", "aria-label": `One more ${product.name}`, disabled: quantity >= item.max_quantity ? "" : null },
        }),
    ]);
}

function priceEach(product) {
    const line = el("span", { className: "bb-card__each", text: `${formatPrice(product.price)} each` });
    if (product.compare_at_price && Number(product.compare_at_price) > Number(product.price)) {
        line.append(el("s", { text: formatPrice(product.compare_at_price) }));
    }
    return line;
}

/** Same products as before: only numbers change. */
function updateCards(items) {
    for (const item of items) {
        const card = ui.list.querySelector(`[data-line="${item.product.id}"]`);
        if (!card) continue;
        const reel = card.querySelector("[data-reel]");
        reel.setAttribute("aria-label", String(item.quantity));
        reel.querySelector("b").style.setProperty("--n", String(item.quantity));
        card.querySelector("[data-line-total]").textContent = formatPrice(item.line_total);
        const [minus, plus] = card.querySelectorAll("[data-step]");
        minus.disabled = item.quantity <= 1;
        plus.disabled = item.quantity >= item.max_quantity;
    }
}

/** First 6 cards, then "Show N more" with little stacked photos. */
function showOrHideExtra(visible) {
    const extra = visible.slice(SHOW);
    ui.more.hidden = extra.length === 0;
    ui.more.setAttribute("aria-expanded", String(state.open));
    ui.moreText.textContent = state.open ? "Show less" : `Show ${extra.length} more`;
    ui.moreStack.replaceChildren(...(state.open ? [] : extra.slice(0, MORE_PHOTOS).map((item) =>
        el("img", { attrs: { src: item.product.thumbnail, alt: "", width: "40", height: "40", loading: "lazy" } }))));
    [...ui.list.children].forEach((card, index) => { card.hidden = !state.open && index >= SHOW; });
}

function setupMore() {
    ui.more.addEventListener("click", () => {
        state.open = !state.open;
        [...ui.list.children].forEach((card, index) => {
            if (index >= SHOW) card.style.setProperty("--d", String(index - SHOW));
        });
        render(state.cart);
    });
}

/* ------------------------------------------------------------------ 5. Quantity · 6. Remove */
function setupList() {
    ui.list.addEventListener("click", (event) => {
        const step = event.target.closest("[data-step]");
        if (step) return changeQuantity(step);
        const remove = event.target.closest("[data-remove]");
        if (remove) removeLine(remove);
    });
}

async function changeQuantity(button) {
    const card = button.closest("[data-line]");
    const control = button.closest("[data-qty]");
    const item = findItem(Number(card.dataset.line));
    if (!item || control.classList.contains("is-busy")) return;

    const quantity = item.quantity + Number(button.dataset.step);
    if (quantity < 1 || quantity > item.max_quantity) return;

    control.classList.add("is-busy");
    // Spin the digit straight away, the server confirms after
    control.querySelector("[data-reel] b").style.setProperty("--n", String(quantity));
    flyCoin(button, getComputedStyle(card).getPropertyValue("--c"));

    try {
        apply(await updateCartItem(item.product.id, quantity));
        flashTotal();
    } catch (error) {
        control.querySelector("[data-reel] b").style.setProperty("--n", String(item.quantity));
        showNotice(error?.data?.detail || "Couldn't change the quantity. Please try again.");
    } finally {
        control.classList.remove("is-busy");
    }
}

async function removeLine(button) {
    const card = button.closest("[data-line]");
    const item = findItem(Number(card.dataset.line));
    if (!item || card.classList.contains("is-gone")) return;

    burst(card, getComputedStyle(card).getPropertyValue("--c"));
    card.classList.add("is-gone");

    try {
        const [cart] = await Promise.all([removeCartItem(item.product.id), wait(state.reduced ? 0 : REMOVE_MS)]);
        apply(cart);
        offerUndo(item);
    } catch (error) {
        card.classList.remove("is-gone");
        showNotice(error?.data?.detail || "Couldn't remove this item. Please try again.");
    }
}

/** A glowing coin arcs from the button into the total. */
function flyCoin(from, color) {
    if (state.reduced) return;
    const a = from.getBoundingClientRect();
    const b = ui.total.getBoundingClientRect();
    const x0 = a.left + a.width / 2;
    const y0 = a.top + a.height / 2;
    const x1 = b.left + b.width / 2;
    const y1 = b.top + b.height / 2;
    const coin = el("i", { className: "bb-coin", attrs: { "aria-hidden": "true" } });
    coin.style.setProperty("--c", color);
    document.body.append(coin);

    coin.animate([
        { transform: `translate(${x0}px, ${y0}px) scale(1)` },
        { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 70}px) scale(1.4)` },
        { transform: `translate(${x1}px, ${y1}px) scale(0.3)`, opacity: 0.2 },
    ], { duration: COIN_MS, easing: "cubic-bezier(0.45, 0, 0.2, 1)" }).onfinish = () => coin.remove();
}

/** The card bursts into little bits. */
function burst(card, color) {
    if (state.reduced) return;
    const box = card.getBoundingClientRect();
    for (let i = 0; i < BURST_BITS; i += 1) {
        const bit = el("i", { className: "bb-bit", attrs: { "aria-hidden": "true" } });
        bit.style.setProperty("--c", i % 3 ? color : "var(--color-text)");
        document.body.append(bit);
        const x = box.left + Math.random() * box.width;
        const y = box.top + Math.random() * box.height;
        const angle = Math.random() * Math.PI * 2;
        const distance = 40 + Math.random() * 80;
        bit.animate([
            { transform: `translate(${x}px, ${y}px)`, opacity: 1 },
            { transform: `translate(${x + Math.cos(angle) * distance}px, ${y + Math.sin(angle) * distance + 40}px) scale(0.2)`, opacity: 0 },
        ], { duration: 700 + Math.random() * 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }).onfinish = () => bit.remove();
    }
}

/* ------------------------------------------------------------------ Undo pill */
function offerUndo(item) {
    state.undo = { productId: item.product.id, quantity: item.quantity };
    ui.toastText.textContent = `Removed ${item.product.name}`;
    ui.toast.classList.add("is-visible");
    startUndoTimer();
    if (document.activeElement === document.body) ui.undo.focus({ preventScroll: true });
}

function startUndoTimer() {
    clearTimeout(state.undoTimer);
    state.undoTimer = setTimeout(hideUndo, UNDO_MS);
}

function hideUndo() {
    clearTimeout(state.undoTimer);
    ui.toast.classList.remove("is-visible");
    state.undo = null;
}

function setupUndo() {
    ui.undo.addEventListener("click", async () => {
        const undo = state.undo;
        if (!undo) return;
        hideUndo();
        try {
            apply(await addToCart(undo.productId, undo.quantity));
        } catch (error) {
            showNotice(error?.data?.detail || "Couldn't put it back. Please try again.");
        }
    });
    ui.toast.addEventListener("pointerenter", () => clearTimeout(state.undoTimer));
    ui.toast.addEventListener("pointerleave", () => { if (state.undo) startUndoTimer(); });
}

/* ------------------------------------------------------------------ Notices */
function renderNotices(notices = []) {
    ui.notices.querySelectorAll("[data-server-notice]").forEach((node) => node.remove());
    for (const text of notices) ui.notices.append(el("p", { text, attrs: { "data-server-notice": "" } }));
}

function showNotice(text) {
    const notice = el("p", { text });
    ui.notices.append(notice);
    setTimeout(() => notice.remove(), NOTICE_MS);
}

/* ------------------------------------------------------------------ 7. Extras */
function splitLetters(title) {
    if (!title || state.reduced) return;
    const text = title.textContent.trim();
    title.setAttribute("aria-label", text);
    title.replaceChildren(...[...text].map((char, index) => {
        const span = el("span", { className: "bb-letter", text: char, attrs: { "aria-hidden": "true" } });
        span.style.setProperty("--i", String(index));
        return span;
    }));
}

/** Two soft colour orbs that drift away from the mouse. */
function addOrbs(root) {
    const orbs = [
        el("i", { className: "bb-orb bb-orb--1", attrs: { "aria-hidden": "true" } }),
        el("i", { className: "bb-orb bb-orb--2", attrs: { "aria-hidden": "true" } }),
    ];
    root.prepend(...orbs);
    if (state.reduced || !state.fine) return;

    let frame = 0;
    window.addEventListener("pointermove", (event) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            const x = event.clientX / window.innerWidth - 0.5;
            const y = event.clientY / window.innerHeight - 0.5;
            orbs[0].style.transform = `translate(${x * 80}px, ${y * 80}px)`;
            orbs[1].style.transform = `translate(${x * -60}px, ${y * -60}px)`;
        });
    }, { passive: true });
}

/** The card leans toward the mouse and the holo shine follows it. */
function addTilt(card) {
    card.addEventListener("pointermove", (event) => {
        const box = card.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;
        card.style.setProperty("--tx", `${x * 12}deg`);
        card.style.setProperty("--ty", `${-y * 14}deg`);
        card.style.setProperty("--hx", `${(x + 0.5) * 100}%`);
    });
    card.addEventListener("pointerleave", () => {
        card.style.setProperty("--tx", "0deg");
        card.style.setProperty("--ty", "0deg");
    });
}

/** Continue button: leans toward the mouse; does nothing while disabled. */
function setupGo() {
    ui.go.addEventListener("click", (event) => {
        if (ui.go.getAttribute("aria-disabled") === "true") event.preventDefault();
    });
    if (state.reduced || !state.fine) return;
    ui.go.addEventListener("pointermove", (event) => {
        const box = ui.go.getBoundingClientRect();
        ui.go.style.transform = `translate(${(event.clientX - box.left - box.width / 2) * 0.12}px, ${(event.clientY - box.top - box.height / 2) * 0.3}px)`;
    });
    ui.go.addEventListener("pointerleave", () => { ui.go.style.transform = ""; });
    window.addEventListener("resize", placePill);
}

/* ------------------------------------------------------------------ Helpers */
function findItem(productId) {
    return state.cart?.items.find((item) => item.product.id === productId);
}

function productUrl(product) {
    return `/products/${encodeURIComponent(product.slug)}/`;
}

function plural(count, word, many = `${word}s`) {
    return `${count} ${count === 1 ? word : many}`;
}

function restartClass(node, className) {
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}