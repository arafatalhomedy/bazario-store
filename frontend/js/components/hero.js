/**
 * Homepage hero ("editorial poster"): brings the hero to life.
 *
 *  1. Mouse depth + spotlight   (lines move with the mouse, glow follows it)
 *  2. Changing word             (having → keeping → gifting → loving)
 *  3. Real products             (photo capsules, product belt, counters)
 *
 * HTML: pages/home/hero.html · Styles: css/home/hero.css
 */
import { fetchCategories, fetchProducts } from "../api/products.js";
import { el } from "../utils/dom.js";
import { formatPrice } from "../utils/format.js";
import { hasFinePointer, prefersReducedMotion } from "../utils/motion.js";

const WORD_INTERVAL_MS = 2400;   // how long each word stays
const PHOTO_INTERVAL_MS = 2600;  // how long each capsule photo stays
const BELT_PRODUCTS = 10;        // products to load for the belt
const BELT_MIN_CARDS = 8;        // repeat products if there are fewer than this
const COUNT_DURATION_MS = 1300;  // counter animation length
const COUNT_DELAY_MS = 1200;     // wait for the title before counting

const BADGE_LABELS = { sold_out: "Sold out", sale: "Sale", new: "New", low_stock: "Low stock" };
const BADGE_PRIORITY = ["sold_out", "sale", "new", "low_stock"]; // show only the most important one

/** Start the hero. Called once by home.js. */
export function initHero() {
    const hero = document.querySelector("[data-hero]");
    if (!hero) return;

    setupDepth(hero);
    setupRotator(hero);
    loadProducts(hero);
}

/* ------------------------------------------------------------------ 1. Mouse depth + spotlight */
function setupDepth(hero) {
    // Give each line its depth from data-depth="6" → --depth: 6
    for (const line of hero.querySelectorAll("[data-depth]")) {
        line.style.setProperty("--depth", line.dataset.depth);
    }
    if (prefersReducedMotion() || !hasFinePointer()) return;

    let frame = null;

    hero.addEventListener("pointermove", (event) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            const box = hero.getBoundingClientRect();
            const x = event.clientX - box.left;
            const y = event.clientY - box.top;

            hero.style.setProperty("--spot-x", `${x}px`);
            hero.style.setProperty("--spot-y", `${y}px`);
            // -1 (left/top) … 0 (center) … 1 (right/bottom)
            hero.style.setProperty("--depth-x", ((x / box.width - 0.5) * 2).toFixed(3));
            hero.style.setProperty("--depth-y", ((y / box.height - 0.5) * 2).toFixed(3));
        });
    });

    hero.addEventListener("pointerleave", () => {
        cancelAnimationFrame(frame);
        hero.style.setProperty("--depth-x", "0");
        hero.style.setProperty("--depth-y", "0");
    });
}

/* ------------------------------------------------------------------ 2. Changing word */
function setupRotator(hero) {
    const words = [...hero.querySelectorAll("[data-rotator] .hero__word")];
    if (words.length < 2 || prefersReducedMotion()) return;

    let index = Math.max(0, words.findIndex((word) => word.classList.contains("is-active")));

    setInterval(() => {
        if (document.hidden) return; // tab not visible: save battery

        const current = words[index];
        index = (index + 1) % words.length;
        const next = words[index];

        current.classList.replace("is-active", "is-leaving"); // old word slides up
        next.classList.remove("is-leaving");
        next.classList.add("is-active");                      // new word slides in

        setTimeout(() => current.classList.remove("is-leaving"), 800);
    }, WORD_INTERVAL_MS);
}

/* ------------------------------------------------------------------ 3. Real products */
async function loadProducts(hero) {
    const track = hero.querySelector("[data-hero-belt]");
    const belt = hero.querySelector(".hero__belt");
    if (track) showBeltSkeleton(track);

    try {
        const [page, categories] = await Promise.all([
            fetchProducts({ sort: "newest", pageSize: BELT_PRODUCTS }),
            fetchCategories(),
        ]);
        const products = page.results.filter((product) => product.thumbnail);

        fillCapsules(hero, products);
        if (track) fillBelt(track, products);
        countUp(hero.querySelector('[data-count="products"]'), page.count);
        countUp(hero.querySelector('[data-count="categories"]'), categories.length);
    } catch {
        // The rest of the hero still works without products
        if (belt) belt.hidden = true;
        hero.querySelectorAll("[data-count]").forEach((node) => { node.textContent = "—"; });
    }
}

