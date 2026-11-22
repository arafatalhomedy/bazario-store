/**
 * Shared basket actions, used on every page.
 *
 *  addProductToCart()  add to the server → photo flies → navbar count bounces
 *  initCartCount()     show the real basket count in the navbar on page load
 *  flyToCart()         a copy of the photo flies into the navbar's Cart button
 *  CART_UPDATED        event sent on `document` whenever the basket changes
 */
import { addToCart, getCart } from "../api/cart.js";
import { el } from "../utils/dom.js";
import { prefersReducedMotion } from "../utils/motion.js";
import { setCartCount } from "./header.js";

export const CART_UPDATED = "cart:updated";

/** Show the real basket count in the navbar (no bounce). */
export async function initCartCount() {
    try {
        const cart = await getCart();
        setCartCount(cart.total_quantity, { bump: false });
    } catch {
        /* the count simply stays at 0 */
    }
}

/**
 * Add a product. Throws ApiError if the server refuses (e.g. sold out),
 * so the page can show error.data.detail to the customer.
 */
export async function addProductToCart(productId, quantity = 1, { photo } = {}) {
    const cart = await addToCart(productId, quantity);
    const done = () => {
        setCartCount(cart.total_quantity);   // bounce
        announceCart(cart);
    };
    if (photo) flyToCart(photo, done);
    else done();
    return cart;
}

/** Tell the rest of the page that the basket changed. */
export function announceCart(cart) {
    document.dispatchEvent(new CustomEvent(CART_UPDATED, { detail: cart }));
}

/** A copy of the photo flies in an arc into the navbar's Cart button. */
export function flyToCart(photo, onArrive = () => { }) {
    const target = document.querySelector("[data-cart-button]");
    if (!photo || !target || prefersReducedMotion()) {
        onArrive();
        return;
    }

    const from = photo.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const flyer = el("img", { attrs: { src: photo.currentSrc || photo.src, alt: "" } });
    Object.assign(flyer.style, {
        position: "fixed",
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        margin: "0",
        zIndex: "999",
        borderRadius: "20px",
        objectFit: "cover",
        pointerEvents: "none",
    });
    document.body.append(flyer);

    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);

    flyer.animate(
        [
            { transform: "translate(0, 0) scale(1)", opacity: 1 },
            { transform: `translate(${dx * 0.5}px, ${dy - 120}px) scale(0.45) rotate(-12deg)`, offset: 0.5 },
            { transform: `translate(${dx}px, ${dy}px) scale(0.08) rotate(-20deg)`, opacity: 0.4 },
        ],
        { duration: 900, easing: "cubic-bezier(0.5, 0, 0.3, 1)" },
    ).onfinish = () => {
        flyer.remove();
        onArrive();
    };
}