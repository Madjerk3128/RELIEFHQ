const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT      = 8080;
const DATA_FILE = path.join(__dirname, 'db.json');
const EXCEL_FILE = path.join(__dirname, 'ReliefHQ_Data.xlsx');

// JSONBlob cloud backup URL
const JSONBLOB_URL = 'https://jsonblob.com/api/jsonBlob/019e9925-9eaa-751e-845b-d60dcea0edb3';

// Default empty DB structure
const DEFAULT_DB = {
  resources:[], camps:[], requests:[], allocations:[],
  volunteers:[], donors:[], donations:[], users:[],
  counters:{r:0,c:0,q:0,a:0,v:0,d:0,n:0,u:0},
  _lastSaved: null
};

// ─── DB helpers ───────────────────────────────────────────────
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch(e) { fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DB, null, 2)); return DEFAULT_DB; }
}

function saveDB(data) {
  data._lastSaved = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  exportToExcel(data);   // auto-export Excel on every save
}

function mergeList(listA, listB, idKey) {
  const map = {};
  (listA || []).forEach(item => {
    if (item && item[idKey]) map[item[idKey]] = item;
  });
  (listB || []).forEach(item => {
    if (item && item[idKey]) {
      const existing = map[item[idKey]];
      if (existing) {
        if (idKey === 'reqID' && existing.status === 'PENDING' && item.status !== 'PENDING') {
          map[item[idKey]] = item;
        } else {
          map[item[idKey]] = Object.assign({}, existing, item);
        }
      } else {
        map[item[idKey]] = item;
      }
    }
  });
  return Object.keys(map).map(k => map[k]);
}

function mergeDBs(dbA, dbB) {
  if (!dbA || !dbA.counters) return dbB || DEFAULT_DB;
  if (!dbB || !dbB.counters) return dbA || DEFAULT_DB;

  const merged = {
    resources: mergeList(dbA.resources, dbB.resources, 'id'),
    camps: mergeList(dbA.camps, dbB.camps, 'id'),
    requests: mergeList(dbA.requests, dbB.requests, 'reqID'),
    allocations: mergeList(dbA.allocations, dbB.allocations, 'id'),
    volunteers: mergeList(dbA.volunteers, dbB.volunteers, 'id'),
    donors: mergeList(dbA.donors, dbB.donors, 'id'),
    donations: mergeList(dbA.donations || [], dbB.donations || [], 'id'),
    users: mergeList(dbA.users, dbB.users, 'id'),
    counters: {
      r: Math.max(dbA.counters.r || 0, dbB.counters.r || 0),
      c: Math.max(dbA.counters.c || 0, dbB.counters.c || 0),
      q: Math.max(dbA.counters.q || 0, dbB.counters.q || 0),
      a: Math.max(dbA.counters.a || 0, dbB.counters.a || 0),
      v: Math.max(dbA.counters.v || 0, dbB.counters.v || 0),
      d: Math.max(dbA.counters.d || 0, dbB.counters.d || 0),
      n: Math.max(dbA.counters.n || 0, dbB.counters.n || 0),
      u: Math.max(dbA.counters.u || 0, dbB.counters.u || 0)
    },
    _lastSaved: new Date().toISOString()
  };
  return merged;
}

// ─── Excel Export ─────────────────────────────────────────────
function exportToExcel(db) {
  try {
    const xlsx = require('xlsx');

    function toSheet(arr) {
      if (!arr || arr.length === 0) return xlsx.utils.aoa_to_sheet([['No data yet']]);
      return xlsx.utils.json_to_sheet(arr);
    }

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, toSheet(db.resources),    'Resources');
    xlsx.utils.book_append_sheet(wb, toSheet(db.camps),        'Relief Camps');
    xlsx.utils.book_append_sheet(wb, toSheet(db.requests),     'Supply Requests');
    xlsx.utils.book_append_sheet(wb, toSheet(db.allocations),  'Allocations');
    xlsx.utils.book_append_sheet(wb, toSheet(db.volunteers),   'Volunteers');
    xlsx.utils.book_append_sheet(wb, toSheet(db.donors),       'Donors');
    xlsx.utils.book_append_sheet(wb, toSheet(db.users),        'Representatives');

    xlsx.writeFile(wb, EXCEL_FILE);
    console.log('[Excel] Updated → ' + EXCEL_FILE);
  } catch(e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      console.log('[Excel] xlsx not installed yet. Run: npm install xlsx');
    } else {
      console.log('[Excel] Export error:', e.message);
    }
  }
}

// ─── JSONBlob cloud sync helpers ──────────────────────────────
function fetchFromCloud(callback) {
  const url = new URL(JSONBLOB_URL);
  const options = { hostname: url.hostname, path: url.pathname, method: 'GET',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      try { callback(null, JSON.parse(body)); }
      catch(e) { callback(e, null); }
    });
  });
  req.on('error', callback);
  req.end();
}

function pushToCloud(data, callback) {
  const body = JSON.stringify(data);
  const url  = new URL(JSONBLOB_URL);
  const options = { hostname: url.hostname, path: url.pathname, method: 'PUT',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json',
               'Content-Length': Buffer.byteLength(body) } };

  const req = https.request(options, (res) => {
    let b = '';
    res.on('data', c => b += c);
    res.on('end', () => { if (callback) callback(null, res.statusCode); });
  });
  req.on('error', (e) => { if (callback) callback(e); });
  req.write(body);
  req.end();
}

