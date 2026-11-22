/**
 * Account page controller: /account/login/ and /account/signup/.
 * This page has no navbar and no footer: just the flip card.
 */
import { initMagnetic } from "../animations/magnetic.js";
import { initAuthCard } from "../components/authCard.js";

function init() {
    initAuthCard();    // flip card, orbits, password meter, log in / sign up
    initMagnetic();    // buttons that lean toward the mouse
}

init();