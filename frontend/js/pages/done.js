/**
 * Done page controller: starts every feature on /checkout/done/<number>/.
 */
import { initMagnetic } from "../animations/magnetic.js";
import { splitAll } from "../animations/splitText.js";
import { initCartCount } from "../components/cartActions.js";
import { initFooter } from "../components/footer.js";
import { initHeader } from "../components/header.js";
import { initOrderDone } from "../components/orderDone.js";

function init() {
    initHeader();      // navbar: menus, theme, scroll effects
    initCartCount();   // navbar basket count (0 after ordering)
    splitAll();        // "It's yours, Sara.": letters rise one by one
    initOrderDone();   // slot machine, copy, barcode, tilt, journey, confetti
    initMagnetic();    // buttons that lean toward the mouse
    initFooter();      // footer: coins, liquid name, back to top
}

init();