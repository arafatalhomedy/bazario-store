/**
 * "The Collection": 3D showroom of products (+ grid view).
 *
 *  1. Start            5. 3D layout       9. Tilt on the center card
 *  2. Tabs             6. Info panel     10. Carousel / Grid switch
 *  3. Load products    7. Moving         11. Empty / error messages
 *  4. Build cards      8. Autoplay
 *
 * The address can choose the tab:  ?category=<slug>   ?new=1   ?search=<text>
 * HTML: pages/home/collection.html · Styles: css/home/collection.css
 */
import { markPhoto, warmUp } from "../animations/morph.js";
import { addProductToCart } from "./cartActions.js";
import { fetchCategories, fetchProducts } from "../api/products.js";
import { averageColorWhenLoaded } from "../utils/color.js";
import { el } from "../utils/dom.js";
import { formatPrice } from "../utils/format.js";
import { hasFinePointer, prefersReducedMotion } from "../utils/motion.js";

const MAX_PRODUCTS = 48;     // server maximum per request
const AUTOPLAY_MS = 3800;    // time between automatic moves
const SWIPE_PX = 40;         // drag distance needed to change product
const VISIBLE_SIDE = 3;      // cards shown on each side of the center
const BADGE_LABELS = { sold_out: "Sold out", sale: "Sale", new: "New", low_stock: "Low stock" };
const BADGE_PRIORITY = ["sold_out", "sale", "new", "low_stock"];

