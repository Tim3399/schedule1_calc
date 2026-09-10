"""Explicit credentials for tests of the retained private calculation API."""

from unittest.mock import patch


def authorized_client(test_case, app):
    token = "test-only-calculation-token"
    configuration = patch.dict(app.config, {"SERVER_CALCULATION_TOKEN": token})
    configuration.start()
    test_case.addCleanup(configuration.stop)
    client = app.test_client()
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    return client
