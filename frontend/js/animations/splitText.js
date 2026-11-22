/**
 * Split text: cuts a title into single letters so they can rise one by one.
 * Mark title lines with  data-split. The parent heading must have an
 * aria-label with the full sentence (for screen readers).
 * Animation styles: css/core/animations.css (section 2).
 */
import { el } from "../utils/dom.js";
import { prefersReducedMotion } from "../utils/motion.js";

/**
 * Split one element. Returns the next letter number, so several
 * lines can continue the same rising wave.
 */
export function splitText(element, startIndex = 0) {
    if (prefersReducedMotion()) {
        element.classList.add("is-split"); // just show it, no animation
        return startIndex;
    }

    const words = element.textContent.trim().split(/\s+/);
    const fragment = document.createDocumentFragment();
    let index = startIndex;

    words.forEach((word, wordIndex) => {
        const wordBox = el("span", { className: "split-word" });
        for (const char of word) {
            const letter = el("span", { className: "split-char", text: char });
            letter.style.setProperty("--char-index", index++);
            wordBox.append(letter);
        }
        fragment.append(wordBox);
        if (wordIndex < words.length - 1) fragment.append(" ");
    });

    element.setAttribute("aria-hidden", "true"); // the heading's aria-label is read instead
    element.replaceChildren(fragment);
    element.classList.add("is-split");
    return index;
}

/** Split every [data-split] element inside root, as one continuous wave. */
export function splitAll(root = document) {
    let index = 0;
    for (const element of root.querySelectorAll("[data-split]")) {
        index = splitText(element, index);
    }
}