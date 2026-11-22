const hero = document.querySelector("[data-orders-hero]");
const button = hero?.querySelector("[data-orders-motion]");

if (button) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function setMotion(playing) {
        hero.dataset.motion = playing ? "playing" : "paused";
        button.textContent = playing ? "Pause motion" : "Play motion";
    }

    button.addEventListener("click", () => {
        setMotion(hero.dataset.motion !== "playing");
    });

    reducedMotion.addEventListener("change", (event) => {
        setMotion(!event.matches);
    });

    setMotion(!reducedMotion.matches);
    button.hidden = false;
}