const workspace = document.getElementById("bazario-workspace");
const dialog = workspace.querySelector("[data-workspace-editor]");
const message = workspace.querySelector("[data-workspace-message]");
const headers = { "X-Bazario-Panel": "product" };
const editorSelector = "[data-product-editor-fragment]";
const deleteSelector = "[data-product-delete-fragment]";

let editorLink;
let deleteLink;
let pending;
let saving = false;

workspace.querySelector("#searchbar")?.setAttribute("placeholder", "Search products…");

function productRow(link) {
    return link?.closest("[data-product-row]");
}

function closeEditor() {
    dialog.close();
    dialog.replaceChildren();
    productRow(editorLink)?.removeAttribute("data-selected");
    editorLink?.focus();
    editorLink = undefined;
}

function closeDelete(restoreFocus = false) {
    if (!deleteLink) return;

    const slot = productRow(deleteLink).querySelector("[data-product-delete-slot]");
    slot.hidden = true;
    slot.replaceChildren();
    deleteLink.setAttribute("aria-expanded", "false");

    if (restoreFocus) deleteLink.focus();
    deleteLink = undefined;
}

function mountEditor(fragment, link) {
    productRow(editorLink)?.removeAttribute("data-selected");
    editorLink = link;
    productRow(link)?.setAttribute("data-selected", "");

    dialog.replaceChildren(fragment);
    fragment.dispatchEvent(new Event("bazario:product-panel", { bubbles: true }));

    if (!dialog.open) dialog.showModal();
    fragment.querySelector("[aria-invalid=true], input[name=name]")?.focus();
}

function mountDelete(fragment, link) {
    deleteLink = link;

    const slot = productRow(link).querySelector("[data-product-delete-slot]");
    slot.replaceChildren(fragment);
    slot.hidden = false;

    link.setAttribute("aria-expanded", "true");
    fragment.querySelector("[data-cancel-delete]")?.focus();
}

async function getFragment(response, selector) {
    if (!response.ok) return null;

    const page = new DOMParser().parseFromString(await response.text(), "text/html");
    return page.querySelector(selector);
}

async function openPanel(link, isDelete) {
    pending?.abort();

    if (isDelete && deleteLink === link) {
        closeDelete(true);
        return;
    }

    closeDelete();
    const request = new AbortController();
    pending = request;
    message.textContent = isDelete ? "Loading delete confirmation…" : "Loading editor…";

    try {
        const response = await fetch(link.href, { headers, signal: request.signal });
        const fragment = await getFragment(response, isDelete ? deleteSelector : editorSelector);
        if (request.signal.aborted) return;

        if (!fragment) window.location.assign(link.href);
        else if (isDelete) mountDelete(fragment, link);
        else mountEditor(fragment, link);
    } catch (error) {
        if (error.name !== "AbortError") window.location.assign(link.href);
    } finally {
        if (pending === request) {
            pending = undefined;
            message.textContent = "";
        }
    }
}

workspace.addEventListener("click", event => {
    const control = event.target.closest(
        "[data-panel-link], [data-delete-link], [data-cancel-delete], [data-close-product-editor]",
    );

    if (!control || event.defaultPrevented || event.button !== 0
        || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    if (saving) return;

    if (control.matches("[data-close-product-editor]")) closeEditor();
    else if (control.matches("[data-cancel-delete]")) closeDelete(true);
    else openPanel(control, control.matches("[data-delete-link]"));
});

dialog.addEventListener("cancel", event => {
    event.preventDefault();
    if (!saving) closeEditor();
});

workspace.addEventListener("submit", async event => {
    const form = event.target.closest("[data-product-mutation]");
    if (!form) return;

    event.preventDefault();
    if (saving) return;

    saving = true;
    pending?.abort();
    pending = undefined;

    const isDelete = Boolean(form.closest(deleteSelector));
    const link = isDelete ? deleteLink : editorLink;
    const notice = isDelete ? message : form.querySelector("[data-editor-message]");
    const button = event.submitter;
    const data = new FormData(form, button ?? undefined);

    if (button) button.disabled = true;
    notice.textContent = isDelete ? "Deleting product…" : "Saving product…";

    try {
        const response = await fetch(form.action, {
            method: "POST",
            headers,
            body: data,
            redirect: "manual",
        });

        if (response.type === "opaqueredirect") {
            if (isDelete) {
                window.location.reload();
            } else {
                form.dispatchEvent(new CustomEvent("bazario:product-saved", { bubbles: true }));
                setTimeout(() => window.location.reload(), 1500);
            }
            return;
        }

        const fragment = await getFragment(response, isDelete ? deleteSelector : editorSelector);

        if (!fragment) {
            notice.textContent = "The server could not complete the request.";
            return;
        }

        notice.textContent = "";
        if (isDelete) mountDelete(fragment, link);
        else mountEditor(fragment, link);
    } catch {
        notice.textContent = "The connection was interrupted. Reload Products to check the result.";
    } finally {
        saving = false;
        if (button) button.disabled = false;
    }
});