/**
 * Order details page controller: starts every feature on /orders/<number>/.
 */
import { initMagnetic } from "../animations/magnetic.js";
import { splitAll } from "../animations/splitText.js";
import { initCartCount } from "../components/cartActions.js";
import { initFooter } from "../components/footer.js";
import { initHeader } from "../components/header.js";
import { initOrderDetail } from "../components/orderDetail.js";

function init() {
    initHeader();        // navbar: menus, theme, scroll effects
    initCartCount();     // navbar basket count
    splitAll();          // the big status: letters rise
    initOrderDetail();   // journey, ring %, copy, buy again, barcode, tilt
    initMagnetic();      // buttons that lean toward the mouse
    initFooter();        // footer: coins, liquid name, back to top
}

init();