import { initHeader } from "../components/header.js";
import { initCartCount } from "../components/cartActions.js";
import { initFooter } from "../components/footer.js";
import { prefersReducedMotion } from "../utils/motion.js";
import { initProductMorph } from "../animations/morph.js";
function trackCurrentCategory() {
    const index = document.querySelector(".shop-index");
    if (!index) return;

    const entries = [...index.querySelectorAll('a[href^="#category-"]')]
        .map((link) => ({
            link,
            section: document.getElementById(link.getAttribute("href").slice(1)),
        }))
        .filter(({ section }) => section);

    if (!entries.length) return;

    let activeLink = null;
    let frame = null;

    function update() {
        frame = null;
        const boundary = index.getBoundingClientRect().bottom + 48;
        let nextLink = entries[0].link;

        for (const { link, section } of entries) {
            if (section.getBoundingClientRect().top > boundary) break;
            nextLink = link;
        }

        if (activeLink === nextLink) return;
        activeLink?.removeAttribute("aria-current");
        nextLink.setAttribute("aria-current", "location");
        activeLink = nextLink;
    }

    function scheduleUpdate() {
        if (frame === null) frame = requestAnimationFrame(update);
    }

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("pageshow", scheduleUpdate);
    update();
}

function revealProductGrids() {
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;

            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
        }
    }, { rootMargin: "0px 0px -8% 0px" });

    document
        .querySelectorAll(".shop-grid--rail, .shop-page--category .shop-grid > li")
        .forEach((item) => observer.observe(item));
}

initHeader();
initCartCount();
initFooter();
initProductMorph();
trackCurrentCategory();
revealProductGrids();
function initShopShelves() {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const glideSpeed = 28;

    document.querySelectorAll("[data-shop-rail]").forEach((shelf) => {
        const track = shelf.querySelector("[data-shop-track]");
        const playback = shelf.querySelector("[data-shop-autoplay]");
        if (!track || !playback) return;

        const cards = [...track.children];
        if (!cards.length) return;

        let copies = [];
        let period = 0;
        let frame = null;
        let lastTime = null;
        let position = 0;
        let visible = false;
        let hovered = false;
        let paused = false;
        let interacting = false;
        let restartTimer;

        function updatePlayback() {
            playback.hidden = !period;
            const label = paused ? "Play" : "Pause";
            playback.textContent = label;
            playback.setAttribute(
                "aria-label",
                `${label} automatic scrolling: ${track.getAttribute("aria-label")}`,
            );
        }

        function tick(time) {
            if (lastTime !== null) {
                const elapsed = Math.min(time - lastTime, 50);
                position = (position + elapsed * glideSpeed / 1000) % period;
                track.scrollLeft = position;
            }

            lastTime = time;
            frame = requestAnimationFrame(tick);
        }

        function syncPlayback() {
            if (frame !== null) cancelAnimationFrame(frame);
            frame = null;
            lastTime = null;

            const focus = shelf.querySelector(":focus-visible");
            if (
                !period || !visible || paused || hovered || interacting
                || document.hidden || (focus && focus !== playback)
            ) return;

            position = Math.max(0, track.scrollLeft) % period;
            frame = requestAnimationFrame(tick);
        }

        function buildBelt() {
            const current = period ? track.scrollLeft % period : track.scrollLeft;
            copies.forEach((copy) => copy.remove());
            copies = [];
            period = 0;

            const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
            const step = cards[0].getBoundingClientRect().width + gap;

            if (
                !motion.matches && cards.length > 1 && step > 0
                && "IntersectionObserver" in window
            ) {
                period = step * cards.length;
                const copyCount = Math.ceil(track.clientWidth / step) + 2;

                for (let i = 0; i < copyCount; i++) {
                    const copy = cards[i % cards.length].cloneNode(true);
                    copy.setAttribute("aria-hidden", "true");

                    const link = copy.querySelector("a");
                    if (link) {
                        link.tabIndex = -1;
                        link.addEventListener("mousedown", (event) => event.preventDefault());
                    }

                    copies.push(copy);
                }

                track.append(...copies);
            }

            track.classList.toggle("is-belt-ready", Boolean(period));
            track.scrollLeft = current;
            updatePlayback();
            syncPlayback();
        }

        function beginInteraction() {
            window.clearTimeout(restartTimer);
            interacting = true;
            syncPlayback();
        }

        function endInteraction() {
            window.clearTimeout(restartTimer);
            restartTimer = window.setTimeout(() => {
                interacting = false;
                syncPlayback();
            }, 1200);
        }

        cards.forEach((card, index) => {
            card.dataset.beltTilt = index % 2 ? "right" : "left";
        });

        playback.addEventListener("click", () => {
            paused = !paused;
            updatePlayback();
            syncPlayback();
        });

        shelf.addEventListener("pointerenter", (event) => {
            if (event.pointerType !== "mouse") return;
            hovered = true;
            syncPlayback();
        });

        shelf.addEventListener("pointerleave", (event) => {
            if (event.pointerType !== "mouse") return;
            hovered = false;
            syncPlayback();
        });

        track.addEventListener("touchstart", beginInteraction, { passive: true });
        track.addEventListener("touchend", endInteraction);
        track.addEventListener("touchcancel", endInteraction);
        shelf.addEventListener("focusin", syncPlayback);
        shelf.addEventListener("focusout", () => requestAnimationFrame(syncPlayback));
        document.addEventListener("visibilitychange", syncPlayback);
        window.addEventListener("resize", buildBelt);
        motion.addEventListener("change", buildBelt);

        if ("IntersectionObserver" in window) {
            const observer = new IntersectionObserver(([entry]) => {
                visible = entry.intersectionRatio >= 0.4;
                syncPlayback();
            }, { threshold: 0.4 });

            observer.observe(track);
        }

        buildBelt();
    });
}

initShopShelves();