/**
 * Group basket / order items by category, each with its own colour.
 * Used by the basket (basketBoard.js) and the checkout (checkout.js).
 */
const CATEGORY_COLORS = ["#ff6b4a", "#7c5cff", "#16b5a3", "#f2b705", "#ff4f9a", "#3d8bfd", "#8ac926"];

export function groupByCategory(items) {
    const slugs = [...new Set(items.map((item) => item.product.category?.slug || "other"))].sort();
    const groups = new Map();

    for (const item of items) {
        const category = item.product.category || { slug: "other", name: "Other" };
        if (!groups.has(category.slug)) {
            groups.set(category.slug, {
                slug: category.slug,
                name: category.name,
                color: CATEGORY_COLORS[slugs.indexOf(category.slug) % CATEGORY_COLORS.length],
                items: [],
                subtotal: 0,
                quantity: 0,
            });
        }
        const group = groups.get(category.slug);
        group.items.push(item);
        group.subtotal += Number(item.line_total);
        group.quantity += item.quantity;
    }
    return [...groups.values()];
}