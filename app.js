// ==========================================================================
// Disaster Relief Resource Coordinator — Application Logic
// ==========================================================================

var DB = {
  resources: [],
  camps: [],
  requests: [],
  allocations: [],
  volunteers: [],
  donors: [],
  donations: [],
  users: [],
  counters: { r: 0, c: 0, q: 0, a: 0, v: 0, d: 0, n: 0, u: 0 }
};

var currentUser = null;
var loginMode = '';
var _cloudReady = false;

// ── DUAL-SERVER SMART ROUTING ──
var LOCAL_URL  = 'http://localhost:8080/api/data';
var PING_URL   = 'http://localhost:8080/api/ping';
var CLOUD_URL  = 'https://jsonblob.com/api/jsonBlob/019e27ec-bda3-73a3-a0a6-17e16cf2a660';
var API_URL    = CLOUD_URL;   // default until ping resolves
var _isLocal   = false;

function updateServerBadges(local) {
  _isLocal = local;
  API_URL = local ? LOCAL_URL : CLOUD_URL;
  var badges = document.querySelectorAll('.server-status-badge');
  badges.forEach(function(b) {
    if (local) {
      b.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse inline-block mr-1"></span> 🟢 Local Server';
      b.className = b.className.replace(/text-\S+/g, '').replace(/bg-\S+\/10/g, '').replace(/border-\S+\/20/g, '').trim();
      b.classList.add('text-tertiary', 'bg-tertiary/10', 'border-tertiary/20');
    } else {
      b.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block mr-1"></span> ☁️ Cloud Mode';
      b.className = b.className.replace(/text-\S+/g, '').replace(/bg-\S+\/10/g, '').replace(/border-\S+\/20/g, '').trim();
      b.classList.add('text-primary', 'bg-primary/10', 'border-primary/20');
    }
  });
}

// Ping the local server; if alive use local, otherwise use cloud
function detectServer(callback) {
  fetch(PING_URL, { method: 'GET', signal: AbortSignal.timeout(1500) })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d && d.ok) {
        updateServerBadges(true);
        if (callback) callback(true);
      } else {
        updateServerBadges(false);
        if (callback) callback(false);
      }
    })
    .catch(function() {
      updateServerBadges(false);
      if (callback) callback(false);
    });
}

// Re-check server every 30 seconds (so phone or browser auto-switches when laptop turns on/off)
setInterval(function() {
  detectServer(null);
}, 30000);

// Global filters for lists
var adminFilters = {
  resource: '',
  camp: '',
  request: '',
  volunteer: '',
  donor: '',
  user: ''
};

// Global pagination state
var paginationState = {
  resource: { current: 1, limit: 10 }
};

// ── DATA PERSISTENCE ──
function save() {
  localStorage.setItem('reliefDB', JSON.stringify(DB));
  var method = _isLocal ? 'POST' : 'PUT';
  fetch(API_URL, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(DB)
  }).catch(function() {
    // If local save failed, retry on cloud
    if (_isLocal) {
      fetch(CLOUD_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DB)
      }).catch(function() {});
    }
  });
}

function loadFromCloud(callback) {
  fetch(API_URL).then(function(r) {
    return r.json();
  }).then(function(d) {
    if (d && typeof d === 'object' && d.counters) {
      DB = d;
      localStorage.setItem('reliefDB', JSON.stringify(DB));
      _cloudReady = true;
    }
    if (callback) callback(true);
  }).catch(function() {
    // Fallback: try cloud if local failed
    if (_isLocal) {
      fetch(CLOUD_URL).then(function(r) { return r.json(); })
        .then(function(d) {
          if (d && d.counters) { DB = d; localStorage.setItem('reliefDB', JSON.stringify(DB)); }
          if (callback) callback(false);
        }).catch(function() {
          var local = localStorage.getItem('reliefDB');
          if (local) DB = JSON.parse(local);
          if (callback) callback(false);
        });
    } else {
      var local = localStorage.getItem('reliefDB');
      if (local) DB = JSON.parse(local);
      if (callback) callback(false);
    }
  });
}

function resetLocalData() {
  localStorage.removeItem('reliefDB');
  detectServer(function() {
    loadFromCloud(function() {
      toast('Data refreshed from ' + (_isLocal ? 'Local Server' : 'Cloud') + '!', 'success');
    });
  });
}

// ── SCREEN MANAGEMENT ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  var activeScreen = document.getElementById(id);
  activeScreen.style.display = id === 'login-screen' ? 'flex' : 'block';
  setTimeout(function() {
    activeScreen.classList.add('active');
  }, 50);
}

// ── TOAST NOTIFICATIONS ──
function toast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  
  // Set theme colors based on type
  if (type === 'error') {
    t.className = 'fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-6 py-4 rounded-xl border font-label-md shadow-2xl transition-all duration-300 bg-error/90 text-on-error border-error glow-error';
  } else if (type === 'info') {
    t.className = 'fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-6 py-4 rounded-xl border font-label-md shadow-2xl transition-all duration-300 bg-primary/90 text-on-primary border-primary glow-primary';
  } else { // success
    t.className = 'fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-6 py-4 rounded-xl border font-label-md shadow-2xl transition-all duration-300 bg-tertiary/90 text-on-tertiary border-tertiary active-glow';
  }
  
  setTimeout(function() {
    t.classList.add('hidden');
  }, 2500);
}

// ── AUTHENTICATION FLOW ──
function handleLogin(mode) {
  if (mode === 'admin') {
    var u = document.getElementById('inp-username').value;
    var p = document.getElementById('inp-password').value;
    var err = document.getElementById('login-error-admin');
    err.classList.add('hidden');
    
    if (u !== 'admin' || p !== '12345678') {
      err.textContent = 'Invalid administrator credentials.';
      err.classList.remove('hidden');
      return;
    }
    
    toggleModal('adminModal');
    loadFromCloud(function() {
      toast('Welcome Admin, Mission Control active.', 'success');
      showScreen('admin-screen');
      // Set active nav styling
      document.querySelectorAll('.admin-nav-btn').forEach(function(b) {
        b.className = 'w-full flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-white/5 transition-all rounded-lg group text-left admin-nav-btn';
      });
      var dashBtn = document.querySelector('[onclick*="dashboard"]');
      if (dashBtn) {
        dashBtn.className = 'w-full flex items-center gap-3 px-4 py-3 text-primary bg-primary/10 border-r-4 border-primary transition-all rounded-lg group text-left admin-nav-btn font-semibold';
      }
      document.getElementById('admin-view-title').textContent = 'System Overview';
      renderAdmin('dashboard');
    });
    
  } else if (mode === 'user') {
    var uid = document.getElementById('inp-userid').value;
    var err = document.getElementById('login-error-user');
    err.classList.add('hidden');
    
    if (!uid) {
      err.textContent = 'Please enter a valid representative ID.';
      err.classList.remove('hidden');
      return;
    }
    
    err.textContent = 'Authenticating secure connection...';
    err.classList.remove('hidden');
    
    loadFromCloud(function() {
      err.classList.add('hidden');
      currentUser = DB.users.find(function(user) {
        return user.id === uid;
      });
      
      if (!currentUser) {
        err.textContent = 'Representative ID not registered.';
        err.classList.remove('hidden');
        return;
      }
      
      toggleModal('userModal');
      document.getElementById('user-name-display').textContent = 'Welcome back, ' + currentUser.name;
      document.getElementById('user-camp-display').textContent = currentUser.campName + ' Representative';
      
      toast('Representative login approved.', 'success');
      showScreen('user-screen');
      
      // Set active nav styling
      document.querySelectorAll('.user-nav-btn').forEach(function(b) {
        b.className = 'w-full flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-white/5 transition-all rounded-lg group text-left user-nav-btn';
      });
      var homeBtn = document.querySelector('[onclick*="user-home"]');
      if (homeBtn) {
        homeBtn.className = 'w-full flex items-center gap-3 px-4 py-3 text-tertiary bg-tertiary/10 border-r-4 border-tertiary transition-all rounded-lg group text-left user-nav-btn font-semibold';
      }
      renderUser('user-home');
    });
    
  } else if (mode === 'register') {
    var cname = document.getElementById('inp-reg-camp-name').value;
    var name = document.getElementById('inp-reg-name').value;
    var phone = document.getElementById('inp-reg-phone').value;
    var loc = document.getElementById('inp-reg-location').value;
    var state = document.getElementById('inp-reg-state').value;
    var disaster = document.getElementById('inp-reg-disaster').value;
    var pop = document.getElementById('inp-reg-population').value;
    var err = document.getElementById('login-error-reg');
    err.classList.add('hidden');
    
    if (!cname || !name || !phone) {
      err.textContent = 'Please fill out Camp Name, Representative Name, and Phone.';
      err.classList.remove('hidden');
      return;
    }
    
    loadFromCloud(function() {
      // Create new camp
      var campID = 'CAMP' + (++DB.counters.c);
      var c = {
        id: campID,
        name: cname,
        location: loc || 'N/A',
        state: state || 'N/A',
        disaster: disaster,
        population: +pop || 100,
        severity: 2,
        contact: name,
        phone: phone,
        date: now()
      };
      DB.camps.push(c);
      
      // Create new representative user
      var userID = 'USER' + (++DB.counters.u);
      var u = {
        id: userID,
        name: name,
        phone: phone,
        campID: campID,
        campName: cname
      };
      DB.users.push(u);
      
      save();
      currentUser = u;
      
      toggleModal('registerModal');
      document.getElementById('user-name-display').textContent = 'Welcome back, ' + u.name;
      document.getElementById('user-camp-display').textContent = u.campName + ' Representative';
      
      toast('Registration complete! ID generated: ' + u.id, 'success');
      showScreen('user-screen');
      
      // Set active nav styling
      document.querySelectorAll('.user-nav-btn').forEach(function(b) {
        b.className = 'w-full flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-white/5 transition-all rounded-lg group text-left user-nav-btn';
      });
      var homeBtn = document.querySelector('[onclick*="user-home"]');
      if (homeBtn) {
        homeBtn.className = 'w-full flex items-center gap-3 px-4 py-3 text-tertiary bg-tertiary/10 border-r-4 border-tertiary transition-all rounded-lg group text-left user-nav-btn font-semibold';
      }
      renderUser('user-home');
    });
  }
}

function logout() {
  showScreen('login-screen');
  currentUser = null;
  document.querySelectorAll('input').forEach(function(i) { i.value = ''; });
  toast('Session terminated safely.', 'info');
}

