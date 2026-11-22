/**
 * Homepage category ribbons.
 *
 *  1. Loads the categories (name, slug, product_count, image) from the server
 *  2. Builds the moving ribbons (repeated + doubled so they loop forever)
 *  3. Hover / keyboard focus: focus mode, letter roll, coin flip
 *
 * Clicking a category goes to  /?category=<slug>#shop  (that category's products).
 * HTML: pages/home/marquee.html · Styles: css/home/marquee.css
 */
import { fetchCategories } from "../api/products.js";
import { el } from "../utils/dom.js";
import { hasFinePointer } from "../utils/motion.js";

const MIN_ITEMS_PER_GROUP = 8; // repeat categories so one group is wider than the screen

/** Start the ribbons. Called once by home.js. */
export async function initMarquee() {
    const section = document.querySelector("[data-ribbons]");
    if (!section) return;
    const tracks = [...section.querySelectorAll("[data-ribbon-track]")];

    let categories = [];
    try {
        categories = await fetchCategories();
    } catch {
        categories = [];
    }

    if (categories.length === 0) {
        section.hidden = true; // no categories yet: hide the whole section
        return;
    }

    tracks.forEach((track, ribbonIndex) => fillTrack(track, categories, ribbonIndex));
    setupFocus(section);
}

/* ------------------------------------------------------------------ Build a ribbon */
function fillTrack(track, categories, ribbonIndex) {
    // Repeat the categories until there are enough to fill the screen
    let items = [];
    while (items.length < MIN_ITEMS_PER_GROUP) items = items.concat(categories);

    // Two identical groups → the ribbon can loop forever
    const groups = [0, 1].map((groupIndex) => {
        // Only the FIRST group of the FIRST ribbon is for keyboard / screen readers
        const isReal = ribbonIndex === 0 && groupIndex === 0;

        return el(
            "div",
            { className: "ribbon__group", attrs: isReal ? {} : { "aria-hidden": "true" } },
            items.flatMap((category, i) => [
                createItem(category, {
                    outline: (i + ribbonIndex) % 2 === 1,          // every second word outlined
                    reachable: isReal && i < categories.length,    // each category reachable once
                }),
                el("span", { className: "ribbon__star", text: "✦", attrs: { "aria-hidden": "true" } }),
            ]),
        );
    });

    track.replaceChildren(...groups);
}

/* ------------------------------------------------------------------ One category */
function createItem(category, { outline, reachable }) {
    const count = category.product_count;
    const attrs = { href: `/shop/?category=${encodeURIComponent(category.slug)}` };

    if (reachable) {
        attrs["aria-label"] = `${category.name} (${count} ${count === 1 ? "product" : "products"})`;
    } else {
        attrs.tabindex = "-1";        // copies: skipped by the Tab key
        attrs["aria-hidden"] = "true"; // and by screen readers
    }

    // Each letter appears twice (stacked) for the roll effect
    const letters = [...category.name].map((char, index) => {
        const shown = char === " " ? "\u00A0" : char; // keep spaces visible
        const letter = el("span", { className: "ribbon__letter" }, [
            el("span", { text: shown }),
            el("span", { text: shown }),
        ]);
        letter.style.setProperty("--letter-index", index);
        return letter;
    });

    return el(
        "a",
        { className: `ribbon__item${outline ? " ribbon__item--outline" : ""}`, attrs },
        [
            // Coin: photo on the front, "4 items" on the back
            el("span", { className: "ribbon__coin", attrs: { "aria-hidden": "true" } }, [
                el("span", { className: "ribbon__coin-front" }, [
                    category.image
                        ? el("img", { attrs: { src: category.image, alt: "", loading: "lazy", decoding: "async" } })
                        : null,
                ]),
                el("span", { className: "ribbon__coin-back" }, [String(count), el("br"), "items"]),
            ]),
            el("span", { className: "ribbon__letters", attrs: { "aria-hidden": "true" } }, letters),
            el("sup", { className: "ribbon__count", text: `(${count})`, attrs: { "aria-hidden": "true" } }),
            el("span", { className: "ribbon__arrow", text: "→", attrs: { "aria-hidden": "true" } }),
        ],
    );
}

/* ------------------------------------------------------------------ Hover / focus effects */
function setupFocus(section) {
    let active = null;

    const activate = (item) => {
        if (item === active) return;
        active?.classList.remove("is-active");
        active = item;
        if (item) {
            item.classList.add("is-active");
            section.classList.add("is-focused");   // ribbons stop, others blur
        } else {
            section.classList.remove("is-focused");
        }
    };

    // Mouse (not on touch screens: a tap just opens the link)
    if (hasFinePointer()) {
        section.addEventListener("pointerover", (event) => {
            activate(event.target.closest(".ribbon__item"));
        });
        section.addEventListener("pointerleave", () => activate(null));
    }

    // Keyboard (Tab key)
    section.addEventListener("focusin", (event) => {
        activate(event.target.closest(".ribbon__item"));
    });
    section.addEventListener("focusout", (event) => {
        if (!section.contains(event.relatedTarget)) activate(null);
    });
}