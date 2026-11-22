/**
 * Orders API: placing and tracking orders.
 * The CSRF security token is added automatically by client.js.
 */
import { apiRequest } from "./client.js";

/** POST /api/orders/ : turn the basket into an order. */
export function placeOrder(details) {
    return apiRequest("/api/orders/", { method: "POST", body: details });
}

/** POST /api/orders/track/ : find an order by number + phone. */
export function trackOrder(number, phone) {
    return apiRequest("/api/orders/track/", { method: "POST", body: { number, phone } });
}

/** GET /api/orders/<number>/ : the order just placed (Done page). */
export function getOrder(number) {
    return apiRequest(`/api/orders/${encodeURIComponent(number)}/`);
}