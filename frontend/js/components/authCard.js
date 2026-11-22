/**
 * Log in / Sign up: the flip card with orbiting products.
 *
 *  1. Start      open the side from the address (/account/login/ or /account/signup/)
 *  2. Orbits     real product photos on two rings
 *  3. Flip       one smooth 3D turn, light sweep, orbits speed up, word rolls
 *  4. Depth      card tilt + parallax with the mouse
 *  5. Password   eye button + strength meter
 *  6. Send       log in or sign up, then return to the requested page
 *
 * HTML: pages/auth.html · Styles: css/account/auth.css
 */
import { apiRequest } from "../api/client.js";
import { fetchProducts } from "../api/products.js";
import { el } from "../utils/dom.js";
import { hasFinePointer, prefersReducedMotion } from "../utils/motion.js";

const SIDES = {
    login: { word: "Hello", path: "/account/login/", focus: "#login-identifier" },
    signup: { word: "Join", path: "/account/signup/", focus: "#signup-name" },
};
const FLIP_MS = 1000;
const ORBIT_FAST = 8;
const OUTER_COINS = 10;
const INNER_COINS = 7;
const MIN_PASSWORD = 10;
const GO_MS = 700;
const METER_COLORS = ["", "#ff6b5a", "#f2a900", "#9bd44a", "var(--color-accent)"];

let ui = null;
let side = "login";
let flipping = false;

/** Start the account page. Called once by pages/auth.js. */
export function initAuthCard() {
    const root = document.querySelector("[data-auth]");
    if (!root) return;

    ui = {
        root,
        word: root.querySelector("[data-auth-word]"),
        orbits: root.querySelector("[data-orbits]"),
        tilt: root.querySelector("[data-auth-tilt]"),
        card: root.querySelector("[data-auth-card]"),
        inner: root.querySelector("[data-auth-inner]"),
        buttons: [...root.querySelectorAll("[data-switch]")],
        faces: {
            login: root.querySelector('[data-face="login"]'),
            signup: root.querySelector('[data-face="signup"]'),
        },
        reduced: prefersReducedMotion(),
    };

    show(root.dataset.side === "signup" ? "signup" : "login");
    setWord(SIDES[side].word, false);

    ui.buttons.forEach((button) => button.addEventListener("click", () => flip(button.dataset.switch)));
    setupOrbits();
    setupDepth();
    setupPasswords();
    setupForm(ui.faces.login, "login");
    setupForm(ui.faces.signup, "signup");
}

/* ------------------------------------------------------------------ 1. Start / show a side */
function show(name) {
    side = name;
    ui.root.dataset.side = name;
    ui.faces.login.hidden = name !== "login";
    ui.faces.signup.hidden = name !== "signup";
    ui.buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.switch === name)));
}

/* ------------------------------------------------------------------ 2. Orbits */
async function setupOrbits() {
    let photos = [];
    try {
        const page = await fetchProducts({ sort: "newest", pageSize: OUTER_COINS + INNER_COINS });
        photos = page.results.map((product) => product.thumbnail).filter(Boolean);
    } catch {
        return;
    }
    if (!photos.length) return;

    const fill = (ring, count, radius, size, offset) => {
        const coins = Array.from({ length: count }, (_, i) => {
            const coin = el("span", { className: "orbit__coin" }, [
                el("span", { className: "orbit__face" }, [
                    el("img", {
                        attrs: {
                            src: photos[(i + offset) % photos.length],
                            alt: "",
                            width: "80",
                            height: "80",
                            decoding: "async",
                        },
                    }),
                ]),
            ]);
            coin.style.setProperty("--a", `${(360 / count) * i}deg`);
            coin.style.setProperty("--r", radius);
            coin.style.setProperty("--s", size);
            coin.style.setProperty("--n", String(i + offset));
            return coin;
        });
        ring.replaceChildren(...coins);
    };

    fill(ui.orbits.querySelector('[data-orbit="outer"]'), OUTER_COINS, "calc(var(--orbit-outer) / 2)", "3.25rem", 0);
    fill(ui.orbits.querySelector('[data-orbit="inner"]'), INNER_COINS, "calc(var(--orbit-inner) / 2)", "2.4rem", OUTER_COINS);
}

