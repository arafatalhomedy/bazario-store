/* Runs before the admin page paints: no menu flash between pages. */
(function () {
    try {
        const root = document.documentElement;
        if (sessionStorage.getItem("bz-nav-seen")) root.classList.add("bz-nav-seen");
        sessionStorage.setItem("bz-nav-seen", "1");
        const phone = window.matchMedia("(max-width: 47.9375rem)").matches;
        if (localStorage.getItem("bz-nav-mini") === "1" && !phone) root.classList.add("bz-nav-mini");
    } catch (error) {
        /* storage blocked: the menu simply animates in */
    }
})();