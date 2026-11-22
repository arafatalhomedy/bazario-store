(() => {
    const page = document.querySelector('.bazario-order-list');
    if (!page) return;

    const search = page.querySelector('#searchbar');
    if (search) search.placeholder = 'Search order, customer, phone or city';

    const results = page.querySelector('.register-results');
    if (!results) return;

    const returnKey = 'bazario:order-list:' + location.pathname + location.search;
    const rows = Array.from(results.querySelectorAll('.register-row'));

    results.addEventListener('click', event => {
        const link = event.target.closest('.register-view, .identity a');
        if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        try {
            sessionStorage.setItem(returnKey, link.closest('.register-row').dataset.order);
        } catch {
            // Navigation also works when browser storage is unavailable.
        }
    });

    window.addEventListener('pageshow', () => {
        let previousOrder;
        try {
            previousOrder = sessionStorage.getItem(returnKey);
            sessionStorage.removeItem(returnKey);
        } catch {
            // Focus restoration is optional.
        }
        const previousRow = rows.find(row => row.dataset.order === previousOrder);
        if (previousRow) {
            previousRow.classList.remove('filter-arrival');
            previousRow.classList.add('return-highlight');
            previousRow.querySelector('.register-view').focus();
        } else if (location.search) {
            rows.forEach((row, index) => {
                row.style.setProperty('--row-delay', Math.min(index, 6) * 24 + 'ms');
                row.classList.add('filter-arrival');
            });
        }
    });
})();
