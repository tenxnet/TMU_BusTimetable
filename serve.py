#!/usr/bin/env python3

from __future__ import annotations

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        pass


def main() -> None:
    root = Path(__file__).resolve().parent
    server = ThreadingHTTPServer(("127.0.0.1", 8000), lambda *args, **kwargs: QuietHandler(*args, directory=str(root), **kwargs))
    print("static site ready on http://127.0.0.1:8000")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()