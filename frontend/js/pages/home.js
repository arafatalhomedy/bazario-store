/**
 * Homepage controller: starts every feature on the homepage.
 * New sections add one line in init().
 */
import { initMagnetic } from "../animations/magnetic.js";
import { initProductMorph } from "../animations/morph.js";
import { initCartCount } from "../components/cartActions.js";
import { splitAll } from "../animations/splitText.js";
import { initHeader } from "../components/header.js";
import { initHero } from "../components/hero.js";
import { initMarquee } from "../components/marquee.js";
import { initShowroom } from "../components/showroom.js";
import { initFooter } from "../components/footer.js";
import { whenNear } from "../utils/lazy.js";

function init() {
    initHeader();    // navbar: menus, highlight, scroll effects, theme, announcement
    initCartCount(); // navbar: real number of items in the basket
    splitAll();      // hero title: letters rise one by one
    initHero();      // hero: photos, changing word, mouse depth, counters, product belt
    whenNear(document.querySelector("[data-marquee]") || document.querySelector(".ribbons"), initMarquee); // category ribbons: start when scrolled near
    whenNear(document.querySelector("[data-showroom]"), initShowroom); // the collection: starts when scrolled near
    initFooter();    // footer: coins rain, liquid name, rolling links, back to top
    initProductMorph(); // clicked product photo flies into the product page
    initMagnetic();  // buttons that lean toward the mouse
}

init();