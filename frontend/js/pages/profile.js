import { initHeader } from "../components/header.js";
import { initCartCount } from "../components/cartActions.js";

function lockOnSubmit(form, pendingLabel) {
    const button = form.querySelector(".profile-save");
    const originalLabel = button.textContent.trim();

    form.addEventListener("submit", (event) => {
        if (button.disabled) {
            event.preventDefault();
            return;
        }

        button.disabled = true;
        button.textContent = pendingLabel;
    });

    window.addEventListener("pageshow", () => {
        button.disabled = false;
        button.textContent = originalLabel;
    });
}

initHeader();
initCartCount();

lockOnSubmit(document.querySelector(".profile-username-edit form"), "Saving…");
lockOnSubmit(document.querySelector(".profile-password form"), "Updating…");