
const SAMPLE_SIZE = 8;     // shrink the photo to 8 × 8 pixels before mixing
const cache = new Map();   // photo address → color (each photo measured once)

export function averageColor(image) {
    if (!image || !image.complete || !image.naturalWidth) return null;
    if (cache.has(image.src)) return cache.get(image.src);

    try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

        const pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
        let red = 0, green = 0, blue = 0;
        for (let i = 0; i < pixels.length; i += 4) {
            red += pixels[i];
            green += pixels[i + 1];
            blue += pixels[i + 2];
        }
        const count = pixels.length / 4;
        const color = `rgb(${Math.round(red / count)} ${Math.round(green / count)} ${Math.round(blue / count)})`;

        cache.set(image.src, color);
        return color;
    } catch {
        return null; // the page keeps its default colors
    }
}
/** Wait for an image to load, then give its average color (or null). */
export function averageColorWhenLoaded(image) {
    if (image.complete && image.naturalWidth) return Promise.resolve(averageColor(image));
    return new Promise((resolve) => {
        image.addEventListener("load", () => resolve(averageColor(image)), { once: true });
        image.addEventListener("error", () => resolve(null), { once: true });
    });
}