const gallery = document.getElementById("bazario-category-gallery");
const panel = gallery.querySelector("[data-category-panel]");
const status = gallery.querySelector("[data-category-status]");
const requestHeaders = { "X-Bazario-Panel": "category" };
const editorFragment = "[data-category-editor-fragment]";
const deleteFragment = "[data-category-delete-fragment]";

let openEditor;
let openDelete;
let pending;
let saving = false;

gallery.querySelector("#searchbar")?.setAttribute("placeholder", "Search categories…");

function tile(link) {
    return link?.closest("[data-category]");
}

function closeEditor() {
    panel.close();
    panel.replaceChildren();
    gallery.querySelector("[data-selected]")?.removeAttribute("data-selected");
    openEditor?.focus();
    openEditor = undefined;
}

function closeDelete(focus = false) {
    if (!openDelete) return;

    const slot = tile(openDelete).querySelector("[data-confirmation-slot]");
    slot.hidden = true;
    slot.replaceChildren();
    openDelete.setAttribute("aria-expanded", "false");

    if (focus) openDelete.focus();
    openDelete = undefined;
}

function updatePreview(input) {
    const name = input.value.trim() || "New category";

    for (const label of panel.querySelectorAll("[data-category-preview-name]")) {
        label.textContent = name;
    }

    const url = panel.querySelector("[data-category-url-preview]");
    if (!url) return;

    const slug = input.value.normalize("NFKD").toLowerCase()
        .replace(/[^\x00-\x7f]/g, "")
        .replace(/[^a-z0-9_\s-]/g, "")
        .replace(/[-\s]+/g, "-")
        .replace(/^[-_]+|[-_]+$/g, "");

    url.textContent = url.dataset.shopUrl + "?category="
        + (slug || (input.value.trim() ? "item" : "your-category"));
}

function mountEditor(fragment, link) {
    panel.replaceChildren(fragment);
    gallery.querySelector("[data-selected]")?.removeAttribute("data-selected");
    tile(link)?.setAttribute("data-selected", "");
    openEditor = link;

    const input = fragment.querySelector("input[name=name]");
    updatePreview(input);

    if (!panel.open) panel.showModal();
    input.focus();
}

function mountDelete(fragment, link) {
    closeDelete();
    openDelete = link;

    const slot = tile(link).querySelector("[data-confirmation-slot]");
    slot.replaceChildren(fragment);
    slot.hidden = false;
    link.setAttribute("aria-expanded", "true");
    fragment.querySelector("[data-cancel-category-delete]").focus();
}

async function parseFragment(response, selector) {
    if (!response.ok) return null;

    const page = new DOMParser().parseFromString(await response.text(), "text/html");
    return page.querySelector(selector);
}

async function loadPanel(link, isDelete) {
    pending?.abort();

    if (isDelete && openDelete === link) {
        closeDelete(true);
        status.textContent = "";
        return;
    }

    closeDelete();

    const controller = new AbortController();
    pending = controller;
    status.textContent = isDelete ? "Loading delete confirmation…" : "Loading editor…";

    try {
        const response = await fetch(link.href, {
            headers: requestHeaders,
            signal: controller.signal,
        });

        const fragment = await parseFragment(response, isDelete ? deleteFragment : editorFragment);
        if (controller.signal.aborted) return;

        if (fragment) {
            if (isDelete) mountDelete(fragment, link);
            else mountEditor(fragment, link);
        } else {
            window.location.assign(link.href);
        }
    } catch (error) {
        if (error.name !== "AbortError") window.location.assign(link.href);
    } finally {
        if (pending === controller) {
            pending = undefined;
            status.textContent = "";
        }
    }
}

gallery.addEventListener("click", event => {
    const control = event.target.closest(
        "[data-category-editor], [data-category-delete], [data-close-category-panel], [data-cancel-category-delete]",
    );

    if (!control || event.defaultPrevented || event.button !== 0
        || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    if (saving) return;

    if (control.matches("[data-close-category-panel]")) {
        pending?.abort();
        closeEditor();
    } else if (control.matches("[data-cancel-category-delete]")) {
        closeDelete(true);
    } else {
        loadPanel(control, control.matches("[data-category-delete]"));
    }
});

panel.addEventListener("input", event => {
    if (event.target.matches("input[name=name]")) updatePreview(event.target);
});

panel.addEventListener("cancel", event => {
    event.preventDefault();
    if (!saving) closeEditor();
});

gallery.addEventListener("submit", async event => {
    const form = event.target.closest("[data-category-mutation]");
    if (!form) return;

    event.preventDefault();
    if (saving) return;

    saving = true;
    pending?.abort();
    pending = undefined;

    const isDelete = Boolean(form.closest(deleteFragment));
    const link = isDelete ? openDelete : openEditor;
    const notice = isDelete ? status : form.querySelector("[data-category-editor-status]");
    const submitter = event.submitter;
    const data = new FormData(form, submitter ?? undefined);

    if (submitter) submitter.disabled = true;
    notice.textContent = isDelete ? "Deleting category…" : "Saving category…";

    try {
        const response = await fetch(form.action, {
            method: "POST",
            headers: requestHeaders,
            body: data,
            redirect: "manual",
        });

        if (response.type === "opaqueredirect") {
            window.location.reload();
            return;
        }

        const fragment = await parseFragment(response, isDelete ? deleteFragment : editorFragment);
        if (fragment) {
            notice.textContent = "";
            if (isDelete) mountDelete(fragment, link);
            else mountEditor(fragment, link);
        } else {
            notice.textContent = "The server could not complete the request.";
        }
    } catch {
        notice.textContent = "The connection was interrupted. Reload the page to check the result.";
    } finally {
        saving = false;
        if (submitter) submitter.disabled = false;
    }
});