/**
 * Product page controller: starts every feature on the product page.
 * Shared parts (navbar, footer, animations) are the same files as the homepage.
 */
import { initMagnetic } from "../animations/magnetic.js";
import { initProductMorph } from "../animations/morph.js";
import { initCartCount } from "../components/cartActions.js";
import { splitAll } from "../animations/splitText.js";
import { initFooter } from "../components/footer.js";
import { initHeader } from "../components/header.js";
import { initProductDetails } from "../components/productDetails.js";

function init() {
    initHeader();          // navbar: menus, theme, scroll effects
    initCartCount();       // navbar: real number of items in the basket
    splitAll();            // product name: letters rise one by one
    initProductDetails();  // tint, price, stock, tilt, quantity, sections, zoom, add to cart
    initMagnetic();        // buttons that lean toward the mouse
    initFooter();          // footer: coins, liquid name, back to top
    initProductMorph();    // clicked suggestion photo flies into the stage
    document.querySelector("[data-product-back]")?.addEventListener("click", (event) => {
        if (event.defaultPrevented || event.button !== 0 ||
            event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

        const canGoBack = window.navigation?.canGoBack ??
            (history.length > 1 && document.referrer.startsWith(location.origin + "/"));

        if (canGoBack) {
            event.preventDefault();
            history.back();
        }
    });
}

init();