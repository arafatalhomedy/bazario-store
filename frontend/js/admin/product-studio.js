/**
 * Product studio (Add / Edit product pop-up)
 *  - 3 sliding steps with a moving pill; steps get ✓ when done, red when the server found an error
 *  - Live 3D card: name types itself, price digits roll, category colour sweeps in,
 *    stock ring fills, "hidden" greys the card, a dropped photo flies onto it
 *  - Category chips, stock − / +, drag & drop photo — all on top of the REAL form fields
 *  - Save: spinner → ✓ → card launches with confetti (the page then refreshes)
 * HTML: products/product/workspace_editor.html + workspace_fields.html
 */
(function () {
    // Same colours as the product cards (by the last digit of the category id)
    const PALETTE = ["#9b5de5", "#7c5cff", "#f2a900", "#16b5a3", "#ff6b4a",
        "#ff4f9a", "#3d8bfd", "#8ac926", "#e76f51", "#2a9d8f"];
    const CONFETTI = ["#ff5a36", "#7c5cff", "#f2a900", "#16b5a3"];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colorFor = (id) => PALETTE[Number(String(id).slice(-1))] || "#ff5a36";

    function setup(studio) {
        if (!studio || studio.dataset.bzReady) return;
        studio.dataset.bzReady = "1";

        const $ = (selector) => studio.querySelector(selector);
        const form = studio.querySelector("form");
        const fields = {
            name: $("#id_name"),
            category: $("#id_category"),
            price: $("#id_price"),
            stock: $("#id_stock"),
            active: $("#id_is_active"),
            image: $(".bz-drop input[type='file']"),
        };
        const card = {
            box: $("[data-bz-card]"),
            name: $("[data-bz-card-name]"),
            tag: $("[data-bz-card-tag]"),
            cat: $("[data-bz-card-cat]"),
            ring: $("[data-bz-card-ring]"),
            stock: $("[data-bz-card-stock]"),
            vis: $("[data-bz-card-vis]"),
            img: $("[data-bz-card-img]"),
        };
        const panes = [...studio.querySelectorAll("[data-bz-pane]")];
        const stepButtons = [...studio.querySelectorAll("[data-bz-step]")];
        const pill = $("[data-bz-pill]");
        const track = $("[data-bz-track]");
        const hasPhoto = () => Boolean(card.img.querySelector("img"));
        let step = 0;

        studio.dataset.mode = /\/add\/?(\?|$)/.test(form.getAttribute("action") || "") ? "add" : "edit";

        // Full-page version: × and Cancel go back to the product list
        const page = studio.closest("[data-bz-list-url]");
        if (page) {
            studio.querySelectorAll("[data-close-product-editor]").forEach((button) => {
                button.addEventListener("click", () => window.location.assign(page.dataset.bzListUrl));
            });
        }

        // Floating labels need a placeholder
        studio.querySelectorAll(".bz-field > input, .bz-field > textarea").forEach((input) => {
            if (!input.placeholder) input.placeholder = " ";
        });

        // Sparks rising on the stage
        const sparks = $("[data-bz-sparks]");
        if (sparks && !reduced) {
            for (let i = 0; i < 14; i += 1) {
                const spark = document.createElement("i");
                spark.style.setProperty("--l", `${Math.random() * 100}%`);
                spark.style.setProperty("--d", `${5 + Math.random() * 6}s`);
                spark.style.animationDelay = `${-Math.random() * 8}s`;
                sparks.append(spark);
            }
        }

        /* ---------------- Live card ---------------- */
        let shownName = "";
        function renderName(value, animate) {
            const cursor = document.createElement("span");
            cursor.className = "bz-cursor";
            if (animate && value.length > shownName.length && value.startsWith(shownName)) {
                const added = document.createElement("span");
                added.className = "bz-ch";
                added.textContent = value.slice(shownName.length);
                card.name.querySelector(".bz-cursor")?.remove();
                card.name.append(added, cursor);
            } else {
                card.name.replaceChildren(...[...value].map((char) => {
                    const span = document.createElement("span");
                    span.textContent = char;
                    return span;
                }), cursor);
            }
            shownName = value;
            if (!hasPhoto()) card.img.textContent = value ? value[0].toUpperCase() : "?";
        }

        function renderPrice() {
            const value = Number.parseFloat(fields.price?.value) || 0;
            const text = `$${value.toFixed(2)}`;
            if (card.tag.dataset.shape !== text.replace(/\d/g, "0") || reduced) {
                card.tag.dataset.shape = text.replace(/\d/g, "0");
                card.tag.replaceChildren(...[...text].map((char) => {
                    if (!/\d/.test(char) || reduced) {
                        const plain = document.createElement("span");
                        plain.textContent = char;
                        return plain;
                    }
                    const wrap = document.createElement("span");
                    wrap.className = "bz-d";
                    const strip = document.createElement("b");
                    for (let k = 0; k <= 9; k += 1) {
                        const digit = document.createElement("span");
                        digit.textContent = String(k);
                        strip.append(digit);
                    }
                    wrap.append(strip);
                    return wrap;
                }));
            }
            const strips = [...card.tag.querySelectorAll(".bz-d b")];
            [...text].filter((char) => /\d/.test(char)).forEach((char, index) => {
                if (strips[index]) strips[index].style.transform = `translateY(${-Number(char) * 1.05}em)`;
            });
        }

        function renderStock() {
            const value = Math.max(0, Number.parseInt(fields.stock?.value, 10) || 0);
            card.stock.textContent = String(value);
            const color = value === 0 ? "#8b8b8b" : value <= 5 ? "#f2a900" : "#16b5a3";
            const fill = value === 0 ? 0 : value <= 5 ? 30 : Math.min(100, 40 + value * 2);
            card.ring.style.setProperty("--sc", color);
            card.ring.style.setProperty("--fill", `${fill}%`);
        }

        function renderVisible() {
            const on = fields.active ? fields.active.checked : true;
            card.vis.textContent = on ? "Visible" : "Hidden";
            card.vis.classList.toggle("is-off", !on);
            card.box.classList.toggle("is-hidden", !on);
        }

        /* ---------------- Category chips + colour sweep ---------------- */
        const chips = $("[data-bz-chips]");
        function setCategory(value, from) {
            const option = [...fields.category.options].find((item) => item.value === value);
            card.cat.textContent = value && option ? option.textContent : "No category";
            chips.querySelectorAll("button").forEach((chip) => {
                chip.setAttribute("aria-pressed", String(chip.dataset.value === value));
            });
            const color = value ? colorFor(value) : "#ff5a36";
            const sweep = $("[data-bz-sweep]");
            if (from && sweep && !reduced) {
                const stage = $("[data-bz-stage]").getBoundingClientRect();
                const chip = from.getBoundingClientRect();
                sweep.style.setProperty("--sx", "100%");
                sweep.style.setProperty("--sy", `${((chip.top - stage.top) / stage.height) * 100}%`);
                sweep.classList.add("is-reset");
                void sweep.offsetWidth;
                studio.style.setProperty("--bz-c", color);
                sweep.classList.remove("is-reset");
            } else {
                studio.style.setProperty("--bz-c", color);
            }
        }

        if (fields.category && chips) {
            [...fields.category.options].filter((option) => option.value).forEach((option) => {
                const chip = document.createElement("button");
                chip.type = "button";
                chip.dataset.value = option.value;
                chip.textContent = option.textContent;
                chip.style.setProperty("--k", colorFor(option.value));
                chip.setAttribute("aria-pressed", "false");
                chip.addEventListener("click", () => {
                    fields.category.value = option.value;
                    fields.category.dispatchEvent(new Event("change", { bubbles: true }));
                    setCategory(option.value, chip);
                    marks();
                });
                chips.append(chip);
            });
        }

        /* ---------------- Stock stepper ---------------- */
        studio.querySelectorAll("[data-bz-stock]").forEach((button) => {
            button.addEventListener("click", () => {
                const next = Math.max(0, (Number.parseInt(fields.stock.value, 10) || 0) + Number(button.dataset.bzStock));
                fields.stock.value = String(next);
                fields.stock.dispatchEvent(new Event("input", { bubbles: true }));
            });
        });

        /* ---------------- Photo: drop or choose ---------------- */
        const drop = $("[data-bz-drop]");
        function showPhoto(file) {
            if (!file || !file.type.startsWith("image/")) return;
            const img = document.createElement("img");
            img.alt = "";
            img.src = URL.createObjectURL(file);
            card.img.replaceChildren(img);
            card.img.classList.remove("is-landing");
            void card.img.offsetWidth;
            card.img.classList.add("is-landing");
            const label = $("[data-bz-drop-text]");
            if (label) label.textContent = `✓ ${file.name}`;
            marks();
        }
        if (drop && fields.image) {
            ["dragenter", "dragover"].forEach((type) => drop.addEventListener(type, (event) => {
                event.preventDefault();
                drop.classList.add("is-over");
            }));
            ["dragleave", "drop"].forEach((type) => drop.addEventListener(type, (event) => {
                event.preventDefault();
                drop.classList.remove("is-over");
            }));
            drop.addEventListener("drop", (event) => {
                const files = event.dataTransfer?.files;
                if (!files?.length) return;
                fields.image.files = files;
                showPhoto(files[0]);
            });
            fields.image.addEventListener("change", () => showPhoto(fields.image.files[0]));
        }

        /* ---------------- Steps ---------------- */
        function placePill() {
            const button = stepButtons[step];
            if (!button || !pill) return;
            pill.style.left = `${button.offsetLeft}px`;
            pill.style.width = `${button.offsetWidth}px`;
        }

        function go(index) {
            step = Math.max(0, Math.min(panes.length - 1, index));
            studio.dataset.step = String(step);
            track.style.transform = `translateX(${-100 * step}%)`;
            panes.forEach((pane, i) => pane.classList.toggle("is-current", i === step));
            stepButtons.forEach((button, i) => {
                button.classList.toggle("is-on", i === step);
                button.setAttribute("aria-current", i === step ? "step" : "false");
            });
            placePill();
        }

        function marks() {
            const done = [
                Boolean(fields.name?.value.trim()) && Boolean(fields.category?.value),
                (Number.parseFloat(fields.price?.value) || 0) > 0,
                hasPhoto(),
            ];
            stepButtons.forEach((button, i) => button.classList.toggle("is-ok", done[i]));
        }

        stepButtons.forEach((button, i) => button.addEventListener("click", () => go(i)));
        $("[data-bz-next]")?.addEventListener("click", () => go(step + 1));
        $("[data-bz-back]")?.addEventListener("click", () => go(step - 1));

        // Enter in a field (Add mode) moves to the next step instead of saving early
        form.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" || event.target.tagName === "TEXTAREA") return;
            if (studio.dataset.mode === "add" && step < panes.length - 1) {
                event.preventDefault();
                go(step + 1);
            }
        });

        /* ---------------- Wire the real fields to the card ---------------- */
        fields.name?.addEventListener("input", () => {
            renderName(fields.name.value, true);
            marks();
        });
        fields.price?.addEventListener("input", () => {
            renderPrice();
            marks();
        });
        fields.stock?.addEventListener("input", renderStock);
        fields.active?.addEventListener("change", renderVisible);

        /* ---------------- Save: spinner → ✓ → launch ---------------- */
        const save = $("[data-bz-save]");
        form.addEventListener("submit", (event) => {
            if (event.submitter === save) save.classList.add("is-busy");
        });
        studio.addEventListener("bazario:product-saved", () => {
            save.classList.remove("is-busy");
            save.classList.add("is-ok");
            if (reduced) {
                $("[data-bz-done]").classList.add("is-on");
                return;
            }
            card.box.classList.add("is-launch");
            const stage = $("[data-bz-stage]");
            for (let i = 0; i < 40; i += 1) {
                const piece = document.createElement("i");
                piece.className = "bz-confetti";
                piece.style.background = CONFETTI[i % CONFETTI.length];
                stage.append(piece);
                const angle = Math.random() * Math.PI * 2;
                const distance = 80 + Math.random() * 160;
                piece.animate([
                    { transform: "translate(-50%, -50%)", opacity: 1 },
                    { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance + 120}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
                ], { duration: 1200 + Math.random() * 600, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }).onfinish = () => piece.remove();
            }
            setTimeout(() => $("[data-bz-done]").classList.add("is-on"), 700);
        });

        /* ---------------- First paint ---------------- */
        renderName(fields.name?.value || "", false);
        renderPrice();
        renderStock();
        renderVisible();
        if (fields.category?.value) setCategory(fields.category.value, null);

        // Server errors: mark their steps red and open the first one
        let firstError = -1;
        panes.forEach((pane, i) => {
            if (!pane.querySelector(".errorlist")) return;
            stepButtons[i]?.classList.add("is-error");
            pane.querySelectorAll("details").forEach((details) => {
                if (details.querySelector(".errorlist")) details.open = true;
            });
            if (firstError < 0) firstError = i;
        });
        marks();
        go(Math.max(0, firstError));
        requestAnimationFrame(() => requestAnimationFrame(placePill));
    }

    document.addEventListener("bazario:product-panel", (event) => {
        setup(event.target.closest?.("[data-bz-studio]") || event.target.querySelector?.("[data-bz-studio]"));
    });
    document.addEventListener("DOMContentLoaded", () => setup(document.querySelector("[data-bz-studio]")));
})();