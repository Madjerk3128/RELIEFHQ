const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 8080;
const DATA_FILE = path.join(__dirname, 'db.json');

// Default empty DB
const DEFAULT_DB = {resources:[],camps:[],requests:[],allocations:[],volunteers:[],donors:[],donations:[],users:[],counters:{r:0,c:0,q:0,a:0,v:0,d:0,n:0,u:0}};

function loadDB() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }
  catch(e) { fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DB)); return DEFAULT_DB; }
}
function saveDB(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

const MIME = {'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.ico':'image/x-icon'};

const server = http.createServer((req, res) => {
  // CORS headers for any origin
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // API: GET data
  if (req.url === '/api/data' && req.method === 'GET') {
    var db = loadDB();
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify(db));
    return;
  }
  // API: POST data (save)
  if (req.url === '/api/data' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { saveDB(JSON.parse(body)); res.writeHead(200); res.end('OK'); }
      catch(e) { res.writeHead(400); res.end('Bad JSON'); }
    });
    return;
  }

  // Serve static files
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type': MIME[ext] || 'text/plain'});
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n===========================================');
  console.log('  DISASTER RELIEF SERVER RUNNING');
  console.log('===========================================');
  console.log('  Local:   http://localhost:' + PORT);
  // Show all local IPs
  const nets = require('os').networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log('  Network: http://' + net.address + ':' + PORT);
      }
    }
  }
  console.log('\n  Waiting for tunnel...');
});

// Auto-start localtunnel for public URL
try {
  const lt = require('localtunnel');
  (async () => {
    const tunnel = await lt({ port: PORT });
    console.log('\n  ★ PUBLIC URL (share this with phones):');
    console.log('  ★ ' + tunnel.url);
    console.log('\n  Anyone with this URL can access the app!');
    console.log('===========================================\n');
    tunnel.on('close', () => console.log('Tunnel closed'));
  })();
} catch(e) {
  console.log('\n  localtunnel not installed. Run:');
  console.log('  npm install localtunnel');
  console.log('  Then restart the server.\n');
}
