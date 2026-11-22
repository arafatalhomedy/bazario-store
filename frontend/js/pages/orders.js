/**
 * Your orders page controller: starts every feature on /orders/.
 */
import { initMagnetic } from "../animations/magnetic.js";
import { splitAll } from "../animations/splitText.js";
import { initCartCount } from "../components/cartActions.js";
import { initFooter } from "../components/footer.js";
import { initHeader } from "../components/header.js";
import { initOrdersList } from "../components/ordersList.js";

function init() {
    initHeader();       // navbar: menus, theme, scroll effects
    initCartCount();    // navbar basket count
    splitAll();         // "Every order, in one place.": letters rise
    initOrdersList();   // counters, filters, tilt, Track by number
    initMagnetic();     // buttons that lean toward the mouse
    initFooter();       // footer: coins, liquid name, back to top
}

init();