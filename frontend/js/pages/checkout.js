/**
 * Checkout page controller: starts every feature on /checkout/.
 * Shared parts (navbar, footer, animations) are the same files as the other pages.
 */
import { initMagnetic } from "../animations/magnetic.js";
import { splitAll } from "../animations/splitText.js";
import { initCheckout } from "../components/checkout.js";
import { initFooter } from "../components/footer.js";
import { initHeader } from "../components/header.js";

function init() {
    initHeader();      // navbar: menus, theme, scroll effects
    splitAll();        // "Almost yours.": letters rise one by one
    initCheckout();    // order summary, fields, progress, hold to place (+ navbar count)
    initMagnetic();    // buttons that lean toward the mouse
    initFooter();      // footer: coins, liquid name, back to top
}

init();