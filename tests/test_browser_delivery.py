"""HTTP caching contract for process-stable browser resources."""

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from flask import Flask, render_template_string

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src")]

from webapp import browser_delivery


class BrowserDeliveryTests(unittest.TestCase):
    def make_app(self, files=None, catalog=None):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        static_root = Path(temporary.name) / "static"
        static_root.mkdir()
        for filename, body in (files or {"js/worker.js": b'importScripts("engine.js");'}).items():
            target = static_root / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(body)

        app = Flask(__name__, static_folder=str(static_root), static_url_path="/static")
        app.config["TESTING"] = True
        with mock.patch.object(
            browser_delivery,
            "get_catalog",
            return_value=catalog or {"schema_version": 1, "value": "catalog"},
        ):
            delivery = browser_delivery.init_browser_delivery(app)

        @app.get("/")
        def index():
            return render_template_string(
                "{{ browser_asset_url('js/worker.js') }}|{{ browser_catalog_url() }}"
            )

        return app, delivery, static_root

    def test_revision_binds_catalog_asset_names_and_bytes(self):
        _, baseline, _ = self.make_app()
        _, changed_catalog, _ = self.make_app(catalog={"schema_version": 1, "value": "changed"})
        _, changed_asset, _ = self.make_app(files={"js/worker.js": b"changed"})
        _, renamed_asset, _ = self.make_app(
            files={"js/worker.js": b'importScripts("engine.js");', "x": b""}
        )

        self.assertNotEqual(baseline.revision, changed_catalog.revision)
        self.assertNotEqual(baseline.revision, changed_asset.revision)
        self.assertNotEqual(baseline.revision, renamed_asset.revision)
        self.assertEqual(len(baseline.revision), 64)

    def test_versioned_resources_are_immutable_and_reject_other_revisions(self):
        app, delivery, _ = self.make_app()
        client = app.test_client()
        asset_url = f"/browser/{delivery.revision}/static/js/worker.js"
        catalog_url = f"/browser/{delivery.revision}/search-data"

        asset = client.get(asset_url)
        catalog = client.get(catalog_url)
        self.assertEqual(asset.status_code, 200)
        self.assertEqual(asset.data, b'importScripts("engine.js");')
        self.assertEqual(asset.headers["Cache-Control"], "public, max-age=31536000, immutable")
        self.assertEqual(asset.content_type, "text/javascript; charset=utf-8")
        self.assertEqual(asset.content_length, len(asset.data))
        self.assertEqual(catalog.status_code, 200)
        self.assertEqual(catalog.headers["Cache-Control"], "public, max-age=31536000, immutable")
        self.assertEqual(catalog.content_type, "application/json")
        self.assertEqual(catalog.content_length, len(catalog.data))
        self.assertEqual(client.get("/browser/deadbeef/static/js/worker.js").status_code, 404)
        self.assertEqual(client.get("/browser/deadbeef/search-data").status_code, 404)
        self.assertEqual(
            client.get(f"/browser/{delivery.revision}/static/missing.js").status_code, 404
        )

    def test_snapshot_does_not_change_when_source_file_changes(self):
        app, delivery, static_root = self.make_app()
        url = f"/browser/{delivery.revision}/static/js/worker.js"
        static_root.joinpath("js/worker.js").write_bytes(b"new bytes")

        self.assertEqual(app.test_client().get(url).data, b'importScripts("engine.js");')

    def test_legacy_catalog_revalidates_with_the_snapshot(self):
        app, delivery, _ = self.make_app()
        client = app.test_client()

        response = client.get("/search-data")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-cache")
        self.assertEqual(response.data, delivery.catalog.body)
        self.assertEqual(response.get_json()["schema_version"], 1)

    def test_head_and_conditional_get_have_correct_body_and_etag_contract(self):
        app, delivery, _ = self.make_app()
        client = app.test_client()
        url = f"/browser/{delivery.revision}/static/js/worker.js"
        full = client.get(url)
        expected_length = len(full.data)

        head = client.head(url)
        unchanged = client.get(url, headers={"If-None-Match": full.headers["ETag"]})
        self.assertEqual(head.status_code, 200)
        self.assertEqual(head.data, b"")
        self.assertEqual(head.content_length, expected_length)
        self.assertEqual(head.headers["ETag"], full.headers["ETag"])
        self.assertEqual(unchanged.status_code, 304)
        self.assertEqual(unchanged.data, b"")
        self.assertIsNone(unchanged.content_length)
        self.assertEqual(unchanged.headers["ETag"], full.headers["ETag"])

    def test_html_uses_one_revision_worker_dependency_graph_and_revalidates(self):
        files = {
            "js/worker.js": b'importScripts("engine.js");',
            "js/engine.js": b"self.engine = {};",
        }
        app, delivery, _ = self.make_app(files=files)
        client = app.test_client()

        page = client.get("/")
        revision_root = f"/browser/{delivery.revision}"
        self.assertEqual(page.status_code, 200)
        self.assertEqual(page.headers["Cache-Control"], "no-cache")
        self.assertIn(f"{revision_root}/static/js/worker.js", page.get_data(as_text=True))
        self.assertIn(f"{revision_root}/search-data", page.get_data(as_text=True))
        worker = client.get(f"{revision_root}/static/js/worker.js")
        self.assertIn(b'importScripts("engine.js")', worker.data)
        self.assertEqual(
            client.get(f"{revision_root}/static/js/engine.js").status_code,
            200,
        )

        unchanged = client.get("/", headers={"If-None-Match": page.headers["ETag"]})
        self.assertEqual(unchanged.status_code, 304)
        self.assertEqual(unchanged.data, b"")

    def test_catalog_and_page_do_not_leak_server_token(self):
        token = "private-token"
        app, delivery, _ = self.make_app()
        app.config["SERVER_CALCULATION_TOKEN"] = token
        client = app.test_client()

        page = client.get("/").data
        catalog = client.get(f"/browser/{delivery.revision}/search-data").data
        self.assertNotIn(token.encode(), page)
        self.assertNotIn(token.encode(), catalog)

    def test_application_template_uses_one_revision_for_the_complete_dependency_graph(self):
        from webapp.app import app

        client = app.test_client()
        delivery = app.extensions["browser_delivery"]
        revision_root = f"/browser/{delivery.revision}"
        page = client.get("/").get_data(as_text=True)

        for filename in (
            "css/tokens.css",
            "css/styles.css",
            "js/theme.js",
            "js/search-engine.js",
            "js/search-worker.js",
            "js/script.js",
        ):
            self.assertIn(f"{revision_root}/static/{filename}", page)
        self.assertIn(f"{revision_root}/search-data", page)
        self.assertNotIn('href="/static/', page)
        self.assertNotIn('src="/static/', page)
        worker = client.get(f"{revision_root}/static/js/search-worker.js")
        self.assertIn(b'importScripts("search-engine.js")', worker.data)
        self.assertEqual(
            client.get(f"{revision_root}/static/js/search-engine.js").status_code,
            200,
        )

    def test_resource_etag_is_its_body_digest(self):
        _, delivery, _ = self.make_app()
        self.assertEqual(delivery.catalog.etag, hashlib.sha256(delivery.catalog.body).hexdigest())

    def test_known_web_asset_mimetypes_are_platform_stable_and_revision_bound(self):
        _, delivery, _ = self.make_app(files={"app.js": b"same bytes", "app.css": b"same bytes"})
        self.assertEqual(delivery.assets["app.js"].mimetype, "text/javascript")
        self.assertEqual(delivery.assets["app.css"].mimetype, "text/css")

        with mock.patch.dict(browser_delivery._STABLE_MIMETYPES, {".js": "application/javascript"}):
            _, changed, _ = self.make_app(files={"app.js": b"same bytes", "app.css": b"same bytes"})
        self.assertNotEqual(delivery.revision, changed.revision)


if __name__ == "__main__":
    unittest.main()