function orbitSpeed(rate) {
    ui.orbits.getAnimations({ subtree: true }).forEach((animation) => {
        if (animation.animationName === "orbit-spin") animation.updatePlaybackRate(rate);
    });
}

/* ------------------------------------------------------------------ 3. Flip */
function flip(target) {
    if (flipping || target === side || !SIDES[target]) return;

    window.history.replaceState(null, "", SIDES[target].path + window.location.search);
    setWord(SIDES[target].word, true);
    clearErrors();

    if (ui.reduced) {
        show(target);
        ui.root.querySelector(SIDES[target].focus)?.focus();
        return;
    }

    flipping = true;
    const turn = target === "signup" ? 1 : -1;

    ui.buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.switch === target)));
    ui.root.dataset.side = target;
    ui.card.classList.remove("is-sweeping");
    void ui.card.offsetWidth;
    ui.card.classList.add("is-sweeping");
    ui.orbits.classList.add("is-wide");
    orbitSpeed(ORBIT_FAST);

    const animation = ui.card.animate(
        [
            { transform: "rotateY(0deg) scale(1)" },
            { transform: `rotateY(${90 * turn}deg) scale(1.06) translateY(-12px)`, offset: 0.5 },
            { transform: `rotateY(${180 * turn}deg) scale(1)` },
        ],
        { duration: FLIP_MS, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
    );

    // Swap faces when the card is edge-on so the next form stays readable.
    setTimeout(() => {
        show(target);
        ui.inner.style.transform = "scaleX(-1)";
    }, FLIP_MS / 2);

    animation.onfinish = () => {
        ui.inner.style.transform = "";
        ui.orbits.classList.remove("is-wide");
        orbitSpeed(1);
        flipping = false;
        ui.root.querySelector(SIDES[target].focus)?.focus({ preventScroll: true });
    };
}

function setWord(text, animate) {
    const build = (from) => [...text].map((char, i) => {
        const letter = el("span", { text: char });
        if (from) {
            letter.style.transform = "translateY(60%) rotate(8deg)";
            letter.style.opacity = "0";
            letter.style.transitionDelay = `${i * 0.04}s`;
        }
        return letter;
    });

    if (!animate || ui.reduced) {
        ui.word.replaceChildren(...build(false));
        return;
    }

    [...ui.word.children].forEach((letter, i) => {
        letter.style.transitionDelay = `${i * 0.03}s`;
        letter.style.transform = "translateY(-60%) rotate(-8deg)";
        letter.style.opacity = "0";
    });

    setTimeout(() => {
        const letters = build(true);
        ui.word.replaceChildren(...letters);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            letters.forEach((letter) => {
                letter.style.transform = "none";
                letter.style.opacity = "1";
            });
        }));
    }, 380);
}

/* ------------------------------------------------------------------ 4. Depth */
function setupDepth() {
    if (ui.reduced || !hasFinePointer()) return;
    let frame = null;

    ui.root.addEventListener("pointermove", (event) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            const box = ui.root.getBoundingClientRect();
            const x = (event.clientX - box.left) / box.width - 0.5;
            const y = (event.clientY - box.top) / box.height - 0.5;
            ui.tilt.style.setProperty("--ty", `${x * 8}deg`);
            ui.tilt.style.setProperty("--tx", `${-y * 8}deg`);
            ui.orbits.style.setProperty("--ox", `${-x * 24}px`);
            ui.orbits.style.setProperty("--oy", `${-y * 24}px`);
            ui.word.style.setProperty("--wx", `${x * 30}px`);
            ui.word.style.setProperty("--wy", `${y * 30}px`);
        });
    });

    ui.root.addEventListener("pointerleave", () => {
        ui.tilt.style.setProperty("--ty", "0deg");
        ui.tilt.style.setProperty("--tx", "0deg");
    });
}

/* ------------------------------------------------------------------ 5. Password */
function setupPasswords() {
    ui.root.querySelectorAll("[data-eye]").forEach((button) => {
        const input = button.closest(".auth-field").querySelector("input");
        button.addEventListener("click", () => {
            const showIt = input.type === "password";
            input.type = showIt ? "text" : "password";
            button.setAttribute("aria-pressed", String(showIt));
            button.setAttribute("aria-label", showIt ? "Hide password" : "Show password");
        });
    });

    const input = ui.root.querySelector("#signup-password");
    const bars = [...ui.root.querySelectorAll("[data-meter] i")];
    const rules = [...ui.root.querySelectorAll("[data-rule]")];

    input?.addEventListener("input", () => {
        const result = passwordRules(input.value);
        const score = Object.values(result).filter(Boolean).length + (input.value.length >= 14 ? 1 : 0);

        bars.forEach((bar, i) => {
            bar.classList.toggle("is-on", i < score);
            bar.style.setProperty("--meter-color", METER_COLORS[score]);
        });
        rules.forEach((rule) => rule.classList.toggle("is-ok", result[rule.dataset.rule]));
    });
}

