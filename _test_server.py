from http.server import HTTPServer, SimpleHTTPRequestHandler
import sys
class H(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        if self.path.endswith('/radar-ips'):
            n = int(self.headers.get('content-length', 0) or 0)
            body = self.rfile.read(n).decode() if n else ''
            sys.stdout.write('RADAR_POST: ' + body + '\n'); sys.stdout.flush()
            self.send_response(200)
            self.send_header('content-type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true,"saved":8,"applied":8}')
        else:
            self.send_response(404); self.end_headers()
HTTPServer(('127.0.0.1', 8899), H).serve_forever()
