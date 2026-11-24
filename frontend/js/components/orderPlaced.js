/**
 * Order placed pop-up on the checkout page.
 * Fills the <dialog data-placed> with the new order and opens it in a circle
 * that grows out of the button the customer held.
 */
import { formatPrice } from "../utils/format.js";
import { prefersReducedMotion } from "../utils/motion.js";

const SPARKS = 14;          // dots that burst out of the check
const CONFETTI = 46;        // confetti pieces
const MAX_PHOTOS = 3;       // fanned product photos
const FAN_TILT = [-10, 0, 10];
const CLOSE_MS = 600;       // close animation before leaving
const CONFETTI_COLORS = ["#ff5a36", "#8ac926", "#7c5cff", "#f2a900"];

/**
 * Show the pop-up for a placed order.
 * @param {object} order  the order the API returned
 * @param {Element} origin  the button the pop-up grows out of
 */
export function showOrderPlaced(order, origin) {
    const dialog = document.querySelector("[data-placed]");
    if (!dialog) return false;

    const reduced = prefersReducedMotion();
    const trackUrl = `/orders/${encodeURIComponent(order.number)}/`;
    const find = (name) => dialog.querySelector(`[data-placed-${name}]`);

    fillTitle(find("title"), order.full_name);
    fillPhotos(find("photos"), order.items || []);
    find("count").textContent = plural(order.item_count ?? (order.items || []).length, "item");
    find("total").textContent = formatPrice(order.total);
    fillNumber(find("number"), order.number, reduced);
    find("track").href = trackUrl;
    addSparks(find("check"));
    setupCopy(find("copy"), find("stub"), order.number);

    // Closing (×, Esc, click outside) also leaves the checkout, because the basket is now empty
    const leave = () => closeThen(dialog, reduced, () => { window.location.href = "/#shop"; });
    find("close").addEventListener("click", leave);
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); leave(); });
    dialog.addEventListener("click", (event) => {
        if (event.target !== dialog) return;
        const box = dialog.getBoundingClientRect();
        const inside = event.clientX >= box.left && event.clientX <= box.right
            && event.clientY >= box.top && event.clientY <= box.bottom;
        if (!inside) leave();
    });

    dialog.showModal();
    growFrom(dialog, origin);
    requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add("is-open")));
    find("track").focus({ preventScroll: true });
    if (!reduced) confetti(dialog);
    return true;
}

/* "It's yours, Arafat!" → each word rolls in */
function fillTitle(node, fullName) {
    const first = (fullName || "").trim().split(/\s+/)[0] || "";
    const name = first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
    const words = name ? ["It's", "yours,", `${name}!`] : ["It's", "yours!"];
    node.replaceChildren(...words.flatMap((word, index) => {
        const span = document.createElement("span");
        span.className = "placed__word";
        span.style.setProperty("--i", index);
        span.textContent = word;
        return index ? [document.createTextNode(" "), span] : [span];
    }));
}

/* Up to 3 product photos, fanned like cards */
function fillPhotos(node, items) {
    const photos = items.filter((item) => item.image).slice(0, MAX_PHOTOS);
    node.replaceChildren(...photos.map((item, index) => {
        const img = document.createElement("img");
        img.src = item.image;
        img.alt = "";
        img.width = 64;
        img.height = 64;
        img.decoding = "async";
        img.style.setProperty("--i", index);
        img.style.setProperty("--r", `${photos.length === 1 ? 0 : FAN_TILT[index]}deg`);
        return img;
    }));
}

/* "BZ-705917" → each digit spins like a slot machine */
function fillNumber(node, number, reduced) {
    node.setAttribute("aria-label", number);
    node.replaceChildren();
    [...number].forEach((char, index) => {
        if (reduced || !/\d/.test(char)) {
            const plain = document.createElement("span");
            plain.textContent = char;
            plain.setAttribute("aria-hidden", "true");
            node.append(plain);
            return;
        }
        const digit = document.createElement("span");
        digit.className = "placed__digit";
        digit.setAttribute("aria-hidden", "true");
        const strip = document.createElement("span");
        strip.className = "placed__strip";
        for (let k = 0; k <= 9; k += 1) strip.append(spanOf(k));
        strip.append(spanOf(char));
        digit.append(strip);
        node.append(digit);
        strip.style.transitionDelay = `${1.2 + index * 0.08}s`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            strip.style.transform = "translateY(-10.5em)";
        }));
    });
}

function addSparks(check) {
    for (let i = 0; i < SPARKS; i += 1) {
        const spark = document.createElement("span");
        spark.className = "placed__spark";
        const angle = (i / SPARKS) * Math.PI * 2;
        spark.style.setProperty("--dx", `${Math.cos(angle) * 70}px`);
        spark.style.setProperty("--dy", `${Math.sin(angle) * 70}px`);
        check.append(spark);
    }
}

function setupCopy(button, stub, number) {
    let timer = 0;
    button.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(number);
        } catch {
            return;   // clipboard blocked: the number is still on screen
        }
        button.classList.add("is-copied");
        button.textContent = "Copied ✓";
        stub.classList.remove("is-wiggle");
        void stub.offsetWidth;
        stub.classList.add("is-wiggle");
        clearTimeout(timer);
        timer = setTimeout(() => {
            button.classList.remove("is-copied");
            button.textContent = "Copy";
        }, 1800);
    });
}

/* The circle starts at the centre of the held button */
function growFrom(dialog, origin) {
    if (!origin) return;
    const from = origin.getBoundingClientRect();
    const box = dialog.getBoundingClientRect();
    const x = ((from.left + from.width / 2 - box.left) / box.width) * 100;
    const y = ((from.top + from.height / 2 - box.top) / box.height) * 100;
    dialog.style.setProperty("--cx", `${Math.min(100, Math.max(0, x))}%`);
    dialog.style.setProperty("--cy", `${Math.min(100, Math.max(0, y))}%`);
}

function closeThen(dialog, reduced, next) {
    dialog.classList.remove("is-open");
    setTimeout(() => {
        dialog.close();
        next();
    }, reduced ? 0 : CLOSE_MS);
}

function confetti(dialog) {
    for (let i = 0; i < CONFETTI; i += 1) {
        const piece = document.createElement("span");
        piece.className = "placed__confetti";
        piece.setAttribute("aria-hidden", "true");
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        piece.style.setProperty("--x", `${(Math.random() - 0.5) * 180}px`);
        piece.style.animationDuration = `${2 + Math.random() * 1.6}s`;
        piece.style.animationDelay = `${0.6 + Math.random() * 0.5}s`;
        piece.addEventListener("animationend", () => piece.remove());
        dialog.append(piece);
    }
}

function spanOf(text) {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
}

function plural(count, word) {
    return `${count} ${count === 1 ? word : `${word}s`}`;
}