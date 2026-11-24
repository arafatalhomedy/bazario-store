"""
How static files (CSS, JS, images) are stored on the live site.

Each file gets a fingerprint in its name (header.css → header.3f9a2c1b.css).
The name changes whenever the file changes, so browsers and Vercel's CDN can
keep files for a whole year and still always show the newest design.
"""
from whitenoise.storage import CompressedManifestStaticFilesStorage


class BazarioStaticStorage(CompressedManifestStaticFilesStorage):
    # Also rewrite JS imports ("../utils/dom.js" → "../utils/dom.4b1e9a.js")
    support_js_module_import_aggregation = True
    # If a file is ever missing from the list, use its plain name instead of crashing
    manifest_strict = False