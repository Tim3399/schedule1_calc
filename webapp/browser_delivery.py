"""Process-stable, content-addressed delivery for browser search resources."""

from __future__ import annotations

import hashlib
import json
import mimetypes
from dataclasses import dataclass
from pathlib import Path

from flask import Response, abort, request, url_for

from src.functionality.browser_catalog import get_catalog

_IMMUTABLE = "public, max-age=31536000, immutable"
_REVALIDATE = "no-cache"
_STABLE_MIMETYPES = {".css": "text/css", ".js": "text/javascript"}


@dataclass(frozen=True)
class _Resource:
    body: bytes
    mimetype: str
    etag: str


@dataclass(frozen=True)
class BrowserDelivery:
    revision: str
    catalog: _Resource
    assets: dict[str, _Resource]


def _resource(body: bytes, mimetype: str) -> _Resource:
    return _Resource(body=body, mimetype=mimetype, etag=hashlib.sha256(body).hexdigest())


def _snapshot(app) -> BrowserDelivery:
    static_root = Path(app.static_folder).resolve()
    assets = {}
    for source in sorted(path for path in static_root.rglob("*") if path.is_file()):
        filename = source.relative_to(static_root).as_posix()
        mimetype = _STABLE_MIMETYPES.get(source.suffix.lower())
        if mimetype is None:
            mimetype = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        assets[filename] = _resource(source.read_bytes(), mimetype)

    catalog_body = json.dumps(
        get_catalog(), ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    catalog = _resource(catalog_body, "application/json")

    digest = hashlib.sha256()
    for filename, resource in [("catalog", catalog), *sorted(assets.items())]:
        name = filename.encode("utf-8")
        mimetype = resource.mimetype.encode("ascii")
        digest.update(len(name).to_bytes(8, "big"))
        digest.update(name)
        digest.update(len(mimetype).to_bytes(8, "big"))
        digest.update(mimetype)
        digest.update(len(resource.body).to_bytes(8, "big"))
        digest.update(resource.body)
    return BrowserDelivery(revision=digest.hexdigest(), catalog=catalog, assets=assets)


def _serve(resource: _Resource, cache_control: str) -> Response:
    response = Response(resource.body, mimetype=resource.mimetype)
    response.headers["Cache-Control"] = cache_control
    response.set_etag(resource.etag)
    return response.make_conditional(request)


def init_browser_delivery(app) -> BrowserDelivery:
    """Snapshot browser resources and register their content-addressed routes."""
    delivery = _snapshot(app)
    app.extensions["browser_delivery"] = delivery

    def search_data_json():
        return _serve(delivery.catalog, _REVALIDATE)

    def browser_search_data(revision):
        if revision != delivery.revision:
            abort(404)
        return _serve(delivery.catalog, _IMMUTABLE)

    def browser_static(revision, filename):
        if revision != delivery.revision or filename not in delivery.assets:
            abort(404)
        return _serve(delivery.assets[filename], _IMMUTABLE)

    app.add_url_rule(
        "/search-data", endpoint="search_data_json", view_func=search_data_json, methods=["GET"]
    )
    app.add_url_rule(
        "/browser/<revision>/search-data",
        endpoint="browser_search_data",
        view_func=browser_search_data,
        methods=["GET"],
    )
    app.add_url_rule(
        "/browser/<revision>/static/<path:filename>",
        endpoint="browser_static",
        view_func=browser_static,
        methods=["GET"],
    )

    def browser_asset_url(filename):
        if filename not in delivery.assets:
            raise KeyError(f"Unknown browser asset: {filename}")
        return url_for("browser_static", revision=delivery.revision, filename=filename)

    def browser_catalog_url():
        return url_for("browser_search_data", revision=delivery.revision)

    app.jinja_env.globals.update(
        browser_asset_url=browser_asset_url,
        browser_catalog_url=browser_catalog_url,
    )

    @app.after_request
    def revalidate_rendered_index(response):
        if (
            request.method in {"GET", "HEAD"}
            and request.endpoint == "index"
            and response.status_code == 200
            and response.mimetype == "text/html"
        ):
            response.headers["Cache-Control"] = _REVALIDATE
            response.set_etag(hashlib.sha256(response.get_data()).hexdigest())
            response.make_conditional(request)
        return response

    return delivery
