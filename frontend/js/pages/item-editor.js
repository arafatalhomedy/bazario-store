(() => {
    const form = document.getElementById("item-edit-form");
    const edit = document.getElementById("start-item-edit");
    const dialog = document.getElementById("bz-item-dialog");
    if (!form || !edit || !dialog) return;

    const footer = form.querySelector(".item-edit-footer");
    const totalOutput = footer.querySelector("[data-edit-total]");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const save = footer.querySelector("[data-save]");
    const money = cents => "$" + (cents / 100).toFixed(2);
    const rows = Array.from(form.querySelectorAll(".order-item"), row => {
        const input = row.querySelector("input[type=number]");
        const price = row.querySelector(".order-item__end strong");
        return {
            row, input, price,
            controls: row.querySelector(".item-edit-controls"),
            plus: row.querySelector('[data-step="1"]'),
            minus: row.querySelector('[data-step="-1"]'),
            remove: row.querySelector("[data-remove]"),
            original: Number(input.max), undo: Number(input.max),
            cents: Math.round(Number(row.dataset.unitPrice) * 100),
        };
    });
    const originalTotal = rows.reduce((sum, line) => sum + line.original * line.cents, 0);

    function refresh(animate = true) {
        let total = 0, units = 0, valid = true, changed = false;
        for (const line of rows) {
            const quantity = line.input.valueAsNumber;
            const ok = line.input.validity.valid && Number.isInteger(quantity);
            valid = valid && ok;
            if (ok) {
                total += quantity * line.cents;
                units += quantity;
                changed ||= quantity !== line.original;
            }
            const removed = ok && quantity === 0;
            line.row.classList.toggle("is-removed", removed);
            line.plus.disabled = ok && quantity >= line.original;
            line.minus.disabled = removed;
            line.remove.textContent = removed ? "Undo" : "Remove";
            const name = line.row.querySelector(".order-item__name").textContent.trim();
            line.remove.setAttribute("aria-label", removed ? "Undo removal of " + name : "Remove " + name);
            line.price.textContent = ok ? money(quantity * line.cents) : "—";
        }
        const nextTotal = valid ? money(total) : "—";
        if (animate && !reduceMotion.matches && nextTotal !== totalOutput.textContent) {
            totalOutput.getAnimations().forEach(animation => animation.cancel());
            totalOutput.animate([
                { transform: "translateY(3px)", opacity: .6 },
                { transform: "translateY(0)", opacity: 1 },
            ], { duration: 180, easing: "ease-out" });
        }
        totalOutput.textContent = nextTotal;

        let note = "";
        if (!valid) note = "Enter a whole quantity between zero and the quantity ordered.";
        else if (!units) note = "To remove every item, use Cancel order.";
        else if (changed) note = money(originalTotal - total) + " less to pay on delivery.";
        footer.querySelector("[data-edit-note]").textContent = note;
        save.disabled = !valid || !changed || !units;
    }

    function openEditor() {
        form.reset();
        for (const line of rows) {
            line.undo = line.original;
            line.controls.hidden = false;
        }
        const more = form.querySelector("details");
        if (more) more.open = false;
        refresh(false);
        form.classList.add("is-editing");
        dialog.showModal();
        dialog.querySelector(".bz-dialog-body").scrollTop = 0;
    }
    function closeEditor() {
        if (!dialog.open || dialog.classList.contains("leaving")) return;
        if (reduceMotion.matches) {
            dialog.close();
            return;
        }
        dialog.classList.add("leaving");
        window.setTimeout(() => dialog.close(), 150);
    }
    for (const line of rows) {
        for (const button of [line.minus, line.plus]) {
            button.addEventListener("click", () => {
                const current = line.input.validity.valid ? line.input.valueAsNumber : line.original;
                line.undo = current || line.undo;
                const step = Number(button.dataset.step);
                line.input.value = Math.min(line.original, Math.max(0, current + step));
                refresh();
                if (line.input.valueAsNumber === 0) line.remove.focus();
                else if (button.disabled) line.input.focus();
            });
        }
        line.remove.addEventListener("click", () => {
            if (line.input.valueAsNumber === 0) {
                line.input.value = line.undo;
            } else {
                line.undo = line.input.validity.valid ? line.input.valueAsNumber : line.original;
                line.input.value = 0;
            }
            refresh();
        });
    }
    form.addEventListener("input", event => {
        // Keep the input available while typing, including when typing zero.
        if (event.target.valueAsNumber === 0) event.target.closest(".order-item").querySelector("[data-remove]").focus();
        refresh();
    });
    form.addEventListener("submit", event => {
        if (!dialog.open || dialog.classList.contains("leaving") || save.disabled) event.preventDefault();
    });
    edit.hidden = false;
    edit.addEventListener("click", openEditor);
    dialog.querySelector("[data-close]").addEventListener("click", closeEditor);
    footer.querySelector("[data-discard]").addEventListener("click", closeEditor);
    dialog.addEventListener("cancel", event => {
        event.preventDefault();
        closeEditor();
    });
    dialog.addEventListener("close", () => {
        dialog.classList.remove("leaving");
        form.classList.remove("is-editing");
        edit.focus();
    });
})();
