/**
 * Product photo morph (card → product page), using cross-page View Transitions.
 *
 * 1. The clicked photo gets view-transition-name: product-photo; the product
 *    page's main photo has the same name, so the browser flies one into the other.
 * 2. To make the click feel instant, the product page's HTML is downloaded
 *    (prefetch) the moment the mouse presses / the finger touches it.
 *    We no longer prepare whole pages in the background (prerender):
 *    that ran all their animations unseen and made phones and laptops slow.
 */
const NAME = "product-photo";
let tagged = null;
const originalNames = new Map();
const warmed = new Set();

export function initProductMorph(root = document) {
    // Every product link: HTML downloaded as soon as the click / tap starts
    addRules({ prefetch: [{ where: { href_matches: "/products/*" }, eagerness: "conservative" }] });

    root.addEventListener("click", (event) => {
        const link = event.target.closest('a[href^="/products/"]');
        if (!link) return;

        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
            event.shiftKey || event.altKey || link.target === "_blank") return;

        markPhoto(link.querySelector("img"));
    });

    window.addEventListener("pageshow", clearTag);
}

/**
 * Download one product page's HTML right now
 * (for things that open a product without being a link, like the showroom's centre card).
 */
export function warmUp(url) {
    if (!url || warmed.has(url)) return;
    warmed.add(url);
    addRules({ prefetch: [{ urls: [url], eagerness: "immediate" }] });
}

export function markPhoto(image) {
    if (image === tagged) return;
    clearTag();
    if (!image || image.hidden) return;

    // The current product page already names its main photo.
    document.querySelectorAll(".product__photo").forEach((photo) => {
        if (photo !== image) setName(photo, "none");
    });

    setName(image, NAME);
    tagged = image;
}

/* ---------------------------------------------------------------- helpers */
function addRules(rules) {
    if (!HTMLScriptElement.supports?.("speculationrules")) return;   // other browsers: skip
    const script = document.createElement("script");
    script.type = "speculationrules";
    script.textContent = JSON.stringify(rules);
    document.head.append(script);
}

function setName(photo, name) {
    originalNames.set(photo, photo.style.viewTransitionName);
    photo.style.viewTransitionName = name;
}

function clearTag() {
    for (const [photo, name] of originalNames) {
        photo.style.viewTransitionName = name;
    }

    originalNames.clear();
    tagged = null;
}