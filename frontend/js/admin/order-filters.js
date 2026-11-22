(() => {
    const strip = document.querySelector('.order-filter-strip');
    if (!strip) return;

    // Reuse Django's links, facet counts and selected state.
    function showChoices(container) {
        const choices = container.querySelector('details[data-filter-title]');
        const list = choices?.querySelector('ul');
        if (!list) return;
        choices.replaceWith(list);
        for (const link of list.querySelectorAll('a')) {
            if (link.parentElement.classList.contains('selected')) link.setAttribute('aria-current', 'true');
            const match = link.textContent.trim().match(/^(.*)\s+\((\d+)\)$/);
            if (!match) continue;
            const count = document.createElement('span');
            count.className = 'filter-count';
            count.textContent = match[2];
            link.replaceChildren(match[1] + ' ', count);
        }
    }
    showChoices(strip.querySelector('.orders-statuses'));
    const picker = strip.querySelector('.order-date-picker');
    showChoices(picker.querySelector('.order-date-panel'));
    const form = picker.querySelector('form');
    const input = form.querySelector('input');
    const caption = picker.querySelector('.order-date-caption strong');
    const current = new URL(location.href);
    const params = current.searchParams;
    const year = params.get('created_at__year');
    const month = params.get('created_at__month');
    const day = params.get('created_at__day');
    const hasDate = Array.from(params.keys()).some(key => key.startsWith('created_at__'));
    picker.classList.toggle('has-date', hasDate);
    if (year) {
        const iso = [year, (month || '1').padStart(2, '0'), (day || '1').padStart(2, '0')].join('-');
        const date = new Date(iso + 'T00:00:00Z');
        if (Number.isFinite(date.getTime())) {
            caption.textContent = date.toLocaleDateString('en-GB', {
                year: 'numeric', month: month ? 'short' : undefined, day: day ? 'numeric' : undefined, timeZone: 'UTC'
            });
            if (month && day) input.value = iso;
        }
    } else if (hasDate) {
        const active = picker.querySelector('a[aria-current="true"]');
        caption.textContent = active?.firstChild?.textContent.trim() || 'Date range';
    }
    form.hidden = false;
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!input.value || !input.reportValidity()) return;
        const url = new URL(location.href);
        for (const key of Array.from(url.searchParams.keys())) {
            if (key.startsWith('created_at__') || key === 'p') url.searchParams.delete(key);
        }
        const [y, m, d] = input.value.split('-');
        url.searchParams.set('created_at__year', y);
        url.searchParams.set('created_at__month', String(Number(m)));
        url.searchParams.set('created_at__day', String(Number(d)));
        location.assign(url.href);
    });
    document.addEventListener('click', event => {
        if (picker.open && !picker.contains(event.target)) picker.open = false;
    });
    picker.addEventListener('keydown', event => {
        if (event.key === 'Escape' && picker.open) {
            picker.open = false;
            picker.querySelector('summary').focus();
        }
    });
})();