/* ================================================================== 1. Start */
export function initShowroom() {
    const root = document.querySelector("[data-showroom]");
    if (!root) return;

    const ui = {
        total: root.querySelector("[data-showroom-total]"),
        tabs: root.querySelector("[data-tabs]"),
        pill: root.querySelector("[data-tabs-pill]"),
        searchNote: root.querySelector("[data-search-note]"),
        searchTerm: root.querySelector("[data-search-term]"),
        clearSearch: root.querySelector("[data-clear-search]"),
        viewButtons: [...root.querySelectorAll("[data-view]")],
        carousel: root.querySelector("[data-carousel]"),
        stage: root.querySelector("[data-stage]"),
        number: root.querySelector("[data-stage-number]"),
        cards: root.querySelector("[data-stage-cards]"),
        prev: root.querySelector("[data-prev]"),
        next: root.querySelector("[data-next]"),
        meta: root.querySelector("[data-meta]"),
        kicker: root.querySelector("[data-meta-kicker]"),
        name: root.querySelector("[data-meta-name]"),
        price: root.querySelector("[data-meta-price]"),
        link: root.querySelector("[data-meta-link]"),
        addToCart: root.querySelector("[data-add-to-cart]"),
        thumbs: root.querySelector("[data-thumbs]"),
        grid: root.querySelector("[data-grid]"),
        state: root.querySelector("[data-state]"),
        stateTitle: root.querySelector("[data-state-title]"),
        stateText: root.querySelector("[data-state-text]"),
        stateAction: root.querySelector("[data-state-action]"),
    };

    const params = new URLSearchParams(window.location.search);
    const state = {
        tab: params.get("new") === "1" ? "new" : params.get("category") ? `cat:${params.get("category")}` : "all",
        search: (params.get("search") || "").trim().slice(0, 100),
        products: [],
        index: 0,
        view: "carousel",
        request: null,       // AbortController of the request in progress
        hovering: false,
        onScreen: false,
        timer: null,
    };
    const els = { cards: [], thumbs: [] };

    /* ================================================================ 2. Tabs */
    async function buildTabs() {
        let categories = [];
        try {
            categories = await fetchCategories();
        } catch {
            categories = []; // the "All" and "New in" tabs still work
        }
        const total = categories.reduce((sum, c) => sum + c.product_count, 0);

        const tabs = [
            { key: "all", label: "All", count: total },
            ...categories.map((c) => ({ key: `cat:${c.slug}`, label: c.name, count: c.product_count })),
            { key: "new", label: "New in", isNew: true },
        ];

        ui.tabs.append(...tabs.map((tab) => {
            const button = el("button", {
                className: `showroom__tab${tab.isNew ? " showroom__tab--new" : ""}`,
                text: tab.label,
                attrs: { type: "button", "data-tab": tab.key, "aria-pressed": "false" },
            }, [tab.count !== undefined ? el("small", { text: String(tab.count) }) : null]);
            button.addEventListener("click", () => selectTab(tab.key));
            return button;
        }));

        markActiveTab();
    }

    function selectTab(key) {
        if (key === state.tab && !state.search) return;
        state.tab = key;
        state.search = "";
        markActiveTab();
        writeUrl();
        loadProducts();
    }

    function markActiveTab() {
        let active = null;
        for (const button of ui.tabs.querySelectorAll("[data-tab]")) {
            const isActive = button.dataset.tab === state.tab;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
            if (isActive) active = button;
        }
        if (!active) return;

        // Slide the pill under the active tab
        ui.tabs.style.setProperty("--pill-x", `${active.offsetLeft}px`);
        ui.tabs.style.setProperty("--pill-w", `${active.offsetWidth}px`);
        ui.pill.classList.toggle("is-new", active.classList.contains("showroom__tab--new"));
        // Keep it visible when the tabs scroll sideways (phones)
        ui.tabs.scrollTo({ left: active.offsetLeft - ui.tabs.clientWidth / 2 + active.offsetWidth / 2, behavior: "smooth" });
    }

    /** Keep the address in sync, so the back button and shared links work. */
    function writeUrl() {
        const query = new URLSearchParams();
        if (state.tab.startsWith("cat:")) query.set("category", state.tab.slice(4));
        if (state.tab === "new") query.set("new", "1");
        if (state.search) query.set("search", state.search);
        const text = query.toString();
        history.replaceState(null, "", `${location.pathname}${text ? `?${text}` : ""}#shop`);
    }

    /* ================================================================ 3. Load products */
    async function loadProducts() {
        state.request?.abort();
        const request = new AbortController();
        state.request = request;

        ui.searchNote.hidden = !state.search;
        ui.searchTerm.textContent = state.search;

        try {
            const page = await fetchProducts({
                category: state.tab.startsWith("cat:") ? state.tab.slice(4) : "",
                newOnly: state.tab === "new",
                search: state.search,
                sort: "newest",
                pageSize: MAX_PRODUCTS,
            }, request.signal);

            state.products = page.results;
            state.index = 0;
            ui.total.textContent = `(${page.count})`;

            if (state.products.length === 0) {
                showMessage("Nothing here yet", "Try another category.", "Show all products", () => selectTab("all"));
                return;
            }
            hideMessage();
            buildAll();
        } catch (error) {
            if (error.name === "AbortError") return; // a newer request replaced this one
            ui.total.textContent = "";
            showMessage("Couldn't load products", "Check your connection and try again.", "Try again", loadProducts);
        }
    }

    /* ================================================================ 4. Build cards */
    function buildAll() {
        els.cards = state.products.map(createStageCard);
        els.thumbs = state.products.map(createThumb);
        ui.cards.replaceChildren(...els.cards);
        ui.thumbs.replaceChildren(...els.thumbs);
        ui.grid.replaceChildren(...state.products.map(createGridCard));
        layout();
        updateInfo({ announce: false });
        restartAutoplay();
    }

    function createStageCard(product, index) {
        const badge = pickBadge(product);
        const card = el("li", { className: "stage-card", attrs: { "aria-hidden": "true" } }, [
            el("div", { className: "stage-card__inner" }, [
                el("div", { className: "stage-card__media" }, [
                    el("img", {
                        attrs: {
                            src: product.thumbnail || product.image,
                            alt: "",
                            width: "600",
                            height: "750",
                            draggable: "false",
                            loading: index < 4 ? "eager" : "lazy",
                            decoding: "async",
                        },
                    }),
                    badge ? el("span", { className: `stage-card__badge stage-card__badge--${badge}`, text: BADGE_LABELS[badge] }) : null,
                    el("span", { className: "stage-card__shine" }),
                ]),
            ]),
            el("div", { className: "stage-card__tag" }, [
                el("small", {}, [
                    isOnSale(product) ? el("s", { text: formatPrice(product.compare_at_price) }) : "Only",
                ]),
                formatPrice(product.price),
            ]),
        ]);

        // Mouse rests on the centre card: get its product page ready in the background,
        // so the photo can fly into place the moment it's clicked
        card.addEventListener("pointerenter", () => {
            if (index === state.index) warmUp(productUrl(product));
        });

        card.addEventListener("click", () => {
            if (drag.moved) return;
            if (index === state.index) {
                // center card: its photo flies into the product page, then open it
                markPhoto(card.querySelector("img"));
                window.location.href = productUrl(product);
            }
            else goTo(index, { byUser: true });                                    // side: bring to center
        });
        return card;
    }

    function createThumb(product, index) {
        const button = el("button", {
            className: "thumb",
            attrs: { type: "button", "aria-label": `Show ${product.name}` },
        }, [el("img", { attrs: { src: product.thumbnail || product.image, alt: "", loading: "lazy", decoding: "async" } })]);
        button.addEventListener("click", () => goTo(index, { byUser: true }));
        return button;
    }

    function createGridCard(product, index) {
        const item = el("li", { className: "grid-card" }, [
            el("a", { className: "grid-card__link", attrs: { href: productUrl(product) } }, [
                el("div", { className: "grid-card__media" }, [
                    el("img", { attrs: { src: product.thumbnail || product.image, alt: "", width: "600", height: "750", loading: "lazy", decoding: "async" } }),
                ]),
                el("p", { className: "grid-card__name", text: product.name }),
                el("p", { className: "grid-card__price" }, [
                    el("span", { text: formatPrice(product.price) }),
                    isOnSale(product) ? el("s", { text: formatPrice(product.compare_at_price) }) : null,
                ]),
            ]),
        ]);
        item.style.setProperty("--i", Math.min(index, 12)); // appear one after another
        return item;
    }

    /* ================================================================ 5. 3D layout */
    function layout() {
        const cardWidth = els.cards[0]?.offsetWidth || 180;
        const spacing = cardWidth * 0.68;

        els.cards.forEach((card, i) => {
            const offset = i - state.index;
            const distance = Math.abs(offset);
            const side = Math.sign(offset);
            const x = offset * spacing - side * Math.max(0, distance - 1) * spacing * 0.35;

            card.style.setProperty("--x", `${x}px`);
            card.style.setProperty("--z", `${-distance * 160}px`);
            card.style.setProperty("--ry", `${-side * Math.min(distance, 1) * 44}deg`);
            card.style.setProperty("--scale", distance ? "0.84" : "1.06");
            card.style.setProperty("--opacity", distance > VISIBLE_SIDE ? "0" : String(1 - distance * 0.2));
            card.style.setProperty("--filter", distance ? `blur(${Math.min(distance, 3) * 0.7}px) saturate(0.8)` : "none");
            card.style.setProperty("--layer", String(50 - distance));
            card.style.visibility = distance > VISIBLE_SIDE + 1 ? "hidden" : "visible"; // far cards: not drawn
            card.classList.toggle("is-center", distance === 0);
        });
    }

    /* ================================================================ 6. Info panel */
    function updateInfo({ announce }) {
        const product = state.products[state.index];
        if (!product) return;

        // Screen readers announce changes only when the customer caused them
        ui.meta.setAttribute("aria-live", announce ? "polite" : "off");

        restartAnimation(ui.meta);
        restartAnimation(ui.number.parentElement);

        const badge = pickBadge(product);
        ui.kicker.textContent = [product.category.name, badge ? BADGE_LABELS[badge] : ""].filter(Boolean).join(" · ");
        ui.name.textContent = product.name;
        ui.price.replaceChildren(...[
            formatPrice(product.price),
            isOnSale(product) ? el("s", { text: formatPrice(product.compare_at_price) }) : null,
        ].filter(Boolean));
        ui.number.textContent = String(state.index + 1).padStart(2, "0");

        ui.link.href = productUrl(product);
        ui.addToCart.dataset.productId = product.id;
        ui.addToCart.disabled = !product.in_stock;
        ui.addToCart.textContent = product.in_stock ? "Add to cart" : "Sold out";

        // Thumbnails: mark the current one and keep it in view
        els.thumbs.forEach((thumb, i) => {
            thumb.classList.toggle("is-active", i === state.index);
            if (i === state.index) thumb.setAttribute("aria-current", "true");
            else thumb.removeAttribute("aria-current");
        });
        const thumb = els.thumbs[state.index];
        ui.thumbs.scrollTo({
            left: thumb.offsetLeft - ui.thumbs.clientWidth / 2 + thumb.offsetWidth / 2,
            behavior: prefersReducedMotion() ? "auto" : "smooth",
        });

        updateGlow();
    }

    /** The glow behind the center card takes the main color of its photo. */
    async function updateGlow() {
        const image = els.cards[state.index]?.querySelector("img");
        if (!image) return;
        const color = await averageColorWhenLoaded(image);
        // Only use it if this product is still in the center
        if (color && els.cards[state.index]?.querySelector("img") === image) {
            root.style.setProperty("--glow-color", color);
        }
    }


    /* ================================================================ 7. Moving */
    function goTo(index, { byUser = false } = {}) {
        const count = state.products.length;
        if (count === 0) return;
        state.index = (index + count) % count; // after the last comes the first
        layout();
        updateInfo({ announce: byUser });
        // Mouse is on the showroom: get the new centre card's page ready right away
        if (state.hovering) warmUp(productUrl(state.products[state.index]));
        if (byUser) restartAutoplay();
    }

    ui.prev.addEventListener("click", () => goTo(state.index - 1, { byUser: true }));
    ui.next.addEventListener("click", () => goTo(state.index + 1, { byUser: true }));

    ui.stage.addEventListener("keydown", (event) => {
        const moves = { ArrowLeft: -1, ArrowRight: 1 };
        if (event.key in moves) {
            event.preventDefault();
            goTo(state.index + moves[event.key], { byUser: true });
        } else if (event.key === "Home") {
            goTo(0, { byUser: true });
        } else if (event.key === "End") {
            goTo(state.products.length - 1, { byUser: true });
        }
    });

    // Drag (mouse) and swipe (finger)
    const drag = { startX: null, moved: false };
    ui.stage.addEventListener("pointerdown", (event) => {
        if (event.target.closest(".stage__nav")) return;
        drag.startX = event.clientX;
        drag.moved = false;
    });
    window.addEventListener("pointerup", (event) => {
        if (drag.startX === null) return;
        const distance = event.clientX - drag.startX;
        drag.startX = null;
        if (Math.abs(distance) > SWIPE_PX) {
            drag.moved = true;                 // so the click after a drag is ignored
            goTo(state.index + (distance < 0 ? 1 : -1), { byUser: true });
            setTimeout(() => { drag.moved = false; }, 50);
        }
    });

    /* ================================================================ 8. Autoplay */
    function restartAutoplay() {
        clearInterval(state.timer);
        if (prefersReducedMotion() || !hasFinePointer()) return; // phones: no autoplay, the visitor swipes
        state.timer = setInterval(() => {
            const busy =
                state.hovering ||
                !state.onScreen ||
                document.hidden ||
                state.view !== "carousel" ||
                root.contains(document.activeElement); // customer is using the keyboard here
            if (!busy) goTo(state.index + 1);
        }, AUTOPLAY_MS);
    }

    ui.stage.addEventListener("pointerenter", () => {
        state.hovering = true;
        warmUp(productUrl(state.products[state.index]));   // the centre card, ready before the click
    });
    ui.stage.addEventListener("pointerleave", () => { state.hovering = false; });

    // Only move while the showroom is on screen
    new IntersectionObserver(([entry]) => { state.onScreen = entry.isIntersecting; }, { threshold: 0.3 })
        .observe(ui.stage);

    /* ================================================================ 9. Tilt on the center card */
    if (hasFinePointer() && !prefersReducedMotion()) {
        ui.stage.addEventListener("pointermove", (event) => {
            const card = event.target.closest(".stage-card.is-center");
            if (!card) return;
            const inner = card.querySelector(".stage-card__inner");
            const box = inner.getBoundingClientRect();
            const x = (event.clientX - box.left) / box.width;
            const y = (event.clientY - box.top) / box.height;
            inner.style.setProperty("--tilt-y", `${(x - 0.5) * 16}deg`);
            inner.style.setProperty("--tilt-x", `${(0.5 - y) * 16}deg`);
            inner.style.setProperty("--shine-x", `${x * 100}%`);
            inner.style.setProperty("--shine-y", `${y * 100}%`);
        });
        ui.stage.addEventListener("pointerleave", () => {
            for (const inner of ui.cards.querySelectorAll(".stage-card__inner")) {
                inner.style.setProperty("--tilt-x", "0deg");
                inner.style.setProperty("--tilt-y", "0deg");
            }
        });
    }

    /* ================================================================ 10. Carousel / Grid */
    function setView(view) {
        state.view = view;
        ui.carousel.hidden = view !== "carousel";
        ui.grid.hidden = view !== "grid";
        for (const button of ui.viewButtons) {
            const isActive = button.dataset.view === view;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        }
        if (view === "carousel") layout(); // sizes may have changed while hidden
    }
    ui.viewButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));

    /* ================================================================ 11. Messages */
    function showMessage(title, text, actionLabel, action) {
        ui.carousel.hidden = true;
        ui.grid.hidden = true;
        ui.state.hidden = false;
        ui.stateTitle.textContent = title;
        ui.stateText.textContent = text;
        ui.stateAction.textContent = actionLabel;
        ui.stateAction.onclick = action;
        clearInterval(state.timer);
    }
    function hideMessage() {
        ui.state.hidden = true;
        setView(state.view);
    }

    ui.clearSearch.addEventListener("click", () => {
        state.search = "";
        writeUrl();
        loadProducts();
    });

    // Recalculate positions when the window size changes
    let resizeFrame = null;
    window.addEventListener("resize", () => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
            layout();
            markActiveTab();
        });
    });

    // Add to cart: adds to the basket, the photo flies into the navbar cart, the count bounces
    ui.addToCart.addEventListener("click", async () => {
        const button = ui.addToCart;
        if (button.disabled) return;

        const photo = state.view === "carousel"
            ? els.cards[state.index]?.querySelector("img")
            : null;

        button.disabled = true;
        try {
            await addProductToCart(Number(button.dataset.productId), 1, { photo });
            button.textContent = "Added ✓";
        } catch (error) {
            button.textContent = error?.data?.detail || "Try again";
        }

        setTimeout(() => {
            const product = state.products[state.index];
            button.disabled = !product?.in_stock;
            button.textContent = product?.in_stock ? "Add to cart" : "Sold out";
        }, 1400);
    });
    // Go!
    buildTabs();
    loadProducts();
}

/* ================================================================== Helpers */
function productUrl(product) {
    return `/products/${encodeURIComponent(product.slug)}/`;
}

function isOnSale(product) {
    return product.compare_at_price && Number(product.compare_at_price) > Number(product.price);
}

function pickBadge(product) {
    return BADGE_PRIORITY.find((name) => product.badges.includes(name));
}

/** Replay a CSS "is-changing" animation on an element. */
function restartAnimation(element) {
    element.classList.add("is-changing");
    void element.offsetWidth; // let the browser notice the change
    element.classList.remove("is-changing");
}