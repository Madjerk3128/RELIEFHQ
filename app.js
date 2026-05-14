// Data
var DB={resources:[],camps:[],requests:[],allocations:[],volunteers:[],donors:[],donations:[],users:[],counters:{r:0,c:0,q:0,a:0,v:0,d:0,n:0,u:0}};
var currentUser=null,loginMode='',CLOUD_DB='https://jsonblob.com/api/jsonBlob/019e27ec-bda3-73a3-a0a6-17e16cf2a660';
var _syncing=false;
function save(){
  localStorage.setItem('reliefDB',JSON.stringify(DB));
  if(_syncing)return;_syncing=true;
  fetch(CLOUD_DB,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(DB)})
  .then(function(){_syncing=false;})
  .catch(function(){_syncing=false;setTimeout(function(){
    fetch(CLOUD_DB,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(DB)}).catch(function(){});
  },2000);});
}
function load(){
  fetch(CLOUD_DB).then(function(r){return r.json();}).then(function(d){
    if(d&&typeof d==='object'&&d.counters){
      DB=d;localStorage.setItem('reliefDB',JSON.stringify(DB));
      var as=document.getElementById('admin-screen');
      var us=document.getElementById('user-screen');
      if(as&&as.classList.contains('active')){renderAdmin('dashboard');}
      if(us&&us.classList.contains('active')&&currentUser){renderUser('user-home');}
    }
  }).catch(function(){
    var local=localStorage.getItem('reliefDB');
    if(local){DB=JSON.parse(local);}
  });
}
load();
setInterval(function(){
  fetch(CLOUD_DB).then(function(r){return r.json();}).then(function(d){
    if(d&&typeof d==='object'&&d.counters){
      DB=d;localStorage.setItem('reliefDB',JSON.stringify(DB));
      var as=document.getElementById('admin-screen');
      var us=document.getElementById('user-screen');
      if(as&&as.classList.contains('active')){renderAdmin('dashboard');}
      if(us&&us.classList.contains('active')&&currentUser){renderUser('user-home');}
    }
  }).catch(function(){});
},30000);

function showScreen(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');}
function toast(msg,type){var t=document.getElementById('toast');t.className='toast '+(type||'success');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2500);}
function showLoginForm(mode){loginMode=mode;var f=document.getElementById('login-form');f.classList.remove('hidden');
document.getElementById('field-username').classList.toggle('hidden',mode!=='admin');
document.getElementById('field-name').classList.toggle('hidden',mode!=='register');
document.getElementById('field-phone').classList.toggle('hidden',mode!=='register');
document.getElementById('field-camp-select').classList.toggle('hidden',mode!=='register');
document.getElementById('field-userid').classList.toggle('hidden',mode!=='user');
document.getElementById('login-title').textContent=mode==='admin'?'Admin Login':mode==='user'?'User Login':'New Registration';
document.getElementById('login-error').classList.add('hidden');
var pwField=document.getElementById('inp-password').parentElement;
if(mode==='admin'){pwField.classList.remove('hidden');}else{pwField.classList.add('hidden');}
if(mode==='register'){var s=document.getElementById('inp-camp-select');s.innerHTML='<option value="">General</option>';DB.camps.forEach(c=>{s.innerHTML+='<option value="'+c.id+'">'+c.name+' - '+c.location+'</option>';});}
}
function hideLoginForm(){document.getElementById('login-form').classList.add('hidden');}
function handleLogin(){
var err=document.getElementById('login-error');err.classList.add('hidden');
var pw=document.getElementById('inp-password').value;
if(loginMode==='admin'){
 if(document.getElementById('inp-username').value!=='admin'||pw!=='12345678'){err.textContent='Invalid credentials';err.classList.remove('hidden');return;}
 showScreen('admin-screen');renderAdmin('dashboard');
}else if(loginMode==='user'){
 var uid=document.getElementById('inp-userid').value;
 currentUser=DB.users.find(u=>u.id===uid);
 if(!currentUser){err.textContent='User ID not found';err.classList.remove('hidden');return;}
 document.getElementById('user-name-display').textContent=currentUser.name;
 showScreen('user-screen');renderUser('user-home');
}else{
 var n=document.getElementById('inp-name').value,p=document.getElementById('inp-phone').value;
 if(!n||!p){err.textContent='Fill all fields';err.classList.remove('hidden');return;}
 var cid=document.getElementById('inp-camp-select').value,cn='General';
 var camp=DB.camps.find(c=>c.id===cid);if(camp)cn=camp.name;
 var u={id:'USER'+(++DB.counters.u),name:n,phone:p,campID:cid||'N/A',campName:cn};
 DB.users.push(u);save();currentUser=u;
 document.getElementById('user-name-display').textContent=u.name;
 toast('Registered! Your ID: '+u.id);showScreen('user-screen');renderUser('user-home');
}}
function logout(){showScreen('login-screen');currentUser=null;document.querySelectorAll('input').forEach(i=>i.value='');}
function closeModal(){document.getElementById('modal-overlay').classList.add('hidden');}
function openModal(title,html){document.getElementById('modal-title').textContent=title;document.getElementById('modal-body').innerHTML=html;document.getElementById('modal-overlay').classList.remove('hidden');}
function now(){var d=new Date();return d.toLocaleDateString('en-GB')+' '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}
function badge(s){var c={PENDING:'pending',APPROVED:'approved',REJECTED:'rejected',FULFILLED:'fulfilled',CRITICAL:'critical',SEVERE:'severe',HIGH:'high',MODERATE:'moderate',LOW:'low'};return '<span class="badge badge-'+(c[s]||'pending')+'">'+s+'</span>';}
function sevLabel(n){return['','LOW','MODERATE','HIGH','SEVERE','CRITICAL'][n]||'LOW';}