// ─── Startup: sync from cloud if cloud is newer ───────────────
function startupSync(silent) {
  if (!silent) console.log('[Sync] Checking cloud for newer data...');
  fetchFromCloud((err, cloudData) => {
    const localData = loadDB();
    if (err || !cloudData || !cloudData.counters) {
      if (!silent) {
        console.log('[Sync] Cloud is empty or invalid. Initializing cloud with local db.json...');
      }
      pushToCloud(localData, (pushErr) => {
        if (!pushErr) {
          if (!silent) console.log('[Sync] ✅ Cloud initialized successfully');
        } else {
          if (!silent) console.log('[Sync] ⚠️ Cloud initialization failed:', pushErr.message);
        }
      });
      return;
    }

    const localTime  = localData._lastSaved ? new Date(localData._lastSaved) : new Date(0);
    const cloudTime  = cloudData._lastSaved  ? new Date(cloudData._lastSaved)  : new Date(0);

    if (cloudTime > localTime) {
      const merged = mergeDBs(localData, cloudData);
      saveDB(merged);
      console.log('[Sync] ✅ Cloud data was newer → merged cloud with local db.json + Excel');
      pushToCloud(merged, (pushErr) => {
        if (!pushErr && !silent) console.log('[Sync] ✅ Pushed merged data to cloud');
      });
    } else if (localTime > cloudTime) {
      const merged = mergeDBs(localData, cloudData);
      saveDB(merged);
      pushToCloud(merged, (pushErr) => {
        if (!pushErr) {
          if (!silent) console.log('[Sync] ✅ Local data was newer -> pushed merged to cloud');
        }
      });
    } else {
      if (!silent) {
        console.log('[Sync] ✅ Local data is up-to-date');
        exportToExcel(localData);
      }
    }
  });
}

// ─── Shutdown: push local data to cloud ───────────────────────
function shutdownSync(exitCode) {
  console.log('\n[Shutdown] Pushing local data to cloud backup...');
  const data = loadDB();
  pushToCloud(data, (err, status) => {
    if (err) {
      console.log('[Shutdown] ⚠️  Cloud push failed:', err.message);
    } else {
      console.log('[Shutdown] ✅ Data backed up to cloud (HTTP ' + status + ')');
    }
    process.exit(exitCode || 0);
  });
}

// Intercept graceful shutdowns
process.on('SIGINT',  () => shutdownSync(0));
process.on('SIGTERM', () => shutdownSync(0));

// ─── MIME types ───────────────────────────────────────────────
const MIME = {
  '.html':'text/html', '.css':'text/css', '.js':'application/javascript',
  '.json':'application/json', '.png':'image/png', '.ico':'image/x-icon',
  '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

// ─── HTTP Server ──────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, bypass-tunnel-reminder');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── PING (used by app.js to detect local server) ──────────
  if (req.url === '/api/ping' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ ok: true, mode: 'local', time: new Date().toISOString() }));
    return;
  }

  // ── GET /api/data ──────────────────────────────────────────
  if (req.url === '/api/data' && req.method === 'GET') {
    const db = loadDB();
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(db));
    return;
  }

  // ── POST /api/data (save + export Excel + mirror to cloud) ─
  if (req.url === '/api/data' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const local = loadDB();
        const merged = mergeDBs(local, data);
        saveDB(merged);

        // Mirror to JSONBlob in background (non-blocking)
        pushToCloud(merged, (err) => {
          if (err) console.log('[Cloud] Mirror failed:', err.message);
          else     console.log('[Cloud] ✅ Mirrored to JSONBlob');
        });

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(400);
        res.end('Bad JSON');
      }
    });
    return;
  }

  // ── Download Excel file ────────────────────────────────────
  if (req.url === '/api/export-excel' && req.method === 'GET') {
    if (!fs.existsSync(EXCEL_FILE)) {
      res.writeHead(404);
      res.end('Excel file not generated yet. Save some data first.');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="ReliefHQ_Data.xlsx"'
    });
    fs.createReadStream(EXCEL_FILE).pipe(res);
    return;
  }

  // ── Serve static files ─────────────────────────────────────
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type': MIME[ext] || 'text/plain'});
    res.end(data);
  });
});

// ─── Start ────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n===========================================');
  console.log('  RELIEFHQ DUAL-SERVER RUNNING');
  console.log('===========================================');
  console.log('  Local:   http://localhost:' + PORT);

  const nets = require('os').networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log('  Network: http://' + net.address + ':' + PORT);
      }
    }
  }
  console.log('  Excel:   ' + EXCEL_FILE);
  console.log('  Cloud:   JSONBlob backup active');
  console.log('===========================================\n');

  // Sync from cloud on startup
  startupSync();
  
  // Poll cloud every 5 seconds for updates (for cross-device real-time sync)
  setInterval(() => startupSync(true), 5000);
});

// Auto-start localtunnel with fixed subdomain so phones can reach this server
var TUNNEL_URL = null;
try {
  const lt = require('localtunnel');
  (async () => {
    try {
      const tunnel = await lt({ port: PORT, subdomain: 'reliefhq-madjerk' });
      TUNNEL_URL = tunnel.url;
      console.log('\n  ★ PUBLIC URL — Share with phones & other devices:');
      console.log('  ★ ' + tunnel.url);
      console.log('\n  All devices use this laptop as the data source!');
      console.log('===========================================\n');
      tunnel.on('close', () => { TUNNEL_URL = null; console.log('Tunnel closed'); });
    } catch(e) {
      // Subdomain taken — try without fixed subdomain
      try {
        const lt2 = require('localtunnel');
        const tunnel2 = await lt2({ port: PORT });
        TUNNEL_URL = tunnel2.url;
        console.log('\n  ★ PUBLIC URL (random):');
        console.log('  ★ ' + tunnel2.url);
        console.log('===========================================\n');
        tunnel2.on('close', () => { TUNNEL_URL = null; });
      } catch(e2) {
        console.log('  (Tunnel unavailable — phones use JSONBlob fallback)\n');
      }
    }
  })();
} catch(e) {
  console.log('  (localtunnel not available)\n');
}