function passwordRules(value) {
    return {
        length: value.length >= MIN_PASSWORD,
        number: /\d/.test(value),
        case: /[a-z]/.test(value) && /[A-Z]/.test(value),
    };
}

/* ------------------------------------------------------------------ 6. Send */
function setupForm(form, kind) {
    const submit = form.querySelector(".auth-submit");
    const label = form.querySelector("[data-label]");
    const error = form.querySelector("[data-error]");
    const idle = label.textContent;

    form.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", () => {
            input.closest(".auth-field")?.classList.remove("is-invalid");
            error.textContent = "";
        });
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (submit.classList.contains("is-loading")) return;

        const data = Object.fromEntries(new FormData(form));
        const problem = checkForm(kind, data);
        if (problem) {
            fail(form, problem.message, problem.field);
            return;
        }

        submit.classList.add("is-loading");
        label.textContent = kind === "signup" ? "Creating your account…" : "Logging in…";

        try {
            const body = kind === "signup"
                ? { full_name: data.full_name.trim(), email: data.email.trim(), password: data.password }
                : { identifier: data.identifier.trim(), password: data.password, remember: data.remember === "on" };
            const user = await apiRequest(`/api/account/${kind}/`, { method: "POST", body });

            submit.classList.remove("is-loading");
            submit.classList.add("is-done");
            label.textContent = kind === "signup" ? `Welcome, ${user.name} ✓` : `Welcome back, ${user.name} ✓`;

            if (!ui.reduced) {
                ui.orbits.animate(
                    [{ scale: 1 }, { scale: 1.1 }, { scale: 1 }],
                    { duration: 700, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
                );
            }

            setTimeout(() => {
                window.location.href = ui.root.dataset.next || "/orders/";
            }, ui.reduced ? 0 : GO_MS);
        } catch (problemFromServer) {
            submit.classList.remove("is-loading");
            label.textContent = idle;
            const body = problemFromServer?.data || {};

            if (problemFromServer?.status === 429) {
                fail(form, "Too many tries. Please wait a minute and try again.");
            } else {
                const field = body.field || ["full_name", "email", "identifier", "password"]
                    .find((name) => Array.isArray(body[name]));
                const message = body.detail
                    || (field && body[field]?.[0])
                    || "We couldn't reach the shop. Check your connection and try again.";
                fail(form, message, field);
            }
        }
    });
}

function checkForm(kind, data) {
    if (kind === "signup" && (data.full_name || "").trim().length < 2) {
        return { field: "full_name", message: "Enter your full name." };
    }

    if (kind === "signup" && !/^\S+@\S+\.\S+$/.test((data.email || "").trim())) {
        return { field: "email", message: "Enter a valid email address." };
    }

    if (kind === "login" && !(data.identifier || "").trim()) {
        return { field: "identifier", message: "Enter your email or username." };
    }

    if (!data.password) {
        return {
            field: "password",
            message: kind === "signup" ? "Choose a password." : "Enter your password.",
        };
    }

    if (kind === "signup" && !passwordRules(data.password).length) {
        return { field: "password", message: `Use at least ${MIN_PASSWORD} characters.` };
    }

    return null;
}

function fail(form, message, field) {
    form.querySelector("[data-error]").textContent = message;
    const input = field ? form.querySelector(`[name="${field}"]`) : null;
    const box = input?.closest(".auth-field");

    if (box) {
        box.classList.remove("is-invalid");
        void box.offsetWidth;
        box.classList.add("is-invalid");
        input.focus();
    }
}

function clearErrors() {
    ui.root.querySelectorAll("[data-error]").forEach((node) => { node.textContent = ""; });
    ui.root.querySelectorAll(".auth-field.is-invalid").forEach((node) => node.classList.remove("is-invalid"));
}