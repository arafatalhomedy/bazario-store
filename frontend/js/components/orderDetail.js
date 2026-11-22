/**
 * Order details: the motion on top of the order Django already filled in.
 *
 *  1. Journey      stops placed on the curve, parcel travels, road draws, current flows
 *  2. Ring %       the percentage counts up with the ring
 *  3. Copy         copy the order number
 *  4. Buy again    put a product back in the basket (photo flies to the cart)
 *  5. Barcode      bars made from the order number + receipt tilt
 *
 * HTML: pages/order.html + pages/orders/{hero,journey,details}.html
 * Styles: css/orders/order.css
 */
import { el } from "../utils/dom.js";
import { hasFinePointer, prefersReducedMotion } from "../utils/motion.js";
import { addProductToCart } from "./cartActions.js";

const VIEW_W = 640;           // the journey's viewBox size
const VIEW_H = 220;
const TRAVEL_MS = 2400;       // parcel travel time
const TRAVEL_DELAY_MS = 900;  // let the stops pop in first
const STOP_POP_MS = 160;      // delay between stops popping in
const FLOW_STEP = 4;          // detail of the flowing current (smaller = smoother)
const PERCENT_MS = 1500;
const TILT_DEG = 10;
const TOAST_MS = 2200;
const GHOST_MS = 2600;        // one run of the light ahead
const STEPS = { pending: 1, confirmed: 2, shipped: 3, delivered: 4, cancelled: 0 };

let ui = null;

/** Start the order details page. Called once by pages/order.js. */
export function initOrderDetail() {
    const root = document.querySelector("[data-order]");
    if (!root) return;

    ui = {
        root,
        toast: root.querySelector("[data-toast]"),
        reduced: prefersReducedMotion(),
    };

    setupJourney(root.querySelector("[data-route]"));
    setupPercent(root.querySelector("[data-percent]"), STEPS[root.dataset.status] ?? 0);
    setupCopy(root.querySelector("[data-copy]"));
    setupBuyAgain(root);
    setupBarcode(root.querySelector("[data-barcode]"));
    setupTilt(root.querySelector("[data-receipt]"));
    setupSpotlight(root);
}

/* ------------------------------------------------------------------ 1. Journey */
function setupJourney(route) {
    if (!route) return;   // cancelled orders have no road
    if (window.matchMedia("(max-width: 640px)").matches) return;   // phones: CSS timeline

    const path = route.querySelector("[data-route-path]");
    const done = route.querySelector("[data-route-done]");
    const flow = route.querySelector("[data-route-flow]");
    const parcel = route.querySelector("[data-route-parcel]");
    const stops = [...route.querySelectorAll("[data-route-stop]")];
    const length = path.getTotalLength();

    // Remember each stop's final state, then clear it so it can light up when reached
    const states = stops.map((stop) => (stop.classList.contains("is-current") ? "is-current" : stop.classList.contains("is-done") ? "is-done" : ""));
    const currentIndex = states.indexOf("is-current");
    const target = currentIndex >= 0 ? Number(stops[currentIndex].dataset.at) : 0;

    // Put every stop exactly on the curve (in %, so it scales with the screen)
    stops.forEach((stop) => {
        const point = path.getPointAtLength(length * Number(stop.dataset.at));
        stop.style.setProperty("--x", `${(point.x / VIEW_W) * 100}%`);
        stop.style.setProperty("--y", `${(point.y / VIEW_H) * 100}%`);
        stop.classList.remove("is-done", "is-current");
    });
    route.classList.add("is-placed");

    // The travelled road starts hidden
    done.style.strokeDasharray = String(length);
    done.style.strokeDashoffset = String(length);

    const placeParcel = (distance) => {
        const point = path.getPointAtLength(distance);
        parcel.style.setProperty("--px", `${(point.x / VIEW_W) * 100}%`);
        parcel.style.setProperty("--py", `${(point.y / VIEW_H) * 100}%`);
    };

    const light = (progress) => {
        stops.forEach((stop, index) => {
            if (states[index] && Number(stop.dataset.at) <= progress + 0.001) stop.classList.add(index === currentIndex ? "is-done" : states[index]);
        });
    };

    const arrive = () => {
        const distance = length * target;
        done.style.strokeDashoffset = String(length - distance);
        placeParcel(distance);
        light(target);
        if (currentIndex >= 0) {
            stops[currentIndex].classList.remove("is-done");
            stops[currentIndex].classList.add("is-current");
        }
        flow.setAttribute("d", partOfPath(path, distance));
        route.classList.add("is-arrived");
        startGhost(route, path, distance, length);
    };

    // Reduced motion: show the finished journey straight away
    if (ui.reduced) {
        stops.forEach((stop) => stop.classList.add("is-shown"));
        arrive();
        return;
    }

    // The stops pop in one by one
    stops.forEach((stop, index) => {
        setTimeout(() => stop.classList.add("is-shown"), 300 + index * STOP_POP_MS);
    });

    // The parcel travels and the road draws behind it
    placeParcel(0);
    setTimeout(() => {
        const start = performance.now();
        const step = (now) => {
            const t = Math.min((now - start) / TRAVEL_MS, 1);
            const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // slow, fast, slow
            const distance = length * target * eased;
            done.style.strokeDashoffset = String(length - distance);
            placeParcel(distance);
            light(target * eased);
            if (t < 1) requestAnimationFrame(step);
            else arrive();
        };
        requestAnimationFrame(step);
    }, TRAVEL_DELAY_MS);
}

