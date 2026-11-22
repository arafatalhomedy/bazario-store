(() => {
    const root = document.querySelector(".bz-delivery");
    if (!root) return;
    const trigger = root.querySelector(".bz-delivery-trigger");
    const fallback = root.querySelector("details");
    const form = root.querySelector("form");
    const dialog = root.querySelector("dialog");
    if (typeof dialog.showModal !== "function") return;

    const hasErrors = fallback.open;
    const fields = Array.from(form.querySelectorAll("[data-saved]"));
    const body = form.querySelector(".bz-delivery-fields");
    dialog.append(form);
    fallback.remove();
    trigger.hidden = false;

    function openEditor() {
        dialog.showModal();
        body.scrollTop = 0;
        const invalid = form.querySelector('[aria-invalid="true"]');
        if (invalid) invalid.focus();
    }
    function closeEditor() {
        if (!dialog.open || dialog.classList.contains("is-closing")) return;
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
            dialog.close();
            return;
        }
        dialog.classList.add("is-closing");
        setTimeout(() => dialog.close(), 150);
    }
    for (const field of fields) {
        const error = field.parentElement.querySelector(".field-error");
        if (error) {
            error.id = "bz-delivery-error-" + field.name;
            field.setAttribute("aria-invalid", "true");
            field.setAttribute("aria-describedby", error.id);
        }
    }
    trigger.addEventListener("click", openEditor);
    form.querySelectorAll("[data-delivery-close]").forEach(button => button.addEventListener("click", closeEditor));
    dialog.addEventListener("cancel", event => { event.preventDefault(); closeEditor(); });
    form.addEventListener("submit", event => {
        if (dialog.classList.contains("is-closing")) event.preventDefault();
    });
    dialog.addEventListener("close", () => {
        dialog.classList.remove("is-closing");
        for (const field of fields) {
            field.value = field.dataset.saved;
            field.removeAttribute("aria-invalid");
            field.removeAttribute("aria-describedby");
        }
        form.querySelectorAll(".field-error").forEach(error => error.remove());
        trigger.focus();
    });
    if (hasErrors) openEditor();
})();
