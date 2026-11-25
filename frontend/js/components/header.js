/**
 * Site header: brings the navbar to life.
 *
 *  1. Entrance order       6. Categories list (from the server)
 *  2. Logo letters         7. Phone menu
 *  3. Rolling link text    8. Scroll effects (shadow, compact, progress, hide)
 *  4. Sliding highlight    9. Announcement messages
 *  5. Dropdown menus      10. Theme toggle
 *                         11. Cart count (used on Day 2)
 */
import { fetchCategories } from "../api/products.js";
import { whenIdle } from "../utils/lazy.js";
import { setupProductSearch } from "./productSearch.js";
import { el } from "../utils/dom.js";
import { hasFinePointer, prefersReducedMotion } from "../utils/motion.js";
import { applyTheme, followSystemTheme, getTheme, saveTheme } from "../utils/theme.js";

const ANNOUNCE_INTERVAL_MS = 5000;
const COMPACT_AFTER_PX = 80;
const HIDE_AFTER_PX = 240;
const SCROLL_DELTA_PX = 6;
const mobileQuery = window.matchMedia("(max-width: 900px)");

/** Start everything. Called once by the page script. */
export function initHeader() {
    const header = document.querySelector("[data-header]");
    if (!header) return;

    const nav = header.querySelector("[data-nav]");

    setEnterOrder(header);
    splitLogo(header);

    if (nav) {
        setupRollingLinks(nav);
        setupIndicator(nav);
    }

    const dropdowns = setupDropdowns(header);
    const closeMobileMenu = setupMobileMenu(header, nav);
    setupScroll(header, dropdowns);

    setupProductSearch(header, {
        closeMenus() {
            dropdowns.closeAll();
            closeMobileMenu?.();
        },
    });

    setupAnnouncement(header);
    setupThemeToggle(header);
    // The categories list loads when someone opens the menu, or when the page is idle
    let menuLoaded = false;
    const loadMenuOnce = () => {
        if (menuLoaded) return;
        menuLoaded = true;
        loadCategoriesMenu(header);
    };
    header.querySelector("[data-categories-menu]")?.closest("[data-dropdown]")
        ?.addEventListener("pointerenter", loadMenuOnce, { once: true });
    header.addEventListener("focusin", loadMenuOnce, { once: true });
    whenIdle(loadMenuOnce);
}

/* ------------------------------------------------------------------ 1. Entrance order */
function setEnterOrder(header) {
    const items = header.querySelectorAll(
        ".site-header__bar .logo, .site-nav__link, .site-header__actions > *",
    );

    items.forEach((item, index) => item.style.setProperty("--enter-index", index));
}

/* ------------------------------------------------------------------ 2. Logo letters */
function splitLogo(header) {
    const logo = header.querySelector(".logo");
    const textNode = findTextNode(logo);
    if (!textNode) return;

    const letters = [...textNode.textContent.trim()].map((char, index) => {
        const letter = el("span", { className: "logo__char", text: char });
        letter.style.setProperty("--char-index", index);
        return letter;
    });

    textNode.replaceWith(...letters);
}

/* ------------------------------------------------------------------ 3. Rolling link text */
function setupRollingLinks(nav) {
    for (const link of nav.querySelectorAll(".site-nav__link")) {
        const textNode = findTextNode(link);
        if (!textNode) continue;

        const text = textNode.textContent.trim();

        textNode.replaceWith(
            el("span", { className: "roll" }, [
                el("span", { className: "roll__inner" }, [
                    el("span", { text }),
                    el("span", { text, attrs: { "aria-hidden": "true" } }),
                ]),
            ]),
        );
    }
}

/* ------------------------------------------------------------------ 4. Sliding highlight */
function setupIndicator(nav) {
    const indicator = nav.querySelector("[data-nav-indicator]");
    if (!indicator) return;

    const moveTo = (link) => {
        const navBox = nav.getBoundingClientRect();
        const linkBox = link.getBoundingClientRect();

        indicator.style.setProperty("--indicator-x", `${linkBox.left - navBox.left}px`);
        indicator.style.setProperty("--indicator-w", `${linkBox.width}px`);
        indicator.classList.add("is-visible");
    };

    const hide = () => indicator.classList.remove("is-visible");

    if (hasFinePointer()) {
        nav.addEventListener("pointerover", (event) => {
            const link = event.target.closest(".site-nav__link");
            if (link) moveTo(link);
        });

        nav.addEventListener("pointerleave", hide);
    }

    nav.addEventListener("focusin", (event) => {
        const link = event.target.closest(".site-nav__link");
        if (link) moveTo(link);
    });

    nav.addEventListener("focusout", (event) => {
        if (!nav.contains(event.relatedTarget)) hide();
    });
}

