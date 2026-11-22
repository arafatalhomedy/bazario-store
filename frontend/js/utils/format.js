const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "149.00" -> "$149.00" */
export function formatPrice(value) {
    return priceFormatter.format(Number(value));
}