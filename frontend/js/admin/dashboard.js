/**
 * Admin dashboard: greeting by time of day, live clock, number cards count up.
 * HTML: pages/admin/index.html · CSS: css/admin/dashboard-v2.css
 */
(function () {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // "Welcome back," → Good morning / afternoon / evening
    const hello = document.querySelector("[data-bz-hello]");
    if (hello) {
        const hour = new Date().getHours();
        hello.textContent = hour < 12 ? "Good morning," : hour < 18 ? "Good afternoon," : "Good evening,";
    }

    // Words of the greeting roll in
    const title = document.querySelector("[data-bz-greeting]");
    if (title && !reduced) {
        let index = 0;
        title.querySelectorAll("span").forEach((part) => {
            const words = part.textContent.trim().split(/\s+/);
            part.replaceChildren(...words.flatMap((word, i) => {
                const span = document.createElement("span");
                span.className = "bz-word";
                span.style.setProperty("--i", String(index++));
                span.textContent = word;
                return i ? [document.createTextNode(" "), span] : [span];
            }));
        });
    }

    // Live clock with a blinking colon
    const clock = document.querySelector("[data-bz-clock]");
    if (clock) {
        const tick = () => {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, "0");
            const minutes = String(now.getMinutes()).padStart(2, "0");
            clock.innerHTML = `${hours}<i>:</i>${minutes}`;
        };
        tick();
        setInterval(tick, 10000);
    }

    // Number cards count up
    if (!reduced) {
        document.querySelectorAll("[data-bz-count]").forEach((node, i) => {
            const end = Number(node.textContent.trim()) || 0;
            if (!end) return;
            const start = performance.now() + 300 + i * 80;
            const step = (now) => {
                const t = Math.max(0, Math.min((now - start) / 900, 1));
                node.textContent = String(Math.round(end * (1 - Math.pow(1 - t, 3))));
                if (t < 1) requestAnimationFrame(step);
            };
            node.textContent = "0";
            requestAnimationFrame(step);
        });
    }
})();