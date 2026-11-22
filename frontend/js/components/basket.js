/**
 * Basket page: the brain.
 *
 *  1. Load       get the basket from the server and draw everything
 *  2. Ticket     total (counts up), items · categories, split bar, notices
 *  3. Items      big tiles (1–4 products) or folding category bars (5+)
 *  4. Quantity   − / + with slot-machine digits
 *  5. Remove     card shrinks away + "Undo" toast
 *  6. Bars       open / close one bar, Expand all / Collapse all
 *  7. Slim bar   small sticky ticket after scrolling past the big one
 *
 * HTML: pages/cart/*.html · Styles: css/cart/*.css
 * Prices always come from the server. Text from the database is added with
 * el() (textContent), never innerHTML, so it can never run as code.
 */
import { addToCart, getCart, removeCartItem, updateCartItem } from "../api/cart.js";
import { el } from "../utils/dom.js";
import { formatPrice } from "../utils/format.js";
import { prefersReducedMotion } from "../utils/motion.js";
import { announceCart, CART_UPDATED } from "./cartActions.js";
import { setCartCount } from "./header.js";

const BARS_FROM = 5;
const compactBasket = window.matchMedia("(max-width: 900px)");    // 5+ products → category bars instead of tiles
const COUNT_MS = 700;      // total counting time
const REMOVE_MS = 400;     // card shrink time (same as items.css)
const UNDO_MS = 5000;      // how long "Undo" stays
const NOTICE_MS = 6000;    // how long an error message stays
const CATEGORY_COLORS = ["#ff6b4a", "#7c5cff", "#16b5a3", "#f2b705", "#ff4f9a", "#3d8bfd", "#8ac926"];

let ui = null;
const state = {
    cart: null,          // the last basket the server sent
    shownTotal: 0,       // the total currently shown (for counting)
    listKey: "",         // layout + product ids → tells us when to rebuild
    splitKey: "",        // categories in the split bar
    openBars: new Set(), // category bars the customer opened
    undo: null,          // { productId, quantity } of the last removed item
    undoTimer: null,
};

