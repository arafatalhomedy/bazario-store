/**
 * Basket page controller: starts every feature on the basket page (/cart/).
 * Shared parts (navbar, footer, animations) are the same files as the other pages.
 */
import { initMagnetic } from "../animations/magnetic.js";
import { initProductMorph } from "../animations/morph.js";
import { splitAll } from "../animations/splitText.js";
import { initBasket } from "../components/basket.js";
import { initBasketSuggestions } from "../components/basketSuggestions.js";
import { initFooter } from "../components/footer.js";
import { initHeader } from "../components/header.js";

function init() {
    initHeader();        // navbar: menus, theme, scroll effects
    splitAll();          // "Your basket": letters rise one by one
    initBasketSuggestions(); // "Complete your basket" (listens before the basket loads)
    initBasket();            // ticket, items, quantity, remove + undo, slim bar (+ navbar count)
    initMagnetic();      // buttons that lean toward the mouse
    initFooter();        // footer: coins, liquid name, back to top
    initProductMorph();  // smooth photo morph when opening a product
}

init();