/* ------------------------------------------------------------------ 5. Dropdown menus */
function setupDropdowns(header) {
    const dropdowns = [...header.querySelectorAll("[data-dropdown]")];

    const setOpen = (dropdown, open) => {
        dropdown.classList.toggle("is-open", open);
        dropdown.querySelector("[data-dropdown-toggle]")?.setAttribute("aria-expanded", String(open));
    };

    const closeAll = (except) => {
        dropdowns.forEach((dropdown) => {
            if (dropdown !== except) setOpen(dropdown, false);
        });
    };

    for (const dropdown of dropdowns) {
        dropdown.querySelector("[data-dropdown-toggle]")?.addEventListener("click", () => {
            const willOpen = !dropdown.classList.contains("is-open");
            closeAll(dropdown);
            setOpen(dropdown, willOpen);
        });
    }

    document.addEventListener("click", (event) => {
        for (const dropdown of dropdowns) {
            if (!dropdown.contains(event.target)) setOpen(dropdown, false);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;

        for (const dropdown of dropdowns) {
            if (dropdown.classList.contains("is-open")) {
                setOpen(dropdown, false);
                dropdown.querySelector("[data-dropdown-toggle]")?.focus();
            }
        }
    });

    return { closeAll: () => closeAll(null) };
}

/* ------------------------------------------------------------------ 6. Categories list */
async function loadCategoriesMenu(header) {
    const menu = header.querySelector("[data-categories-menu]");
    if (!menu) return;

    const shopUrl = menu.dataset.shopUrl;
    const note = (text) => el("li", { className: "dropdown__note", text });
    const item = (text, href) => el("li", {}, [
        el("a", { className: "dropdown__item", text, attrs: { href } }),
    ]);

    menu.replaceChildren(note("Loading…"));

    try {
        const categories = await fetchCategories();

        menu.replaceChildren(
            item("All products", shopUrl),
            ...categories
                .filter((category) => category.slug !== "home")
                .map((category) => item(
                    category.name,
                    `${shopUrl}#category-${encodeURIComponent(category.slug)}`,
                )),
        );
    } catch {
        menu.replaceChildren(
            note("Couldn't load categories"),
            item("All products", shopUrl),
        );
    }
}

/* ------------------------------------------------------------------ 7. Phone menu */
function setupMobileMenu(header, nav) {
    const button = header.querySelector("[data-menu-toggle]");
    if (!button || !nav) return;

    const setOpen = (open) => {
        nav.classList.toggle("is-open", open);
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };

    button.addEventListener("click", () => {
        setOpen(!nav.classList.contains("is-open"));
    });

    nav.addEventListener("click", (event) => {
        if (event.target.closest("a")) setOpen(false);
    });

    document.addEventListener("click", (event) => {
        if (nav.classList.contains("is-open") && !header.contains(event.target)) {
            setOpen(false);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && nav.classList.contains("is-open")) {
            setOpen(false);
            button.focus();
        }
    });

    mobileQuery.addEventListener("change", (event) => {
        if (!event.matches) setOpen(false);
    });

    return () => setOpen(false);
}

/* ------------------------------------------------------------------ 8. Scroll effects */
function setupScroll(header, dropdowns) {
    const progress = header.querySelector("[data-scroll-progress]");
    let lastY = window.scrollY;
    let ticking = false;

    const isMenuOpen = () => Boolean(header.querySelector(".is-open"));

    const update = () => {
        const y = window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

        header.classList.toggle("is-scrolled", y > 8);
        header.classList.toggle("is-compact", y > COMPACT_AFTER_PX);

        if (progress) {
            const ratio = maxScroll > 0 ? Math.min(y / maxScroll, 1) : 0;
            progress.style.setProperty("--scroll-progress", ratio.toFixed(4));
        }

        const goingDown = y > lastY + SCROLL_DELTA_PX;
        const goingUp = y < lastY - SCROLL_DELTA_PX;

        if (goingDown && y > HIDE_AFTER_PX && !isMenuOpen()) {
            header.classList.add("is-hidden");
            dropdowns.closeAll();
        } else if (goingUp || y < HIDE_AFTER_PX) {
            header.classList.remove("is-hidden");
        }

        if (goingDown || goingUp) lastY = y;

        ticking = false;
    };

    const requestUpdate = () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(update);
        }
    };

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    header.addEventListener("focusin", () => header.classList.remove("is-hidden"));

    update();
}