/** Start the basket page. Called once by pages/cart.js. */
export function initBasket() {
    const root = document.querySelector("[data-basket]");
    if (!root) return;

    ui = {
        root,
        count: root.querySelector("[data-basket-count]"),
        ticket: root.querySelector("[data-ticket]"),
        total: root.querySelector("[data-ticket-total]"),
        meta: root.querySelector("[data-ticket-meta]"),
        bar: root.querySelector("[data-ticket-bar]"),
        legend: root.querySelector("[data-ticket-legend]"),
        subtotal: root.querySelector("[data-ticket-subtotal]"),
        notices: root.querySelector("[data-ticket-notices]"),
        cta: root.querySelector("[data-ticket-cta]"),
        slim: root.querySelector("[data-ticket-slim]"),
        slimTotal: root.querySelector("[data-slim-total]"),
        slimMeta: root.querySelector("[data-slim-meta]"),
        list: root.querySelector("[data-items-list]"),
        toggleAll: root.querySelector("[data-toggle-all]"),
        toast: root.querySelector("[data-undo-toast]"),
        toastText: root.querySelector("[data-undo-text]"),
        undoButton: root.querySelector("[data-undo-button]"),
    };
    ui.cta.setAttribute("aria-disabled", "true"); // not clickable until loaded

    setupListEvents();
    setupToggleAll();
    setupUndo();
    setupSlimBar();

    // Another part of the page (e.g. "Complete your basket") changed the basket
    document.addEventListener(CART_UPDATED, (event) => {
        if (event.detail && event.detail !== state.cart) render(event.detail);
    });
    compactBasket.addEventListener("change", () => {
        if (!state.cart) return;

        const items = state.cart.items || [];
        renderList(items, items, false);
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

/** Show a new basket and tell the rest of the page about it. */
function apply(cart, options) {
    render(cart, options);
    announceCart(cart);
}

function render(cart, { first = false } = {}) {
    const previous = state.cart;
    state.cart = cart;
    const items = cart.items || [];
    const quantity = cart.total_quantity || 0;

    ui.root.dataset.state = items.length ? "full" : "empty";
    ui.list.removeAttribute("aria-busy");
    setCartCount(quantity, { bump: !first && previous?.total_quantity !== quantity });
    ui.count.textContent = items.length ? `${plural(quantity, "item")} waiting for you` : "Nothing here yet";

    renderTicket(cart, items, first);
    renderList(items, previous?.items || [], first);
    renderNotices(cart.notices);
}

/* ------------------------------------------------------------------ 2. Ticket */
function renderTicket(cart, items, first) {
    const groups = groupByCategory(items);

    ui.meta.textContent = `${plural(cart.total_quantity, "item")} · ${plural(groups.length, "category", "categories")}`;
    ui.slimMeta.textContent = plural(cart.total_quantity, "item");
    ui.subtotal.textContent = formatPrice(cart.subtotal);
    ui.slimTotal.textContent = formatPrice(cart.total);
    ui.cta.setAttribute("aria-disabled", String(items.length === 0));

    countTotal(Number(cart.total), first);
    renderSplit(groups, Number(cart.subtotal));
}

/** The big total counts from the old number to the new one. */
function countTotal(end, first) {
    const start = state.shownTotal;
    state.shownTotal = end;

    if (start === end || prefersReducedMotion()) {
        ui.total.textContent = formatPrice(end);
        return;
    }
    if (!first) restartClass(ui.total, "is-flash");

    const begin = performance.now();
    const step = (now) => {
        if (state.shownTotal !== end) return; // a newer count took over
        const progress = Math.min((now - begin) / COUNT_MS, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        ui.total.textContent = formatPrice(start + (end - start) * eased);
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

/** Coloured bar: each category gets a piece as wide as its share of the total. */
function renderSplit(groups, subtotal) {
    const share = (group) => (subtotal > 0 ? group.subtotal / subtotal : 0);
    const percent = (group) => `${Math.round(share(group) * 100)}%`;

    // Rebuild the pieces only when the categories change (so they don't re-grow every click)
    const key = groups.map((group) => group.slug).join("|");
    if (key !== state.splitKey) {
        state.splitKey = key;
        ui.bar.replaceChildren(...groups.map((group, index) => {
            const piece = el("span", { className: "ticket__seg" });
            piece.style.setProperty("--seg-color", group.color);
            piece.style.setProperty("--i", index);
            return piece;
        }));
    }
    groups.forEach((group, index) => {
        ui.bar.children[index]?.style.setProperty("--share", share(group).toFixed(4));
    });

    ui.legend.replaceChildren(...groups.map((group) => {
        const dot = el("span", { className: "ticket__legend-dot", attrs: { "aria-hidden": "true" } });
        dot.style.setProperty("--seg-color", group.color);
        return el("li", {}, [
            dot,
            el("span", { text: group.name }),
            el("span", { className: "ticket__legend-share", text: percent(group) }),
        ]);
    }));

    ui.bar.setAttribute(
        "aria-label",
        `Basket total by category: ${groups.map((group) => `${group.name} ${percent(group)}`).join(", ")}`,
    );
}

/** Messages from the server, e.g. "Only 3 of … left, so we updated your basket." */
function renderNotices(notices = []) {
    ui.notices.querySelectorAll("[data-server-notice]").forEach((node) => node.remove());
    for (const text of notices) {
        ui.notices.append(el("p", { className: "ticket__notice", text, attrs: { "data-server-notice": "" } }));
    }
}

/** A short message of our own (e.g. an error) that disappears by itself. */
function showNotice(text) {
    const notice = el("p", { className: "ticket__notice", text });
    ui.notices.append(notice);
    setTimeout(() => notice.remove(), NOTICE_MS);
}

/* ------------------------------------------------------------------ 3. Items */
function renderList(items, previousItems, first) {
    if (!items.length) {
        state.listKey = "";
        ui.list.replaceChildren();
        updateToggleAll();
        return;
    }

    const layout = compactBasket.matches || items.length >= BARS_FROM
        ? "bars"
        : "tiles";
    const key = `${layout}:${items.map((item) => item.product.id).join(",")}`;

    // Same products → only update numbers in place (no jumping, keeps focus)
    if (key === state.listKey) {
        updateLines(items);
        return;
    }

    const layoutChanged = ui.list.dataset.layout !== layout || !state.listKey;
    state.listKey = key;
    ui.list.dataset.layout = layout;

    const nodes = layout === "tiles"
        ? items.map((item, index) => buildTile(item, index))
        : groupByCategory(items).map((group, index) => buildBar(group, index));
    const boxes = measure();           // remember where every card is now
    ui.list.replaceChildren(...nodes);
    glide(boxes);                      // cards that moved glide to their new place

    // Only NEW cards play the entrance animation
    if (!first && !layoutChanged) {
        const oldIds = new Set(previousItems.map((item) => item.product.id));
        const oldSlugs = new Set(groupByCategory(previousItems).map((group) => group.slug));
        for (const node of ui.list.querySelectorAll(".tile, .bar, .row")) {
            const known = node.dataset.bar
                ? oldSlugs.has(node.dataset.bar)
                : oldIds.has(Number(node.dataset.line));
            if (known) node.style.animation = "none";
        }
    }
    updateToggleAll();
}

function buildTile(item, index) {
    const { product } = item;
    const url = productUrl(product);

    const tile = el("article", { className: "tile", attrs: { "data-line": product.id } }, [
        // The photo link is skipped by Tab and screen readers: the name link below is the real one
        el("a", { className: "tile__media", attrs: { href: url, tabindex: "-1", "aria-hidden": "true" } }, [
            photo(product.image || product.thumbnail, "tile__photo"),
        ]),
        removeButton(product, "tile__remove"),
        el("div", { className: "tile__body" }, [
            el("p", { className: "tile__category", text: product.category?.name || "" }),
            el("h3", { className: "tile__name" }, [el("a", { text: product.name, attrs: { href: url } })]),
            priceLine(product, "tile__price"),
            el("div", { className: "tile__foot" }, [
                quantityControl(item),
                el("p", { className: "tile__total", text: formatPrice(item.line_total), attrs: { "data-line-total": "" } }),
            ]),
        ]),
    ]);
    tile.style.setProperty("--i", index);
    return tile;
}

function buildBar(group, index) {
    const open = state.openBars.has(group.slug);
    const panelId = `bar-panel-${group.slug}`;

    const head = el("button", {
        className: "bar__head",
        attrs: { type: "button", "aria-expanded": String(open), "aria-controls": panelId, "data-bar-toggle": "" },
    }, [
        el("span", { className: "bar__stripe", attrs: { "aria-hidden": "true" } }),
        el("span", { className: "bar__name", text: group.name }),
        el("span", { className: "bar__stack", attrs: { "aria-hidden": "true" } },
            group.items.slice(0, 4).map((item) => photo(item.product.thumbnail))),
        el("span", { className: "bar__count", text: plural(group.quantity, "item"), attrs: { "data-bar-count": "" } }),
        el("span", { className: "bar__subtotal", text: formatPrice(group.subtotal), attrs: { "data-bar-subtotal": "" } }),
        el("span", { className: "bar__chevron", attrs: { "aria-hidden": "true" } }),
    ]);

    const panel = el("div", { className: "bar__panel", attrs: { id: panelId } }, [
        el("div", { className: "bar__inner" }, group.items.map((item, row) => buildRow(item, row))),
    ]);
    panel.inert = !open; // closed bars are skipped by the Tab key

    const bar = el("section", {
        className: open ? "bar is-open" : "bar",
        attrs: { "data-bar": group.slug, "aria-label": group.name },
    }, [head, panel]);
    bar.style.setProperty("--cat-color", group.color);
    bar.style.setProperty("--i", index);
    return bar;
}

function buildRow(item, rowIndex) {
    const { product } = item;
    const url = productUrl(product);

    const row = el("article", { className: "row", attrs: { "data-line": product.id } }, [
        el("a", { className: "row__media", attrs: { href: url, tabindex: "-1", "aria-hidden": "true" } }, [
            photo(product.thumbnail),
        ]),
        el("div", { className: "row__info" }, [
            el("h3", { className: "row__name" }, [el("a", { text: product.name, attrs: { href: url } })]),
            priceLine(product, "row__price"),
        ]),
        removeButton(product, "row__remove"),
        quantityControl(item),
        el("p", { className: "row__total", text: formatPrice(item.line_total), attrs: { "data-line-total": "" } }),
    ]);
    row.style.setProperty("--r", rowIndex);
    return row;
}

function quantityControl(item) {
    const { product, quantity } = item;
    return el("div", { className: "qty", attrs: { "data-qty": "", role: "group", "aria-label": `Quantity of ${product.name}` } }, [
        el("button", {
            className: "qty__btn",
            text: "−",
            attrs: { type: "button", "data-qty-step": "-1", "aria-label": `One less ${product.name}`, disabled: quantity <= 1 ? "" : null },
        }),
        el("span", { className: "qty__slot", attrs: { "aria-live": "polite" } }, [
            el("span", { className: "qty__value", text: String(quantity), attrs: { "data-qty-value": "" } }),
        ]),
        el("button", {
            className: "qty__btn",
            text: "+",
            attrs: { type: "button", "data-qty-step": "1", "aria-label": `One more ${product.name}`, disabled: quantity >= item.max_quantity ? "" : null },
        }),
    ]);
}

function removeButton(product, className) {
    return el("button", {
        className,
        text: "×",
        attrs: { type: "button", "data-remove": "", "aria-label": `Remove ${product.name}` },
    });
}

function priceLine(product, className) {
    const line = el("p", { className, text: `${formatPrice(product.price)} each` });
    if (product.compare_at_price && Number(product.compare_at_price) > Number(product.price)) {
        line.append(el("s", { text: formatPrice(product.compare_at_price) }));
    }
    return line;
}

function photo(src, className) {
    return el("img", {
        className,
        attrs: { src, alt: "", loading: "lazy", decoding: "async", width: "400", height: "400" },
    });
}

/** Same products as before: update quantities and totals without rebuilding. */
function updateLines(items) {
    for (const item of items) {
        const line = ui.list.querySelector(`[data-line="${item.product.id}"]`);
        if (!line) continue;

        const value = line.querySelector("[data-qty-value]");
        const old = Number(value.textContent);
        if (old !== item.quantity) rollDigit(value, item.quantity, item.quantity > old);

        line.querySelector("[data-line-total]").textContent = formatPrice(item.line_total);
        const [minus, plus] = line.querySelectorAll("[data-qty-step]");
        minus.disabled = item.quantity <= 1;
        plus.disabled = item.quantity >= item.max_quantity;
    }

    for (const group of groupByCategory(items)) {
        const bar = ui.list.querySelector(`[data-bar="${group.slug}"]`);
        if (!bar) continue;
        bar.querySelector("[data-bar-count]").textContent = plural(group.quantity, "item");
        bar.querySelector("[data-bar-subtotal]").textContent = formatPrice(group.subtotal);
    }
}

/* ------------------------------------------------------------------ 4. Quantity · 5. Remove · 6. Bars (clicks) */
function setupListEvents() {
    ui.list.addEventListener("click", (event) => {
        const step = event.target.closest("[data-qty-step]");
        if (step) return changeQuantity(step);

        const remove = event.target.closest("[data-remove]");
        if (remove) return removeLine(remove);

        const toggle = event.target.closest("[data-bar-toggle]");
        if (toggle) toggleBar(toggle.closest("[data-bar]"));
    });
}

async function changeQuantity(button) {
    const control = button.closest("[data-qty]");
    const productId = Number(button.closest("[data-line]").dataset.line);
    const item = findItem(productId);
    if (!item || control.classList.contains("is-busy")) return;

    const quantity = item.quantity + Number(button.dataset.qtyStep);
    if (quantity < 1 || quantity > item.max_quantity) return;

    control.classList.add("is-busy");
    try {
        apply(await updateCartItem(productId, quantity));
    } catch (error) {
        showNotice(error?.data?.detail || "Couldn't change the quantity. Please try again.");
    } finally {
        control.classList.remove("is-busy");
    }
}

/** The number rolls in from below (bigger) or from above (smaller). */
function rollDigit(node, value, up) {
    node.textContent = String(value);
    node.classList.remove("is-up", "is-down");
    void node.offsetWidth; // restart the animation
    node.classList.add(up ? "is-up" : "is-down");
}

async function removeLine(button) {
    const line = button.closest("[data-line]");
    const productId = Number(line.dataset.line);
    const item = findItem(productId);
    if (!item || line.classList.contains("is-removing")) return;

    // Shrink the card (and its bar, if it was the last one inside)
    line.classList.add("is-removing");
    const bar = line.closest("[data-bar]");
    if (bar && !bar.querySelector("[data-line]:not(.is-removing)")) bar.classList.add("is-removing");

    try {
        const [cart] = await Promise.all([removeCartItem(productId), wait(REMOVE_MS)]);
        apply(cart);
        offerUndo(item);
    } catch (error) {
        line.classList.remove("is-removing");
        bar?.classList.remove("is-removing");
        showNotice(error?.data?.detail || "Couldn't remove this item. Please try again.");
    }
}

function toggleBar(bar, force) {
    const open = force ?? !bar.classList.contains("is-open");
    bar.classList.toggle("is-open", open);
    bar.querySelector("[data-bar-toggle]").setAttribute("aria-expanded", String(open));
    bar.querySelector(".bar__panel").inert = !open;

    if (open) {
        state.openBars.add(bar.dataset.bar);
        // let the rows fold in again
        bar.querySelectorAll(".row").forEach((row) => { row.style.animation = ""; });
    } else {
        state.openBars.delete(bar.dataset.bar);
    }
    updateToggleAll();
}

function setupToggleAll() {
    ui.toggleAll.addEventListener("click", () => {
        const bars = [...ui.list.querySelectorAll("[data-bar]")];
        const open = !bars.every((bar) => bar.classList.contains("is-open"));
        bars.forEach((bar, index) => setTimeout(() => toggleBar(bar, open), index * 70));
    });
}

function updateToggleAll() {
    const bars = [...ui.list.querySelectorAll("[data-bar]")];
    const allOpen = bars.length > 0 && bars.every((bar) => bar.classList.contains("is-open"));
    ui.toggleAll.hidden = bars.length === 0;
    ui.toggleAll.textContent = allOpen ? "Collapse all" : "Expand all";
    ui.toggleAll.setAttribute("aria-expanded", String(allOpen));
}

/* ------------------------------------------------------------------ 5. Undo toast */
function offerUndo(item) {
    state.undo = { productId: item.product.id, quantity: item.quantity };
    ui.toastText.textContent = `Removed ${item.product.name}`;
    ui.toast.classList.add("is-visible");
    startUndoTimer();

    // Keyboard users: the removed button is gone, so move focus to "Undo"
    if (document.activeElement === document.body) ui.undoButton.focus({ preventScroll: true });
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
    ui.undoButton.addEventListener("click", async () => {
        const undo = state.undo;
        if (!undo) return;
        hideUndo();
        try {
            apply(await addToCart(undo.productId, undo.quantity));
        } catch (error) {
            showNotice(error?.data?.detail || "Couldn't put it back. Please try again.");
        }
    });

    // The toast waits while the mouse is on it
    ui.toast.addEventListener("pointerenter", () => clearTimeout(state.undoTimer));
    ui.toast.addEventListener("pointerleave", () => { if (state.undo) startUndoTimer(); });
}

/* ------------------------------------------------------------------ 7. Slim bar */
function setupSlimBar() {
    if (!ui.slim || !ui.ticket) return;
    const observer = new IntersectionObserver(([entry]) => {
        // Show it only when the big ticket has gone ABOVE the screen
        const passed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        ui.slim.classList.toggle("is-visible", passed);
    });
    observer.observe(ui.ticket);
}

/* ------------------------------------------------------------------ Smooth gliding (FLIP) */
/**
 * FLIP = First, Last, Invert, Play.
 * 1. measure() remembers where each card is BEFORE the change.
 * 2. After the change, glide() moves each card back to its old place
 *    with a transform, then lets it slide smoothly to its new place.
 * Positions are measured inside their parent (the list, or the bar for rows),
 * so a row and its bar never move twice.
 */
function measure() {
    const boxes = new Map();
    for (const node of ui.list.querySelectorAll("[data-line], [data-bar]")) {
        boxes.set(cardKey(node), offsetIn(node));
    }
    return boxes;
}

function glide(boxes) {
    if (!boxes.size || prefersReducedMotion()) return;

    for (const node of ui.list.querySelectorAll("[data-line], [data-bar]")) {
        const before = boxes.get(cardKey(node));
        if (!before) continue; // a new card: it has its own entrance animation

        const after = offsetIn(node);
        const dx = before.x - after.x;
        const dy = before.y - after.y;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

        node.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
            { duration: 600, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
    }
}

/** Position of a card inside its bar (rows) or inside the list (tiles and bars). */
function offsetIn(node) {
    const parent = node.parentElement.closest("[data-bar]") || ui.list;
    const box = node.getBoundingClientRect();
    const parentBox = parent.getBoundingClientRect();
    return { x: box.left - parentBox.left, y: box.top - parentBox.top };
}

function cardKey(node) {
    return node.dataset.bar ? `bar:${node.dataset.bar}` : `line:${node.dataset.line}`;
}

/* ------------------------------------------------------------------ Helpers */
/** Group basket lines by category, each with a colour, subtotal and quantity. */
export function groupByCategory(items) {
    const slugs = [...new Set(items.map((item) => item.product.category?.slug || "other"))].sort();
    const groups = new Map();

    for (const item of items) {
        const category = item.product.category || { slug: "other", name: "Other" };
        if (!groups.has(category.slug)) {
            groups.set(category.slug, {
                slug: category.slug,
                name: category.name,
                color: CATEGORY_COLORS[slugs.indexOf(category.slug) % CATEGORY_COLORS.length],
                items: [],
                subtotal: 0,
                quantity: 0,
            });
        }
        const group = groups.get(category.slug);
        group.items.push(item);
        group.subtotal += Number(item.line_total);
        group.quantity += item.quantity;
    }
    return [...groups.values()];
}

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