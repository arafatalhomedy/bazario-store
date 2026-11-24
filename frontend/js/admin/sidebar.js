/**
 * Admin menu:
 *  1. Glass highlight slides to the current page (in that page's colour)
 *  2. ‹ collapses to an icon rail — remembered for next time
 *  3. "Jump to…" filters the links; Enter opens the first match, Esc clears
 *  4. "/" focuses Jump to… (on pages without their own search box)
 */
(function () {
    const nav = document.querySelector("[data-bz-nav]");
    if (!nav) return;

    const root = document.documentElement;
    const KEY = "bz-nav-mini";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const collapse = nav.querySelector("[data-bz-collapse]");
    const indicator = nav.querySelector("[data-bz-indicator]");
    const jump = nav.querySelector("[data-bz-jump]");
    const links = [...nav.querySelectorAll(".bz-nav__link")];

    /* 1. Sliding highlight */
    function currentLink() {
        return links.find((link) => link.getAttribute("aria-current") === "page")
            || links.find((link) => link.getAttribute("aria-current") === "location");
    }

    function place() {
        const link = currentLink();
        if (!link || !indicator || link.closest("li").hidden) return;
        indicator.style.top = `${link.offsetTop}px`;
        indicator.style.height = `${link.offsetHeight}px`;
        indicator.style.setProperty("--k", getComputedStyle(link).getPropertyValue("--k"));
        indicator.classList.add("is-ready");
    }

    /* 2. Collapse (remembered) */
    function setMini(on) {
        root.classList.toggle(KEY, on);
        collapse?.setAttribute("aria-pressed", String(on));
        collapse?.setAttribute("aria-label", on ? "Expand menu" : "Collapse menu");
        try {
            localStorage.setItem(KEY, on ? "1" : "0");
        } catch {
            /* private mode: just don't remember */
        }
        setTimeout(place, reduced ? 0 : 520);
    }

    let saved = false;
    try {
        saved = localStorage.getItem(KEY) === "1";
    } catch {
        saved = false;
    }
    if (saved) setMini(true);
    collapse?.addEventListener("click", () => setMini(!root.classList.contains(KEY)));

    // The glow starts where it was on the previous page, then slides to this one
    const box = nav.closest(".bazario-admin-sidebar");
    let lastTop = null;
    try {
        lastTop = sessionStorage.getItem("bz-nav-top");
        const scroll = sessionStorage.getItem("bz-nav-scroll");
        if (box && scroll) box.scrollTop = Number(scroll);
    } catch {
        lastTop = null;
    }
    if (indicator && lastTop && !reduced) {
        indicator.style.transition = "none";
        indicator.style.top = `${lastTop}px`;
        indicator.classList.add("is-ready");
        void indicator.offsetWidth;
        indicator.style.transition = "";
    }
    requestAnimationFrame(() => requestAnimationFrame(place));

    // Remember the glow + menu scroll for the next page
    window.addEventListener("pagehide", () => {
        try {
            sessionStorage.setItem("bz-nav-top", (indicator?.style.top || "").replace("px", ""));
            if (box) sessionStorage.setItem("bz-nav-scroll", String(box.scrollTop));
        } catch {
            /* ignore */
        }
    });

    // Hovering a menu link starts loading that page in the background
    if (HTMLScriptElement.supports?.("speculationrules")) {
        const rules = document.createElement("script");
        rules.type = "speculationrules";
        rules.textContent = JSON.stringify({
            prefetch: [{ where: { selector_matches: ".bz-nav__link" }, eagerness: "moderate" }],
        });
        document.head.append(rules);
    }
    window.addEventListener("resize", place);

    /* 3. Jump to… */
    if (!jump) return;
    jump.addEventListener("input", () => {
        const query = jump.value.trim().toLowerCase();
        links.forEach((link) => {
            link.closest("li").hidden = Boolean(query) && !link.dataset.label.toLowerCase().includes(query);
        });
        nav.classList.toggle("is-jumping", Boolean(query));
        if (!query) place();
    });

    jump.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            const first = links.find((link) => !link.closest("li").hidden);
            if (first) window.location.href = first.href;
        }
        if (event.key === "Escape") {
            jump.value = "";
            jump.dispatchEvent(new Event("input"));
            jump.blur();
        }
    });

    /* 4. "/" shortcut (the Orders page keeps "/" for its own search) */
    document.addEventListener("keydown", (event) => {
        if (event.key !== "/" || document.getElementById("searchbar")) return;
        if (event.target.closest("input, textarea, select, [contenteditable]")) return;
        event.preventDefault();
        if (root.classList.contains(KEY)) setMini(false);
        jump.focus();
    });
})();

/* ==========================================================================
   Phones: the menu is a drawer opened by the B button
   ========================================================================== */
(function () {
    const button = document.querySelector("[data-bz-menu]");
    const drawer = document.getElementById("bz-admin-menu");
    if (!button || !drawer) return;

    const root = document.documentElement;
    const phone = window.matchMedia("(max-width: 47.9375rem)");
    const dim = document.createElement("div");
    dim.className = "bz-nav-dim";
    document.body.append(dim);

    function setOpen(open) {
        root.classList.toggle("bz-nav-open", open);
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        if (open) {
            drawer.querySelector(".bz-nav__link[aria-current='page'], .bz-nav__link")?.focus({ preventScroll: true });
        } else if (drawer.contains(document.activeElement)) {
            button.focus({ preventScroll: true });
        }
    }

    button.addEventListener("click", () => setOpen(!root.classList.contains("bz-nav-open")));
    dim.addEventListener("click", () => setOpen(false));
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && root.classList.contains("bz-nav-open")) setOpen(false);
    });

    // On phones the ‹ / ✕ in the drawer closes it (instead of collapsing)
    drawer.querySelector("[data-bz-collapse]")?.addEventListener("click", (event) => {
        if (!phone.matches) return;
        event.stopImmediatePropagation();
        setOpen(false);
    }, true);

    // Tapping a page closes the drawer
    drawer.querySelectorAll(".bz-nav__link").forEach((link) => {
        link.addEventListener("click", () => {
            if (phone.matches) setOpen(false);
        });
    });

    // Swipe left to close
    let startX = null;
    drawer.addEventListener("touchstart", (event) => {
        startX = event.touches[0].clientX;
    }, { passive: true });
    drawer.addEventListener("touchend", (event) => {
        if (startX !== null && event.changedTouches[0].clientX - startX < -60) setOpen(false);
        startX = null;
    });

    // Phone ↔ computer: phones never use the collapsed rail; leaving phone size closes the drawer
    function sync() {
        if (phone.matches) {
            root.classList.remove("bz-nav-mini");
        } else {
            setOpen(false);
            try {
                if (localStorage.getItem("bz-nav-mini") === "1") root.classList.add("bz-nav-mini");
            } catch {
                /* ignore */
            }
        }
    }
    phone.addEventListener("change", sync);
    sync();
})();