/** Put product photos into the capsules; they take turns. */
function fillCapsules(hero, products) {
    const capsules = [...hero.querySelectorAll("[data-hero-capsule]")];

    capsules.forEach((capsule, capsuleIndex) => {
        // Capsule 1 gets products 1, 3, 5 … capsule 2 gets 2, 4, 6 …
        const photos = products
            .filter((_, i) => i % capsules.length === capsuleIndex)
            .slice(0, 3);
        if (photos.length === 0) return;

        const images = photos.map((product, i) =>
            el("img", {
                className: i === 0 ? "is-active" : undefined,
                attrs: { src: product.thumbnail, alt: "", decoding: "async" },
            }));
        capsule.replaceChildren(...images);

        if (images.length < 2 || prefersReducedMotion()) return;

        let current = 0;
        // The second capsule starts half a turn later, so they don't change together
        setTimeout(() => {
            setInterval(() => {
                images[current].classList.remove("is-active");
                current = (current + 1) % images.length;
                images[current].classList.add("is-active");
            }, PHOTO_INTERVAL_MS);
        }, capsuleIndex * (PHOTO_INTERVAL_MS / 2));
    });
}

/** Build the moving belt. The list is doubled so it can loop forever. */
function fillBelt(track, products) {
    if (products.length === 0) {
        track.closest(".hero__belt").hidden = true;
        return;
    }

    let cards = [...products];
    while (cards.length < BELT_MIN_CARDS) cards = cards.concat(products);

    track.replaceChildren(
        ...cards.map((product) => createBeltCard(product)),
        ...cards.map((product) => createBeltCard(product, { copy: true })), // loop copy
    );
}

function createBeltCard(product, { copy = false } = {}) {
    const badge = BADGE_PRIORITY.find((name) => product.badges.includes(name));
    const linkAttrs = { href: `/products/${encodeURIComponent(product.slug)}/` };
    if (copy) linkAttrs.tabindex = "-1"; // the copy can't be reached with Tab

    return el("li", { className: "belt-card", attrs: copy ? { "aria-hidden": "true" } : {} }, [
        el("a", { className: "belt-card__link", attrs: linkAttrs }, [
            el("div", { className: "belt-card__media" }, [
                el("img", {
                    attrs: {
                        src: product.thumbnail,
                        alt: "",               // the name is written below the photo
                        width: "600",
                        height: "750",
                        loading: "lazy",
                        decoding: "async",
                    },
                }),
                badge
                    ? el("span", { className: `belt-card__badge belt-card__badge--${badge}`, text: BADGE_LABELS[badge] })
                    : null,
            ]),
            el("p", { className: "belt-card__name", text: product.name }),
            el("p", { className: "belt-card__price" }, [
                el("span", { className: "belt-card__amounts" }, [
                    el("span", { text: formatPrice(product.price) }),
                    product.badges.includes("sale")
                        ? el("s", { text: formatPrice(product.compare_at_price) })
                        : null,
                ]),
                el("span", { className: "belt-card__view", text: "View →", attrs: { "aria-hidden": "true" } }),
            ]),
        ]),
    ]);
}

/** Grey shimmering cards while products load. */
function showBeltSkeleton(track) {
    const skeletonCard = () =>
        el("li", { className: "belt-card belt-card--loading", attrs: { "aria-hidden": "true" } }, [
            el("div", { className: "belt-card__link" }, [
                el("div", { className: "belt-card__media" }),
                el("p", { className: "belt-card__name" }),
            ]),
        ]);
    track.replaceChildren(...Array.from({ length: BELT_MIN_CARDS * 2 }, skeletonCard));
}

/** Count a number up from 0, slowing down at the end. */
function countUp(node, end) {
    if (!node) return;
    if (prefersReducedMotion()) {
        node.textContent = String(end);
        return;
    }

    setTimeout(() => {
        const start = performance.now();
        const step = (now) => {
            const progress = Math.min((now - start) / COUNT_DURATION_MS, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // fast at first, slow at the end
            node.textContent = String(Math.round(end * eased));
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }, COUNT_DELAY_MS);
}