/* ------------------------------------------------------------------ 9. Announcement messages */
function setupAnnouncement(header) {
    const bar = header.querySelector("[data-announcement]");
    const messages = bar ? [...bar.querySelectorAll(".announcement__message")] : [];
    if (!messages.length) return;

    let index = Math.max(0, messages.findIndex((message) => message.classList.contains("is-active")));

    messages.forEach((message, i) => message.toggleAttribute("aria-hidden", i !== index));

    if (messages.length < 2 || prefersReducedMotion()) return;

    let paused = false;
    bar.addEventListener("pointerenter", () => { paused = true; });
    bar.addEventListener("pointerleave", () => { paused = false; });

    setInterval(() => {
        if (paused || document.hidden) return;

        const current = messages[index];
        index = (index + 1) % messages.length;
        const next = messages[index];

        current.classList.replace("is-active", "is-leaving");
        current.setAttribute("aria-hidden", "true");
        next.classList.remove("is-leaving");
        next.classList.add("is-active");
        next.removeAttribute("aria-hidden");

        setTimeout(() => current.classList.remove("is-leaving"), 700);
    }, ANNOUNCE_INTERVAL_MS);
}

/* ------------------------------------------------------------------ 10. Theme toggle */
function setupThemeToggle(header) {
    const button = header.querySelector("[data-theme-toggle]");
    if (!button) return;

    const updateLabel = (theme) => {
        const next = theme === "dark" ? "light" : "dark";
        button.setAttribute("aria-label", `Switch to ${next} theme`);
    };

    applyTheme(getTheme());
    updateLabel(getTheme());

    button.addEventListener("click", () => {
        const next = getTheme() === "dark" ? "light" : "dark";
        saveTheme(next);
        switchThemeAnimated(next, button);
        updateLabel(next);
    });

    followSystemTheme(updateLabel);
}

function switchThemeAnimated(theme, origin) {
    if (prefersReducedMotion()) {
        applyTheme(theme);
        return;
    }

    // Phones: a colour circle grows from the button (drawn by the graphics chip,
    // starts instantly). The heavy colour change happens hidden behind it.
    if (window.matchMedia("(hover: none), (max-width: 820px)").matches) {
        wipeTheme(theme, origin);
        return;
    }

    if (!document.startViewTransition) {
        applyTheme(theme);
        return;
    }

    const box = origin.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const radius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
    );

    document.documentElement.classList.add("is-theme-switching");

    const transition = document.startViewTransition(() => applyTheme(theme));
    transition.finished.finally(() => {
        document.documentElement.classList.remove("is-theme-switching");
    });

    transition.ready
        .then(() => {
            document.documentElement.animate(
                {
                    clipPath: [
                        `circle(0px at ${x}px ${y}px)`,
                        `circle(${radius}px at ${x}px ${y}px)`,
                    ],
                },
                {
                    duration: 700,
                    easing: "cubic-bezier(0.7, 0, 0.3, 1)",
                    pseudoElement: "::view-transition-new(root)",
                },
            );
        })
        .catch(() => { /* The theme applies even when the animation is skipped. */ });
}

/** Phone theme switch: a soft circle of the new colour spreads from the button
    and fades out while the page changes colour underneath (the page never disappears). */
function wipeTheme(theme, origin) {
    const box = origin.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const radius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
    ) + 40;

    const BASE = 200; // small circle, scaled up: cheap for the phone to draw
    const wipe = document.createElement("div");
    Object.assign(wipe.style, {
        position: "fixed",
        left: `${x - BASE / 2}px`,
        top: `${y - BASE / 2}px`,
        width: `${BASE}px`,
        height: `${BASE}px`,
        borderRadius: "50%",
        background: theme === "dark" ? "#0e0e0f" : "#f4f1ea",
        zIndex: "2147483646",
        pointerEvents: "none",
        transform: "scale(0)",
        willChange: "transform, opacity",
    });
    document.body.append(wipe);

    const spread = wipe.animate(
        [
            { transform: "scale(0)", opacity: 1 },
            { transform: `scale(${(radius * 0.9) / BASE})`, opacity: 0.85, offset: 0.4 },
            { transform: `scale(${(radius * 2) / BASE})`, opacity: 0 },
        ],
        { duration: 750, easing: "cubic-bezier(0.33, 0, 0.2, 1)", fill: "forwards" },
    );

    // Change the colours once the circle is already moving
    // (it keeps moving smoothly even while the page is busy)
    requestAnimationFrame(() => requestAnimationFrame(() => applyTheme(theme)));

    spread.finished.finally(() => wipe.remove());
}



/* ------------------------------------------------------------------ 11. Cart count */
export function setCartCount(count, { bump = true } = {}) {
    const badge = document.querySelector("[data-cart-count]");
    const button = document.querySelector("[data-cart-button]");
    if (!badge) return;

    badge.textContent = String(count);
    button?.setAttribute("aria-label", `Open cart, ${count} item${count === 1 ? "" : "s"}`);

    if (bump && !prefersReducedMotion()) {
        badge.classList.remove("is-bumping");
        void badge.offsetWidth;
        badge.classList.add("is-bumping");
    }
}

function findTextNode(element) {
    return [...element.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
    );
}