// ── UTILITIES ──
function now() {
  var d = new Date();
  return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function getSeverityBadge(sev) {
  var sevLabel = ['', 'LOW', 'MODERATE', 'HIGH', 'SEVERE', 'CRITICAL'][sev] || 'LOW';
  var badgeClass = '';
  var dotClass = '';
  
  if (sev >= 5) {
    badgeClass = 'bg-error/10 text-error border-error/20 glow-error';
    dotClass = 'bg-error';
  } else if (sev >= 4) {
    badgeClass = 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    dotClass = 'bg-amber-500';
  } else if (sev >= 3) {
    badgeClass = 'bg-primary/10 text-primary border-primary/20 glow-primary';
    dotClass = 'bg-primary';
  } else {
    badgeClass = 'bg-tertiary/10 text-tertiary border-tertiary/20 active-glow';
    dotClass = 'bg-tertiary';
  }
  
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold uppercase ' + badgeClass + '">' +
         '<span class="w-1.5 h-1.5 rounded-full ' + dotClass + ' animate-pulse"></span>' +
         sevLabel + '</span>';
}

function getRequestStatusBadge(status) {
  if (status === 'APPROVED') {
    return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tertiary/10 text-tertiary text-xs font-bold border border-tertiary/20 active-glow"><span class="w-1.5 h-1.5 bg-tertiary rounded-full"></span>APPROVED</span>';
  } else if (status === 'REJECTED') {
    return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-error/10 text-error text-xs font-bold border border-error/20"><span class="w-1.5 h-1.5 bg-error rounded-full"></span>REJECTED</span>';
  } else {
    return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20 glow-primary"><span class="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span>PENDING</span>';
  }
}

function getCategoryBadge(cat) {
  var col = 'bg-white/5 text-outline border-white/10';
  if (cat === 'Food') col = 'bg-tertiary/10 text-tertiary border-tertiary/20';
  else if (cat === 'Water') col = 'bg-primary/10 text-primary border-primary/20';
  else if (cat === 'Medicine') col = 'bg-secondary/10 text-secondary border-secondary/20';
  else if (cat === 'Shelter') col = 'bg-purple-500/10 text-purple-400 border-purple-500/20';
  else if (cat === 'Clothing') col = 'bg-amber-500/10 text-amber-500 border-amber-500/20';
  return '<span class="px-3 py-1 rounded-full text-xs border font-medium ' + col + '">' + cat + '</span>';
}

// ── COMMON MODAL DIALOGS ──
function openModal(title, html) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// Update clock in top navigation bar
function updateAdminTime() {
  var t = document.getElementById('admin-time-display');
  if (t) {
    t.textContent = now();
  }
}
setInterval(updateAdminTime, 10000);

// ── ADMIN CONSOLE ACTIONS & TEMPLATES ──
function adminNav(btn, view) {
  document.querySelectorAll('.admin-nav-btn').forEach(function(b) {
    b.className = 'w-full flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-white/5 transition-all rounded-lg group text-left admin-nav-btn';
  });
  btn.className = 'w-full flex items-center gap-3 px-4 py-3 text-primary bg-primary/10 border-r-4 border-primary transition-all rounded-lg group text-left admin-nav-btn font-semibold';
  
  // Set View Title
  var titles = {
    dashboard: 'System Overview',
    resources: 'Resource Inventory',
    'low-stock': 'Critical Stock Alerts',
    camps: 'Active Relief Camps',
    requests: 'All Requests Log',
    pending: 'Pending Supply Requests',
    allocations: 'Allocation History Log',
    volunteers: 'Volunteers Directory',
    donors: 'Donors Directory',
    users: 'Representative Accounts'
  };
  document.getElementById('admin-view-title').textContent = titles[view] || 'ReliefHQ Admin';
  renderAdmin(view);
}

function renderAdmin(view) {
  var main = document.getElementById('admin-main');
  var h = '';
  
  if (view === 'dashboard') {
    h = adminDashboardTemplate();
  } else if (view === 'resources') {
    h = adminResourcesTemplate();
  } else if (view === 'low-stock') {
    h = adminLowStockTemplate();
  } else if (view === 'camps') {
    h = adminCampsTemplate();
  } else if (view === 'requests') {
    h = adminRequestsTemplate(false);
  } else if (view === 'pending') {
    h = adminRequestsTemplate(true);
  } else if (view === 'allocations') {
    h = adminAllocationsTemplate();
  } else if (view === 'volunteers') {
    h = adminVolunteersTemplate();
  } else if (view === 'donors') {
    h = adminDonorsTemplate();
  } else if (view === 'users') {
    h = adminUsersTemplate();
  }
  
  main.innerHTML = h;
}

function adminDashboardTemplate() {
  var pending = DB.requests.filter(function(r) { return r.status === 'PENDING'; }).length;
  var critical = DB.camps.filter(function(c) { return c.severity >= 4; }).length;
  var lowStock = DB.resources.filter(function(r) { return r.quantity <= r.threshold; }).length;
  var activeAlloc = DB.allocations.length;
  var totalResources = DB.resources.reduce(function(sum, r) { return sum + r.quantity; }, 0);
  
  // Update Notification Badge on topbar
  var notif = document.getElementById('admin-notif-badge');
  if (notif) {
    if (pending > 0) notif.classList.remove('hidden');
    else notif.classList.add('hidden');
  }

  // Compile up to 4 recent requests
  var recentRequestsRows = '';
  var recents = DB.requests.slice().reverse().slice(0, 4);
  recents.forEach(function(r) {
    var priorityPill = '';
    if (r.status === 'PENDING') {
      priorityPill = '<span class="px-2 py-1 rounded bg-primary/10 text-primary text-[10px] font-bold uppercase border border-primary/20 flex items-center gap-1 w-fit"><span class="w-1 h-1 rounded-full bg-primary"></span> Review</span>';
    } else if (r.status === 'APPROVED') {
      priorityPill = '<span class="px-2 py-1 rounded bg-tertiary/10 text-tertiary text-[10px] font-bold uppercase border border-tertiary/20 flex items-center gap-1 w-fit"><span class="w-1 h-1 rounded-full bg-tertiary"></span> Sent</span>';
    } else {
      priorityPill = '<span class="px-2 py-1 rounded bg-error/10 text-error text-[10px] font-bold uppercase border border-error/20 flex items-center gap-1 w-fit"><span class="w-1 h-1 rounded-full bg-error"></span> Denied</span>';
    }
    
    recentRequestsRows += '<tr class="hover:bg-white/5 transition-colors border-b border-white/5">' +
      '<td class="px-6 py-4 text-body-md font-body-md text-on-surface">' + r.campName + '</td>' +
      '<td class="px-6 py-4 text-body-md font-body-md text-on-surface-variant">' + r.resourceName + ' (' + r.quantity + ' ' + r.unit + ')</td>' +
      '<td class="px-6 py-4">' + priorityPill + '</td>' +
      '<td class="px-6 py-4">' +
        '<button onclick="adminNav(document.querySelector(\'[onclick*=\\\'pending\\\']\'), \'pending\')" class="p-2 hover:bg-primary/20 rounded-full text-primary transition-all">' +
          '<span class="material-symbols-outlined">visibility</span>' +
        '</button>' +
      '</td>' +
      '</tr>';
  });
  
  if (recentRequestsRows === '') {
    recentRequestsRows = '<tr><td colspan="4" class="px-6 py-12 text-center text-outline text-sm">No supply requests recorded</td></tr>';
  }

  // Compile up to 3 recent allocations
  var timelineItems = '';
  var recentAlloc = DB.allocations.slice().reverse().slice(0, 3);
  recentAlloc.forEach(function(a, idx) {
    var colors = ['border-primary', 'border-tertiary', 'border-secondary'];
    var dots = ['bg-primary', 'bg-tertiary', 'bg-secondary'];
    var color = colors[idx % 3];
    var dot = dots[idx % 3];
    
    timelineItems += '<div class="relative">' +
      '<div class="absolute -left-[41px] top-1 w-5 h-5 rounded-full bg-surface-container border-2 ' + color + ' flex items-center justify-center z-10">' +
        '<span class="w-1.5 h-1.5 rounded-full ' + dot + '"></span>' +
      '</div>' +
      '<div class="flex flex-col">' +
        '<div class="flex justify-between">' +
          '<span class="text-on-surface font-label-md text-label-md">' + a.resourceName + ' Dispatched</span>' +
          '<span class="text-on-surface-variant font-label-sm text-label-sm">' + a.timestamp + '</span>' +
        '</div>' +
        '<p class="text-on-surface-variant font-body-md text-body-md mt-1">Sent ' + a.qty + ' units to ' + a.campName + ' (Allocated by ' + a.by + ')</p>' +
      '</div>' +
      '</div>';
  });

  if (timelineItems === '') {
    timelineItems = '<div class="text-center text-outline py-8 text-sm">No recent allocation activity</div>';
  }

  return '<div class="space-y-8">' +
    '<!-- Hero Banner -->' +
    '<section class="relative h-48 rounded-xl overflow-hidden glass-card flex flex-col justify-end p-8">' +
      '<div class="absolute inset-0 z-0">' +
        '<img class="w-full h-full object-cover opacity-20" src="https://lh3.googleusercontent.com/aida-public/AB6AXuByMDraEQe5Jtqz4L-GwI3h-SaPnZTKZYBrk1gHxSS9spxl5UXWmaBs8Bf46GSByruaBriMxbSAph7f811FO4bh1-1buuqMSBrcFM_AZbEXoz1ww4-bnV5m5xK6Vn5AUYdXIQRAQTzz1VcJqKyW6ldMNYGOdE99XrVq5ghvtwLWbDLmUAgOJme_C0z1p972UBSwPCAFF4SRsWoPiH4JEjQA27birplxFSBrYJXnCw2k73YexpILN447K8cgLatVhNY3oDlL-VkhUw"/>' +
        '<div class="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent"></div>' +
      '</div>' +
      '<div class="relative z-10 flex justify-between items-end">' +
        '<div>' +
          '<h2 class="font-display-lg text-headline-lg-mobile md:text-display-lg text-on-surface">Mission Command Status</h2>' +
          '<p class="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mt-2">Active response in ' + DB.camps.length + ' regional sectors. Critical escalations require action.</p>' +
        '</div>' +
      '</div>' +
    '</section>' +

    '<!-- 7 Stats Bento Grid -->' +
    '<section class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">' +
      '<div class="glass-card p-5 rounded-xl flex flex-col justify-between">' +
        '<span class="material-symbols-outlined text-primary">segment</span>' +
        '<div class="mt-4"><p class="text-on-surface-variant font-label-md text-xs">Total Camps</p><h3 class="text-3xl font-headline-lg text-on-surface font-bold mt-1">' + String(DB.camps.length).padStart(2, '0') + '</h3></div>' +
      '</div>' +
      '<div class="glass-card p-5 rounded-xl flex flex-col justify-between ' + (critical > 0 ? 'border-error/20 bg-error/5 glow-error' : '') + '">' +
        '<span class="material-symbols-outlined ' + (critical > 0 ? 'text-error animate-pulse' : 'text-outline') + '">warning</span>' +
        '<div class="mt-4"><p class="text-on-surface-variant font-label-md text-xs">Critical Camps</p><h3 class="text-3xl font-headline-lg ' + (critical > 0 ? 'text-error' : 'text-on-surface') + ' font-bold mt-1">' + String(critical).padStart(2, '0') + '</h3></div>' +
      '</div>' +
      '<div class="glass-card p-5 rounded-xl flex flex-col justify-between ' + (pending > 0 ? 'border-amber-500/20 bg-amber-500/5' : '') + '">' +
        '<span class="material-symbols-outlined text-amber-500">pending_actions</span>' +
        '<div class="mt-4"><p class="text-on-surface-variant font-label-md text-xs">Pending Req</p><h3 class="text-3xl font-headline-lg text-amber-500 font-bold mt-1">' + String(pending).padStart(2, '0') + '</h3></div>' +
      '</div>' +
      '<div class="glass-card p-5 rounded-xl flex flex-col justify-between">' +
        '<span class="material-symbols-outlined text-primary">inventory_2</span>' +
        '<div class="mt-4"><p class="text-on-surface-variant font-label-md text-xs">Stock Units</p><h3 class="text-3xl font-headline-lg text-on-surface font-bold mt-1">' + (totalResources >= 1000 ? (totalResources/1000).toFixed(1) + 'k' : totalResources) + '</h3></div>' +
      '</div>' +
      '<div class="glass-card p-5 rounded-xl flex flex-col justify-between ' + (lowStock > 0 ? 'border-error/20 bg-error/5' : '') + '">' +
        '<span class="material-symbols-outlined text-error">inventory</span>' +
        '<div class="mt-4"><p class="text-on-surface-variant font-label-md text-xs">Low Stock</p><h3 class="text-3xl font-headline-lg text-error font-bold mt-1">' + String(lowStock).padStart(2, '0') + '</h3></div>' +
      '</div>' +
      '<div class="glass-card p-5 rounded-xl flex flex-col justify-between">' +
        '<span class="material-symbols-outlined text-purple-400">groups</span>' +
        '<div class="mt-4"><p class="text-on-surface-variant font-label-md text-xs">Volunteers</p><h3 class="text-3xl font-headline-lg text-on-surface font-bold mt-1">' + String(DB.volunteers.length).padStart(2, '0') + '</h3></div>' +
      '</div>' +
      '<div class="glass-card p-5 rounded-xl flex flex-col justify-between">' +
        '<span class="material-symbols-outlined text-tertiary">local_shipping</span>' +
        '<div class="mt-4"><p class="text-on-surface-variant font-label-md text-xs">Allocations</p><h3 class="text-3xl font-headline-lg text-on-surface font-bold mt-1">' + String(activeAlloc).padStart(2, '0') + '</h3></div>' +
      '</div>' +
    '</section>' +

    '<!-- Split View Area -->' +
    '<section class="grid grid-cols-1 lg:grid-cols-2 gap-gutter">' +
      '<!-- Recent Requests -->' +
      '<div class="glass-card rounded-xl flex flex-col h-[400px] overflow-hidden">' +
        '<div class="p-6 border-b border-white/5 flex justify-between items-center bg-surface-container-low/20">' +
          '<h4 class="font-headline-md text-headline-md text-on-surface flex items-center gap-2 text-lg font-semibold">' +
            '<span class="material-symbols-outlined text-primary">assignment_late</span>' +
            'Recent Requests Feed' +
          '</h4>' +
          '<button onclick="adminNav(document.querySelector(\'[onclick*=\\\'requests\\\']\'), \'requests\')" class="text-primary font-label-md text-xs hover:underline">View All</button>' +
        '</div>' +
        '<div class="flex-grow overflow-y-auto custom-scrollbar">' +
          '<table class="w-full text-left">' +
            '<thead class="sticky top-0 bg-surface-container-high z-10">' +
              '<tr class="text-on-surface-variant font-label-sm text-xs border-b border-white/5 uppercase bg-surface-container">' +
                '<th class="px-6 py-3 font-medium">Source Camp</th>' +
                '<th class="px-6 py-3 font-medium">Items</th>' +
                '<th class="px-6 py-3 font-medium">Status</th>' +
                '<th class="px-6 py-3 font-medium">View</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody class="divide-y divide-white/5">' +
              recentRequestsRows +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +

      '<!-- Recent Allocations timeline -->' +
      '<div class="glass-card rounded-xl flex flex-col h-[400px] overflow-hidden">' +
        '<div class="p-6 border-b border-white/5 bg-surface-container-low/20">' +
          '<h4 class="font-headline-md text-headline-md text-on-surface flex items-center gap-2 text-lg font-semibold">' +
            '<span class="material-symbols-outlined text-tertiary">history</span>' +
            'Latest Dispatches' +
          '</h4>' +
        '</div>' +
        '<div class="flex-grow p-6 overflow-y-auto custom-scrollbar">' +
          '<div class="relative pl-8 border-l-2 border-primary/20 space-y-6 pb-4 ml-3">' +
            timelineItems +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>' +
  '</div>';
}

function adminResourcesTemplate() {
  // Filters list
  var filtered = DB.resources.filter(function(r) {
    var matchSearch = r.name.toLowerCase().includes(adminFilters.resource.toLowerCase()) || 
                       r.id.toLowerCase().includes(adminFilters.resource.toLowerCase()) ||
                       r.category.toLowerCase().includes(adminFilters.resource.toLowerCase());
    return matchSearch;
  });

  // Render rows
  var rows = '';
  filtered.forEach(function(r, i) {
    var idx = DB.resources.indexOf(r);
    var low = r.quantity <= r.threshold;
    
    rows += '<tr class="hover:bg-white/5 transition-all border-b border-white/5 ' + (low ? 'bg-error-container/5' : '') + '">' +
      '<td class="px-6 py-4 font-body-md text-outline">' + r.id + '</td>' +
      '<td class="px-6 py-4 font-label-md text-on-surface font-semibold">' + r.name + '</td>' +
      '<td class="px-6 py-4">' + getCategoryBadge(r.category) + '</td>' +
      '<td class="px-6 py-4 text-right font-bold ' + (low ? 'text-error' : 'text-tertiary') + '">' + r.quantity + '</td>' +
      '<td class="px-6 py-4 text-outline">' + r.unit + '</td>' +
      '<td class="px-6 py-4 text-right text-outline">' + r.threshold + '</td>' +
      '<td class="px-6 py-4 text-outline text-center">' + r.expiry + '</td>' +
      '<td class="px-6 py-4 text-center">' +
        (low ? 
          '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-error/15 text-error text-[10px] font-bold uppercase border border-error/25 glow-error"><span class="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>LOW</span>' :
          '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-tertiary/15 text-tertiary text-[10px] font-bold uppercase border border-tertiary/25"><span class="w-1.5 h-1.5 rounded-full bg-tertiary"></span>OK</span>'
        ) +
      '</td>' +
      '<td class="px-6 py-4 text-right space-x-1">' +
        '<button onclick="modalEditResource(' + idx + ')" class="p-1.5 hover:bg-white/10 rounded-lg text-outline transition-all" title="Edit Quantity"><span class="material-symbols-outlined text-[18px]">edit</span></button>' +
        '<button onclick="deleteResource(' + idx + ')" class="p-1.5 hover:bg-error/15 hover:text-error rounded-lg text-outline transition-all" title="Delete Resource"><span class="material-symbols-outlined text-[18px]">delete</span></button>' +
      '</td>' +
      '</tr>';
  });

  if (rows === '') {
    rows = '<tr><td colspan="9" class="px-6 py-12 text-center text-outline text-sm">No matching inventory items found.</td></tr>';
  }

  return '<div class="space-y-6">' +
    '<!-- Action Header -->' +
    '<div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-container-low/30 p-4 rounded-xl border border-white/5">' +
      '<div class="flex items-center gap-3 w-full md:w-auto">' +
        '<div class="relative w-72 flex items-center bg-surface-container-low border border-white/10 rounded-full px-3 py-1.5 focus-within:border-primary transition-all">' +
          '<span class="material-symbols-outlined text-outline text-sm mr-2">search</span>' +
          '<input id="res-search-input" value="' + adminFilters.resource + '" oninput="updateAdminFilter(\'resource\', this.value)" class="bg-transparent border-none text-sm focus:ring-0 text-on-surface w-full p-0" placeholder="Filter stock..." type="text"/>' +
        '</div>' +
      '</div>' +
      '<button onclick="modalAddResource()" class="flex items-center gap-2 bg-primary text-on-primary px-6 py-2.5 rounded-xl font-label-md text-sm font-semibold glow-primary hover:brightness-110 active:scale-95 transition-all">' +
        '<span class="material-symbols-outlined text-base">add</span>Add Resource' +
      '</button>' +
    '</div>' +

    '<!-- Table -->' +
    '<div class="glass-card rounded-xl overflow-hidden">' +
      '<div class="overflow-x-auto">' +
        '<table class="w-full text-left border-collapse">' +
          '<thead>' +
            '<tr class="bg-white/5 border-b border-white/10 text-on-surface-variant font-label-sm text-xs uppercase">' +
              '<th class="px-6 py-4 font-semibold">ID</th>' +
              '<th class="px-6 py-4 font-semibold">Name</th>' +
              '<th class="px-6 py-4 font-semibold">Category</th>' +
              '<th class="px-6 py-4 font-semibold text-right">Qty</th>' +
              '<th class="px-6 py-4 font-semibold">Unit</th>' +
              '<th class="px-6 py-4 font-semibold text-right">Threshold</th>' +
              '<th class="px-6 py-4 font-semibold text-center">Expiry</th>' +
              '<th class="px-6 py-4 font-semibold text-center">Status</th>' +
              '<th class="px-6 py-4 font-semibold text-right">Actions</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody class="divide-y divide-white/5">' +
            rows +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>' +
    '</div>';
}

function updateAdminFilter(field, val) {
  adminFilters[field] = val;
  renderAdmin(field === 'resource' ? 'resources' : (field === 'camp' ? 'camps' : 'volunteers'));
  // Focus the input back
  var inputId = field === 'resource' ? 'res-search-input' : (field === 'camp' ? 'camp-search-input' : 'vol-search-input');
  var input = document.getElementById(inputId);
  if (input) {
    input.focus();
    // Move cursor to end
    var len = input.value.length;
    input.setSelectionRange(len, len);
  }
}

function adminLowStockTemplate() {
  var low = DB.resources.filter(function(r) { return r.quantity <= r.threshold; });
  var rows = '';
  low.forEach(function(r) {
    rows += '<tr class="hover:bg-white/5 transition-all border-b border-white/5 bg-error-container/5">' +
      '<td class="px-6 py-5 font-body-md text-outline">' + r.id + '</td>' +
      '<td class="px-6 py-5 font-label-md text-on-surface font-semibold">' + r.name + '</td>' +
      '<td class="px-6 py-5">' + getCategoryBadge(r.category) + '</td>' +
      '<td class="px-6 py-5 text-right font-bold text-error">' + r.quantity + '</td>' +
      '<td class="px-6 py-5 text-outline">' + r.unit + '</td>' +
      '<td class="px-6 py-5 text-right text-outline">' + r.threshold + '</td>' +
      '<td class="px-6 py-5 text-center">' +
        '<span class="inline-flex items-center gap-1.5 px-3 py-1 bg-error/15 text-error rounded-full text-xs font-bold glow-error border border-error/25"><span class="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>CRITICAL STOCK</span>' +
      '</td>' +
      '</tr>';
  });

  if (rows === '') {
    rows = '<tr><td colspan="7" class="px-6 py-12 text-center text-tertiary text-sm">✅ All supplies are adequately stocked above alert thresholds.</td></tr>';
  }

  return '<div class="glass-card rounded-xl overflow-hidden">' +
    '<div class="overflow-x-auto">' +
      '<table class="w-full text-left border-collapse">' +
        '<thead>' +
          '<tr class="bg-white/5 border-b border-white/10 text-on-surface-variant font-label-sm text-xs uppercase">' +
            '<th class="px-6 py-4 font-semibold">ID</th>' +
            '<th class="px-6 py-4 font-semibold">Name</th>' +
            '<th class="px-6 py-4 font-semibold">Category</th>' +
            '<th class="px-6 py-4 font-semibold text-right">Current Stock</th>' +
            '<th class="px-6 py-4 font-semibold">Unit</th>' +
            '<th class="px-6 py-4 font-semibold text-right">Min Threshold</th>' +
            '<th class="px-6 py-4 font-semibold text-center">Alert Status</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody class="divide-y divide-white/5">' +
          rows +
        '</tbody>' +
      '</table>' +
    '</div>' +
  '</div>';
}

function adminCampsTemplate() {
  var filtered = DB.camps.filter(function(c) {
    return c.name.toLowerCase().includes(adminFilters.camp.toLowerCase()) || 
           c.location.toLowerCase().includes(adminFilters.camp.toLowerCase()) ||
           c.disaster.toLowerCase().includes(adminFilters.camp.toLowerCase());
  });

  var rows = '';
  filtered.forEach(function(c, i) {
    var idx = DB.camps.indexOf(c);
    rows += '<tr class="hover:bg-white/5 transition-all border-b border-white/5">' +
      '<td class="px-6 py-5 font-body-md text-outline">' + c.id + '</td>' +
      '<td class="px-6 py-5 font-label-md text-on-surface font-semibold">' + c.name + '</td>' +
      '<td class="px-6 py-5 text-on-surface-variant">' + c.location + ', ' + c.state + '</td>' +
      '<td class="px-6 py-5 text-outline">' + c.disaster + '</td>' +
      '<td class="px-6 py-5 text-right font-medium">' + c.population + '</td>' +
      '<td class="px-6 py-5 text-center">' + getSeverityBadge(c.severity) + '</td>' +
      '<td class="px-6 py-5 text-outline text-sm">' + c.contact + '<br><span class="text-xs opacity-60">' + c.phone + '</span></td>' +
      '<td class="px-6 py-5 text-right">' +
        '<button onclick="modalEditCamp(' + idx + ')" class="px-4 py-2 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all rounded-lg font-label-md text-xs font-semibold">Modify</button>' +
      '</td>' +
      '</tr>';
  });

  if (rows === '') {
    rows = '<tr><td colspan="8" class="px-6 py-12 text-center text-outline text-sm">No camps registered.</td></tr>';
  }

  return '<div class="space-y-6">' +
    '<div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-container-low/30 p-4 rounded-xl border border-white/5">' +
      '<div class="relative w-72 flex items-center bg-surface-container-low border border-white/10 rounded-full px-3 py-1.5 focus-within:border-primary transition-all">' +
        '<span class="material-symbols-outlined text-outline text-sm mr-2">search</span>' +
        '<input id="camp-search-input" value="' + adminFilters.camp + '" oninput="updateAdminFilter(\'camp\', this.value)" class="bg-transparent border-none text-sm focus:ring-0 text-on-surface w-full p-0" placeholder="Filter camps..." type="text"/>' +
      '</div>' +
      '<button onclick="modalAddCamp()" class="flex items-center gap-2 bg-primary text-on-primary px-6 py-2.5 rounded-xl font-label-md text-sm font-semibold glow-primary hover:brightness-110 active:scale-95 transition-all">' +
        '<span class="material-symbols-outlined text-base">add</span>Register Camp' +
      '</button>' +
    '</div>' +

    '<div class="glass-card rounded-xl overflow-hidden">' +
      '<div class="overflow-x-auto">' +
        '<table class="w-full text-left border-collapse">' +
          '<thead>' +
            '<tr class="bg-white/5 border-b border-white/10 text-on-surface-variant font-label-sm text-xs uppercase">' +
              '<th class="px-6 py-4 font-semibold">ID</th>' +
              '<th class="px-6 py-4 font-semibold">Camp Name</th>' +
              '<th class="px-6 py-4 font-semibold">Location</th>' +
              '<th class="px-6 py-4 font-semibold">Disaster</th>' +
              '<th class="px-6 py-4 font-semibold text-right">Population</th>' +
              '<th class="px-6 py-4 font-semibold text-center">Severity</th>' +
              '<th class="px-6 py-4 font-semibold">Coordinator</th>' +
              '<th class="px-6 py-4 font-semibold text-right">Actions</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody class="divide-y divide-white/5">' +
            rows +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>' +
    '</div>';
}

function adminRequestsTemplate(pendingOnly) {
  var list = pendingOnly ? DB.requests.filter(function(r) { return r.status === 'PENDING'; }) : DB.requests;
  var rows = '';

  list.forEach(function(r) {
    var idx = DB.requests.indexOf(r);
    
    rows += '<tr class="hover:bg-white/5 transition-all border-b border-white/5">' +
      '<td class="px-6 py-5 font-mono text-primary text-sm">' + r.reqID + '</td>' +
      '<td class="px-6 py-5 font-label-md text-on-surface font-semibold">' + r.userName + '<br><span class="text-xs text-outline font-normal">ID: ' + r.userID + '</span></td>' +
      '<td class="px-6 py-5 text-on-surface-variant">' + r.campName + '</td>' +
      '<td class="px-6 py-5 font-medium">' + r.resourceName + '</td>' +
      '<td class="px-6 py-5 text-right font-bold">' + r.quantity + ' <span class="text-xs font-normal text-outline">' + r.unit + '</span></td>' +
      '<td class="px-6 py-5 text-center">' + getRequestStatusBadge(r.status) + '</td>' +
      '<td class="px-6 py-5 text-outline text-xs">' + r.submitTime + '</td>' +
      (pendingOnly ? 
        '<td class="px-6 py-5 text-right">' +
          '<button onclick="modalProcessReq(' + idx + ')" class="px-4 py-2 bg-primary text-on-primary glow-primary hover:brightness-110 active:scale-95 transition-all rounded-lg font-label-md text-xs font-semibold">Process Request</button>' +
        '</td>' : 
        '<td class="px-6 py-5 text-on-surface-variant text-sm font-normal italic">' + (r.note || '—') + '</td>'
      ) +
      '</tr>';
  });

  if (rows === '') {
    rows = '<tr><td colspan="' + (pendingOnly ? 8 : 8) + '" class="px-6 py-12 text-center text-outline text-sm">No supply requests recorded in this filter.</td></tr>';
  }

  return '<div class="glass-card rounded-xl overflow-hidden">' +
    '<div class="overflow-x-auto">' +
      '<table class="w-full text-left border-collapse">' +
        '<thead>' +
          '<tr class="bg-white/5 border-b border-white/10 text-on-surface-variant font-label-sm text-xs uppercase">' +
            '<th class="px-6 py-4 font-semibold">Req ID</th>' +
            '<th class="px-6 py-4 font-semibold">Representative</th>' +
            '<th class="px-6 py-4 font-semibold">Camp Location</th>' +
            '<th class="px-6 py-4 font-semibold">Supply Item</th>' +
            '<th class="px-6 py-4 font-semibold text-right">Qty</th>' +
            '<th class="px-6 py-4 font-semibold text-center">Status</th>' +
            '<th class="px-6 py-4 font-semibold">Submitted</th>' +
            (pendingOnly ? '<th class="px-6 py-4 font-semibold text-right">Process</th>' : '<th class="px-6 py-4 font-semibold">Dispatch Note</th>') +
          '</tr>' +
        '</thead>' +
        '<tbody class="divide-y divide-white/5">' +
          rows +
        '</tbody>' +
      '</table>' +
    '</div>' +
  '</div>';
}

function adminAllocationsTemplate() {
  var rows = '';
  DB.allocations.forEach(function(a) {
    rows += '<tr class="hover:bg-white/5 transition-all border-b border-white/5">' +
      '<td class="px-6 py-5 font-mono text-primary text-sm">' + a.id + '</td>' +
      '<td class="px-6 py-5 font-label-md text-on-surface font-semibold">' + a.campName + '</td>' +
      '<td class="px-6 py-5 text-on-surface-variant">' + a.resourceName + '</td>' +
      '<td class="px-6 py-5 text-right font-bold text-tertiary">' + a.qty + '</td>' +
      '<td class="px-6 py-5 text-outline text-sm">' + a.timestamp + '</td>' +
      '<td class="px-6 py-5 text-outline text-sm font-semibold">' + a.by + '</td>' +
      '</tr>';
  });

  if (rows === '') {
    rows = '<tr><td colspan="6" class="px-6 py-12 text-center text-outline text-sm">No logistics allocations recorded yet.</td></tr>';
  }

  return '<div class="glass-card rounded-xl overflow-hidden">' +
    '<div class="overflow-x-auto">' +
      '<table class="w-full text-left border-collapse">' +
        '<thead>' +
          '<tr class="bg-white/5 border-b border-white/10 text-on-surface-variant font-label-sm text-xs uppercase">' +
            '<th class="px-6 py-4 font-semibold">Alloc ID</th>' +
            '<th class="px-6 py-4 font-semibold">Destination Camp</th>' +
            '<th class="px-6 py-4 font-semibold">Resource Dispatched</th>' +
            '<th class="px-6 py-4 font-semibold text-right">Qty</th>' +
            '<th class="px-6 py-4 font-semibold">Timestamp</th>' +
            '<th class="px-6 py-4 font-semibold">Authorized By</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody class="divide-y divide-white/5">' +
          rows +
        '</tbody>' +
      '</table>' +
    '</div>' +
  '</div>';
}

function adminVolunteersTemplate() {
  var filtered = DB.volunteers.filter(function(v) {
    return v.name.toLowerCase().includes(adminFilters.volunteer.toLowerCase()) || 
           v.skill.toLowerCase().includes(adminFilters.volunteer.toLowerCase()) ||
           v.camp.toLowerCase().includes(adminFilters.volunteer.toLowerCase());
  });

  var rows = '';
  filtered.forEach(function(v) {
    rows += '<tr class="hover:bg-white/5 transition-all border-b border-white/5">' +
      '<td class="px-6 py-5 font-mono text-outline text-sm">' + v.id + '</td>' +
      '<td class="px-6 py-5 font-label-md text-on-surface font-semibold">' + v.name + '</td>' +
      '<td class="px-6 py-5"><span class="px-3 py-1 bg-secondary/10 text-secondary border border-secondary/20 rounded-full text-xs font-semibold">' + v.skill + '</span></td>' +
      '<td class="px-6 py-5 text-on-surface-variant text-sm">' + v.contact + '<br><span class="text-xs opacity-60">' + v.email + '</span></td>' +
      '<td class="px-6 py-5 text-outline">' + v.camp + '</td>' +
      '<td class="px-6 py-5 text-center">' +
        (v.active ? 
          '<span class="px-3 py-1 bg-tertiary/10 text-tertiary border border-tertiary/20 rounded-full text-xs font-bold uppercase active-glow">ACTIVE</span>' :
          '<span class="px-3 py-1 bg-white/5 text-outline border border-white/10 rounded-full text-xs font-bold uppercase">INACTIVE</span>'
        ) +
      '</td>' +
      '</tr>';
  });

  if (rows === '') {
    rows = '<tr><td colspan="6" class="px-6 py-12 text-center text-outline text-sm">No volunteers registered.</td></tr>';
  }

  return '<div class="space-y-6">' +
    '<div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-container-low/30 p-4 rounded-xl border border-white/5">' +
      '<div class="relative w-72 flex items-center bg-surface-container-low border border-white/10 rounded-full px-3 py-1.5 focus-within:border-primary transition-all">' +
        '<span class="material-symbols-outlined text-outline text-sm mr-2">search</span>' +
        '<input id="vol-search-input" value="' + adminFilters.volunteer + '" oninput="updateAdminFilter(\'volunteer\', this.value)" class="bg-transparent border-none text-sm focus:ring-0 text-on-surface w-full p-0" placeholder="Filter volunteers..." type="text"/>' +
      '</div>' +
      '<button onclick="modalAddVolunteer()" class="flex items-center gap-2 bg-primary text-on-primary px-6 py-2.5 rounded-xl font-label-md text-sm font-semibold glow-primary hover:brightness-110 active:scale-95 transition-all">' +
        '<span class="material-symbols-outlined text-base">add</span>Register Volunteer' +
      '</button>' +
    '</div>' +

    '<div class="glass-card rounded-xl overflow-hidden">' +
      '<div class="overflow-x-auto">' +
        '<table class="w-full text-left border-collapse">' +
          '<thead>' +
            '<tr class="bg-white/5 border-b border-white/10 text-on-surface-variant font-label-sm text-xs uppercase">' +
              '<th class="px-6 py-4 font-semibold">Vol ID</th>' +
              '<th class="px-6 py-4 font-semibold">Full Name</th>' +
              '<th class="px-6 py-4 font-semibold">Specialization</th>' +
              '<th class="px-6 py-4 font-semibold">Contact Info</th>' +
              '<th class="px-6 py-4 font-semibold">Assigned Camp</th>' +
              '<th class="px-6 py-4 font-semibold text-center">Status</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody class="divide-y divide-white/5">' +
            rows +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>' +
    '</div>';
}

function adminDonorsTemplate() {
  var rows = '';
  DB.donors.forEach(function(d) {
    rows += '<tr class="hover:bg-white/5 transition-all border-b border-white/5">' +
      '<td class="px-6 py-5 font-mono text-outline text-sm">' + d.id + '</td>' +
      '<td class="px-6 py-5 font-label-md text-on-surface font-semibold">' + d.name + '</td>' +
      '<td class="px-6 py-5 text-on-surface-variant font-medium">' + d.org + '</td>' +
      '<td class="px-6 py-5 text-outline text-sm">' + d.contact + '</td>' +
      '<td class="px-6 py-5 text-outline text-sm">' + d.email + '</td>' +
      '</tr>';
  });

  if (rows === '') {
    rows = '<tr><td colspan="5" class="px-6 py-12 text-center text-outline text-sm">No donors registered yet.</td></tr>';
  }

  return '<div class="space-y-6">' +
    '<div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-container-low/30 p-4 rounded-xl border border-white/5 justify-end">' +
      '<button onclick="modalAddDonor()" class="flex items-center gap-2 bg-primary text-on-primary px-6 py-2.5 rounded-xl font-label-md text-sm font-semibold glow-primary hover:brightness-110 active:scale-95 transition-all">' +
        '<span class="material-symbols-outlined text-base">add</span>Register Donor' +
      '</button>' +
    '</div>' +

    '<div class="glass-card rounded-xl overflow-hidden">' +
      '<div class="overflow-x-auto">' +
        '<table class="w-full text-left border-collapse">' +
          '<thead>' +
            '<tr class="bg-white/5 border-b border-white/10 text-on-surface-variant font-label-sm text-xs uppercase">' +
              '<th class="px-6 py-4 font-semibold">Donor ID</th>' +
              '<th class="px-6 py-4 font-semibold">Full Name</th>' +
              '<th class="px-6 py-4 font-semibold">Organization</th>' +
              '<th class="px-6 py-4 font-semibold">Phone</th>' +
              '<th class="px-6 py-4 font-semibold">Email</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody class="divide-y divide-white/5">' +
            rows +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>' +
    '</div>';
}

function adminUsersTemplate() {
  var rows = '';
  DB.users.forEach(function(u) {
    rows += '<tr class="hover:bg-white/5 transition-all border-b border-white/5">' +
      '<td class="px-6 py-5 font-mono text-primary text-sm">' + u.id + '</td>' +
      '<td class="px-6 py-5 font-label-md text-on-surface font-semibold">' + u.name + '</td>' +
      '<td class="px-6 py-5 text-on-surface-variant">' + u.phone + '</td>' +
      '<td class="px-6 py-5 text-outline font-semibold text-tertiary">' + u.campName + '</td>' +
      '</tr>';
  });

  if (rows === '') {
    rows = '<tr><td colspan="4" class="px-6 py-12 text-center text-outline text-sm">No representative users registered.</td></tr>';
  }

  return '<div class="glass-card rounded-xl overflow-hidden">' +
    '<div class="overflow-x-auto">' +
      '<table class="w-full text-left border-collapse">' +
        '<thead>' +
          '<tr class="bg-white/5 border-b border-white/10 text-on-surface-variant font-label-sm text-xs uppercase">' +
            '<th class="px-6 py-4 font-semibold">User ID</th>' +
            '<th class="px-6 py-4 font-semibold">Representative Name</th>' +
            '<th class="px-6 py-4 font-semibold">Phone Number</th>' +
            '<th class="px-6 py-4 font-semibold">Associated Camp</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody class="divide-y divide-white/5">' +
          rows +
        '</tbody>' +
      '</table>' +
    '</div>' +
  '</div>';
}

// ── ADMIN MODALS TRIGGER ACTIONS ──
function modalAddResource() {
  var html = '<div class="space-y-4">' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Resource Name</label>' +
    '<input id="m-rname" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none" type="text" placeholder="e.g. Basmati Rice"></div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Category</label>' +
    '<select id="m-rcat" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface bg-surface-container">' +
      '<option>Food</option><option>Water</option><option>Medicine</option><option>Shelter</option><option>Clothing</option><option>Equipment</option>' +
    '</select></div>' +
    '<div class="grid grid-cols-2 gap-4">' +
      '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Quantity</label>' +
      '<input id="m-rqty" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="number"></div>' +
      '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Unit</label>' +
      '<input id="m-runit" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="text" placeholder="kg / boxes / units"></div>' +
    '</div>' +
    '<div class="grid grid-cols-2 gap-4">' +
      '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Alert Threshold</label>' +
      '<input id="m-rthresh" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="number"></div>' +
      '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Expiry</label>' +
      '<input id="m-rexp" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="text" placeholder="DD/MM/YYYY or N/A"></div>' +
    '</div>' +
    '<button onclick="addResource()" class="w-full py-3 bg-primary text-on-primary font-label-md rounded-lg glow-primary hover:brightness-110 active:scale-95 transition-all mt-4 font-semibold">' +
      'Confirm & Add to Inventory' +
    '</button>' +
    '</div>';
  openModal('Register New Depot Supply', html);
}

function addResource() {
  var n = document.getElementById('m-rname').value;
  var cat = document.getElementById('m-rcat').value;
  var qty = +document.getElementById('m-rqty').value;
  var unit = document.getElementById('m-runit').value;
  var th = +document.getElementById('m-rthresh').value;
  var exp = document.getElementById('m-rexp').value;
  
  if (!n) {
    toast('Please enter a resource name', 'error');
    return;
  }
  
  var r = {
    id: 'RES' + (++DB.counters.r),
    name: n,
    category: cat,
    quantity: qty || 0,
    unit: unit || 'units',
    threshold: th || 0,
    expiry: exp || 'N/A',
    location: 'Main Depot'
  };
  
  DB.resources.push(r);
  save();
  closeModal();
  toast('Resource added: ' + r.id, 'success');
  renderAdmin('resources');
}

function modalEditResource(i) {
  var r = DB.resources[i];
  var html = '<div class="space-y-4">' +
    '<div class="bg-surface-container-low/50 p-4 rounded-xl border border-white/5 mb-4">' +
      '<h4 class="font-semibold text-primary text-sm">' + r.name + ' (' + r.category + ')</h4>' +
      '<p class="text-xs text-outline mt-1">Current Stock Level: ' + r.quantity + ' ' + r.unit + '</p>' +
    '</div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Adjust Stock Quantity</label>' +
    '<input id="m-eq" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none" type="number" value="' + r.quantity + '"></div>' +
    '<button onclick="editResource(' + i + ')" class="w-full py-3 bg-primary text-on-primary font-label-md rounded-lg glow-primary hover:brightness-110 active:scale-95 transition-all mt-4 font-semibold">' +
      'Save Stock Settings' +
    '</button>' +
    '</div>';
  openModal('Adjust supply levels: ' + r.id, html);
}

function editResource(i) {
  var newQty = +document.getElementById('m-eq').value;
  DB.resources[i].quantity = newQty;
  save();
  closeModal();
  toast('Resource stock levels adjusted.', 'success');
  renderAdmin('resources');
}

function deleteResource(i) {
  if (confirm('Permanently remove ' + DB.resources[i].name + ' from global stock inventory?')) {
    var name = DB.resources[i].name;
    DB.resources.splice(i, 1);
    save();
    toast('Removed ' + name + ' from depot listings.', 'info');
    renderAdmin('resources');
  }
}

function modalAddCamp() {
  var html = '<div class="space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Camp Name</label>' +
    '<input id="m-cn" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="text" placeholder="e.g. West Sector Shelter"></div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Location Sector</label>' +
    '<input id="m-cl" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="text" placeholder="Location"></div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">State</label>' +
    '<input id="m-cs" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="text" placeholder="Province"></div>' +
    '<div class="grid grid-cols-2 gap-4">' +
      '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Disaster Type</label>' +
      '<select id="m-cd" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface bg-surface-container">' +
        '<option>Flood</option><option>Earthquake</option><option>Cyclone</option><option>Fire</option><option>Other</option>' +
      '</select></div>' +
      '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Severity Rating (1-5)</label>' +
      '<input id="m-cv" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="number" min="1" max="5" value="2"></div>' +
    '</div>' +
    '<div class="grid grid-cols-2 gap-4">' +
      '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Camp Population</label>' +
      '<input id="m-cp" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="number"></div>' +
      '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Camp Coordinator</label>' +
      '<input id="m-cc" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="text"></div>' +
    '</div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Phone Number</label>' +
    '<input id="m-cph" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="text"></div>' +
    '<button onclick="addCamp()" class="w-full py-3 bg-primary text-on-primary font-label-md rounded-lg glow-primary hover:brightness-110 active:scale-95 transition-all mt-4 font-semibold">' +
      'Register Relief Camp' +
    '</button>' +
    '</div>';
  openModal('Register New Relief Sector', html);
}

function addCamp() {
  var name = document.getElementById('m-cn').value;
  var loc = document.getElementById('m-cl').value;
  var state = document.getElementById('m-cs').value;
  var disaster = document.getElementById('m-cd').value;
  var pop = +document.getElementById('m-cp').value;
  var sev = +document.getElementById('m-cv').value;
  var cc = document.getElementById('m-cc').value;
  var cph = document.getElementById('m-cph').value;
  
  if (!name) {
    toast('Camp Name is required', 'error');
    return;
  }
  
  var c = {
    id: 'CAMP' + (++DB.counters.c),
    name: name,
    location: loc || 'N/A',
    state: state || 'N/A',
    disaster: disaster,
    population: pop || 0,
    severity: Math.min(5, Math.max(1, sev || 2)),
    contact: cc || 'N/A',
    phone: cph || 'N/A',
    date: now()
  };
  
  DB.camps.push(c);
  save();
  closeModal();
  toast('New Relief Camp Registered: ' + c.id, 'success');
  renderAdmin('camps');
}

function modalEditCamp(i) {
  var c = DB.camps[i];
  var html = '<div class="space-y-4">' +
    '<div class="bg-surface-container-low/50 p-4 rounded-xl border border-white/5 mb-4">' +
      '<h4 class="font-semibold text-primary text-sm">' + c.name + '</h4>' +
      '<p class="text-xs text-outline mt-1">Location: ' + c.location + ', ' + c.state + '</p>' +
    '</div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Severity Level Rating (1-5)</label>' +
    '<input id="m-es" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="number" min="1" max="5" value="' + c.severity + '"></div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Active Camp Population</label>' +
    '<input id="m-epo" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="number" value="' + c.population + '"></div>' +
    '<button onclick="editCamp(' + i + ')" class="w-full py-3 bg-primary text-on-primary font-label-md rounded-lg glow-primary hover:brightness-110 active:scale-95 transition-all mt-4 font-semibold">' +
      'Save Camp Settings' +
    '</button>' +
    '</div>';
  openModal('Modify Camp Details: ' + c.id, html);
}

function editCamp(i) {
  var sev = +document.getElementById('m-es').value;
  var pop = +document.getElementById('m-epo').value;
  DB.camps[i].severity = Math.min(5, Math.max(1, sev));
  DB.camps[i].population = pop;
  save();
  closeModal();
  toast('Camp details updated successfully.', 'success');
  renderAdmin('camps');
}

function modalProcessReq(i) {
  var r = DB.requests[i];
  var resOpts = '<option value="">-- Select stock to dispatch --</option>';
  
  DB.resources.forEach(function(res, ri) {
    resOpts += '<option value="' + ri + '">' + res.name + ' (' + res.category + ') — Stock: ' + res.quantity + ' ' + res.unit + '</option>';
  });

  var html = '<div class="space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">' +
    '<div class="bg-surface-container-low/50 p-4 rounded-xl border border-white/5 text-sm space-y-1.5 mb-4">' +
      '<p><strong class="text-primary">User Rep:</strong> ' + r.userName + ' (' + r.userID + ')</p>' +
      '<p><strong class="text-primary">Camp Target:</strong> ' + r.campName + '</p>' +
      '<p><strong class="text-primary">Supply Name:</strong> ' + r.resourceName + ' (' + r.category + ')</p>' +
      '<p><strong class="text-primary">Requested Qty:</strong> ' + r.quantity + ' ' + r.unit + '</p>' +
      '<p><strong class="text-primary">Time:</strong> ' + r.submitTime + '</p>' +
    '</div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Select Depot Stock to Allocate</label>' +
    '<select id="m-pres" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface bg-surface-container">' + resOpts + '</select></div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Quantity to Dispatch (Requested: ' + r.quantity + ')</label>' +
    '<input id="m-pqty" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="number" value="' + r.quantity + '" min="1"></div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Logistics / Dispatch Note</label>' +
    '<textarea id="m-pnote" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none h-20" placeholder="e.g. Dispatched 50 boxes water via drone unit."></textarea></div>' +
    '<div class="flex gap-4 mt-4">' +
      '<button onclick="approveReq(' + i + ')" class="flex-1 py-3 bg-tertiary text-on-tertiary font-label-md rounded-lg active-glow hover:brightness-110 active:scale-95 transition-all font-semibold">✓ Approve & Dispatch</button>' +
      '<button onclick="rejectReq(' + i + ')" class="flex-1 py-3 bg-error text-on-error font-label-md rounded-lg hover:brightness-110 active:scale-95 transition-all font-semibold">✗ Reject Request</button>' +
    '</div>' +
    '</div>';
  openModal('Process Representative Request: ' + r.reqID, html);
}

function approveReq(i) {
  var r = DB.requests[i];
  var ri = document.getElementById('m-pres').value;
  var qty = +document.getElementById('m-pqty').value;
  var note = document.getElementById('m-pnote').value;
  
  if (ri === '' || !qty) {
    toast('Select depot resource stock and quantity to dispatch', 'error');
    return;
  }
  
  ri = +ri;
  var res = DB.resources[ri];
  if (qty > res.quantity) {
    toast('Insufficient stock at depot. Available: ' + res.quantity + ' ' + res.unit, 'error');
    return;
  }
  
  res.quantity -= qty;
  r.status = 'APPROVED';
  r.note = 'Dispatched ' + qty + ' ' + res.unit + ' of ' + res.name + (note ? ' — ' + note : '');
  
  var a = {
    id: 'ALLOC' + (++DB.counters.a),
    campID: r.campID,
    campName: r.campName,
    resourceID: res.id,
    resourceName: res.name,
    qty: qty,
    timestamp: now(),
    by: 'System Administrator'
  };
  
  DB.allocations.push(a);
  save();
  closeModal();
  toast('Supply request processed. Allocation active: ' + a.id, 'success');
  renderAdmin('pending');
}

function rejectReq(i) {
  var note = document.getElementById('m-pnote').value;
  DB.requests[i].status = 'REJECTED';
  DB.requests[i].note = 'Rejected: ' + (note ? note : 'Item stock limits exceeded or duplicate request');
  save();
  closeModal();
  toast('Supply request has been rejected.', 'info');
  renderAdmin('pending');
}

function modalAddVolunteer() {
  var html = '<div class="space-y-4">' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Volunteer Full Name</label>' +
    '<input id="m-vn" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="text"></div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Specialized Skill</label>' +
    '<select id="m-vs" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface bg-surface-container">' +
      '<option>Medical</option><option>Rescue</option><option>Logistics</option><option>Cooking</option><option>Counselling</option><option>General</option>' +
    '</select></div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Contact Phone</label>' +
    '<input id="m-vc" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="text"></div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Email Address</label>' +
    '<input id="m-ve" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="email"></div>' +
    '<button onclick="addVolunteer()" class="w-full py-3 bg-primary text-on-primary font-label-md rounded-lg glow-primary hover:brightness-110 active:scale-95 transition-all mt-4 font-semibold">' +
      'Confirm Registration' +
    '</button>' +
    '</div>';
  openModal('Register Relief Volunteer', html);
}

function addVolunteer() {
  var n = document.getElementById('m-vn').value;
  var skill = document.getElementById('m-vs').value;
  var contact = document.getElementById('m-vc').value;
  var email = document.getElementById('m-ve').value;
  
  if (!n) {
    toast('Name is required', 'error');
    return;
  }
  
  var v = {
    id: 'VOL' + (++DB.counters.v),
    name: n,
    skill: skill,
    contact: contact || 'N/A',
    email: email || 'N/A',
    camp: 'Unassigned',
    joinDate: now(),
    active: true
  };
  
  DB.volunteers.push(v);
  save();
  closeModal();
  toast('Volunteer Registered: ' + v.name, 'success');
  renderAdmin('volunteers');
}

function modalAddDonor() {
  var html = '<div class="space-y-4">' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Donor / Organization Name</label>' +
    '<input id="m-dn" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="text"></div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Affiliation</label>' +
    '<input id="m-do" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="text" placeholder="e.g. Red Cross / Personal"></div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Phone Number</label>' +
    '<input id="m-dc" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="text"></div>' +
    '<div><label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Email Address</label>' +
    '<input id="m-de" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-on-surface focus:border-primary outline-none" type="email"></div>' +
    '<button onclick="addDonor()" class="w-full py-3 bg-primary text-on-primary font-label-md rounded-lg glow-primary hover:brightness-110 active:scale-95 transition-all mt-4 font-semibold">' +
      'Register Donor Profile' +
    '</button>' +
    '</div>';
  openModal('Register Aid Donor', html);
}

function addDonor() {
  var name = document.getElementById('m-dn').value;
  var org = document.getElementById('m-do').value;
  var contact = document.getElementById('m-dc').value;
  var email = document.getElementById('m-de').value;
  
  if (!name) {
    toast('Name is required', 'error');
    return;
  }
  
  var d = {
    id: 'DNR' + (++DB.counters.d),
    name: name,
    org: org || 'NGO/Individual',
    contact: contact || 'N/A',
    email: email || 'N/A'
  };
  
  DB.donors.push(d);
  save();
  closeModal();
  toast('Donor profile created.', 'success');
  renderAdmin('donors');
}


// ── USER PORTAL VIEWS & TEMPLATES ──
function userNav(btn, view) {
  document.querySelectorAll('.user-nav-btn').forEach(function(b) {
    b.className = 'w-full flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-white/5 transition-all rounded-lg group text-left user-nav-btn';
  });
  btn.className = 'w-full flex items-center gap-3 px-4 py-3 text-tertiary bg-tertiary/10 border-r-4 border-tertiary transition-all rounded-lg group text-left user-nav-btn font-semibold';
  renderUser(view);
}

function renderUser(view) {
  var main = document.getElementById('user-main');
  var h = '';
  
  if (view === 'user-home') {
    h = userHomeTemplate();
  } else if (view === 'user-request') {
    h = userRequestFormTemplate();
  } else if (view === 'user-my-requests') {
    h = userMyRequestsTemplate();
  } else if (view === 'user-resources') {
    h = userResourcesTemplate();
  } else if (view === 'user-camps') {
    h = userCampsViewTemplate();
  }
  
  main.innerHTML = h;
}

function userHomeTemplate() {
  // Stats
  var myReqs = DB.requests.filter(function(r) { return r.userID === currentUser.id; });
  var pending = myReqs.filter(function(r) { return r.status === 'PENDING'; }).length;
  var fulfilled = myReqs.filter(function(r) { return r.status === 'APPROVED'; }).length;
  
  // Find current camp details
  var camp = DB.camps.find(function(c) { return c.id === currentUser.campID; });
  var pop = camp ? camp.population : 'N/A';
  var severity = camp ? camp.severity : 2;

  // Active Requests table for home screen (limit to 3)
  var activeRequestsRows = '';
  var recentMyReqs = myReqs.slice().reverse().slice(0, 3);
  recentMyReqs.forEach(function(r) {
    activeRequestsRows += '<tr class="hover:bg-white/5 transition-colors border-b border-white/5">' +
      '<td class="px-6 py-4 font-mono text-primary text-xs">' + r.reqID + '</td>' +
      '<td class="px-6 py-4 font-label-md text-on-surface font-semibold">' + r.resourceName + '</td>' +
      '<td class="px-6 py-4 text-on-surface-variant">' + r.quantity + ' ' + r.unit + '</td>' +
      '<td class="px-6 py-4">' + getRequestStatusBadge(r.status) + '</td>' +
      '<td class="px-6 py-4 text-xs italic text-on-surface-variant">' + (r.note || '—') + '</td>' +
      '</tr>';
  });

  if (activeRequestsRows === '') {
    activeRequestsRows = '<tr><td colspan="5" class="px-6 py-8 text-center text-outline text-sm">No recent requests filed.</td></tr>';
  }

  return '<div class="space-y-8">' +
    '<!-- Welcome Banner Bento Grid -->' +
    '<div class="grid grid-cols-1 md:grid-cols-3 gap-6">' +
      '<div class="md:col-span-2 relative overflow-hidden rounded-xl glass-card p-8 flex flex-col justify-between min-h-[220px]">' +
        '<!-- Decorative Gradient Decor -->' +
        '<div class="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] -mr-32 -mt-32"></div>' +
        '<div class="absolute bottom-0 left-0 w-48 h-48 bg-tertiary/5 blur-[80px] -ml-24 -mb-24"></div>' +
        '<div class="relative z-10">' +
          '<h2 class="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-2">' + currentUser.campName + ' Overview</h2>' +
          '<p class="text-on-surface-variant font-body-md max-w-md">Managing critical logistics and resources for your sector. Your inputs ensure safe response.</p>' +
        '</div>' +
        '<div class="relative z-10 flex gap-12 mt-6">' +
          '<div><p class="text-[10px] uppercase tracking-widest text-tertiary font-bold">User Rep ID</p><p class="font-headline-md text-headline-md text-on-surface font-semibold">' + currentUser.id + '</p></div>' +
          '<div><p class="text-[10px] uppercase tracking-widest text-tertiary font-bold">Location Sector</p><p class="font-headline-md text-headline-md text-on-surface font-semibold">' + (camp ? camp.location : 'N/A') + '</p></div>' +
          '<div><p class="text-[10px] uppercase tracking-widest text-tertiary font-bold">Camp Population</p><p class="font-headline-md text-headline-md text-on-surface font-semibold">' + pop + '</p></div>' +
        '</div>' +
      '</div>' +

      '<!-- Camp Severity Info Card -->' +
      '<div class="glass-card rounded-xl p-6 flex flex-col justify-between border-tertiary/20">' +
        '<div class="flex justify-between items-start">' +
          '<div class="p-3 bg-tertiary/10 rounded-lg text-tertiary"><span class="material-symbols-outlined">cloud_queue</span></div>' +
          '<span class="font-label-sm text-xs text-on-surface-variant uppercase tracking-wider">Sector Alert Rating</span>' +
        '</div>' +
        '<div>' +
          '<p class="text-sm text-outline">Camp Urgency Level:</p>' +
          '<div class="mt-2">' + getSeverityBadge(severity) + '</div>' +
        '</div>' +
        '<button onclick="userNav(document.querySelector(\'[onclick*=\\\'user-request\\\']\'), \'user-request\')" class="w-full py-2.5 bg-tertiary/15 text-tertiary hover:bg-tertiary/20 border border-tertiary/20 font-label-md rounded-lg transition-colors font-semibold text-sm">Request Supply Items</button>' +
      '</div>' +
    '</div>' +

    '<!-- Quick Stats Grid -->' +
    '<div class="grid grid-cols-1 md:grid-cols-3 gap-6">' +
      '<div class="glass-card p-6 rounded-xl">' +
        '<div class="flex items-center justify-between mb-4">' +
          '<span class="font-label-md text-sm text-outline">Pending Supplication</span>' +
          '<span class="material-symbols-outlined text-primary">pending_actions</span>' +
        '</div>' +
        '<div class="flex items-baseline gap-2 mt-2"><span class="text-4xl font-headline-lg text-on-surface font-bold">' + pending + '</span><span class="text-on-surface-variant text-xs">requests awaiting review</span></div>' +
      '</div>' +
      '<div class="glass-card p-6 rounded-xl border-tertiary/20">' +
        '<div class="flex items-center justify-between mb-4">' +
          '<span class="font-label-md text-sm text-outline">Fulfilled Deliveries</span>' +
          '<span class="material-symbols-outlined text-tertiary">check_circle</span>' +
        '</div>' +
        '<div class="flex items-baseline gap-2 mt-2"><span class="text-4xl font-headline-lg text-tertiary font-bold">' + fulfilled + '</span><span class="text-on-surface-variant text-xs">dispatches delivered</span></div>' +
      '</div>' +
      '<div class="glass-card p-6 rounded-xl ' + (severity >= 4 ? 'border-error/20 bg-error/5 glow-error' : '') + '">' +
        '<div class="flex items-center justify-between mb-4">' +
          '<span class="font-label-md text-sm text-outline">Severity Level</span>' +
          '<span class="material-symbols-outlined text-error">warning</span>' +
        '</div>' +
        '<div class="flex items-baseline gap-2 mt-2"><span class="text-4xl font-headline-lg text-error font-bold">' + severity + '</span><span class="text-on-surface-variant text-xs">out of 5 rating scale</span></div>' +
      '</div>' +
    '</div>' +

    '<!-- Recent Requests Log Table -->' +
    '<div class="glass-card rounded-xl overflow-hidden">' +
      '<div class="px-6 py-4 border-b border-white/5 bg-surface-container-low/20 flex justify-between items-center">' +
        '<h4 class="font-headline-md text-on-surface text-base font-semibold">Active Supply Requests</h4>' +
        '<button onclick="userNav(document.querySelector(\'[onclick*=\\\'user-my-requests\\\']\'), \'user-my-requests\')" class="text-tertiary font-label-md text-xs hover:underline">View Track List</button>' +
      '</div>' +
      '<div class="overflow-x-auto">' +
        '<table class="w-full text-left">' +
          '<thead>' +
            '<tr class="text-on-surface-variant text-[11px] uppercase tracking-wider bg-surface-container-low/30 border-b border-white/5">' +
              '<th class="px-6 py-3 font-semibold">ID</th>' +
              '<th class="px-6 py-3 font-semibold">Item Category</th>' +
              '<th class="px-6 py-3 font-semibold">Requested Qty</th>' +
              '<th class="px-6 py-3 font-semibold">Status</th>' +
              '<th class="px-6 py-3 font-semibold">Dispatch Remarks</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody class="divide-y divide-white/5">' +
            activeRequestsRows +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>' +
    '</div>';
}

function userRequestFormTemplate() {
  return '<div class="glass-card rounded-xl max-w-xl p-8 border-white/10 space-y-6 mx-auto">' +
    '<div>' +
      '<h3 class="font-headline-md text-headline-md text-tertiary font-semibold">File Supply Request</h3>' +
      '<p class="text-on-surface-variant text-xs mt-1">Submit resource request to Command Depot Logistics.</p>' +
    '</div>' +
    '<div class="space-y-4">' +
      '<div>' +
        '<label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Resource / Item Name</label>' +
        '<input id="u-rn" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-on-surface focus:border-tertiary focus:ring-1 focus:ring-tertiary outline-none transition-all" placeholder="e.g. Infant Milk Powder" type="text">' +
      '</div>' +
      '<div>' +
        '<label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Item Category</label>' +
        '<select id="u-rc" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-on-surface bg-surface-container focus:border-tertiary focus:ring-0">' +
          '<option>Food</option><option>Water</option><option>Medicine</option><option>Shelter</option><option>Clothing</option><option>Equipment</option>' +
        '</select>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-4">' +
        '<div>' +
          '<label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Quantity Required</label>' +
          '<input id="u-rq" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-on-surface focus:border-tertiary focus:ring-1 focus:ring-tertiary outline-none transition-all" type="number" min="1" value="50">' +
        '</div>' +
        '<div>' +
          '<label class="block font-label-md text-xs mb-1 uppercase tracking-wider text-outline">Measurement Unit</label>' +
          '<input id="u-ru" class="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-on-surface focus:border-tertiary focus:ring-1 focus:ring-tertiary outline-none transition-all" placeholder="kg / boxes / units" type="text">' +
        '</div>' +
      '</div>' +
      '<button onclick="submitRequest()" class="w-full py-4 bg-tertiary text-on-tertiary font-label-md rounded-lg active-glow hover:brightness-110 active:scale-95 transition-all mt-4 font-semibold">' +
        'Transmit Supply Request' +
      '</button>' +
    '</div>' +
    '</div>';
}

function submitRequest() {
  var name = document.getElementById('u-rn').value;
  var cat = document.getElementById('u-rc').value;
  var qty = +document.getElementById('u-rq').value;
  var unit = document.getElementById('u-ru').value;

  if (!name || !qty) {
    toast('Specify supply name and required quantity', 'error');
    return;
  }

  var r = {
    reqID: 'REQ' + (++DB.counters.q),
    userID: currentUser.id,
    userName: currentUser.name,
    campID: currentUser.campID,
    campName: currentUser.campName,
    resourceName: name,
    category: cat,
    quantity: qty,
    unit: unit || 'units',
    status: 'PENDING',
    note: '',
    submitTime: now()
  };

  DB.requests.push(r);
  save();
  toast('Supply request submitted: ' + r.reqID, 'success');
  
  // Set tracker active in nav styling
  document.querySelectorAll('.user-nav-btn').forEach(function(b) {
    b.className = 'w-full flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-white/5 transition-all rounded-lg group text-left user-nav-btn';
  });
  var reqsBtn = document.querySelector('[onclick*="user-my-requests"]');
  if (reqsBtn) {
    reqsBtn.className = 'w-full flex items-center gap-3 px-4 py-3 text-tertiary bg-tertiary/10 border-r-4 border-tertiary transition-all rounded-lg group text-left user-nav-btn font-semibold';
  }
  renderUser('user-my-requests');
}

function userMyRequestsTemplate() {
  var list = DB.requests.filter(function(r) { return r.userID === currentUser.id; });
  var rows = '';

  list.forEach(function(r) {
    rows += '<tr class="hover:bg-white/5 transition-colors border-b border-white/5">' +
      '<td class="px-6 py-5 font-mono text-primary text-sm">' + r.reqID + '</td>' +
      '<td class="px-6 py-5 font-label-md text-on-surface font-semibold">' + r.resourceName + '</td>' +
      '<td class="px-6 py-5 text-on-surface-variant">' + r.quantity + ' <span class="text-xs text-outline">' + r.unit + '</span></td>' +
      '<td class="px-6 py-5">' + getRequestStatusBadge(r.status) + '</td>' +
      '<td class="px-6 py-5 text-on-surface-variant text-sm italic">' + (r.note || '—') + '</td>' +
      '<td class="px-6 py-5 text-right text-outline text-xs">' + r.submitTime + '</td>' +
      '</tr>';
  });

  if (rows === '') {
    rows = '<tr><td colspan="6" class="px-6 py-12 text-center text-outline text-sm">No supply requests registered yet.</td></tr>';
  }

  return '<div class="glass-card rounded-xl overflow-hidden">' +
    '<div class="px-6 py-4 border-b border-white/5 bg-surface-container-low/20">' +
      '<h4 class="font-headline-md text-on-surface text-base font-semibold">My Resource Logs</h4>' +
    '</div>' +
    '<div class="overflow-x-auto">' +
      '<table class="w-full text-left">' +
        '<thead>' +
          '<tr class="text-on-surface-variant text-[11px] uppercase tracking-wider bg-surface-container-low/30 border-b border-white/5">' +
            '<th class="px-6 py-4 font-semibold">Req ID</th>' +
            '<th class="px-6 py-4 font-semibold">Item Description</th>' +
            '<th class="px-6 py-4 font-semibold">Quantity</th>' +
            '<th class="px-6 py-4 font-semibold">Status</th>' +
            '<th class="px-6 py-4 font-semibold">Dispatch Note Remarks</th>' +
            '<th class="px-6 py-4 font-semibold text-right">Submitted</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody class="divide-y divide-white/5">' +
          rows +
        '</tbody>' +
      '</table>' +
    '</div>' +
    '</div>';
}

function userResourcesTemplate() {
  var rows = '';
  DB.resources.forEach(function(r) {
    if (r.quantity > 0) {
      rows += '<tr class="hover:bg-white/5 transition-colors border-b border-white/5">' +
        '<td class="px-6 py-5 font-label-md text-on-surface font-semibold">' + r.name + '</td>' +
        '<td class="px-6 py-5">' + getCategoryBadge(r.category) + '</td>' +
        '<td class="px-6 py-5 text-right font-bold text-tertiary">' + r.quantity + '</td>' +
        '<td class="px-6 py-5 text-outline">' + r.unit + '</td>' +
        '</tr>';
    }
  });

  if (rows === '') {
    rows = '<tr><td colspan="4" class="px-6 py-12 text-center text-outline text-sm">No resource inventory recorded at Command Depot.</td></tr>';
  }

  return '<div class="glass-card rounded-xl overflow-hidden max-w-3xl mx-auto">' +
    '<div class="px-6 py-4 border-b border-white/5 bg-surface-container-low/20">' +
      '<h4 class="font-headline-md text-on-surface text-base font-semibold">Central Depot Inventory Stock levels</h4>' +
    '</div>' +
    '<div class="overflow-x-auto">' +
      '<table class="w-full text-left">' +
        '<thead>' +
          '<tr class="text-on-surface-variant text-[11px] uppercase tracking-wider bg-surface-container-low/30 border-b border-white/5">' +
            '<th class="px-6 py-4 font-semibold">Item Name</th>' +
            '<th class="px-6 py-4 font-semibold">Category</th>' +
            '<th class="px-6 py-4 font-semibold text-right">Available Qty</th>' +
            '<th class="px-6 py-4 font-semibold">Unit</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody class="divide-y divide-white/5">' +
          rows +
        '</tbody>' +
      '</table>' +
    '</div>' +
    '</div>';
}

function userCampsViewTemplate() {
  var rows = '';
  DB.camps.forEach(function(c) {
    rows += '<tr class="hover:bg-white/5 transition-colors border-b border-white/5">' +
      '<td class="px-6 py-5 font-body-md text-outline">' + c.id + '</td>' +
      '<td class="px-6 py-5 font-label-md text-on-surface font-semibold">' + c.name + '</td>' +
      '<td class="px-6 py-5 text-on-surface-variant">' + c.location + ', ' + c.state + '</td>' +
      '<td class="px-6 py-5 text-right font-medium">' + c.population + '</td>' +
      '<td class="px-6 py-5 text-center">' + getSeverityBadge(c.severity) + '</td>' +
      '<td class="px-6 py-5 text-outline text-sm">' + c.disaster + '</td>' +
      '</tr>';
  });

  if (rows === '') {
    rows = '<tr><td colspan="6" class="px-6 py-12 text-center text-outline text-sm">No camps registered.</td></tr>';
  }

  return '<div class="glass-card rounded-xl overflow-hidden">' +
    '<div class="px-6 py-4 border-b border-white/5 bg-surface-container-low/20">' +
      '<h4 class="font-headline-md text-on-surface text-base font-semibold">Network Relief Sectors Log</h4>' +
    '</div>' +
    '<div class="overflow-x-auto">' +
      '<table class="w-full text-left">' +
        '<thead>' +
          '<tr class="text-on-surface-variant text-[11px] uppercase tracking-wider bg-surface-container-low/30 border-b border-white/5">' +
            '<th class="px-6 py-4 font-semibold">Camp ID</th>' +
            '<th class="px-6 py-4 font-semibold">Camp Name</th>' +
            '<th class="px-6 py-4 font-semibold">Location</th>' +
            '<th class="px-6 py-4 font-semibold text-right">Population</th>' +
            '<th class="px-6 py-4 font-semibold text-center">Urgency Rating</th>' +
            '<th class="px-6 py-4 font-semibold text-sm">Incident</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody class="divide-y divide-white/5">' +
          rows +
        '</tbody>' +
      '</table>' +
    '</div>' +
    '</div>';
}


// ── INITIALIZATION & HEARTBEATS ──
// 1. Ping local server first, then load data from the correct source
detectServer(function() {
  loadFromCloud(function() {
    // Sync + re-check server every 20 seconds
    setInterval(function() {
      detectServer(function() {
        loadFromCloud(function() {
          // Proactively refresh active view to display real-time updates
          var activeAdminNav = document.querySelector('.admin-nav-btn.active');
          if (activeAdminNav) {
            var viewMatches = activeAdminNav.getAttribute('onclick').match(/'([^']+)'/);
            if (viewMatches && viewMatches[1]) renderAdmin(viewMatches[1]);
          }
          var activeUserNav = document.querySelector('.user-nav-btn.active');
          if (activeUserNav) {
            var uViewMatches = activeUserNav.getAttribute('onclick').match(/'([^']+)'/);
            if (uViewMatches && uViewMatches[1]) renderUser(uViewMatches[1]);
          }
        });
      });
    }, 10000);

    // Re-render active view every 1 second (pure UI refresh, no network)
    setInterval(function() {
      var activeAdminNav = document.querySelector('.admin-nav-btn.active');
      if (activeAdminNav) {
        var viewMatches = activeAdminNav.getAttribute('onclick').match(/'([^']+)'/);
        if (viewMatches && viewMatches[1]) renderAdmin(viewMatches[1]);
      }
      var activeUserNav = document.querySelector('.user-nav-btn.active');
      if (activeUserNav) {
        var uViewMatches = activeUserNav.getAttribute('onclick').match(/'([^']+)'/);
        if (uViewMatches && uViewMatches[1]) renderUser(uViewMatches[1]);
      }
    }, 1000);

    // Re-check server mode every 5 seconds
    setInterval(function() { detectServer(null); }, 5000);
  });
});
