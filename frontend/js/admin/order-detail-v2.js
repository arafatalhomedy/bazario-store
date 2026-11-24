/**
 * Admin order details v2:
 *  1. Hold-to-confirm buttons (confirm, mark on the way / delivered, cancel, approve cancel)
 *  2. Arrival window as chips (the real <select> stays, hidden)
 *  3. Fold-outs: Cancel order, Decline, History
 *  4. Items | Delivery tabs
 *  5. Copy order number / address, decline reason chips, total counts up
 * HTML: pages/admin/orders/order/change_form.html · CSS: css/admin/order-detail-v2.css
 */
(function () {
    const page = document.getElementById("bz-order");
    if (!page) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const HOLD_MS = 1000;

    /* 1. Hold to confirm */
    page.querySelectorAll("[data-bz-hold]").forEach((button) => {
        const fill = button.querySelector(".bz-hold__fill");
        let animation = null;

        function start(event) {
            if (button.classList.contains("is-done") || animation) return;
            if (event?.button > 0) return;
            const form = button.form;
            if (form && !form.checkValidity()) {
                form.reportValidity();
                return;
            }
            animation = fill.animate(
                [{ transform: "translateX(-101%)" }, { transform: "translateX(0)" }],
                { duration: reduced ? 250 : HOLD_MS, fill: "forwards", easing: "linear" },
            );
            animation.onfinish = () => {
                animation = null;
                button.classList.add("is-done");
                button.dataset.ready = "1";
                if (button.form) button.form.requestSubmit(button);
            };
        }

        function stop() {
            if (!animation) return;
            animation.onfinish = null;
            animation.reverse();
            animation = null;
        }

        button.addEventListener("pointerdown", start);
        ["pointerup", "pointerleave", "pointercancel"].forEach((type) => button.addEventListener(type, stop));
        button.addEventListener("keydown", (event) => {
            if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                event.preventDefault();
                start();
            }
        });
        button.addEventListener("keyup", (event) => {
            if (event.key === " " || event.key === "Enter") stop();
        });
        // A normal click must NOT submit — only a finished hold does
        button.addEventListener("click", (event) => {
            if (!button.dataset.ready) event.preventDefault();
        });
    });

    /* 2. Arrival window chips */
    const confirmForm = document.getElementById("bz-confirm-form");
    const windowSelect = confirmForm?.elements.window;
    const chipBox = confirmForm?.querySelector("[data-bz-windows]");
    if (windowSelect && chipBox) {
        const sync = () => chipBox.querySelectorAll("button").forEach((chip) => {
            chip.setAttribute("aria-pressed", String(chip.dataset.value === windowSelect.value));
        });
        [...windowSelect.options].forEach((option) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.dataset.value = option.value;
            chip.textContent = option.textContent;
            chip.addEventListener("click", () => {
                windowSelect.value = option.value;
                windowSelect.dispatchEvent(new Event("input", { bubbles: true }));
                windowSelect.dispatchEvent(new Event("change", { bubbles: true }));
                sync();
            });
            chipBox.append(chip);
        });
        confirmForm.classList.add("has-chips");
        windowSelect.addEventListener("change", sync);
        sync();
    }

    /* 3. Fold-outs */
    page.querySelectorAll("[data-bz-toggle]").forEach((button) => {
        const box = document.getElementById(button.dataset.bzToggle);
        if (!box) return;
        button.setAttribute("aria-controls", box.id);
        button.setAttribute("aria-expanded", "false");
        button.addEventListener("click", () => {
            const open = box.classList.toggle("is-open");
            page.querySelectorAll(`[data-bz-toggle="${box.id}"]`).forEach((other) => {
                other.setAttribute("aria-expanded", String(open));
            });
            if (button.classList.contains("bz-od__history-btn")) button.textContent = open ? "Hide" : "History";
            if (open) box.querySelector("textarea, input:not([type=hidden])")?.focus({ preventScroll: true });
        });
    });

    /* 4. Tabs */
    const tabs = page.querySelector("[data-bz-tabs]");
    tabs?.querySelectorAll("[data-bz-tab]").forEach((tab) => {
        tab.addEventListener("click", () => {
            tabs.querySelectorAll("[data-bz-tab]").forEach((other) => other.classList.toggle("is-on", other === tab));
            tabs.classList.toggle("is-right", tab.dataset.bzTab === "1");
            page.querySelectorAll("[data-bz-pane]").forEach((pane) => {
                pane.classList.toggle("is-on", pane.dataset.bzPane === tab.dataset.bzTab);
            });
        });
    });

    /* 5a. Copy buttons */
    page.querySelectorAll("[data-copy]").forEach((button) => {
        const label = button.textContent;
        button.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(button.dataset.copy);
                button.textContent = "Copied ✓";
                button.classList.add("is-ok");
            } catch {
                button.textContent = "Couldn't copy";
            }
            setTimeout(() => {
                button.textContent = label;
                button.classList.remove("is-ok");
            }, 1600);
        });
    });

    /* 5b. Decline reason chips fill the box */
    page.querySelectorAll("[data-bz-reasons]").forEach((group) => {
        const textarea = group.parentElement.querySelector("textarea");
        group.querySelectorAll("button").forEach((chip) => {
            chip.addEventListener("click", () => {
                group.querySelectorAll("button").forEach((other) => other.setAttribute("aria-pressed", String(other === chip)));
                textarea.value = chip.textContent;
                textarea.focus();
            });
        });
    });

    /* 5c. Total counts up */
    const money = page.querySelector("[data-bz-money]");
    const end = Number((money?.textContent || "").replace(/[^0-9.]/g, ""));
    if (money && end && !reduced) {
        const start = performance.now() + 300;
        const tick = (now) => {
            const t = Math.max(0, Math.min((now - start) / 900, 1));
            money.textContent = `$${(end * (1 - Math.pow(1 - t, 3))).toFixed(2)}`;
            if (t < 1) requestAnimationFrame(tick);
        };
        money.textContent = "$0.00";
        requestAnimationFrame(tick);
    }
})();