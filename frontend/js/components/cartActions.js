/**
 * Shared basket actions, used on every page.
 *
 *  addProductToCart()  the photo starts flying at once, the server adds the product
 *                      at the same time, then the navbar count bounces
 *  initCartCount()     show the real basket count in the navbar on page load
 *  flyToCart()         a copy of the photo flies in a smooth arc into the navbar's Cart button
 *  CART_UPDATED        event sent on `document` whenever the basket changes
 */
import { addToCart, getCart } from "../api/cart.js";
import { prefersReducedMotion } from "../utils/motion.js";
import { setCartCount } from "./header.js";

export const CART_UPDATED = "cart:updated";

const FLIGHT_MS = 780;

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
 * The photo flies while the server works, so it feels instant.
 */
export async function addProductToCart(productId, quantity = 1, { photo } = {}) {
    const flight = photo ? flyToCart(photo) : null;

    let cart;
    try {
        cart = await addToCart(productId, quantity);
    } catch (error) {
        flight?.cancel();          // refused: the photo disappears, nothing lands
        throw error;
    }

    await flight;                  // wait for the landing, then bounce the count
    setCartCount(cart.total_quantity);
    announceCart(cart);
    return cart;
}

/** Tell the rest of the page that the basket changed. */
export function announceCart(cart) {
    document.dispatchEvent(new CustomEvent(CART_UPDATED, { detail: cart }));
}

/**
 * A copy of the photo flies in a smooth arc into the navbar's Cart button.
 * Returns a promise (resolves on landing) with a cancel() method.
 * Two layers move it: the outer one sideways, the inner one up/down,
 * each with its own easing, which draws a natural curve. Only transform
 * and opacity change, so the phone's graphics chip does all the work.
 */
export function flyToCart(photo) {
    const target = document.querySelector("[data-cart-button]");
    if (!photo || !target || prefersReducedMotion()) {
        return Object.assign(Promise.resolve(), { cancel() { } });
    }

    // The navbar hides while scrolling down: bring it back so the photo has somewhere to land
    const header = target.closest(".site-header");
    header?.classList.remove("is-hidden");

    const from = photo.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    // If the navbar is still sliding back in, aim where it will end up
    const headerShift = header ? new DOMMatrixReadOnly(getComputedStyle(header).transform).m42 : 0;

    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top - headerShift + to.height / 2 - (from.top + from.height / 2);

    const outer = document.createElement("div");
    Object.assign(outer.style, {
        position: "fixed",
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        zIndex: "999",
        pointerEvents: "none",
        willChange: "transform",
    });

    const inner = document.createElement("img");
    inner.src = photo.currentSrc || photo.src;
    inner.alt = "";
    Object.assign(inner.style, {
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius: "20px",
        boxShadow: "0 18px 40px rgb(0 0 0 / 28%)",
        willChange: "transform, opacity",
    });

    outer.append(inner);
    document.body.append(outer);

    // Sideways: smooth start and end
    const sideways = outer.animate(
        [{ transform: "translate3d(0, 0, 0)" }, { transform: `translate3d(${dx}px, 0, 0)` }],
        { duration: FLIGHT_MS, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "forwards" },
    );

    // Up/down: a small dip first (like a throw), then it shoots to the cart, shrinking and turning
    const upDown = inner.animate(
        [
            { transform: "translate3d(0, 0, 0) scale(1) rotate(0deg)", opacity: 1 },
            { transform: `translate3d(0, ${dy * 0.15}px, 0) scale(0.8) rotate(-6deg)`, opacity: 1, offset: 0.25 },
            { transform: `translate3d(0, ${dy}px, 0) scale(0.12) rotate(-20deg)`, opacity: 0.6 },
        ],
        { duration: FLIGHT_MS, easing: "cubic-bezier(0.6, 0, 0.35, 1)", fill: "forwards" },
    );

    let cancelled = false;
    const landed = Promise.all([sideways.finished, upDown.finished])
        .then(() => {
            outer.remove();
            if (cancelled) return;
            // The cart catches it
            target.animate(
                [{ transform: "scale(1)" }, { transform: "scale(1.16)" }, { transform: "scale(1)" }],
                { duration: 420, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
            );
        })
        .catch(() => outer.remove());

    return Object.assign(landed, {
        cancel() {
            cancelled = true;
            sideways.cancel();
            upDown.cancel();
            outer.remove();
        },
    });
}