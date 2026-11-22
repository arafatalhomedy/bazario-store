(() => {
  const form = document.getElementById("bz-confirm-form");
  if (!form) return;

  const { window: windowField, start, end } = form.elements;
  const dates = form.querySelector(".dates");
  const estimate = form.querySelector(".estimate");
  const output = estimate.querySelector("output");
  const display = new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
  const storeDate = new Intl.DateTimeFormat("en-GB", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kuala_Lumpur",
  });

  function todayInStore() {
    const parts = Object.fromEntries(storeDate.formatToParts().map(part => [part.type, part.value]));
    return [parts.year, parts.month, parts.day].join("-");
  }

  function offsetDay(today, days) {
    const date = new Date(today + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function render() {
    const today = todayInStore();
    const custom = windowField.value === "custom";
    dates.hidden = !custom;
    for (const field of [start, end]) {
      field.disabled = !custom;
      field.required = custom;
    }
    start.min = today;
    end.min = start.value && start.value > today ? start.value : today;

    let first = start.value;
    let last = end.value;
    if (!custom) {
      const [minimum, maximum] = windowField.value.split("-").map(Number);
      first = offsetDay(today, minimum);
      last = offsetDay(today, maximum);
    }
    estimate.hidden = false;
    if (!first || !last || first < today || last < first) {
      output.textContent = "Choose a valid start and end date.";
      return;
    }
    const firstDate = new Date(first + "T00:00:00Z");
    const lastDate = new Date(last + "T00:00:00Z");
    output.textContent = display.formatRange(firstDate, lastDate);
  }

  form.addEventListener("input", render);
  window.addEventListener("pageshow", render);
  window.addEventListener("focus", render);
  render();
})();
