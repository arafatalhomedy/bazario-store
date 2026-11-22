(() => {
    const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    const cents = value => BigInt(Math.round(Number(value) * 100));

    function setup(root) {
        const regular = root.querySelector("#id_price");
        const ticket = root.querySelector("[data-product-price]");
        if (!regular || !ticket) return;
        const saleLabel = ticket.querySelector("[data-current-price]");
        const previous = ticket.querySelector("[data-regular-price]");
        const savings = ticket.querySelector("[data-savings]");
        const hasSale = Boolean(regular.dataset.regular);

        function update() {
            ticket.hidden = false;
            savings.hidden = previous.hidden = true;
            saleLabel.textContent = "—";
            if (!regular.value || !regular.validity.valid || !Number.isFinite(Number(regular.value))) return;
            const base = cents(regular.value);
            if (base <= 0n) return;
            let sale = base;
            if (hasSale) {
                const oldBase = cents(regular.dataset.regular);
                sale = (2n * base * cents(regular.dataset.sale) + oldBase) / (2n * oldBase);
                if (sale <= 0n || sale >= base) return;
                previous.textContent = money.format(Number(base) / 100);
                savings.textContent = "Save " + money.format(Number(base - sale) / 100);
                savings.hidden = previous.hidden = false;
            }
            saleLabel.textContent = money.format(Number(sale) / 100);
        }
        regular.addEventListener("input", update);
        update();
    }
    document.addEventListener("DOMContentLoaded", () => setup(document));
    document.addEventListener("bazario:product-panel", event => setup(event.target));
})();
