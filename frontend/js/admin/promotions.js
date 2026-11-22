(() => {
    const form = document.querySelector(".bz-promotions .promo-form");
    if (!form) return;
    const products = JSON.parse(document.getElementById("promotion-pricing").textContent);
    const prices = form.querySelector(".promo-prices");
    const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    const cents = value => Math.round(Number(value) * 100);
    const {starts, ends, timing} = form.elements;
    const dialog = document.querySelector("#promo-calendar");
    const enhanced = typeof dialog?.showModal === "function";
    const triggers = new Map();
    const pickerError = form.querySelector("[data-picker-error]");
    let mode = timing.value;
    const endByMode = {now: "", later: "", [mode]: ends.value};
    const originalStart = starts.value;
    const myt = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    const instant = value => Date.parse(value + ":00+08:00");
    const localMinute = ms => new Date(ms + 8 * 3600000).toISOString().slice(0, 16);
    const dayText = new Intl.DateTimeFormat("en-GB", {
        timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
    const monthText = new Intl.DateTimeFormat("en-GB", {timeZone: "UTC", month: "long", year: "numeric"});

    function renderTriggers() {
        for (const [field, button] of triggers) {
            const ms = instant(field.value);
            const text = Number.isFinite(ms) ? myt.format(ms) : "Choose date and time";
            button.textContent = text;
            button.setAttribute("aria-label", (field === starts ? "Start" : "End") + " time, MYT. " + text);
        }
    }

    function update() {
        const later = form.elements.timing.value === "later";
        if (timing.value !== mode) {
            endByMode[mode] = ends.value;
            mode = timing.value;
            ends.value = endByMode[mode];
        }
        form.querySelector("[data-start-field]").hidden = !later;
        form.querySelector("[data-end-hint]").hidden = later;
        starts.disabled = !later;
        starts.required = ends.required = later;
        pickerError.hidden = true;
        renderTriggers();
        const save = form.querySelector("[data-save]");
        if (save.dataset.editing === "no") save.textContent = later ? "Schedule promotion" : "Apply promotion";
        const product = products[form.elements.product.value];
        prices.hidden = !product;
        if (!product) return;
        const field = form.elements.discount;
        const rate = cents(field.value);
        const regular = cents(product.regular);
        const sameDiscount = product.rate !== "" && rate === cents(product.rate);
        const sale = sameDiscount ? cents(product.sale) : Math.floor((regular * (10000 - rate) + 5000) / 10000);
        const valid = field.validity.valid && sale > 0 && sale < regular;
        prices.querySelector("[data-regular]").textContent = money.format(regular / 100);
        prices.querySelector("[data-sale]").textContent = valid ? money.format(sale / 100) : "—";
        prices.querySelector("[data-after]").textContent = money.format(regular / 100);
    }
    if (enhanced) {
        const get = selector => dialog.querySelector(selector);
        const hours = get("[data-hour]");
        const minutes = get("[data-minute]");
        for (const [select, count] of [[hours, 24], [minutes, 60]]) {
            for (let n = 0; n < count; n++) {
                const value = String(n).padStart(2, "0");
                select.add(new Option(value, value));
            }
        }
        let target, month, day;
        const draft = () => day + "T" + hours.value + ":" + minutes.value;
        function earliest() {
            return target === ends && mode === "later" && starts.value
                ? Math.max(Date.now(), instant(starts.value)) : Date.now();
        }
        function checkTime() {
            const valid = instant(draft()) > earliest();
            get("[data-day]").textContent = dayText.format(new Date(day + "T12:00:00Z"));
            get("[data-apply]").disabled = !valid;
            get("[data-warning]").textContent = valid ? "" : target === ends && mode === "later"
                ? "Choose an end time after the start and in the future." : "Choose a future time.";
        }
        function drawMonth() {
            const minimumDay = localMinute(earliest()).slice(0, 10);
            const days = get(".pc-days");
            days.replaceChildren();
            get("[data-month]").textContent = monthText.format(month);
            get("[data-prev]").disabled = month.toISOString().slice(0, 7) <= minimumDay.slice(0, 7);
            const date = new Date(month);
            for (let i = 0; i < (date.getUTCDay() + 6) % 7; i++) days.append(document.createElement("span"));
            while (date.getUTCMonth() === month.getUTCMonth()) {
                const key = date.toISOString().slice(0, 10);
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = date.getUTCDate();
                button.disabled = key < minimumDay;
                button.setAttribute("aria-label", dayText.format(date));
                button.setAttribute("aria-pressed", String(key === day));
                button.onclick = () => {
                    days.querySelector('[aria-pressed="true"]')?.setAttribute("aria-pressed", "false");
                    button.setAttribute("aria-pressed", "true");
                    day = key;
                    checkTime();
                };
                days.append(button);
                date.setUTCDate(date.getUTCDate() + 1);
            }
            checkTime();
        }
        function open(field) {
            target = field;
            const floor = earliest();
            const value = instant(field.value) > floor ? field.value : localMinute(floor + 3600000);
            day = value.slice(0, 10);
            month = new Date(day.slice(0, 7) + "-01T00:00:00Z");
            hours.value = value.slice(11, 13);
            minutes.value = value.slice(14, 16);
            get("[data-context]").textContent = (field === starts ? "Start time" : "End time") + " · MYT";
            get("[data-clear]").hidden = field !== ends || mode !== "now";
            drawMonth();
            triggers.get(field).setAttribute("aria-expanded", "true");
            dialog.showModal();
            get('.pc-days [aria-pressed="true"]')?.focus();
        }
        for (const field of [starts, ends]) {
            const label = form.querySelector('label[for="' + field.id + '"]');
            const button = document.createElement("button");
            button.type = "button";
            button.className = "promo-button pc-trigger";
            button.id = field.id + "-trigger";
            button.setAttribute("aria-haspopup", "dialog");
            button.setAttribute("aria-controls", dialog.id);
            button.setAttribute("aria-expanded", "false");
            label.htmlFor = button.id;
            field.type = "hidden";
            field.after(button);
            triggers.set(field, button);
            button.onclick = () => open(field);
        }
        for (const [selector, offset] of [["[data-prev]", -1], ["[data-next]", 1]]) {
            get(selector).onclick = () => {
                month.setUTCMonth(month.getUTCMonth() + offset);
                drawMonth();
            };
        }
        hours.onchange = minutes.onchange = checkTime;
        get("[data-dismiss]").onclick = get("[data-cancel]").onclick = () => dialog.close();
        get("[data-clear]").onclick = () => { target.value = ""; update(); dialog.close(); };
        get("[data-apply]").onclick = () => {
            checkTime();
            if (get("[data-apply]").disabled) return;
            target.value = draft();
            update();
            dialog.close();
        };
        dialog.addEventListener("close", () => {
            const button = triggers.get(target);
            button.setAttribute("aria-expanded", "false");
            button.focus();
        });
        dialog.addEventListener("click", event => {
            if (event.target !== dialog) return;
            const box = dialog.getBoundingClientRect();
            if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
        });
        form.addEventListener("submit", event => {
            if (event.submitter?.value === "end") return;
            const later = timing.value === "later";
            const now = Date.now();
            let invalid, message;
            if (later && (!starts.value || (instant(starts.value) <= now && starts.value !== originalStart))) {
                invalid = starts;
                message = "Choose a future start time.";
            } else if ((later && !ends.value) || (ends.value && (instant(ends.value) <= now || (later && instant(ends.value) <= instant(starts.value))))) {
                invalid = ends;
                message = later ? "Choose a future end time after the start." : "Choose a future end time or clear it.";
            }
            if (invalid) {
                event.preventDefault();
                pickerError.textContent = message;
                pickerError.hidden = false;
                triggers.get(invalid).focus();
            }
        });
    }
    form.addEventListener("input", update);
    update();
})();