// Admin nav
function adminNav(btn){document.querySelectorAll('.sidebar-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderAdmin(btn.dataset.view);}
function renderAdmin(view){
var m=document.getElementById('admin-main'),h='';
if(view==='dashboard'){h=adminDashboard();}
else if(view==='resources'){h=adminResources();}
else if(view==='low-stock'){h=adminLowStock();}
else if(view==='camps'){h=adminCamps();}
else if(view==='requests'){h=adminRequests(false);}
else if(view==='pending'){h=adminRequests(true);}
else if(view==='allocations'){h=adminAllocations();}
else if(view==='volunteers'){h=adminVolunteers();}
else if(view==='donors'){h=adminDonors();}
else if(view==='users'){h=adminUsers();}
m.innerHTML=h;
}
function adminDashboard(){
var p=DB.requests.filter(r=>r.status==='PENDING').length,ls=DB.resources.filter(r=>r.quantity<=r.threshold).length;
var cr=DB.camps.filter(c=>c.severity>=4).length;
return '<h2 style="margin-bottom:20px;color:var(--text-bright)">📊 Dashboard Overview</h2><div class="stats-grid">'+
'<div class="stat-card info"><div class="stat-label">Total Camps</div><div class="stat-value">'+DB.camps.length+'</div></div>'+
'<div class="stat-card danger"><div class="stat-label">Critical Camps</div><div class="stat-value">'+cr+'</div></div>'+
'<div class="stat-card warning"><div class="stat-label">Pending Requests</div><div class="stat-value">'+p+'</div></div>'+
'<div class="stat-card success"><div class="stat-label">Resources</div><div class="stat-value">'+DB.resources.length+'</div></div>'+
'<div class="stat-card danger"><div class="stat-label">Low Stock</div><div class="stat-value">'+ls+'</div></div>'+
'<div class="stat-card purple"><div class="stat-label">Volunteers</div><div class="stat-value">'+DB.volunteers.length+'</div></div>'+
'<div class="stat-card info"><div class="stat-label">Users</div><div class="stat-value">'+DB.users.length+'</div></div>'+
'<div class="stat-card success"><div class="stat-label">Allocations</div><div class="stat-value">'+DB.allocations.length+'</div></div>'+
'</div>';
}
function adminResources(){
var h='<div class="section-header"><h2>📦 Resources</h2><button class="btn-action" onclick="modalAddResource()">+ Add Resource</button></div>';
if(!DB.resources.length)return h+'<div class="empty-state"><div class="empty-icon">📦</div><p>No resources yet</p></div>';
h+='<table class="data-table"><tr><th>ID</th><th>Name</th><th>Category</th><th>Qty</th><th>Unit</th><th>Threshold</th><th>Expiry</th><th>Actions</th></tr>';
DB.resources.forEach((r,i)=>{var low=r.quantity<=r.threshold;
h+='<tr><td>'+r.id+'</td><td>'+r.name+'</td><td>'+r.category+'</td><td style="color:'+(low?'var(--danger)':'var(--success)')+'">'+r.quantity+(low?' ⚠️':'')+'</td><td>'+r.unit+'</td><td>'+r.threshold+'</td><td>'+r.expiry+'</td><td><button class="btn-action small" onclick="modalEditResource('+i+')">Edit</button> <button class="btn-action small danger" onclick="deleteResource('+i+')">Del</button></td></tr>';});
return h+'</table>';}
function adminLowStock(){
var low=DB.resources.filter(r=>r.quantity<=r.threshold);
var h='<div class="section-header"><h2>⚠️ Low Stock Alerts</h2></div>';
if(!low.length)return h+'<div class="empty-state"><div class="empty-icon">✅</div><p>All resources adequately stocked</p></div>';
h+='<table class="data-table"><tr><th>ID</th><th>Name</th><th>Category</th><th>Qty</th><th>Threshold</th></tr>';
low.forEach(r=>{h+='<tr><td>'+r.id+'</td><td>'+r.name+'</td><td>'+r.category+'</td><td style="color:var(--danger)">'+r.quantity+'</td><td>'+r.threshold+'</td></tr>';});
return h+'</table>';}
function adminCamps(){
var h='<div class="section-header"><h2>🏕️ Relief Camps</h2><button class="btn-action" onclick="modalAddCamp()">+ Register Camp</button></div>';
if(!DB.camps.length)return h+'<div class="empty-state"><div class="empty-icon">🏕️</div><p>No camps registered</p></div>';
h+='<table class="data-table"><tr><th>ID</th><th>Name</th><th>Location</th><th>State</th><th>Disaster</th><th>Population</th><th>Severity</th><th>Actions</th></tr>';
DB.camps.forEach((c,i)=>{h+='<tr><td>'+c.id+'</td><td>'+c.name+'</td><td>'+c.location+'</td><td>'+c.state+'</td><td>'+c.disaster+'</td><td>'+c.population+'</td><td>'+badge(sevLabel(c.severity))+'</td><td><button class="btn-action small" onclick="modalEditCamp('+i+')">Edit</button></td></tr>';});
return h+'</table>';}
function adminRequests(pendingOnly){
var list=pendingOnly?DB.requests.filter(r=>r.status==='PENDING'):DB.requests;
var h='<div class="section-header"><h2>'+(pendingOnly?'🔔 Pending':'📋 All')+' Requests</h2></div>';
if(!list.length)return h+'<div class="empty-state"><div class="empty-icon">📋</div><p>No requests</p></div>';
h+='<table class="data-table"><tr><th>ID</th><th>User</th><th>Camp</th><th>Resource</th><th>Qty</th><th>Status</th><th>Time</th>'+(pendingOnly?'<th>Actions</th>':'<th>Note</th>')+'</tr>';
list.forEach((r,i)=>{var idx=DB.requests.indexOf(r);h+='<tr><td>'+r.reqID+'</td><td>'+r.userName+'</td><td>'+r.campName+'</td><td>'+r.resourceName+'</td><td>'+r.quantity+'</td><td>'+badge(r.status)+'</td><td>'+r.submitTime+'</td>'+(pendingOnly?'<td><button class="btn-action small success" onclick="modalProcessReq('+idx+')">Process</button></td>':'<td>'+(r.note||'')+'</td>')+'</tr>';});
return h+'</table>';}
function adminAllocations(){
var h='<div class="section-header"><h2>🚚 Allocation History</h2></div>';
if(!DB.allocations.length)return h+'<div class="empty-state"><div class="empty-icon">🚚</div><p>No allocations yet</p></div>';
h+='<table class="data-table"><tr><th>ID</th><th>Camp</th><th>Resource</th><th>Qty</th><th>Time</th><th>By</th></tr>';
DB.allocations.forEach(a=>{h+='<tr><td>'+a.id+'</td><td>'+a.campName+'</td><td>'+a.resourceName+'</td><td>'+a.qty+'</td><td>'+a.timestamp+'</td><td>'+a.by+'</td></tr>';});
return h+'</table>';}
function adminVolunteers(){
var h='<div class="section-header"><h2>🙋 Volunteers</h2><button class="btn-action" onclick="modalAddVolunteer()">+ Add Volunteer</button></div>';
if(!DB.volunteers.length)return h+'<div class="empty-state"><div class="empty-icon">🙋</div><p>No volunteers</p></div>';
h+='<table class="data-table"><tr><th>ID</th><th>Name</th><th>Skill</th><th>Contact</th><th>Camp</th><th>Status</th></tr>';
DB.volunteers.forEach(v=>{h+='<tr><td>'+v.id+'</td><td>'+v.name+'</td><td>'+v.skill+'</td><td>'+v.contact+'</td><td>'+v.camp+'</td><td>'+badge(v.active?'APPROVED':'REJECTED')+'</td></tr>';});
return h+'</table>';}
function adminDonors(){
var h='<div class="section-header"><h2>💝 Donors</h2><button class="btn-action" onclick="modalAddDonor()">+ Add Donor</button></div>';
if(!DB.donors.length)return h+'<div class="empty-state"><div class="empty-icon">💝</div><p>No donors</p></div>';
h+='<table class="data-table"><tr><th>ID</th><th>Name</th><th>Organization</th><th>Contact</th><th>Email</th></tr>';
DB.donors.forEach(d=>{h+='<tr><td>'+d.id+'</td><td>'+d.name+'</td><td>'+d.org+'</td><td>'+d.contact+'</td><td>'+d.email+'</td></tr>';});
return h+'</table>';}
function adminUsers(){
var h='<div class="section-header"><h2>👥 Registered Users</h2></div>';
if(!DB.users.length)return h+'<div class="empty-state"><div class="empty-icon">👥</div><p>No users</p></div>';
h+='<table class="data-table"><tr><th>ID</th><th>Name</th><th>Phone</th><th>Camp</th></tr>';
DB.users.forEach(u=>{h+='<tr><td>'+u.id+'</td><td>'+u.name+'</td><td>'+u.phone+'</td><td>'+u.campName+'</td></tr>';});
return h+'</table>';}

// Modals
function modalAddResource(){openModal('Add Resource','<div class="form-group"><label>Name</label><input id="m-rname"></div><div class="form-group"><label>Category</label><select id="m-rcat"><option>Food</option><option>Water</option><option>Medicine</option><option>Shelter</option><option>Clothing</option><option>Equipment</option></select></div><div class="form-group"><label>Quantity</label><input id="m-rqty" type="number"></div><div class="form-group"><label>Unit</label><input id="m-runit" placeholder="kg/liters/units"></div><div class="form-group"><label>Threshold</label><input id="m-rthresh" type="number"></div><div class="form-group"><label>Expiry</label><input id="m-rexp" placeholder="DD/MM/YYYY or N/A"></div><div class="modal-actions"><button class="btn-action" onclick="addResource()">Add Resource</button></div>');}
function addResource(){var r={id:'RES'+(++DB.counters.r),name:document.getElementById('m-rname').value,category:document.getElementById('m-rcat').value,quantity:+document.getElementById('m-rqty').value,unit:document.getElementById('m-runit').value,threshold:+document.getElementById('m-rthresh').value,expiry:document.getElementById('m-rexp').value||'N/A',location:'Main'};if(!r.name){toast('Fill name','error');return;}DB.resources.push(r);save();closeModal();toast('Resource added: '+r.id);renderAdmin('resources');}
function modalEditResource(i){var r=DB.resources[i];openModal('Edit Resource: '+r.id,'<div class="form-group"><label>Quantity (current: '+r.quantity+')</label><input id="m-eq" type="number" value="'+r.quantity+'"></div><div class="modal-actions"><button class="btn-action" onclick="editResource('+i+')">Update</button></div>');}
function editResource(i){DB.resources[i].quantity=+document.getElementById('m-eq').value;save();closeModal();toast('Updated');renderAdmin('resources');}
function deleteResource(i){if(confirm('Delete '+DB.resources[i].name+'?')){DB.resources.splice(i,1);save();toast('Deleted');renderAdmin('resources');}}
function modalAddCamp(){openModal('Register Camp','<div class="form-group"><label>Name</label><input id="m-cn"></div><div class="form-group"><label>Location</label><input id="m-cl"></div><div class="form-group"><label>State</label><input id="m-cs"></div><div class="form-group"><label>Disaster Type</label><select id="m-cd"><option>Flood</option><option>Earthquake</option><option>Cyclone</option><option>Fire</option><option>Other</option></select></div><div class="form-group"><label>Population</label><input id="m-cp" type="number"></div><div class="form-group"><label>Severity (1-5)</label><input id="m-cv" type="number" min="1" max="5"></div><div class="form-group"><label>Contact Person</label><input id="m-cc"></div><div class="form-group"><label>Phone</label><input id="m-cph"></div><div class="modal-actions"><button class="btn-action" onclick="addCamp()">Register</button></div>');}
function addCamp(){var c={id:'CAMP'+(++DB.counters.c),name:document.getElementById('m-cn').value,location:document.getElementById('m-cl').value,state:document.getElementById('m-cs').value,disaster:document.getElementById('m-cd').value,population:+document.getElementById('m-cp').value,severity:Math.min(5,Math.max(1,+document.getElementById('m-cv').value)),contact:document.getElementById('m-cc').value,phone:document.getElementById('m-cph').value,date:now()};if(!c.name){toast('Fill name','error');return;}DB.camps.push(c);save();closeModal();toast('Camp registered: '+c.id);renderAdmin('camps');}
function modalEditCamp(i){var c=DB.camps[i];openModal('Edit Camp: '+c.id,'<div class="form-group"><label>Severity (current: '+c.severity+')</label><input id="m-es" type="number" min="1" max="5" value="'+c.severity+'"></div><div class="form-group"><label>Population (current: '+c.population+')</label><input id="m-epo" type="number" value="'+c.population+'"></div><div class="modal-actions"><button class="btn-action" onclick="editCamp('+i+')">Update</button></div>');}
function editCamp(i){DB.camps[i].severity=Math.min(5,Math.max(1,+document.getElementById('m-es').value));DB.camps[i].population=+document.getElementById('m-epo').value;save();closeModal();toast('Updated');renderAdmin('camps');}
function modalProcessReq(i){var r=DB.requests[i];var resOpts='<option value="">-- Select Resource --</option>';DB.resources.forEach(function(res,ri){resOpts+='<option value="'+ri+'">'+res.name+' ('+res.category+') — Stock: '+res.quantity+' '+res.unit+'</option>';});openModal('Process Request: '+r.reqID,'<div style="background:var(--bg-surface);padding:16px;border-radius:8px;margin-bottom:16px"><p><b>User:</b> '+r.userName+'</p><p><b>Camp:</b> '+r.campName+'</p><p><b>Requested:</b> '+r.resourceName+'</p><p><b>Qty Requested:</b> '+r.quantity+' '+r.unit+'</p><p><b>Category:</b> '+r.category+'</p><p><b>Submitted:</b> '+r.submitTime+'</p></div><div class="form-group"><label>Select Resource to Allocate</label><select id="m-pres">'+resOpts+'</select></div><div class="form-group"><label>Quantity to Send (max: requested '+r.quantity+')</label><input id="m-pqty" type="number" value="'+r.quantity+'" min="1"></div><div class="form-group"><label>Admin Note (visible to user)</label><textarea id="m-pnote" placeholder="e.g. Sent 50kg rice to Camp A"></textarea></div><div class="modal-actions"><button class="btn-action success" onclick="approveReq('+i+')">✓ Approve & Send</button><button class="btn-action danger" onclick="rejectReq('+i+')">✗ Reject</button></div>');}
function approveReq(i){var r=DB.requests[i];var ri=document.getElementById('m-pres').value;var qty=+document.getElementById('m-pqty').value;var note=document.getElementById('m-pnote').value;if(ri===''||!qty){toast('Select resource and quantity','error');return;}ri=+ri;var res=DB.resources[ri];if(qty>res.quantity){toast('Not enough stock! Available: '+res.quantity,'error');return;}res.quantity-=qty;r.status='APPROVED';r.note='Sent '+qty+' '+res.unit+' of '+res.name+(note?' — '+note:'');var a={id:'ALLOC'+(++DB.counters.a),campID:r.campID,campName:r.campName,resourceID:res.id,resourceName:res.name,qty:qty,timestamp:now(),by:'Admin→'+r.userName};DB.allocations.push(a);save();closeModal();toast('Approved! '+qty+' '+res.unit+' of '+res.name+' sent to '+r.userName);renderAdmin('pending');}
function rejectReq(i){var note=document.getElementById('m-pnote').value;DB.requests[i].status='REJECTED';DB.requests[i].note='Rejected'+(note?' — '+note:'');save();closeModal();toast('Request rejected');renderAdmin('pending');}
function modalAddVolunteer(){openModal('Add Volunteer','<div class="form-group"><label>Name</label><input id="m-vn"></div><div class="form-group"><label>Skill</label><select id="m-vs"><option>Medical</option><option>Rescue</option><option>Logistics</option><option>Cooking</option><option>Counselling</option><option>General</option></select></div><div class="form-group"><label>Phone</label><input id="m-vc"></div><div class="form-group"><label>Email</label><input id="m-ve"></div><div class="modal-actions"><button class="btn-action" onclick="addVolunteer()">Register</button></div>');}
function addVolunteer(){var v={id:'VOL'+(++DB.counters.v),name:document.getElementById('m-vn').value,skill:document.getElementById('m-vs').value,contact:document.getElementById('m-vc').value,email:document.getElementById('m-ve').value,camp:'Unassigned',joinDate:now(),active:true};if(!v.name){toast('Fill name','error');return;}DB.volunteers.push(v);save();closeModal();toast('Volunteer added');renderAdmin('volunteers');}
function modalAddDonor(){openModal('Register Donor','<div class="form-group"><label>Name</label><input id="m-dn"></div><div class="form-group"><label>Organization</label><input id="m-do"></div><div class="form-group"><label>Contact</label><input id="m-dc"></div><div class="form-group"><label>Email</label><input id="m-de"></div><div class="modal-actions"><button class="btn-action" onclick="addDonor()">Register</button></div>');}
function addDonor(){var d={id:'DNR'+(++DB.counters.d),name:document.getElementById('m-dn').value,org:document.getElementById('m-do').value,contact:document.getElementById('m-dc').value,email:document.getElementById('m-de').value};if(!d.name){toast('Fill name','error');return;}DB.donors.push(d);save();closeModal();toast('Donor registered');renderAdmin('donors');}

// User portal
function userNav(btn){document.querySelectorAll('.user-sidebar .sidebar-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderUser(btn.dataset.view);}
function renderUser(view){
var m=document.getElementById('user-main');
if(view==='user-home'){m.innerHTML='<div class="welcome-banner"><h2>Welcome, '+currentUser.name+'!</h2><p>Disaster Relief Resource Coordinator</p><div class="user-info-row"><span class="info-chip">🆔 '+currentUser.id+'</span><span class="info-chip">🏕️ '+currentUser.campName+'</span><span class="info-chip">📱 '+currentUser.phone+'</span></div></div>'+adminDashboard();}
else if(view==='user-request'){m.innerHTML=userRequestForm();}
else if(view==='user-my-requests'){m.innerHTML=userMyRequests();}
else if(view==='user-resources'){m.innerHTML=userResources();}
else if(view==='user-camps'){m.innerHTML=userCampsView();}
}
function userRequestForm(){return '<div class="section-header"><h2>📝 Submit Resource Request</h2></div><div style="max-width:500px"><div class="form-group"><label>Resource Name</label><input id="u-rn"></div><div class="form-group"><label>Category</label><select id="u-rc"><option>Food</option><option>Water</option><option>Medicine</option><option>Shelter</option><option>Clothing</option><option>Equipment</option></select></div><div class="form-group"><label>Quantity</label><input id="u-rq" type="number"></div><div class="form-group"><label>Unit</label><input id="u-ru" placeholder="kg/liters/units/boxes"></div><button class="btn-action" onclick="submitRequest()">Submit Request</button></div>';}
function submitRequest(){var r={reqID:'REQ'+(++DB.counters.q),userID:currentUser.id,userName:currentUser.name,campID:currentUser.campID,campName:currentUser.campName,resourceName:document.getElementById('u-rn').value,category:document.getElementById('u-rc').value,quantity:+document.getElementById('u-rq').value,unit:document.getElementById('u-ru').value,status:'PENDING',note:'',submitTime:now()};if(!r.resourceName||!r.quantity){toast('Fill all fields','error');return;}DB.requests.push(r);save();toast('Request submitted: '+r.reqID);renderUser('user-my-requests');}
function userMyRequests(){var list=DB.requests.filter(r=>r.userID===currentUser.id);var h='<div class="section-header"><h2>📋 My Requests</h2></div>';if(!list.length)return h+'<div class="empty-state"><div class="empty-icon">📋</div><p>No requests yet</p></div>';h+='<table class="data-table"><tr><th>ID</th><th>Resource</th><th>Qty</th><th>Unit</th><th>Status</th><th>Note</th><th>Submitted</th></tr>';list.forEach(r=>{h+='<tr><td>'+r.reqID+'</td><td>'+r.resourceName+'</td><td>'+r.quantity+'</td><td>'+r.unit+'</td><td>'+badge(r.status)+'</td><td>'+r.note+'</td><td>'+r.submitTime+'</td></tr>';});return h+'</table>';}
function userResources(){var h='<div class="section-header"><h2>📦 Available Resources</h2></div>';if(!DB.resources.length)return h+'<div class="empty-state"><div class="empty-icon">📦</div><p>No resources available</p></div>';h+='<table class="data-table"><tr><th>Name</th><th>Category</th><th>Available</th><th>Unit</th></tr>';DB.resources.filter(r=>r.quantity>0).forEach(r=>{h+='<tr><td>'+r.name+'</td><td>'+r.category+'</td><td style="color:var(--success)">'+r.quantity+'</td><td>'+r.unit+'</td></tr>';});return h+'</table>';}
function userCampsView(){var h='<div class="section-header"><h2>🏕️ Relief Camps</h2></div>';if(!DB.camps.length)return h+'<div class="empty-state"><div class="empty-icon">🏕️</div><p>No camps</p></div>';h+='<table class="data-table"><tr><th>ID</th><th>Name</th><th>Location</th><th>Population</th><th>Severity</th><th>Disaster</th></tr>';DB.camps.forEach(c=>{h+='<tr><td>'+c.id+'</td><td>'+c.name+'</td><td>'+c.location+', '+c.state+'</td><td>'+c.population+'</td><td>'+badge(sevLabel(c.severity))+'</td><td>'+c.disaster+'</td></tr>';});return h+'</table>';}
