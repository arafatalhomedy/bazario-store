/**
 * API client: the ONLY place that talks to the backend.
 *
 * - Asks for JSON and sends JSON
 * - Adds the CSRF security token to requests that change data
 * - Sends the session cookie (so the server knows the visitor's cart)
 * - Turns server errors into a clear ApiError
 * - If several parts of the page ask the SAME question at the same time,
 *   only one request goes to the server and they all share the answer
 */
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"]; // read-only, no CSRF token needed
const inFlight = new Map();                         // GET path → the request already on its way
const KEEP = /^\/api\/(categories|products)\//;     // catalog answers: kept until the page closes

/** Error with the HTTP status and the server's response data. */
export class ApiError extends Error {
    constructor(message, status, data) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.data = data;
    }
}

/** Read one cookie by name (used for Django's "csrftoken" cookie). */
function getCookie(name) {
    const row = document.cookie.split("; ").find((item) => item.startsWith(`${name}=`));
    return row ? decodeURIComponent(row.split("=")[1]) : "";
}

/**
 * Send a request to the backend and return the JSON answer.
 * Example: await apiRequest("/api/categories/")
 */
export function apiRequest(path, { method = "GET", body, signal } = {}) {
    // Same read-only question already on its way? Share it instead of asking again.
    const shareable = method === "GET" && !signal && body === undefined;
    if (shareable && inFlight.has(path)) return inFlight.get(path);

    const request = send(path, { method, body, signal });
    if (shareable) {
        inFlight.set(path, request);
        request.then(
            () => { if (!KEEP.test(path)) inFlight.delete(path); },  // catalog: keep the answer
            () => inFlight.delete(path),                             // failed: allow a retry
        );
    }
    return request;
}

async function send(path, { method, body, signal }) {
    const headers = { Accept: "application/json" };
    const options = { method, headers, signal, credentials: "same-origin" };

    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
    }
    if (!SAFE_METHODS.includes(method)) {
        headers["X-CSRFToken"] = getCookie("csrftoken");
    }

    const response = await fetch(path, options);
    const data = response.status === 204 ? null : await response.json().catch(() => null);

    if (!response.ok) {
        throw new ApiError(data?.detail || `Request failed (${response.status})`, response.status, data);
    }
    return data;
}