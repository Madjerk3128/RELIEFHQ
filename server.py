"""
Disaster Relief Resource Coordinator — Server
Serves static files + JSON API for shared data.
Accessible from phones via pyngrok tunnel.
"""
import http.server, json, os, threading, sys, subprocess

PORT = 8080
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'db.json')
DEFAULT_DB = {"resources":[],"camps":[],"requests":[],"allocations":[],"volunteers":[],"donors":[],"donations":[],"users":[],"counters":{"r":0,"c":0,"q":0,"a":0,"v":0,"d":0,"n":0,"u":0}}

def load_db():
    try:
        with open(DB_FILE,'r') as f: return json.load(f)
    except: 
        save_db(DEFAULT_DB)
        return DEFAULT_DB

def save_db(data):
    with open(DB_FILE,'w') as f: json.dump(data, f, indent=2)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(os.path.abspath(__file__)), **kwargs)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/data':
            data = json.dumps(load_db()).encode()
            self.send_response(200)
            self.send_header('Content-Type','application/json')
            self.send_header('Access-Control-Allow-Origin','*')
            self.send_header('Content-Length', len(data))
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/data':
            length = int(self.headers.get('Content-Length',0))
            body = self.rfile.read(length)
            try:
                save_db(json.loads(body))
                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin','*')
                self.end_headers()
                self.wfile.write(b'OK')
            except:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'Bad JSON')
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Silence logs

def get_local_ip():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try: s.connect(('8.8.8.8',80)); return s.getsockname()[0]
    except: return '127.0.0.1'
    finally: s.close()

if __name__ == '__main__':
    ip = get_local_ip()
    print("\n" + "=" * 50)
    print("  DISASTER RELIEF SERVER RUNNING")
    print("=" * 50)
    print(f"  Local:   http://localhost:{PORT}")
    print(f"  Network: http://{ip}:{PORT}")
    print(f"  (Same WiFi devices can use the Network URL)")
    print("")
    print("  FOR PHONE ACCESS (mobile data):")
    print("  Run in another terminal:")
    print(f"  ssh -R 80:localhost:{PORT} serveo.net")
    print("  It will give you a public URL!")
    print("=" * 50)
    
    server = http.server.HTTPServer(('0.0.0.0', PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
        server.server_close()
