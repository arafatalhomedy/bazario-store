/**
 * Product API: the questions the website can ask about products.
 * Uses apiRequest() from client.js for the actual request.
 */
import { apiRequest } from "./client.js";

/**
 * GET /api/products/ with optional filters.
 * Example: fetchProducts({ search: "lamp", category: "home", sort: "price_asc", page: 1 })
 */
export function fetchProducts(
    { search = "", category = "", sort = "", newOnly = false, page = 1, pageSize } = {},
    signal,
) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (sort) params.set("sort", sort);
    if (newOnly) params.set("new", "1");
    params.set("page", String(page));
    if (pageSize) params.set("page_size", String(pageSize)); // how many products (server max 48)
    return apiRequest(`/api/products/?${params}`, { signal });
}

/** Categories shown in the storefront, including categories awaiting products. */
export function fetchCategories(signal) {
    return apiRequest("/api/categories/?include_empty=1", { signal });
}
