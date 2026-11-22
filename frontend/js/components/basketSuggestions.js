/**
 * Basket page: "Complete your basket" row.
 *
 *  1. Waits for the basket (the cart:updated event from basket.js)
 *  2. Loads products from the same categories (or the newest if the basket is empty)
 *  3. Hides products already in the basket, sold out or repeated
 *  4. "+ Add" → photo flies to the navbar → card fades away
 *  5. ← → arrows scroll the row
 *
 * HTML: pages/cart/suggestions.html · Styles: css/cart/suggestions.css
 */
import { fetchProducts } from "../api/products.js";
import { el } from "../utils/dom.js";
import { formatPrice } from "../utils/format.js";
import { prefersReducedMotion } from "../utils/motion.js";
import { addProductToCart, CART_UPDATED } from "./cartActions.js";

const MAX_PICKS = 8;        // most cards in the row
const MAX_CATEGORIES = 3;   // how many basket categories we look in
const PER_CATEGORY = 8;     // products asked for per category
const MIN_PICKS = 4;        // fewer than this → top up with the newest products
const DONE_MS = 900;        // how long "Added ✓" stays before the card leaves

/** Start the row. Called once by pages/cart.js (before initBasket). */
export function initBasketSuggestions() {
    const root = document.querySelector("[data-complete]");
    if (!root) return;

    const track = root.querySelector("[data-complete-track]");
    const text = root.querySelector(".complete__text");
    const prev = root.querySelector("[data-complete-prev]");
    const next = root.querySelector("[data-complete-next]");

    let loaded = false;
    let inBasket = new Set();

    /* ---------------------------------------------------------------- 1. Wait for the basket */
    document.addEventListener(CART_UPDATED, (event) => {
        const items = event.detail?.items || [];
        inBasket = new Set(items.map((item) => item.product.id));

        if (!loaded) {
            loaded = true;
            load(items);
        } else {
            dropPicksInBasket();
        }
    });

    /* ---------------------------------------------------------------- 2–3. Load + filter */
    async function load(items) {
        const slugs = [...new Set(items.map((item) => item.product.category?.slug).filter(Boolean))]
            .slice(0, MAX_CATEGORIES);

        let products = [];
        try {
            const pages = slugs.length
                ? await Promise.all(slugs.map((slug) => fetchProducts({ category: slug, pageSize: PER_CATEGORY })))
                : [await fetchProducts({ sort: "newest", pageSize: MAX_PICKS * 2 })];
            products = pages.flatMap((page) => page.results || []);

            if (slugs.length && countUsable(products) < MIN_PICKS) {
                const newest = await fetchProducts({ sort: "newest", pageSize: MAX_PICKS * 2 });
                products.push(...(newest.results || []));
            }
        } catch {
            return; // no suggestions: the section simply stays hidden
        }

        const picks = usable(products).slice(0, MAX_PICKS);
        if (!picks.length) return;

        if (!slugs.length) text.textContent = "Fresh arrivals to start your basket.";
        track.replaceChildren(...picks.map(buildPick));
        root.hidden = false;
        requestAnimationFrame(updateArrows);
    }

    /** In stock, not in the basket, no repeats. */
    function usable(products) {
        const seen = new Set();
        const result = [];
        for (const product of products) {
            if (!product.in_stock || inBasket.has(product.id) || seen.has(product.id)) continue;
            seen.add(product.id);
            result.push(product);
        }
        return result;
    }

    function countUsable(products) {
        return usable(products).length;
    }

    function buildPick(product, index) {
        const url = `/products/${encodeURIComponent(product.slug)}/`;
        const photo = el("img", {
            className: "pick__photo",
            attrs: {
                src: product.thumbnail || product.image,
                alt: "",
                loading: "lazy",
                decoding: "async",
                width: "300",
                height: "300",
            },
        });
        const button = el("button", {
            className: "pick__add",
            text: "+ Add",
            attrs: { type: "button", "aria-label": `Add ${product.name} to basket` },
        });

        const item = el("li", { className: "pick", attrs: { "data-pick": product.id } }, [
            // The photo link is skipped by Tab: the name link is the real one
            el("a", { className: "pick__media", attrs: { href: url, tabindex: "-1", "aria-hidden": "true" } }, [photo]),
            el("div", { className: "pick__body" }, [
                el("p", { className: "pick__name" }, [el("a", { text: product.name, attrs: { href: url } })]),
                el("p", { className: "pick__price", text: formatPrice(product.price) }),
            ]),
            button,
        ]);
        item.style.setProperty("--i", index);

        button.addEventListener("click", () => addPick(product, button, photo, item));
        return item;
    }

    /* ---------------------------------------------------------------- 4. + Add */
    async function addPick(product, button, photo, item) {
        if (button.disabled) return;
        button.disabled = true;
        button.classList.add("is-loading");
        button.textContent = "Adding…";

        try {
            await addProductToCart(product.id, 1, { photo });  // the basket above updates by itself
            button.classList.remove("is-loading");
            button.classList.add("is-done");
            button.textContent = "Added ✓";
            setTimeout(() => removePick(item), DONE_MS);
        } catch (error) {
            button.classList.remove("is-loading");
            button.disabled = false;
            button.textContent = error?.status === 400 ? "Not available" : "Try again";
        }
    }

    /** A product reached the basket some other way (e.g. Undo): remove its card. */
    function dropPicksInBasket() {
        for (const item of track.querySelectorAll("[data-pick]")) {
            const busy = item.querySelector(".pick__add")?.disabled; // its own "+ Add" handles it
            if (!busy && inBasket.has(Number(item.dataset.pick))) removePick(item);
        }
    }

    function removePick(item) {
        const finish = () => {
            item.remove();
            if (!track.children.length) root.hidden = true;
            updateArrows();
        };
        if (prefersReducedMotion()) return finish();

        item.animate(
            [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.9)" }],
            { duration: 300, easing: "ease" },
        ).onfinish = finish;
    }

    /* ---------------------------------------------------------------- 5. Arrows */
    function updateArrows() {
        prev.disabled = track.scrollLeft <= 4;
        next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    }

    prev.addEventListener("click", () => track.scrollBy({ left: -track.clientWidth * 0.8 }));
    next.addEventListener("click", () => track.scrollBy({ left: track.clientWidth * 0.8 }));
    track.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows, { passive: true });
}