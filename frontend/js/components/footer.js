
import { fetchCategories, fetchProducts } from "../api/products.js";
import { averageColorWhenLoaded } from "../utils/color.js";
import { el } from "../utils/dom.js";
import { whenNear } from "../utils/lazy.js";
import { prefersReducedMotion } from "../utils/motion.js";

const HEADER_SPACE_PX = 120;   // room for the navbar (curtain check)
const FILL_START = 0.25;       // how much of the footer is uncovered before the liquid starts
const FILL_RANGE = 0.6;        // how much more scrolling fills it completely
const WAVE_HEIGHT_PX = 7;      // height of the wave on top of the liquid
const COIN_COUNT = 12;         // product photos that fall as coins
const COINS_KEY = "bazario:coins-seen";

/** Start the footer. Called once by each page script (home.js, product.js, ...). */
export function initFooter() {
    const footer = document.querySelector("[data-footer]");
    if (!footer) return;

    setupReveal(footer);
    footer.querySelectorAll(".site-footer__link").forEach(makeRolling);
    setupBackToTop(footer);

    // The heavier parts (category links, liquid name, coins) wait until the footer is close
    whenNear(footer, () => {
        loadCategoryLinks(footer);
        setupWordmark(footer);
    }, "600px");
}

/* ------------------------------------------------------------------ 1. Curtain reveal */
function setupReveal(footer) {
    const update = () => {
        const fits = footer.offsetHeight <= window.innerHeight - HEADER_SPACE_PX;
        footer.classList.toggle("is-revealing", fits);
    };
    update();
    window.addEventListener("resize", update);
    new ResizeObserver(update).observe(footer); // e.g. when category links are added
}

/* ------------------------------------------------------------------ 2. Rolling links */
function makeRolling(link) {
    if (link.querySelector(".roll")) return; // already done
    const text = link.textContent.trim();
    link.replaceChildren(
        el("span", { className: "roll" }, [
            el("span", { className: "roll__inner" }, [
                el("span", { text }),
                el("span", { text, attrs: { "aria-hidden": "true" } }), // copy: screen readers skip it
            ]),
        ]),
    );
}

/* ------------------------------------------------------------------ 3. Shop links */
async function loadCategoryLinks(footer) {
    const list = footer.querySelector("[data-footer-categories]");
    if (!list) return;
    try {
        const categories = await fetchCategories();
        list.append(...categories.map((category) => {
            const link = el("a", {
                className: "site-footer__link",
                text: category.name,
                attrs: { href: `/?category=${encodeURIComponent(category.slug)}#shop` },
            });
            makeRolling(link);
            return el("li", {}, [link]);
        }));
    } catch {
        /* the "All products" link is still there */
    }
}

/* ------------------------------------------------------------------ 4. Back to top */
function setupBackToTop(footer) {
    footer.querySelector("[data-back-to-top]")?.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
        // Keyboard users: continue from the top of the page
        document.querySelector(".logo")?.focus({ preventScroll: true });
    });
}

//* ------------------------------------------------------------------ 5. Footer wordmark */
function setupWordmark(footer) {
    const brand = footer.querySelector("[data-footer-brand]");
    const mark = brand?.querySelector("[data-footer-mark]");
    if (!mark || prefersReducedMotion()) return;

    const main = document.getElementById("main");
    const listeners = new AbortController();

    function reveal() {
        const { top, bottom } = brand.getBoundingClientRect();

        // A sticky footer can be inside the viewport while still covered by main.
        const mainBottom = main?.getBoundingClientRect().bottom ?? 0;
        const visibleHeight = Math.min(bottom, window.innerHeight)
            - Math.max(top, mainBottom, 0);

        if (visibleHeight < 24) return;

        listeners.abort();

        const letters = [...mark.textContent.trim()].map((character, index) => {
            const className = character === "."
                ? "site-footer__glyph site-footer__mark-dot"
                : "site-footer__glyph";
            const letter = el("span", { className, text: character });
            letter.style.setProperty("--char-index", index);
            return letter;
        });

        mark.replaceChildren(...letters);
        brand.classList.add("is-animated");
    }

    window.addEventListener("scroll", reveal, { passive: true, signal: listeners.signal });
    window.addEventListener("resize", reveal, { signal: listeners.signal });
    reveal();
}