const NAME = "product-photo";
let tagged = null;
const originalNames = new Map();

export function initProductMorph(root = document) {
    root.addEventListener("click", (event) => {
        const link = event.target.closest('a[href^="/products/"]');
        if (!link) return;

        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
            event.shiftKey || event.altKey || link.target === "_blank") return;

        markPhoto(link.querySelector("img"));
    });

    window.addEventListener("pageshow", clearTag);
}

export function markPhoto(image) {
    if (image === tagged) return;
    clearTag();
    if (!image || image.hidden) return;

    // The current product page already names its main photo.
    document.querySelectorAll(".product__photo").forEach((photo) => {
        if (photo !== image) setName(photo, "none");
    });

    setName(image, NAME);
    tagged = image;
}

function setName(photo, name) {
    originalNames.set(photo, photo.style.viewTransitionName);
    photo.style.viewTransitionName = name;
}

function clearTag() {
    for (const [photo, name] of originalNames) {
        photo.style.viewTransitionName = name;
    }

    originalNames.clear();
    tagged = null;
}