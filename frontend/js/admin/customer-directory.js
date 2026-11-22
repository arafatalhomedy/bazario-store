(() => {
    const directory = document.querySelector('.customer-desk');
    if (!directory) return;
    const search = directory.querySelector('#searchbar');
    if (search) search.placeholder = 'Search name, email or username';
    for (const link of directory.querySelectorAll('.customer-view')) {
        const panel = document.getElementById(link.getAttribute('aria-controls'));
        link.setAttribute('aria-expanded', 'false');
        link.addEventListener('click', event => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            panel.hidden = !panel.hidden;
            link.setAttribute('aria-expanded', String(!panel.hidden));
            link.firstChild.textContent = panel.hidden ? 'View customer ' : 'Hide details ';
        });
    }
})();
