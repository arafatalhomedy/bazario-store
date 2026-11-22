/**
 * Basket API: the questions the website can ask about the basket.
 * Every function returns the FULL, updated basket from the server:
 *   { items, total_quantity, subtotal, total, notices }
 * The CSRF security token is added automatically by client.js.
 */
import { apiRequest } from "./client.js";

/** GET /api/cart/ */
export function getCart() {
    return apiRequest("/api/cart/");
}

/** POST /api/cart/items/ */
export function addToCart(productId, quantity = 1) {
    return apiRequest("/api/cart/items/", {
        method: "POST",
        body: { product_id: productId, quantity },
    });
}

/** PATCH /api/cart/items/<id>/ */
export function updateCartItem(productId, quantity) {
    return apiRequest(`/api/cart/items/${encodeURIComponent(productId)}/`, {
        method: "PATCH",
        body: { quantity },
    });
}

/** DELETE /api/cart/items/<id>/ */
export function removeCartItem(productId) {
    return apiRequest(`/api/cart/items/${encodeURIComponent(productId)}/`, {
        method: "DELETE",
    });
}

/** DELETE /api/cart/ */
export function clearCart() {
    return apiRequest("/api/cart/", { method: "DELETE" });
}