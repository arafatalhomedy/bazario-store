import { initProductMorph } from "../animations/morph.js";
import { fetchProducts } from "../api/products.js";
import { el } from "../utils/dom.js";
import { formatPrice } from "../utils/format.js";
import { hasFinePointer, prefersReducedMotion } from "../utils/motion.js";

const SEARCH_DELAY = 180;
const SUGGESTION_COUNT = 3;
const RESULT_COUNT = 8;

export function setupProductSearch(header, { closeMenus }) {
    const trigger = header.querySelector("[data-search-open]");
    const panel = header.querySelector("[data-product-search]");
    if (!trigger || !panel) return;

    const form = panel.querySelector("form");
    const input = form.elements.search;
    const clear = panel.querySelector("[data-search-clear]");
    const status = panel.querySelector("[data-search-status]");
    const list = panel.querySelector("[data-search-results]");
    const preview = panel.querySelector("[data-search-preview]");
    const all = panel.querySelector("[data-search-all]");
    const retry = panel.querySelector("[data-search-retry]");
    const previewPhoto = preview.querySelector("img");
    const previewName = preview.querySelector("[data-search-name]");
    const previewCategory = preview.querySelector("[data-search-category]");
    const previewPrice = preview.querySelector("[data-search-price]");

    const links = [];
    let currentLink = null;
    let loadedQuery = null;
    let timer;
    let request;

    function stopRequest() {
        clearTimeout(timer);
        request?.abort();
        request = null;
    }

    function setOpen(open, moveFocus = true) {
        if (open) {
            closeMenus();
            header.classList.remove("is-hidden");
        }

        panel.hidden = !open;
        panel.classList.toggle("is-open", open);
        trigger.setAttribute("aria-expanded", String(open));

        if (moveFocus) {
            (open ? input : trigger).focus({ preventScroll: true });
        }

        if (open) {
            queueSearch();
        } else {
            stopRequest();

            if (typeof history.state?.bazarioSearch === "string") {
                const { bazarioSearch, ...otherState } = history.state;
                history.replaceState(otherState, "");
            }
        }
    }

    function selectProduct(product, link) {
        if (link === currentLink) return;

        currentLink?.classList.remove("is-current");
        currentLink = link;
        link.classList.add("is-current");

        preview.href = link.getAttribute("href");
        preview.dataset.searchProduct = product.slug;
        previewName.textContent = product.name;
        previewCategory.textContent = product.category?.name ?? "";
        previewPrice.textContent = formatPrice(product.price);

        const source = product.image || product.thumbnail;
        previewPhoto.hidden = !source;

        if (source) previewPhoto.src = source;
        else previewPhoto.removeAttribute("src");

        preview.hidden = false;

        if (source && !prefersReducedMotion() && preview.getClientRects().length) {
            previewPhoto.getAnimations().forEach((animation) => animation.cancel());
            previewPhoto.animate([
                { opacity: 0.4, translate: "0 5px" },
                { opacity: 1, translate: "0 0" },
            ], { duration: 210, easing: "ease-out" });
        }
    }

    function createResult(product, query) {
        const photoUrl = product.thumbnail || product.image;
        const photo = photoUrl
            ? el("img", { attrs: { src: photoUrl, alt: "", decoding: "async" } })
            : null;

        photo?.addEventListener("error", () => { photo.hidden = true; });

        const name = el("strong", { className: "product-search__name" });
        const hit = query ? product.name.toLowerCase().indexOf(query.toLowerCase()) : -1;

        if (hit < 0) {
            name.textContent = product.name;
        } else {
            name.append(
                product.name.slice(0, hit),
                el("mark", { text: product.name.slice(hit, hit + query.length) }),
                product.name.slice(hit + query.length),
            );
        }

        const link = el("a", {
            className: "product-search__row",
            attrs: {
                href: panel.dataset.productUrl.replace("product-slug", encodeURIComponent(product.slug)),
                "data-search-product": product.slug,
            },
        }, [
            el("span", {
                className: "product-search__thumb",
                attrs: { "aria-hidden": "true" },
            }, [photo]),
            el("span", { className: "product-search__label" }, [
                name,
                el("span", {
                    className: "product-search__category",
                    text: product.category?.name ?? "",
                }),
            ]),
            el("span", {
                className: "product-search__price",
                text: formatPrice(product.price),
            }),
            el("span", {
                className: "product-search__arrow",
                text: "↗",
                attrs: { "aria-hidden": "true" },
            }),
        ]);

        link.addEventListener("pointerenter", () => {
            if (hasFinePointer()) selectProduct(product, link);
        });
        link.addEventListener("focus", () => selectProduct(product, link));

        links.push(link);
        return el("li", {}, [link]);
    }

    async function loadProducts(query) {
        const controller = new AbortController();
        request = controller;

        try {
            const { results, count } = await fetchProducts({
                search: query,
                pageSize: query ? RESULT_COUNT : SUGGESTION_COUNT,
            }, controller.signal);

            if (request !== controller) return;

            list.replaceChildren(...results.map((product) => createResult(product, query)));

            if (query) {
                status.textContent = count
                    ? `${count} ${count === 1 ? "result" : "results"}`
                    : "No matching products";
            } else {
                status.textContent = results.length ? "Recently added" : "No products available";
            }

            if (results.length) selectProduct(results[0], links[0]);

            if (query && count > results.length) {
                const url = new URL(form.action);
                url.searchParams.set("search", query);
                all.href = url.href;
                all.textContent = `View all ${count} results`;
                all.hidden = false;
            }

            loadedQuery = query;
        } catch {
            if (request !== controller) return;
            status.textContent = "Couldn’t load products.";
            retry.hidden = false;
        } finally {
            if (request === controller) request = null;
        }
    }

    function queueSearch(delay = 0) {
        stopRequest();

        const query = input.value.trim().replace(/\s+/g, " ");
        clear.hidden = !input.value;
        if (loadedQuery === query) return;

        loadedQuery = null;
        currentLink = null;
        links.length = 0;
        list.replaceChildren();
        preview.hidden = true;
        all.hidden = true;
        retry.hidden = true;
        status.textContent = query ? "Searching…" : "Loading products…";
        timer = window.setTimeout(() => loadProducts(query), delay);
    }

    trigger.addEventListener("click", () => setOpen(panel.hidden));
    panel.querySelector("[data-search-close]").addEventListener("click", () => setOpen(false));

    panel.addEventListener("click", (event) => {
        if (!event.target.closest("[data-search-product]") || event.button !== 0 ||
            event.defaultPrevented || event.ctrlKey || event.metaKey ||
            event.shiftKey || event.altKey) return;

        history.replaceState({ ...history.state, bazarioSearch: input.value }, "");
    });

    input.addEventListener("input", (event) => {
        if (!event.isComposing) queueSearch(SEARCH_DELAY);
    });
    input.addEventListener("compositionend", () => queueSearch(SEARCH_DELAY));

    clear.addEventListener("click", () => {
        input.value = "";
        input.focus();
        queueSearch();
    });

    retry.addEventListener("click", () => {
        input.focus();
        queueSearch();
    });

    previewPhoto.addEventListener("error", () => { previewPhoto.hidden = true; });

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        currentLink?.click();
    });

    document.addEventListener("pointerdown", (event) => {
        if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) {
            setOpen(false, false);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.defaultPrevented || event.isComposing || event.ctrlKey ||
            event.metaKey || event.altKey) return;

        if (event.key === "/" && !event.target.closest?.("input, textarea, select, [contenteditable]")) {
            event.preventDefault();
            setOpen(true);
            return;
        }

        if (panel.hidden) return;

        if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            return;
        }

        const row = links.indexOf(event.target);
        if (!links.length || (row === -1 && event.target !== input)) return;
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

        event.preventDefault();
        const next = row + (event.key === "ArrowDown" ? 1 : -1);
        (next < 0 ? input : links[Math.min(next, links.length - 1)]).focus();
    });

    initProductMorph(panel);

    const previousSearch = history.state?.bazarioSearch;
    if (typeof previousSearch === "string") {
        input.value = previousSearch.slice(0, input.maxLength);
        setOpen(true, false);
    }
}