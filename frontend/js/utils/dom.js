/**
 * Small DOM helpers.
 *
 * el() builds elements using textContent (never innerHTML), so text that
 * comes from the database is always shown as plain text and can never run
 * as code. This protects the site against XSS attacks.
 */

/**
 * Create an element in one line.
 * Example: el("a", { className: "dropdown__item", text: "Audio", attrs: { href: "/" } })
 */
export function el(tag, { className, text, attrs = {} } = {}, children = []) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    for (const [name, value] of Object.entries(attrs)) {
        if (value !== undefined && value !== null) node.setAttribute(name, value);
    }
    for (const child of children) {
        if (child) node.append(child);
    }
    return node;
}

/**
 * Run `fn` only after `wait` milliseconds have passed without another call.
 * Example: search only after the customer stops typing for 300 ms.
 */
export function debounce(fn, wait) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}