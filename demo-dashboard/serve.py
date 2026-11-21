import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

class SPAHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="dist", **kwargs)

    def do_GET(self):
        # Serve index.html for SPA routing if path doesn't exist
        path = self.translate_path(self.path)
        if not os.path.exists(path) and not self.path.startswith("/assets"):
            self.path = "/index.html"
        return super().do_GET()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    print(f"Starting SPA Server on 0.0.0.0:{port}...")
    server = HTTPServer(("0.0.0.0", port), SPAHandler)
    server.serve_forever()
