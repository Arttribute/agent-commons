"""Header authentication for the Agent Commons SearXNG deployment."""

import hmac
import json
import os
from collections.abc import Callable, Iterable

from searx.webapp import app as searxng_app

StartResponse = Callable[[str, list[tuple[str, str]]], object]
WsgiApp = Callable[[dict, StartResponse], Iterable[bytes]]


class ApiKeyMiddleware:
    def __init__(self, wrapped: WsgiApp):
        self.wrapped = wrapped

    def __call__(
        self, environ: dict, start_response: StartResponse
    ) -> Iterable[bytes]:
        if environ.get("PATH_INFO") == "/healthz":
            return self.wrapped(environ, start_response)

        expected = os.environ.get("SEARXNG_API_KEY", "")
        provided = environ.get("HTTP_X_AGENT_COMMONS_SEARCH_KEY", "")
        if expected and hmac.compare_digest(expected, provided):
            return self.wrapped(environ, start_response)

        body = json.dumps({"error": "unauthorized"}).encode()
        start_response(
            "401 Unauthorized",
            [
                ("Content-Type", "application/json"),
                ("Content-Length", str(len(body))),
            ],
        )
        return [body]


app = ApiKeyMiddleware(searxng_app)
