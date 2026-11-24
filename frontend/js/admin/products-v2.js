/**
 * Admin Products v2:
 *  1. Cards tilt toward the mouse
 *  2. Header counters count up
 *  3. Ticking a card opens the floating bulk bar (closes again when nothing is ticked)
 *  4. "/" jumps into the product search
 * Styles: css/admin/products-v2.css
 */
(function () {
    const root = document.getElementById("bazario-workspace");
    if (!root) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    /* 1. Tilt */
    if (!reduced && finePointer) {
        root.querySelectorAll(".bz-pcard").forEach((card) => {
            let frame = 0;
            card.addEventListener("pointermove", (event) => {
                cancelAnimationFrame(frame);
                frame = requestAnimationFrame(() => {
                    const box = card.getBoundingClientRect();
                    const x = (event.clientX - box.left) / box.width - 0.5;
                    const y = (event.clientY - box.top) / box.height - 0.5;
                    card.style.setProperty("--tx", `${x * 12}deg`);
                    card.style.setProperty("--ty", `${-y * 12}deg`);
                });
            });
            card.addEventListener("pointerleave", () => {
                card.style.setProperty("--tx", "0deg");
                card.style.setProperty("--ty", "0deg");
            });
        });
    }

    /* 2. Count up */
    if (!reduced) {
        root.querySelectorAll("[data-bz-count]").forEach((node, index) => {
            const end = Number(node.textContent.trim()) || 0;
            if (!end) return;
            const start = performance.now() + 250 + index * 80;
            const tick = (now) => {
                const t = Math.max(0, Math.min((now - start) / 800, 1));
                node.textContent = String(Math.round(end * (1 - Math.pow(1 - t, 3))));
                if (t < 1) requestAnimationFrame(tick);
            };
            node.textContent = "0";
            requestAnimationFrame(tick);
        });
    }

    /* 3. Bulk bar */
    const bulk = root.querySelector("[data-bz-bulk]");
    if (bulk) {
        const update = () => {
            const any = root.querySelector(".bz-pcard__check:checked");
            bulk.open = Boolean(any);
        };
        root.addEventListener("change", (event) => {
            if (event.target.matches(".bz-pcard__check, #action-toggle")) update();
        });
        update();
    }

    /* 4. Search: no reload when the box is empty or unchanged — the box shakes instead */
    const search = document.getElementById("searchbar");
    const searchForm = search?.form;
    if (searchForm) {
        const current = (new URLSearchParams(window.location.search).get("q") || "").trim();
        searchForm.addEventListener("submit", (event) => {
            if (search.value.trim() !== current) return;
            event.preventDefault();
            search.focus();
            search.classList.remove("is-shake");
            void search.offsetWidth;
            search.classList.add("is-shake");
        });
    }

    /* 5. "/" → search */
    if (search) {
        document.addEventListener("keydown", (event) => {
            if (event.key !== "/" || event.target.closest("input, textarea, select, [contenteditable]")) return;
            event.preventDefault();
            search.focus();
        });
    }
})();