/** The part of the road from the start to `distance`, as a new path (for the flowing current). */
function partOfPath(path, distance) {
    if (distance <= 0) return "";
    const points = [];
    for (let d = 0; d < distance; d += FLOW_STEP) points.push(path.getPointAtLength(d));
    points.push(path.getPointAtLength(distance));
    return points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

/* ------------------------------------------------------------------ 2. Ring % */
function setupPercent(node, step) {
    if (!node) return;
    const end = step * 25;
    if (ui.reduced || end === 0) {
        node.textContent = `${end}%`;
        return;
    }
    const start = performance.now() + 500;   // same delay as the ring
    const tick = (now) => {
        const t = Math.max(0, Math.min((now - start) / PERCENT_MS, 1));
        node.textContent = `${Math.round(end * (1 - Math.pow(1 - t, 3)))}%`;
        if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ 3. Copy */
function setupCopy(button) {
    if (!button) return;
    const label = button.querySelector("[data-copy-label]");
    let timer = null;

    button.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(button.dataset.copy);
            label.textContent = "Copied ✓";
            button.classList.add("is-copied");
            toast("Order number copied");
        } catch {
            toast("Couldn't copy. Select the number and copy it.");
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
            label.textContent = "Copy number";
            button.classList.remove("is-copied");
        }, TOAST_MS);
    });
}

/* ------------------------------------------------------------------ 4. Buy again */
function setupBuyAgain(root) {
    root.querySelectorAll("[data-buy-again]").forEach((button) => {
        const label = button.querySelector("span");
        button.addEventListener("click", async () => {
            if (button.getAttribute("aria-busy") === "true") return;
            button.setAttribute("aria-busy", "true");
            const photo = button.closest(".order-item")?.querySelector("img");

            try {
                await addProductToCart(Number(button.dataset.buyAgain), 1, { photo });
                button.classList.add("is-done");
                label.textContent = "Added ✓";
                toast("Added to your basket");
                setTimeout(() => {
                    button.classList.remove("is-done");
                    label.textContent = "Buy again";
                }, TOAST_MS);
            } catch (error) {
                toast(error?.data?.detail || "Couldn't add it. Please try again.");
            } finally {
                button.removeAttribute("aria-busy");
            }
        });
    });
}

/* ------------------------------------------------------------------ 5. Barcode + tilt */
function setupBarcode(box) {
    if (!box) return;
    const bars = [];
    [...(box.dataset.barcode || "")].forEach((char, c) => {
        const value = char.charCodeAt(0);
        for (let b = 0; b < 3; b += 1) {
            const bar = el("span");
            bar.style.setProperty("--w", String(((value >> b) % 3) + 1));
            bar.style.setProperty("--o", (value + b) % 4 === 0 ? "0.25" : "0.9");
            bar.style.setProperty("--i", String(c * 3 + b));
            bars.push(bar);
        }
    });
    box.replaceChildren(...bars);
}

function setupTilt(tile) {
    const paper = tile?.querySelector("[data-receipt-paper]");
    if (!paper || ui.reduced || !hasFinePointer()) return;

    let frame = null;
    tile.addEventListener("pointermove", (event) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            const box = tile.getBoundingClientRect();
            paper.style.setProperty("--ry", `${((event.clientX - box.left) / box.width - 0.5) * TILT_DEG}deg`);
            paper.style.setProperty("--rx", `${-((event.clientY - box.top) / box.height - 0.5) * TILT_DEG}deg`);
        });
    });
    tile.addEventListener("pointerleave", () => {
        paper.style.setProperty("--ry", "0deg");
        paper.style.setProperty("--rx", "0deg");
    });
}

/* ------------------------------------------------------------------ Running light + spotlight */
/** A small light keeps running along the road still ahead: from the parcel to your home. */
function startGhost(route, path, from, length) {
    if (ui.reduced || from >= length - 1) return;   // delivered: nothing ahead
    const ghost = el("span", { className: "route__ghost", attrs: { "aria-hidden": "true" } });
    route.append(ghost);

    const start = performance.now();
    const tick = (now) => {
        const t = ((now - start) % GHOST_MS) / GHOST_MS;          // 0 → 1, again and again
        const point = path.getPointAtLength(from + (length - from) * t);
        ghost.style.setProperty("--gx", `${(point.x / VIEW_W) * 100}%`);
        ghost.style.setProperty("--gy", `${(point.y / VIEW_H) * 100}%`);
        ghost.style.opacity = String(Math.sin(t * Math.PI));       // fades in and out
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

/** A soft glow follows the mouse inside each tile. */
function setupSpotlight(root) {
    if (ui.reduced || !hasFinePointer()) return;
    root.querySelectorAll(".order-hero, .journey-tile, .order-tile").forEach((tile) => {
        tile.addEventListener("pointermove", (event) => {
            const box = tile.getBoundingClientRect();
            tile.style.setProperty("--mx", `${event.clientX - box.left}px`);
            tile.style.setProperty("--my", `${event.clientY - box.top}px`);
        });
    });
}

/* ------------------------------------------------------------------ Toast */
let toastTimer = null;
function toast(message) {
    if (!ui.toast) return;
    ui.toast.replaceChildren(el("span", { text: message }));
    ui.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove("is-visible"), TOAST_MS);
}