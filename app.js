/* DropZone BGMI scoreboard
   1. Add your Supabase project URL and anon key below.
   2. Run supabase-schema.sql in Supabase SQL Editor.
*/
const SUPABASE_URL = "https://lsvoxgjbpodqwwikxhvq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VuppDmkWeCJK_yQsSjGU6Q_bzBy-xZb";
const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR_") && SUPABASE_ANON_KEY.length > 30 && !SUPABASE_ANON_KEY.includes("YOUR_");
const db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

const state = { groups: [], teams: [], events: [], matches: [], results: [], contacts: {}, session: null, editingResultId: null };
const $ = id => document.getElementById(id);
const placementPoints = {1:12,2:9,3:8,4:7,5:6,6:5,7:4,8:3,9:2,10:1,11:0,12:0};
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials = name => String(name || "??").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase();
const pointsFor = place => placementPoints[Number(place)] ?? 0;
const teamById = id => state.teams.find(t=>t.id===id);
const groupName = id => state.groups.find(g=>g.id===id)?.name || "Ungrouped";
const eventById = id => state.events.find(e=>e.id===id);
const matchById = id => state.matches.find(m=>m.id===id);
const showToast = msg => { const t=$("adminToast"); t.textContent=msg; t.classList.add("show"); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.classList.remove("show"),3200); };
const errorText = err => err?.message || String(err || "Unknown error");
function setSelect(id, options, placeholder, selected="") { const el=$(id); if(!el)return; el.innerHTML=`<option value="">${esc(placeholder)}</option>`+options.map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(selected)?"selected":""}>${esc(o.label)}</option>`).join(""); }
function requireDb() { if(!db) { alert("Connect Supabase first: add your project URL and anon key at the top of app.js, then run supabase-schema.sql in your Supabase project."); return false; } return true; }
function placementLabel(n){return n===1?"1st — BOOYAH":`${n}${n===2?"nd":n===3?"rd":"th"}`;}

async function loadPublic() {
  if(!db){ $("lastUpdated").textContent="Demo setup needed: connect Supabase in app.js"; return; }
  try {
    const [g,t,e,m,r] = await Promise.all([
      db.from("groups").select("id,name,created_at").order("name"),
      db.from("teams").select("id,name,group_id,created_at").order("name"),
      db.from("events").select("id,name,stage,description,created_at").order("created_at",{ascending:false}),
      db.from("matches").select("id,event_id,match_number,map_name,label,created_at").order("match_number"),
      db.from("match_results").select("id,match_id,team_id,placement,kills,placement_points,total_points")
    ]);
    for(const x of [g,t,e,m,r]) if(x.error) throw x.error;
    state.groups=g.data||[]; state.teams=t.data||[]; state.events=e.data||[]; state.matches=m.data||[]; state.results=r.data||[];
    renderPublic(); if(state.session) renderAdmin();
    $("lastUpdated").textContent=`Updated ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`;
  } catch(err) { console.error(err); $("lastUpdated").textContent=`Could not load data: ${errorText(err)}`; }
}
function eventTotals(eventId, groupFilter="") {
  const matchIds=new Set(state.matches.filter(m=>m.event_id===eventId).map(m=>m.id));
  const sums={};
  for(const r of state.results.filter(x=>matchIds.has(x.match_id))){
    const t=teamById(r.team_id); if(!t || (groupFilter && t.group_id!==groupFilter)) continue;
    if(!sums[t.id]) sums[t.id]={team:t,points:0,kills:0,placement:0,wwcd:0,matches:0};
    const s=sums[t.id]; s.points+=Number(r.total_points ?? (pointsFor(r.placement)+Number(r.kills||0))); s.kills+=Number(r.kills||0); s.placement+=Number(r.placement_points ?? pointsFor(r.placement)); s.wwcd+=Number(r.placement)===1?1:0; s.matches++;
  }
  return Object.values(sums).sort((a,b)=>b.points-a.points || b.wwcd-a.wwcd || b.kills-a.kills || a.team.name.localeCompare(b.team.name));
}
function renderPublic(){
  const evOpts=state.events.map(e=>({value:e.id,label:e.name}));
  setSelect("eventFilter",evOpts,"All events",$("eventFilter").value); setSelect("matchEventFilter",evOpts,"All events",$("matchEventFilter").value);
  const groupOpts=state.groups.map(g=>({value:g.id,label:g.name}));
  setSelect("leaderGroupFilter",groupOpts,"All groups",$("leaderGroupFilter").value);
  const eventId=$("eventFilter").value || state.events[0]?.id || "";
  const groupId=$("leaderGroupFilter").value;
  let totals=[];
  if(eventId) totals=eventTotals(eventId,groupId);
  else {
    const map={};
    for(const ev of state.events) for(const s of eventTotals(ev.id,groupId)){
      if(!map[s.team.id]) map[s.team.id]={...s,points:0,kills:0,placement:0,wwcd:0,matches:0};
      for(const k of ["points","kills","placement","wwcd","matches"]) map[s.team.id][k]+=s[k];
    }
    totals=Object.values(map).sort((a,b)=>b.points-a.points||b.wwcd-a.wwcd||b.kills-a.kills);
  }
  $("leaderboardBody").innerHTML=totals.length?totals.map((s,i)=>`<tr><td class="rank-cell ${i===0?"rank-1":""}">${String(i+1).padStart(2,"0")}</td><td><div class="team-cell"><span class="team-badge">${esc(initials(s.team.name))}</span><span><span class="team-name">${esc(s.team.name)}</span><span class="team-sub">${s.matches} match${s.matches===1?"":"es"} played</span></span></div></td><td><span class="group-tag">${esc(groupName(s.team.group_id))}</span></td><td class="numeric chicken-count">${s.wwcd}</td><td class="numeric">${s.matches}</td><td class="numeric">${s.placement}</td><td class="numeric">${s.kills}</td><td class="numeric"><span class="points-strong">${s.points}</span></td></tr>`).join(""):`<tr><td colspan="8" class="empty-cell">${state.teams.length?"No results have been entered for this event yet.":"No teams registered yet. Check back soon."}</td></tr>`;
  $("teamsGrid").innerHTML=state.teams.length?state.teams.map(t=>`<article class="team-card"><div class="team-card-top"><span class="team-badge">${esc(initials(t.name))}</span><span class="group-tag">${esc(groupName(t.group_id))}</span></div><h3>${esc(t.name)}</h3><p>Registered squad · Contact admin for details</p></article>`).join(""):`<div class="empty-card">Team roster will appear here once the tournament admin adds teams.</div>`;
  $("teamCount").textContent=`${state.teams.length} team${state.teams.length===1?"":"s"} registered`;
  renderMatches();
}
function renderMatches(){
  const selected=$("matchEventFilter").value;
  const events=state.events.filter(e=>!selected||e.id===selected);
  $("matchResults").innerHTML=events.length?events.map(ev=>{
    const matches=state.matches.filter(m=>m.event_id===ev.id).sort((a,b)=>a.match_number-b.match_number);
    return `<article class="event-card"><div class="event-card-head"><div><h3>${esc(ev.name)}</h3><p>${esc(ev.description||"Tournament event")} · ${matches.length} match${matches.length===1?"":"es"}</p></div><span class="stage-chip">${esc(ev.stage||"EVENT")}</span></div>${matches.length?matches.map(m=>{
      const rows=state.results.filter(r=>r.match_id===m.id).sort((a,b)=>Number(a.placement)-Number(b.placement));
      return `<div class="match-row"><div class="match-row-head"><strong>MATCH ${m.match_number} · ${esc(m.label||m.map_name)}</strong><span>${esc(m.map_name)}</span></div>${rows.length?rows.map(r=>{const t=teamById(r.team_id);return t?`<div class="mini-result"><span class="mini-rank">${r.placement}</span><strong>${esc(t.name)}</strong><span class="mini-kills">${r.kills} kills</span><span class="mini-pts">${r.total_points??pointsFor(r.placement)+Number(r.kills||0)} pts</span></div>`:""}).join(""):`<div class="no-results">Results not posted yet.</div>`}</div>`;
    }).join(""):`<div class="match-row"><div class="no-results">No matches have been created for this event.</div></div>`}</article>`;
  }).join(""):`<div class="empty-card">No events have been created yet.</div>`;
}

function renderAdmin(){
  setSelect("teamGroup",state.groups.map(g=>({value:g.id,label:g.name})),"Select group",$("teamGroup").value);
  setSelect("matchEvent",state.events.map(e=>({value:e.id,label:e.name})),"Select event",$("matchEvent").value);
  setSelect("resultEvent",state.events.map(e=>({value:e.id,label:e.name})),"Select event",$("resultEvent").value);
  setSelect("resultGroup",state.groups.map(g=>({value:g.id,label:g.name})),"All groups",$("resultGroup").value);
  refreshResultMatchOptions(); refreshResultTeamOptions();
  $("adminTeamsList").innerHTML=state.teams.length?state.teams.map(t=>`<div class="admin-list-row"><div class="admin-list-main"><strong>${esc(t.name)}</strong><small>${esc(groupName(t.group_id))}${state.contacts[t.id]?.contact_person?" · "+esc(state.contacts[t.id].contact_person):""}${state.contacts[t.id]?.contact_details?" · "+esc(state.contacts[t.id].contact_details):""}</small></div><div class="admin-list-actions"><button class="mini-btn" data-edit-team="${t.id}">Edit</button><button class="mini-btn danger" data-delete-team="${t.id}">Delete</button></div></div>`).join(""):`<div class="empty-card">No teams added yet.</div>`;
  $("adminEventsList").innerHTML=state.events.length?state.events.map(e=>{const ms=state.matches.filter(m=>m.event_id===e.id);return `<div class="admin-list-row"><div class="admin-list-main"><strong>${esc(e.name)} <span class="stage-chip">${esc(e.stage||"EVENT")}</span></strong><small>${ms.length} match(es) · ${esc(e.description||"No description")}</small>${ms.map(m=>`<small>Match ${m.match_number}: ${esc(m.map_name)}${m.label?" · "+esc(m.label):""}</small>`).join("")}</div><div class="admin-list-actions"><button class="mini-btn danger" data-delete-event="${e.id}">Delete event</button></div></div>`}).join(""):`<div class="empty-card">No events created yet.</div>`;
  renderAdminResults();
}
function refreshResultMatchOptions(){
  const ev=$("resultEvent")?.value;
  setSelect("resultMatch",state.matches.filter(m=>!ev||m.event_id===ev).map(m=>({value:m.id,label:`${eventById(m.event_id)?.name||"Event"} · Match ${m.match_number} — ${m.map_name}`})),"Select match",$("resultMatch")?.value);
}
function refreshResultTeamOptions(){
  const group=$("resultGroup")?.value;
  setSelect("resultTeam",state.teams.filter(t=>!group||t.group_id===group).map(t=>({value:t.id,label:`${t.name} (${groupName(t.group_id)})`})),"Select team",$("resultTeam")?.value);
}
function renderAdminResults(){
  const mid=$("resultMatch")?.value;
  const rows=state.results.filter(r=>!mid||r.match_id===mid).sort((a,b)=>a.placement-b.placement);
  $("adminResultsList").innerHTML=rows.length?rows.map(r=>`<div class="admin-list-row"><div class="admin-list-main"><strong>${esc(teamById(r.team_id)?.name||"Deleted team")} · ${placementLabel(Number(r.placement))}</strong><small>${esc(matchById(r.match_id)?.map_name||"Match")} · ${r.kills} kills · ${r.placement_points??pointsFor(r.placement)} placement pts + ${r.kills} kill pts = ${r.total_points??pointsFor(r.placement)+Number(r.kills||0)} total</small></div><div class="admin-list-actions"><button class="mini-btn" data-edit-result="${r.id}">Edit</button><button class="mini-btn danger" data-delete-result="${r.id}">Delete</button></div></div>`).join(""):`<div class="empty-card">No results for this match yet.</div>`;
}
async function loadContacts(){
  if(!db||!state.session)return;
  const {data,error}=await db.from("team_contacts").select("team_id,contact_person,contact_details");
  if(error){console.warn("Contacts unavailable",error.message);return;}
  state.contacts=Object.fromEntries((data||[]).map(c=>[c.team_id,c]));
}
async function reloadAdmin(){await loadPublic();await loadContacts();renderAdmin();}
async function adminCheck(){
  if(!db)return;
  const {data:{session}}=await db.auth.getSession();state.session=session;
  if(session){await reloadAdmin();$("adminIdentity").textContent=session.user.email||"Admin";}
  else {state.contacts={};}
}
async function signIn(e){
  e.preventDefault(); if(!requireDb())return;
  $("loginMessage").textContent="Signing in…";
  const {data,error}=await db.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
  if(error){$("loginMessage").textContent=error.message;return;}
  state.session=data.session; $("adminModal").classList.remove("open");$("adminModal").setAttribute("aria-hidden","true");$("adminShell").classList.add("open");$("adminShell").setAttribute("aria-hidden","false");$("loginMessage").textContent="";
  await reloadAdmin();$("adminIdentity").textContent=data.user.email||"Admin";
}
function openConsole(){if(!requireDb())return;if(state.session){$("adminShell").classList.add("open");$("adminShell").setAttribute("aria-hidden","false");reloadAdmin();}else{$("adminModal").classList.add("open");$("adminModal").setAttribute("aria-hidden","false");}}
function closeConsole(){$("adminShell").classList.remove("open");$("adminShell").setAttribute("aria-hidden","true");}
async function insertOrUpdate(table,payload,id){
  const q=id?db.from(table).update(payload).eq("id",id):db.from(table).insert(payload);
  const {error}=await q;if(error)throw error;
}
async function handleGroup(e){e.preventDefault();try{await insertOrUpdate("groups",{name:$("groupName").value.trim()});$("groupForm").reset();await reloadAdmin();showToast("Group created.");}catch(err){showToast(errorText(err));}}
async function handleTeam(e){
  e.preventDefault();try{
    const id=$("teamId").value||null;const name=$("teamName").value.trim(),group_id=$("teamGroup").value;
    if(id) await insertOrUpdate("teams",{name,group_id},id); else {const {data,error}=await db.from("teams").insert({name,group_id}).select("id").single();if(error)throw error;state.teamContactNewId=data.id;}
    const teamId=id||state.teamContactNewId;
    const contact={team_id:teamId,contact_person:$("contactPerson").value.trim()||null,contact_details:$("contactDetails").value.trim()||null};
    const {error:contactError}=await db.from("team_contacts").upsert(contact,{onConflict:"team_id"});if(contactError)throw contactError;
    clearTeamForm();await reloadAdmin();showToast(id?"Team updated.":"Team added and published.");
  }catch(err){showToast(errorText(err));}
}
function clearTeamForm(){$("teamForm").reset();$("teamId").value="";$("saveTeamBtn").textContent="Save team";}
async function handleEvent(e){e.preventDefault();try{await insertOrUpdate("events",{name:$("eventName").value.trim(),stage:$("eventStage").value,description:$("eventDescription").value.trim()||null});$("eventForm").reset();await reloadAdmin();showToast("Event created.");}catch(err){showToast(errorText(err));}}
async function handleMatch(e){e.preventDefault();try{await insertOrUpdate("matches",{event_id:$("matchEvent").value,match_number:Number($("matchNumber").value),map_name:$("mapName").value.trim(),label:$("matchLabel").value.trim()||null});$("matchForm").reset();$("matchNumber").value="1";await reloadAdmin();showToast("Match created.");}catch(err){showToast(errorText(err));}}
function updateScorePreview(){const place=Number($("resultPlacement").value||1),kills=Number($("resultKills").value||0),p=pointsFor(place);$("placementPreview").textContent=p;$("killPreview").textContent=kills;$("totalPreview").textContent=`${p+kills} PTS`;}
async function handleResult(e){
  e.preventDefault();try{
    const payload={match_id:$("resultMatch").value,team_id:$("resultTeam").value,placement:Number($("resultPlacement").value),kills:Number($("resultKills").value)};
    // placement_points and total_points are generated by PostgreSQL; do not send them in writes.
    const existing=state.results.find(r=>r.match_id===payload.match_id&&r.team_id===payload.team_id);
    const id=state.editingResultId || existing?.id || null;
    if(id) await insertOrUpdate("match_results",payload,id);else await insertOrUpdate("match_results",payload);
    state.editingResultId=null;$("resultForm").reset();$("resultKills").value="0";refreshResultMatchOptions();refreshResultTeamOptions();updateScorePreview();await reloadAdmin();showToast("Result saved. Public scoreboard updated.");
  }catch(err){showToast(errorText(err));}
}
async function deleteRow(table,id,label){
  if(!confirm(`Delete this ${label}? This action cannot be undone.`))return;
  try{const {error}=await db.from(table).delete().eq("id",id);if(error)throw error;await reloadAdmin();showToast(`${label[0].toUpperCase()+label.slice(1)} deleted.`);}catch(err){showToast(errorText(err));}
}
document.addEventListener("click",async e=>{
  const t=e.target.closest("[data-edit-team]");if(t){const team=teamById(t.dataset.editTeam);if(!team)return;$("teamId").value=team.id;$("teamName").value=team.name;$("teamGroup").value=team.group_id||"";$("contactPerson").value=state.contacts[team.id]?.contact_person||"";$("contactDetails").value=state.contacts[team.id]?.contact_details||"";$("saveTeamBtn").textContent="Update team";$("teamsTab").scrollIntoView({behavior:"smooth"});return;}
  const dt=e.target.closest("[data-delete-team]");if(dt){await deleteRow("teams",dt.dataset.deleteTeam,"team");return;}
  const de=e.target.closest("[data-delete-event]");if(de){await deleteRow("events",de.dataset.deleteEvent,"event");return;}
  const dr=e.target.closest("[data-delete-result]");if(dr){await deleteRow("match_results",dr.dataset.deleteResult,"result");return;}
  const er=e.target.closest("[data-edit-result]");if(er){const r=state.results.find(x=>x.id===er.dataset.editResult);if(!r)return;state.editingResultId=r.id;$("resultEvent").value=matchById(r.match_id)?.event_id||"";refreshResultMatchOptions();$("resultMatch").value=r.match_id;$("resultGroup").value=teamById(r.team_id)?.group_id||"";refreshResultTeamOptions();$("resultTeam").value=r.team_id;$("resultPlacement").value=r.placement;$("resultKills").value=r.kills;updateScorePreview();$("resultForm").scrollIntoView({behavior:"smooth"});}
});
document.querySelectorAll(".admin-tabs button").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".admin-tabs button").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".admin-tab").forEach(x=>x.classList.toggle("active",x.id===b.dataset.tab));}));
$("adminOpen").addEventListener("click",openConsole);$("closeAdmin").addEventListener("click",()=>{$("adminModal").classList.remove("open");$("adminModal").setAttribute("aria-hidden","true");});$("closeConsole").addEventListener("click",closeConsole);
$("loginForm").addEventListener("submit",signIn);$("groupForm").addEventListener("submit",handleGroup);$("teamForm").addEventListener("submit",handleTeam);$("eventForm").addEventListener("submit",handleEvent);$("matchForm").addEventListener("submit",handleMatch);$("resultForm").addEventListener("submit",handleResult);
$("cancelTeamEdit").addEventListener("click",clearTeamForm);$("clearResult").addEventListener("click",()=>{state.editingResultId=null;$("resultForm").reset();$("resultKills").value="0";updateScorePreview();});
$("resultPlacement").addEventListener("change",updateScorePreview);$("resultKills").addEventListener("input",updateScorePreview);
$("resultEvent").addEventListener("change",()=>{refreshResultMatchOptions();renderAdminResults();});$("resultMatch").addEventListener("change",renderAdminResults);$("resultGroup").addEventListener("change",refreshResultTeamOptions);
$("eventFilter").addEventListener("change",renderPublic);$("leaderGroupFilter").addEventListener("change",renderPublic);$("matchEventFilter").addEventListener("change",renderMatches);$("refreshBtn").addEventListener("click",loadPublic);$("logoutBtn").addEventListener("click",async()=>{if(db)await db.auth.signOut();state.session=null;state.contacts={};closeConsole();showToast("Signed out.");});
$("adminModal").addEventListener("click",e=>{if(e.target===$("adminModal")){$("adminModal").classList.remove("open");$("adminModal").setAttribute("aria-hidden","true");}});
$("year").textContent=new Date().getFullYear();
if(db){db.auth.onAuthStateChange((_event,session)=>{state.session=session;if(session){setTimeout(()=>adminCheck(),0);}else{state.contacts={};}});adminCheck();loadPublic();setInterval(loadPublic,15000);}
else {renderPublic();}
