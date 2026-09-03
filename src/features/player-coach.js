/// @diq:begin [A0] Constants & pure helpers
// Passwords (edit here)
// Note: Coach Tools password is also used to unlock chip/target editing.
// Keep these near the top for easy updates.
// Database API bridge. D1/SQLite is the runtime source of truth.
let DIQ_API_AVAILABLE = false;
let DIQ_AUTH_USER = null;
let DIQ_ACTIVE_PRACTICE_ASSIGNMENT_ID = '';
let DIQ_PRACTICE_STATE = {
  pendingCount:0,
  overdueCount:0,
  freePlayAllowed:true,
  lockedAssignmentId:null,
  lockedAssignment:null,
  nextSituation:null,
};
let DIQ_PRACTICE_ADVANCE_ACTION = null;
let DIQ_PRACTICE_NOTICE_SIGNATURE = '';
let _diqTeamSyncTimer = null;
let _diqSituationSyncTimer = null;
let _diqSituationSaveQueue = Promise.resolve();
let _diqTeamSaveQueue = Promise.resolve();
const _diqDirtyTeams = new Set();
const _diqDirtyMembers = new Map();

function diqApiUrl(path){
  return `./api/${String(path || '').replace(/^\/+/, '')}`;
}

async function diqApiRequest(path, options={}){
  const headers = Object.assign({ Accept:'application/json' }, options.headers || {});
  if(options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(diqApiUrl(path), Object.assign({ credentials:'same-origin' }, options, { headers }));
  let data = null;
  try{ data = await response.json(); }catch(_e){}
  if(!response.ok){
    const err = new Error((data && data.error) || `Database request failed (${response.status}).`);
    err.status = response.status;
    throw err;
  }
  DIQ_API_AVAILABLE = true;
  window.__DIQ_API_AVAILABLE__ = true;
  return data;
}

function showDatabaseUnavailable(error){
  const message = (error && error.message) ? error.message : String(error || 'The database could not be reached.');
  window.__DIQ_DATABASE_ERROR__ = message;
  document.documentElement.dataset.diqDatabase = 'unavailable';
  let panel = document.getElementById('databaseUnavailable');
  if(!panel){
    panel = document.createElement('section');
    panel.id = 'databaseUnavailable';
    panel.setAttribute('role', 'alert');
    panel.style.cssText = 'position:fixed;inset:1rem;z-index:100000;display:grid;place-content:center;text-align:center;padding:2rem;border:1px solid #43e7f4;border-radius:18px;background:rgba(6,18,37,.97);color:#e1f9ff;box-shadow:0 0 40px rgba(67,231,244,.2)';
    panel.innerHTML = '<div style="max-width:38rem"><h1 style="margin:0 0 .75rem;font-size:1.6rem">Database unavailable</h1><p style="margin:0 0 1rem;line-height:1.5">Diamond Defense needs its SQLite database to load situations, teams, users, and results.</p><p data-database-error style="margin:0 0 1.25rem;color:#a9c8dd"></p><button type="button" style="padding:.7rem 1.1rem;border:0;border-radius:10px;background:#43e7f4;color:#061225;font-weight:800;cursor:pointer">Try again</button></div>';
    panel.querySelector('button').addEventListener('click', ()=>window.location.reload());
    document.body.appendChild(panel);
  }
  const detail = panel.querySelector('[data-database-error]');
  if(detail) detail.textContent = message;
}

function reportDatabaseWriteError(context, error){
  console.error(`[Database] ${context}:`, error);
  if(!error || ![400,401,403].includes(error.status)) showDatabaseUnavailable(error);
  else if(typeof toast === 'function') toast(error.message || `${context} failed.`);
}

function reportAuthenticationError(context, error){
  console.error(`[Authentication] ${context}:`, error);
  if(error?.status === 429) return error.message || 'Too many unsuccessful attempts. Try again later.';
  if(error?.status === 401) return error.message || 'The selected account or password is incorrect.';
  if(error?.status >= 500 && error?.status !== 503) return 'Login service is temporarily unavailable. Please try again.';
  return error?.message || 'Login service is temporarily unavailable. Please try again.';
}

let DIQ_LAST_AUTH_ERROR = '';

function rememberAuthenticationError(context, error){
  DIQ_LAST_AUTH_ERROR = reportAuthenticationError(context, error);
  return DIQ_LAST_AUTH_ERROR;
}

window._diqLastAuthenticationError = ()=>DIQ_LAST_AUTH_ERROR;

async function authenticateStaff(role, password){
  try{
    const result = await diqApiRequest('auth/login', {
      method:'POST',
      body:JSON.stringify({ role, password })
    });
    DIQ_AUTH_USER = result && result.user ? result.user : null;
    window.__DIQ_AUTH_USER__ = DIQ_AUTH_USER;
    DIQ_LAST_AUTH_ERROR = '';
    window._diqUpdateAuthNavigation?.();
    if(DIQ_AUTH_USER?.mustChangePassword) queueMicrotask(()=>window._diqOpenAccountSecurity?.({ required:true }));
    return !!(DIQ_AUTH_USER && DIQ_AUTH_USER.role === role);
  }catch(error){
    rememberAuthenticationError('Staff login failed', error);
    return error?.status === 401 ? false : null;
  }
}

let COACH_LOGIN_TEAMS = [];

function renderCoachLoginNames(){
  const teamSelect = document.getElementById('coachLoginTeamSelect');
  const coachSelect = document.getElementById('coachLoginNameSelect');
  if(!teamSelect || !coachSelect) return;
  const team = COACH_LOGIN_TEAMS.find(item=>item.id === teamSelect.value);
  coachSelect.innerHTML = '<option value="">— Select coach —</option>';
  ((team && team.roster) || []).forEach(coach=>{
    const option = document.createElement('option');
    option.value = coach.playerId;
    option.textContent = coach.name || coach.playerId;
    coachSelect.appendChild(option);
  });
  coachSelect.disabled = !team;
}

async function prepareCoachLogin(){
  const teamSelect = document.getElementById('coachLoginTeamSelect');
  if(!teamSelect) return;
  try{
    const result = await diqApiRequest('coaches/options', { cache:'no-store' });
    COACH_LOGIN_TEAMS = Array.isArray(result && result.teams) ? result.teams : [];
    const previous = teamSelect.value;
    teamSelect.innerHTML = '<option value="">— Select team —</option>';
    COACH_LOGIN_TEAMS.forEach(team=>{
      const option = document.createElement('option');
      option.value = team.id;
      option.textContent = team.displayName || team.name || team.id;
      teamSelect.appendChild(option);
    });
    if(COACH_LOGIN_TEAMS.some(team=>team.id === previous)) teamSelect.value = previous;
    renderCoachLoginNames();
  }catch(error){
    const message = document.getElementById('pwMsg');
    if(message) message.textContent = error?.message || 'Coach accounts could not be loaded.';
  }
}

async function authenticateCoach(teamId, coachId, password){
  try{
    const result = await diqApiRequest('auth/login', {
      method:'POST',
      body:JSON.stringify({ role:'coach', teamId, coachId, password })
    });
    DIQ_AUTH_USER = result && result.user ? result.user : null;
    window.__DIQ_AUTH_USER__ = DIQ_AUTH_USER;
    DIQ_LAST_AUTH_ERROR = '';
    updateCoachHeaderButton();
    if(DIQ_AUTH_USER?.mustChangePassword) queueMicrotask(()=>window._diqOpenAccountSecurity?.({ required:true }));
    return !!(DIQ_AUTH_USER && DIQ_AUTH_USER.role === 'coach');
  }catch(error){
    rememberAuthenticationError('Coach login failed', error);
    return error?.status === 401 ? false : null;
  }
}

function updateCoachHeaderButton(){
  const button = document.getElementById('coachBtn');
  const identity = document.getElementById('coachIdentity');
  const user = DIQ_AUTH_USER && DIQ_AUTH_USER.role === 'coach' ? DIQ_AUTH_USER : null;
  if(button){
    button.textContent = 'Coach Tools';
    button.dataset.authState = user ? 'logged-in' : 'logged-out';
    button.title = user ? `Open tools for ${user.displayName}` : 'Coach tools';
  }
  if(identity){
    identity.textContent = user
      ? `${user.displayName}${user.teamName ? ` · ${user.teamName}` : ''}`
      : 'Not logged in';
  }
  window._diqUpdateAuthNavigation?.();
}

async function logoutCoach(){
  try{ await diqApiRequest('auth/logout', { method:'POST' }); }
  catch(error){ reportDatabaseWriteError('Logout failed', error); return false; }
  DIQ_AUTH_USER = null;
  window.__DIQ_AUTH_USER__ = null;
  updateCoachHeaderButton();
  window._diqUpdateAuthNavigation?.();
  return true;
}

document.getElementById('coachLoginTeamSelect')?.addEventListener('change', renderCoachLoginNames);
window._diqPrepareCoachLogin = prepareCoachLogin;
window._diqAuthenticateCoach = authenticateCoach;
window._diqLogoutCoach = logoutCoach;
window._diqUpdateCoachHeaderButton = updateCoachHeaderButton;

function flushTeamsDatabaseSync(){
  clearTimeout(_diqTeamSyncTimer);
  _diqTeamSyncTimer = null;
  _diqTeamSaveQueue = _diqTeamSaveQueue.then(async ()=>{
    try{
      const teamIds = Array.from(_diqDirtyTeams);
      const memberEntries = Array.from(_diqDirtyMembers.entries());
      _diqDirtyTeams.clear();
      _diqDirtyMembers.clear();

      for(const teamId of teamIds){
        const team = (TEAMS.teams || []).find(item=>item.id === teamId);
        if(!team) continue;
        const creating = !Number.isInteger(Number(team.revision)) || Number(team.revision) < 1;
        const result = await diqApiRequest(creating ? 'admin/teams' : `admin/teams/${encodeURIComponent(team.id)}`, {
          method:creating ? 'POST' : 'PUT',
          headers:creating ? {} : { 'If-Match':String(team.revision) },
          body:JSON.stringify({ id:team.id, name:team.name })
        });
        if(result && result.record) team.revision = result.record.revision;
      }

      for(const [identity] of memberEntries){
        const [teamId, playerId] = identity.split('\u0000');
        const team = (TEAMS.teams || []).find(item=>item.id === teamId);
        const member = team && (team.roster || []).find(item=>item.playerId === playerId);
        if(!team || !member) continue;
        const creating = !Number.isInteger(Number(member.revision)) || Number(member.revision) < 1;
        const result = await diqApiRequest(
          creating
            ? `admin/teams/${encodeURIComponent(teamId)}/members`
            : `admin/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(playerId)}`,
          {
            method:creating ? 'POST' : 'PUT',
            headers:creating ? {} : { 'If-Match':String(member.revision) },
            body:JSON.stringify({
              userId:playerId,
              name:member.name,
              number:member.number,
              role:member.role || 'player',
              ...(member.password ? { password:member.password } : {})
            })
          }
        );
        if(result && result.record){
          member.revision = result.record.revision;
          member.userRevision = result.record.userRevision;
          delete member.password;
        }
      }
    }catch(error){
      reportDatabaseWriteError('Team save failed', error);
      throw error;
    }
  });
  return _diqTeamSaveQueue;
}

function queueTeamsDatabaseSync(){
  clearTimeout(_diqTeamSyncTimer);
  _diqTeamSyncTimer = setTimeout(()=>{ void flushTeamsDatabaseSync(); }, 450);
}

function queueSituationDatabaseSync(situation){
  if(!situation || !situation.key) return;
  clearTimeout(_diqSituationSyncTimer);
  const snapshot = JSON.parse(JSON.stringify(situation));
  _diqSituationSyncTimer = setTimeout(()=>{
    _diqSituationSaveQueue = _diqSituationSaveQueue.then(async ()=>{
      const live = (typeof SITUATIONS !== 'undefined' ? SITUATIONS : []).find(item=>item.key === snapshot.key);
      const revision = Number(live && live.revision);
      const creating = !Number.isInteger(revision) || revision < 1;
      const result = await diqApiRequest(
        creating ? 'situations' : `situations/${encodeURIComponent(snapshot.key)}`,
        {
          method:creating ? 'POST' : 'PUT',
          headers:creating ? {} : { 'If-Match':String(revision) },
          body:JSON.stringify(snapshot)
        }
      );
      if(live && result && result.record) live.revision = result.record.revision;
    }).catch(error=>reportDatabaseWriteError('Situation save failed', error));
  }, 500);
}

async function deleteSituationFromDatabase(key, revision){
  if(!key) return;
  try{
    await diqApiRequest(`situations/${encodeURIComponent(key)}`, {
      method:'DELETE',
      headers:{ 'If-Match':String(revision) }
    });
  }catch(error){ reportDatabaseWriteError('Situation delete failed', error); }
}

window._diqApiRequest = diqApiRequest;
window._diqAuthenticateStaff = authenticateStaff;
window._diqQueueSituationSave = queueSituationDatabaseSync;
window._diqDeleteSituation = deleteSituationFromDatabase;
window._diqFlushTeamDatabaseSync = flushTeamsDatabaseSync;

// Patch map (JS):
// [A0] Boot / globals
// [A1] Utilities + storage
// [A2] Marker scaling + layout
// [A3] Situation model + selection
// [A4] Targets + tolerance + notes
// [A5] Export / import (situations, results, teams)
// [A6] Player login + database-backed results
// [A7] Coach tools + database-backed results viewer + situation proposals
// Keep begin/end markers intact for patching.
/** @typedef {{ x:number, y:number }} Pt */
/** @typedef {{ [posId:string]: Pt }} Starts */
/** @typedef {{ [posId:string]: {x:number,y:number,tol:number} }} Targets */
/** @typedef {{ first:boolean, second:boolean, third:boolean }} RunnersOn */
/** @typedef {{
 *   key:string, title:string, desc:string, category:string,
 *   difficulty:'beginner'|'intermediate'|'advanced',
 *   starts?:Starts, targets?:Targets,
 *   hit?:Pt, hitType?:'line'|'popup'|'grounder',
 *   batterAdvance?:number,
 *   outs?:0|1|2,
 *   runnersOn?:RunnersOn
 * }} Situation */

/** “enum” of position ids, frozen for safety */
const POS_IDS = Object.freeze(['P','C','1B','2B','SS','3B','LF','CF','RF']);

/** Don’t let defaults accidentally change at runtime */
const DEFAULT_STARTS = Object.freeze({
  P:{x:1570,y:1240},  C:{x:1578,y:1833},
  '1B':{x:2081,y:1172}, '2B':{x:1934,y:941}, SS:{x:1202,y:935}, '3B':{x:1047,y:1170},
  LF:{x:750,y:679},  CF:{x:1570,y:476}, RF:{x:2385,y:683}
});
Object.freeze(DEFAULT_STARTS.P); Object.freeze(DEFAULT_STARTS.C);
Object.freeze(DEFAULT_STARTS['1B']); Object.freeze(DEFAULT_STARTS['2B']);
Object.freeze(DEFAULT_STARTS.SS); Object.freeze(DEFAULT_STARTS['3B']);
Object.freeze(DEFAULT_STARTS.LF); Object.freeze(DEFAULT_STARTS.CF); Object.freeze(DEFAULT_STARTS.RF);

const IMG_W=3200, IMG_H=2133;
const DEFAULT_TOL=69;
const HOME_NATIVE = { x:1577, y:1734 };
const BASES_NATIVE = {
  home:{x:1577,y:1734}, first:{x:2170,y:1304}, second:{x:1572,y:854}, third:{x:962,y:1305}
};

const TIMER_START_SECS = 60;
let _timerId = null;
let _timerSecs = TIMER_START_SECS;

// --- Player identity + per-situation results (database-backed) ---

  // --- Player identity (base random id + user-entered metadata) ---
  function slugify(str){
    return String(str || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  let PLAYER_BASE_ID = 'anonymous';
  let PLAYER_META = {team:"", name:"", number:""};

  // Ensure cached player session is loaded (and base id exists) on page load.
  // Safe to call multiple times.
  function ensurePlayerMeta(){
    PLAYER_META = (PLAYER_META && typeof PLAYER_META === 'object') ? PLAYER_META : {team:"", name:"", number:""};
    if(typeof PLAYER_META.team !== 'string') PLAYER_META.team = (PLAYER_META.team!=null ? String(PLAYER_META.team) : "");
    if(typeof PLAYER_META.name !== 'string') PLAYER_META.name = (PLAYER_META.name!=null ? String(PLAYER_META.name) : "");
    if(typeof PLAYER_META.number !== 'string') PLAYER_META.number = (PLAYER_META.number!=null ? String(PLAYER_META.number) : "");
    try{ refreshPlayerLoginUI(); }catch(_e){}
  }

  function buildPlayerId(){
    const m = (PLAYER_META && typeof PLAYER_META === 'object') ? PLAYER_META : {team:"", name:"", number:""};
    const teamSlug = slugify(m.team) || "team";
    const nameSlug = slugify(m.name) || "player";
    const num = String(m.number || "").trim().replace(/\s+/g,"");
    const numSafe = num ? num.replace(/[^0-9a-zA-Z-]/g,"") : "0";
    return `${PLAYER_BASE_ID}-${teamSlug}-${nameSlug}-${numSafe}`;
  }

  function getPlayerId(){
    return (DIQ_AUTH_USER && DIQ_AUTH_USER.role === 'player' && DIQ_AUTH_USER.id)
      ? String(DIQ_AUTH_USER.id)
      : 'anonymous';
  }

  // --- Teams (Coach-managed) + Player Login ---
  let TEAMS = { version: 1, teams: [] };

  function slugifyLoose(str){
    return String(str || "")
      .trim()
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function deepClone(obj){
    return JSON.parse(JSON.stringify(obj));
  }

  function normalizeTeamsData(data){
  // Accept multiple top-level keys to be forgiving with hand-edited JSON
  const rawTeams =
    (data && (data.teams || data.Teams || data.TEAMS)) || [];
  const teamsArr = Array.isArray(rawTeams) ? rawTeams : [];

  const out = { version: 1, teams: [] };
  teamsArr.forEach((t, i)=>{
    const name = String((t && (t.name || t.team || t.teamName || t.Team || t.TeamName)) || '').trim();
    const id = String((t && (t.id || t.teamId || t.slug)) || (name ? slugify(name) : ('team-' + (i+1))));
    const rawRoster =
      (t && (t.roster || t.Roster || t.players || t.Players || t.playerList)) || [];
    const rosterArr = Array.isArray(rawRoster) ? rawRoster : [];

    const roster = rosterArr.map((p, j)=>{
      const playerName = String((p && (p.name || p.playerName || p.player || p.PlayerName)) || '').trim();
      const playerNumber = String((p && (p.number || p.playerNumber || p.num || p.PlayerNumber)) || '').trim();
      const password = String((p && (p.password || p.pass || p.pin || p.PlayerPassword)) || '').trim();
      const playerId = String((p && (p.playerId || p.id)) || '').trim();
      return {
        name: playerName,
        number: playerNumber,
        password,
        playerId,
        role: (p && p.role) === 'coach' ? 'coach' : 'player',
        revision: Number(p && p.revision) || 0,
        userRevision: Number(p && p.userRevision) || 0,
        active: !p || p.active !== false
      };
    }).filter(p=>p.name && p.number);

    out.teams.push({
      id,
      name,
      revision:Number(t && t.revision) || 0,
      active:!t || t.active !== false,
      roster:roster.map(p => ({ ...p, playerId:computeRosterPlayerId({id, name}, p) }))
    });
  });

  return out;
}

function computeRosterPlayerId(teamObj, playerObj){
  // Compatibility fallback for old roster entries that did not include IDs.
  if (playerObj && playerObj.playerId) return String(playerObj.playerId);
  const teamSlug = slugifyLoose(teamObj && (teamObj.name || teamObj.id) ? (teamObj.name || teamObj.id) : "team") || "team";
  const nameSlug = slugifyLoose(playerObj && playerObj.name ? playerObj.name : "") || "player";
  const num = String(playerObj && playerObj.number != null ? playerObj.number : "").trim().replace(/\s+/g,"");
  const numSafe = num ? num.replace(/[^0-9a-zA-Z-]/g,"") : "0";
  return `${teamSlug}-${nameSlug}-${numSafe}`;
}

  function saveTeamsToLocal(teamId, memberId){
    if(teamId && memberId){
      _diqDirtyMembers.set(`${teamId}\u0000${memberId}`, true);
    }else if(teamId){
      _diqDirtyTeams.add(String(teamId));
    }else{
      (TEAMS.teams || []).forEach(team=>{
        _diqDirtyTeams.add(String(team.id));
        (team.roster || []).forEach(member=>{
          _diqDirtyMembers.set(`${team.id}\u0000${member.playerId}`, true);
        });
      });
    }
    queueTeamsDatabaseSync();
  }

  async function loadTeamsFromJson(){
    const data = await diqApiRequest('teams/options', { cache:'no-store' });
    TEAMS = normalizeTeamsData(data);
}

  // @diq:begin [A13] Teams CSV upload
  function _csvParseLine(line, delim){
    const out = [];
    let cur = '';
    let inQ = false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(inQ){
        if(ch === '"'){
          if(line[i+1] === '"'){ cur += '"'; i++; }
          else inQ = false;
        }else{
          cur += ch;
        }
      }else{
        if(ch === '"') inQ = true;
        else if(ch === delim){ out.push(cur); cur=''; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function parseDelimited(text){
    const raw = String(text || '').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    const lines = raw.split('\n').filter(l=>l.trim().length>0);
    if(lines.length === 0) return { headers: [], rows: [] };

    const first = lines[0];
    const comma = (first.match(/,/g)||[]).length;
    const tab = (first.match(/\t/g)||[]).length;
    const delim = tab > comma ? '\t' : ',';

    const headers = _csvParseLine(lines[0], delim).map(h=>String(h||'').trim());
    const rows = [];
    for(let i=1;i<lines.length;i++){
      const cols = _csvParseLine(lines[i], delim);
      if(cols.every(c=>String(c||'').trim()==='')) continue;
      const obj = {};
      for(let j=0;j<headers.length;j++){
        obj[headers[j]] = (cols[j]==null ? '' : String(cols[j]).trim());
      }
      rows.push(obj);
    }
    return { headers, rows };
  }

  function _truthyRemove(v){
    const s = String(v||'').trim().toLowerCase();
    return s==='1' || s==='y' || s==='yes' || s==='true' || s==='remove' || s==='delete';
  }

  function _csvEscape(v){
    const s = String(v ?? '');
    if(/[",\n\r\t]/.test(s)){
      return '"' + s.replace(/"/g,'""') + '"';
    }
    return s;
  }

  function _detectDelim(line){
    const comma = (String(line||'').match(/,/g)||[]).length;
    const tab = (String(line||'').match(/\t/g)||[]).length;
    return tab > comma ? '\t' : ',';
  }

  // Parse the v3 block CSV:
  // [TEAMS] team_name,remove
  // [PLAYERS] team_name,player_name,player_number,player_password,remove
  function parseTeamsCsvV3(text){
    const raw = String(text || '').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    const lines = raw.split('\n').map(l=>l.trim()).filter(l=>l.length>0);

    const sections = { TEAMS: [], PLAYERS: [] };
    let cur = null;
    for(const line of lines){
      const up = line.toUpperCase();
      if(up === '[TEAMS]'){ cur = 'TEAMS'; continue; }
      if(up === '[PLAYERS]'){ cur = 'PLAYERS'; continue; }
      if(cur) sections[cur].push(line);
    }

    const parseSection = (arr)=>{
      if(!arr || arr.length===0) return { headers:[], rows:[] };
      const delim = _detectDelim(arr[0]);
      const headers = _csvParseLine(arr[0], delim).map(h=>String(h||'').trim());
      const rows = [];
      for(let i=1;i<arr.length;i++){
        const cols = _csvParseLine(arr[i], delim);
        if(cols.every(c=>String(c||'').trim()==='')) continue;
        const obj = {};
        for(let j=0;j<headers.length;j++){
          obj[headers[j]] = (cols[j]==null ? '' : String(cols[j]).trim());
        }
        rows.push(obj);
      }
      return { headers, rows };
    };

    return { teams: parseSection(sections.TEAMS), players: parseSection(sections.PLAYERS) };
  }

  function applyTeamsCsvV3(parsed){
    const out = { teams:0, players:0, removedTeams:0, removedPlayers:0 };

    const mapHeaders = (headers)=>{
      const m = {};
      (headers||[]).forEach(h=>{
        const k = String(h||'').trim().toLowerCase();
        if(k) m[k]=h;
      });
      return m;
    };

    const get = (row, headerMap, key, alts=[])=>{
      const lk = String(key).toLowerCase();
      if(headerMap[lk]) return row[headerMap[lk]];
      for(const a of alts){
        const la = String(a).toLowerCase();
        if(headerMap[la]) return row[headerMap[la]];
      }
      for(const k in row){
        const kl = String(k).trim().toLowerCase();
        if(kl===lk) return row[k];
        for(const a of alts){
          if(kl===String(a).trim().toLowerCase()) return row[k];
        }
      }
      return '';
    };

    const findTeamByNameLocal = (name)=>{
      const n = String(name||'').trim().toLowerCase();
      const list = (TEAMS && Array.isArray(TEAMS.teams)) ? TEAMS.teams : [];
      for(const t of list){
        if(String(t.name||'').trim().toLowerCase() === n) return t;
      }
      return null;
    };

    // --- TEAMS ---
    const th = mapHeaders(parsed.teams.headers);
    for(const r of (parsed.teams.rows||[])){
      const teamName = String(get(r, th, 'team_name', ['team','name','team name','teamname'])).trim();
      if(!teamName) continue;

      const remove = _truthyRemove(get(r, th, 'remove', ['rm','delete','remove?']));

      const existing = findTeamByNameLocal(teamName);
      if(remove){
        if(existing){
          removeTeam(existing.id);
          out.removedTeams++;
        }
        continue;
      }

      if(!existing){
        upsertTeam(teamName);
        out.teams++;
      }
    }

    // --- PLAYERS ---
    const ph = mapHeaders(parsed.players.headers);
    for(const r of (parsed.players.rows||[])){
      const teamName = String(get(r, ph, 'team_name', ['team','team name','teamname'])).trim();
      const playerName = String(get(r, ph, 'player_name', ['player','name','player name','playername'])).trim();
      const playerNum  = String(get(r, ph, 'player_number', ['number','player number','playernumber','jersey','jersey number'])).trim();
      const password   = String(get(r, ph, 'player_password', ['password','pin','passcode','player password','playerpassword'])).trim();
      const remove = _truthyRemove(get(r, ph, 'remove', ['rm','delete','remove?']));

      if(!teamName) continue;
      if(!playerName && !playerNum) continue;

      let t = findTeamByNameLocal(teamName);
      if(!t){
        t = upsertTeam(teamName);
        out.teams++;
      }

      if(remove){
        const roster = Array.isArray(t.roster) ? t.roster : [];
        let target = null;

        if(playerNum){
          target = roster.find(p => String(p.number||'').trim() === String(playerNum).trim()) || null;
          if(target && playerName){
            const t2 = roster.find(p => String(p.number||'').trim() === String(playerNum).trim() && String(p.name||'').trim().toLowerCase() === playerName.trim().toLowerCase());
            if(t2) target = t2;
          }
        }
        if(!target && playerName){
          target = roster.find(p => String(p.name||'').trim().toLowerCase() === playerName.trim().toLowerCase()) || null;
        }
        if(!target && playerNum){
          target = roster.find(p => String(p.number||'').trim() === String(playerNum).trim()) || null;
        }

        if(target && target.playerId){
          removePlayer(t.id, target.playerId);
          out.removedPlayers++;
        }
        continue;
      }

      // Upsert: require name+number; password is optional (blank preserves existing when possible)
      if(playerName && playerNum){
        const existingRoster = Array.isArray(t.roster) ? t.roster : [];
        const ex = existingRoster.find(p => String(p.number||'').trim() === String(playerNum).trim() && String(p.name||'').trim().toLowerCase() === playerName.trim().toLowerCase()) || null;
        const passToSet = password ? password : (ex && ex.password ? ex.password : '');
        upsertPlayer(t.id, playerName, playerNum, passToSet);
        out.players++;
      }
    }

    TEAMS = normalizeTeamsData(TEAMS);
    saveTeamsToLocal();
    refreshTeamsUIAll();
    if(typeof adminRefreshAll === 'function') adminRefreshAll();
    return out;
  }

  // Backward-compatible: accept legacy v2 flat CSV OR v3 block CSV.
  function importTeamsFromCsvText(text){
    const raw = String(text || '');
    if(/\[\s*TEAMS\s*\]/i.test(raw) && /\[\s*PLAYERS\s*\]/i.test(raw)){
      const parsed = parseTeamsCsvV3(raw);
      return applyTeamsCsvV3(parsed);
    }
    const parsed = parseDelimited(raw);
    return applyTeamsRosterRows(parsed.rows, parsed.headers);
  }

  function applyTeamsRosterRows(rows, headers){
    // Legacy v2 flat CSV importer (kept for backward compatibility)
    if(!Array.isArray(rows) || rows.length===0) return { teams:0, players:0, removedTeams:0, removedPlayers:0 };

    const headerMap = {};
    (headers||[]).forEach(h=>{
      const k = String(h||'').trim().toLowerCase();
      if(k) headerMap[k]=h;
    });

    const get = (row, key, alts=[])=>{
      const lk = String(key).toLowerCase();
      if(headerMap[lk]) return row[headerMap[lk]];
      for(const a of alts){
        const la = String(a).toLowerCase();
        if(headerMap[la]) return row[headerMap[la]];
      }
      for(const k in row){
        if(String(k).trim().toLowerCase()===lk) return row[k];
        for(const a of alts){
          if(String(k).trim().toLowerCase()===String(a).trim().toLowerCase()) return row[k];
        }
      }
      return '';
    };

    const findTeamByNameLocal = (name)=>{
      const n = String(name||'').trim().toLowerCase();
      const list = (TEAMS && Array.isArray(TEAMS.teams)) ? TEAMS.teams : [];
      for(const t of list){
        if(String(t.name||'').trim().toLowerCase() === n) return t;
      }
      return null;
    };

    const normAction = (a)=>{
      const v = String(a||'').trim().toLowerCase();
      if(!v) return '';
      if(v==='remove' || v==='delete' || v==='del' || v==='rm') return 'remove';
      if(v==='add' || v==='update' || v==='upsert') return 'add';
      return v;
    };

    let teamAdds=0, playerAdds=0, removedTeams=0, removedPlayers=0;

    for(const r of rows){
      const teamName = String(get(r,'Team Name',['Team','TeamName'])).trim();
      if(!teamName) continue;

      const playerName = String(get(r,'Player Name',['Player','Name','PlayerName'])).trim();
      const playerNum  = String(get(r,'Player Number',['Number','PlayerNumber','Jersey','Jersey Number'])).trim();
      const password   = String(get(r,'Player Password',['Password','Passcode','PIN','Pin'])).trim();
      const actionRaw  = get(r,'Action',['Op','Operation','Mode']);
      const action = normAction(actionRaw);

      let t = findTeamByNameLocal(teamName);

      const hasAnyPlayerFields = !!(playerName || playerNum);
      if(action === 'remove' && !hasAnyPlayerFields){
        if(t){
          removeTeam(t.id);
          removedTeams++;
        }
        continue;
      }

      if(!t){
        t = upsertTeam(teamName);
        teamAdds++;
      }

      if(action === 'remove' && t){
        const roster = Array.isArray(t.roster) ? t.roster : [];
        let target = null;

        if(playerNum){
          target = roster.find(p => String(p.number||'').trim() === String(playerNum).trim()) || null;
          if(target && playerName){
            const t2 = roster.find(p => String(p.number||'').trim() === String(playerNum).trim() && String(p.name||'').trim().toLowerCase() === playerName.trim().toLowerCase());
            if(t2) target = t2;
          }
        }
        if(!target && playerName){
          target = roster.find(p => String(p.name||'').trim().toLowerCase() === playerName.trim().toLowerCase()) || null;
        }

        if(target && target.playerId){
          removePlayer(t.id, target.playerId);
          removedPlayers++;
        }
        continue;
      }

      if(t && playerName && playerNum && password){
        const before = (t.roster||[]).length;
        upsertPlayer(t.id, playerName, playerNum, password);
        const after = (t.roster||[]).length;
        if(after >= before) playerAdds++;
      }
    }

    TEAMS = normalizeTeamsData(TEAMS);
    saveTeamsToLocal();
    refreshTeamsUIAll();
    if(typeof adminRefreshAll === 'function') adminRefreshAll();
    return { teams:teamAdds, players:playerAdds, removedTeams, removedPlayers };
  }

  function downloadTeamsCsvTemplate(){
    // v3 clean template (no comment rows)
    const csv = [
      '[TEAMS]',
      'team_name,remove',
      '',
      '[PLAYERS]',
      'team_name,player_name,player_number,player_password,remove'
    ].join('\n');
    downloadText('diamondiq_teams_template_v3.csv', csv, 'text/csv');
  }

  function downloadSelectedTeamCsvV3(teamId){
    const id = String(teamId||'').trim();
    if(!id) return null;
    const t = findTeam(id);
    if(!t) return null;

    const lines = [];
    lines.push('[TEAMS]');
    lines.push('team_name,remove');
    lines.push([t.name||'', ''].map(_csvEscape).join(','));
    lines.push('');
    lines.push('[PLAYERS]');
    lines.push('team_name,player_name,player_number,player_password,remove');

    const roster = Array.isArray(t.roster) ? t.roster.slice() : [];
    roster.sort((a,b)=> String(a.number||'').localeCompare(String(b.number||''), undefined, {numeric:true, sensitivity:'base'}) || String(a.name||'').localeCompare(String(b.name||'')));
    for(const p of roster){
      lines.push([t.name||'', p.name||'', p.number!=null ? String(p.number) : '', p.password||'', ''].map(_csvEscape).join(','));
    }
    return lines.join('\n');
  }

  // @diq:end [A13] 


  function findTeam(teamId){
  const id = String(teamId || "").trim();
  if(!id) return null;
  const want = id;
  const wantSlug = slugifyLoose(id);
  return (TEAMS.teams || []).find(t => t.id === want || t.id === wantSlug || slugifyLoose(t.name) === wantSlug) || null;
}
  function findPlayer(teamId, playerId){
  const t = findTeam(teamId);
  if(!t) return null;
  const pid = String(playerId || "").trim();
  const pidSlug = slugifyLoose(pid);
  return (t.roster || []).find(p => p.playerId === pid || slugifyLoose(p.playerId) === pidSlug) || null;
}

  // --- Coach TEAMS UI wiring ---
  const coachTeamSelect = document.getElementById("coachTeamSelect");
  const coachTeamName = document.getElementById("coachTeamName");
  const coachTeamAddBtn = document.getElementById("coachTeamAddBtn");
  const coachTeamUpdateBtn = document.getElementById("coachTeamUpdateBtn");
  const coachTeamRemoveBtn = document.getElementById("coachTeamRemoveBtn");

  const coachResultsWorkspace = document.getElementById('coachResultsWorkspace');
  const coachResultsPlayerSelect = document.getElementById('coachResultsPlayerSelect');
  const coachResultsSituationSelect = document.getElementById('coachResultsSituationSelect');
  const coachResultsOutcomeSelect = document.getElementById('coachResultsOutcomeSelect');
  const coachResultsDateFrom = document.getElementById('coachResultsDateFrom');
  const coachResultsDateTo = document.getElementById('coachResultsDateTo');
  const coachResultsStatus = document.getElementById('coachResultsStatus');
  const coachResultsSummary = document.getElementById('coachResultsSummary');
  const coachResultsList = document.getElementById('coachResultsList');
  const coachResultsPagination = document.getElementById('coachResultsPagination');
  const practiceWorkspace = document.getElementById('practiceWorkspace');
  const playerPracticeView = document.getElementById('playerPracticeView');
  const coachPracticeView = document.getElementById('coachPracticeView');
  const playerPracticeStatus = document.getElementById('playerPracticeStatus');
  const playerPracticeList = document.getElementById('playerPracticeList');
  const playerPracticePagination = document.getElementById('playerPracticePagination');
  const coachPracticeStatus = document.getElementById('coachPracticeStatus');
  const coachPracticeList = document.getElementById('coachPracticeList');
  const coachPracticePagination = document.getElementById('coachPracticePagination');
  const practiceAssignmentForm = document.getElementById('practiceAssignmentForm');
  const practiceTitle = document.getElementById('practiceTitle');
  const practiceDueAt = document.getElementById('practiceDueAt');
  const practiceInstructions = document.getElementById('practiceInstructions');
  const practicePlayerChoices = document.getElementById('practicePlayerChoices');
  const practiceSituationChoices = document.getElementById('practiceSituationChoices');
  const practiceFormEyebrow = document.getElementById('practiceFormEyebrow');
  const practiceFormTitle = document.getElementById('practiceFormTitle');
  const practiceCancelEdit = document.getElementById('practiceCancelEdit');
  const practiceSaveDraft = document.getElementById('practiceSaveDraft');
  const practicePublish = document.getElementById('practicePublish');
  const practiceLifecycleTabs = document.getElementById('practiceLifecycleTabs');
  const practiceSearch = document.getElementById('practiceSearch');
  const practiceSort = document.getElementById('practiceSort');
  let coachResultsPage = 1;
  let coachResultsAppliedFilters = {};
  let playerPracticePage = 1;
  let coachPracticePage = 1;
  let playerPracticeAssignments = [];
  let coachPracticeAssignments = [];
  let coachPracticeViewFilter = 'active';
  let practiceEditingAssignment = null;

  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[character]);
  }

  function setPracticeStatus(element, message='', state=''){
    if(!element) return;
    element.textContent = message;
    element.className = `operation-status${state ? ` is-${state}` : ''}`;
  }

  function normalizedPracticeState(state){
    const pendingCount = Math.max(0, Number(state?.pendingCount || 0));
    return {
      pendingCount,
      overdueCount:Math.max(0, Number(state?.overdueCount || 0)),
      freePlayAllowed:state?.freePlayAllowed !== false && pendingCount === 0,
      lockedAssignmentId:state?.lockedAssignmentId || null,
      lockedAssignment:state?.lockedAssignment || null,
      nextSituation:state?.nextSituation || null,
    };
  }

  function updatePracticeNavigation(){
    const practice = document.getElementById('practiceToggle');
    const playbook = document.getElementById('playbookBrowserToggle');
    const random = document.getElementById('randomSitBtn');
    const user = DIQ_AUTH_USER || window.__DIQ_AUTH_USER__;
    const pending = user?.role === 'player' && DIQ_PRACTICE_STATE.pendingCount > 0;
    if(practice){
      let label = practice.querySelector('.practice-toggle-label');
      let count = practice.querySelector('.practice-toggle-count');
      if(!label || !count){
        label = document.createElement('span');
        label.className = 'practice-toggle-label';
        count = document.createElement('span');
        count.className = 'practice-toggle-count hidden';
        practice.replaceChildren(label, count);
      }
      label.textContent = 'Your Practice';
      count.textContent = String(DIQ_PRACTICE_STATE.pendingCount);
      count.classList.toggle('hidden', !pending);
      practice.classList.toggle('has-pending-practice', pending);
      practice.setAttribute('aria-label', pending
        ? `Your Practice, ${DIQ_PRACTICE_STATE.pendingCount} pending`
        : 'Your Practice');
    }
    if(playbook){
      playbook.disabled = Boolean(pending);
      playbook.title = pending ? 'Complete all assigned practice before opening the Playbook.' : 'Browse the Playbook';
    }
    if(random){
      random.disabled = !user || Boolean(pending);
      random.title = pending ? 'Complete all assigned practice before choosing a random situation.' : 'Choose a random situation';
    }
    window._diqApplyGameAccess?.();
  }

  function applyPracticeState(state, options={}){
    DIQ_PRACTICE_STATE = normalizedPracticeState(state);
    window.__DIQ_PRACTICE_STATE__ = DIQ_PRACTICE_STATE;
    DIQ_ACTIVE_PRACTICE_ASSIGNMENT_ID = DIQ_PRACTICE_STATE.lockedAssignmentId || '';
    updatePracticeNavigation();
    if(options.notify && DIQ_PRACTICE_STATE.pendingCount > 0){
      const signature = `${DIQ_AUTH_USER?.id || ''}:${DIQ_PRACTICE_STATE.pendingCount}:${DIQ_PRACTICE_STATE.lockedAssignmentId || ''}`;
      if(signature !== DIQ_PRACTICE_NOTICE_SIGNATURE){
        DIQ_PRACTICE_NOTICE_SIGNATURE = signature;
        const overdue = DIQ_PRACTICE_STATE.overdueCount > 0
          ? ` ${DIQ_PRACTICE_STATE.overdueCount} ${DIQ_PRACTICE_STATE.overdueCount === 1 ? 'is' : 'are'} overdue.`
          : '';
        if(typeof toast === 'function') toast(`You have ${DIQ_PRACTICE_STATE.pendingCount} pending practice ${DIQ_PRACTICE_STATE.pendingCount === 1 ? 'assignment' : 'assignments'}.${overdue}`);
      }
    }
    return DIQ_PRACTICE_STATE;
  }

  async function refreshPlayerPracticeState(options={}){
    const user = DIQ_AUTH_USER || window.__DIQ_AUTH_USER__;
    if(user?.role !== 'player') return applyPracticeState(null);
    const state = await diqApiRequest('practice/status', { cache:'no-store' });
    return applyPracticeState(state, options);
  }

  function hidePracticeAdvance(){
    document.getElementById('practiceAdvancePanel')?.classList.add('hidden');
    DIQ_PRACTICE_ADVANCE_ACTION = null;
  }

  function showPracticeAdvance(state, options={}){
    const panel = document.getElementById('practiceAdvancePanel');
    const title = document.getElementById('practiceAdvanceTitle');
    const message = document.getElementById('practiceAdvanceMessage');
    const button = document.getElementById('practiceAdvanceButton');
    if(!panel || !title || !message || !button) return;
    if(state.lockedAssignmentId && state.nextSituation){
      title.textContent = options.interrupted ? 'Attempt ended' : 'Situation complete';
      message.textContent = `Next: ${practiceSituationLabel(state.nextSituation)}`;
      button.textContent = 'Continue to next situation';
      DIQ_PRACTICE_ADVANCE_ACTION = { type:'continue', assignmentId:state.lockedAssignmentId };
    }else if(state.pendingCount > 0){
      title.textContent = 'Assignment complete';
      message.textContent = 'Choose your next pending practice assignment.';
      button.textContent = 'View Your Practice';
      DIQ_PRACTICE_ADVANCE_ACTION = { type:'practice-list' };
    }else{
      title.textContent = 'All practice complete';
      message.textContent = 'Free play, Playbook, and Random are now available.';
      button.textContent = 'Continue to free play';
      DIQ_PRACTICE_ADVANCE_ACTION = { type:'dismiss' };
    }
    panel.classList.remove('hidden');
  }

  async function startGuidedPractice(assignmentId){
    setPracticeStatus(playerPracticeStatus, 'Preparing your next situation…');
    try{
      const state = await diqApiRequest(`practice/assignments/${encodeURIComponent(assignmentId)}/start`, { method:'POST' });
      applyPracticeState(state);
      if(!state.nextSituation?.situationKey || !state.nextSituation?.situation){
        throw new Error('The next assigned situation could not be loaded.');
      }
      hidePracticeAdvance();
      window._diqSelectPracticeSituation?.(
        state.nextSituation.situationKey,
        state.lockedAssignmentId,
        state.nextSituation.situation,
      );
      showFieldWorkspace();
      setPracticeStatus(playerPracticeStatus);
    }catch(error){
      setPracticeStatus(playerPracticeStatus, error?.message || 'Practice could not be started.', 'error');
      await refreshPlayerPracticeState().catch(()=>null);
    }
  }

  function practiceSituationCode(key){
    const raw = String(key || '').replace(/^BD-/i, '');
    const [number, ...suffix] = raw.split('-');
    const main = /^\d+$/.test(number) ? number.padStart(2, '0') : number;
    return `S${main}${suffix.length ? `.${suffix.join('.')}` : ''}`;
  }

  function practiceSituationLabel(situation){
    return `${practiceSituationCode(situation?.key || situation?.situationKey)} · ${situation?.title || 'Situation'}`;
  }

  function practiceDueLabel(assignment){
    if(!assignment?.dueAt) return 'No due date';
    const label = new Date(assignment.dueAt).toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' });
    return assignment.overdue ? `Overdue · ${label}` : `Due ${label}`;
  }

  function practiceAssignmentStatus(assignment){
    if(assignment?.status === 'archived') return 'archived';
    if(assignment?.cancelledAt) return 'cancelled';
    if(assignment?.closedAt) return 'closed';
    return assignment?.status || 'draft';
  }

  function assignmentProgress(assignment){
    const situations = Array.isArray(assignment?.situations) ? assignment.situations : [];
    const required = situations.length;
    const completed = situations.filter(item=>item.progressStatus === 'completed' || Number(item.completedRepetitions || 0) > 0).length;
    return { completed, required, percent:required ? Math.round(completed / required * 100) : 0 };
  }

  function practiceSituationStatus(item){
    if(item?.progressStatus === 'completed' || Number(item?.completedRepetitions || 0) > 0) return 'Completed';
    if(item?.progressStatus === 'incomplete') return 'Incomplete';
    return 'Not started';
  }

  function paginationHtml(report, role){
    if(!report || Number(report.totalPages || 1) <= 1) return '';
    return `<button class="btn btn-ghost" type="button" data-practice-page="${Number(report.page)-1}" data-practice-role="${role}" ${report.hasPrevious ? '' : 'disabled'}>← Previous</button>
      <span>Page ${Number(report.page)} of ${Number(report.totalPages)}</span>
      <button class="btn btn-ghost" type="button" data-practice-page="${Number(report.page)+1}" data-practice-role="${role}" ${report.hasNext ? '' : 'disabled'}>Next →</button>`;
  }

  function renderPlayerPractice(report){
    if(!playerPracticeList) return;
    const assignments = Array.isArray(report?.assignments) ? report.assignments : [];
    playerPracticeAssignments = assignments;
    if(!assignments.length){
      playerPracticeList.innerHTML = '<div class="practice-empty"><strong>No assigned practice yet</strong><span>Your coach’s assignments will appear here.</span></div>';
    }else{
      playerPracticeList.innerHTML = assignments.map(assignment=>{
        const recipient = (assignment.recipients || []).find(item=>item.playerId === DIQ_AUTH_USER?.id);
        const progress = assignmentProgress(assignment);
        const next = (assignment.situations || []).find(item=>item.progressStatus !== 'completed' && Number(item.completedRepetitions || 0) === 0);
        const complete = recipient?.status === 'completed' || assignment.status === 'completed';
        return `<article class="practice-assignment-card${assignment.overdue ? ' is-overdue' : ''}${complete ? ' is-complete' : ''}">
          <div class="practice-card-heading"><div><span class="practice-status is-${escapeHtml(recipient?.status || assignment.status)}">${escapeHtml(complete ? 'Completed' : recipient?.status === 'in_progress' ? 'In progress' : 'Assigned')}</span><h3>${escapeHtml(assignment.title)}</h3></div><span class="practice-due">${escapeHtml(practiceDueLabel(assignment))}</span></div>
          ${assignment.instructions ? `<p>${escapeHtml(assignment.instructions)}</p>` : ''}
          <div class="practice-progress"><span style="width:${progress.percent}%"></span></div>
          <div class="practice-progress-copy"><strong>${progress.completed} of ${progress.required} situations complete</strong><span>${progress.percent}%</span></div>
          <div class="practice-situation-list">${(assignment.situations || []).map(item=>`
            <div><span>${escapeHtml(practiceSituationLabel(item))}</span><strong>${escapeHtml(practiceSituationStatus(item))}</strong></div>`).join('')}</div>
          ${next && !complete ? `<button class="btn-green" type="button" data-practice-start="${escapeHtml(assignment.id)}" ${DIQ_PRACTICE_STATE.lockedAssignmentId && DIQ_PRACTICE_STATE.lockedAssignmentId !== assignment.id ? 'disabled title="Finish your current practice assignment first"' : ''}>${recipient?.lockActive || DIQ_PRACTICE_STATE.lockedAssignmentId === assignment.id ? 'Continue practice' : 'Start practice'}</button>` : ''}
        </article>`;
      }).join('');
    }
    if(playerPracticePagination) playerPracticePagination.innerHTML = paginationHtml(report, 'player');
  }

  function renderCoachPractice(report){
    if(!coachPracticeList) return;
    const assignments = Array.isArray(report?.assignments) ? report.assignments : [];
    coachPracticeAssignments = assignments;
    if(!assignments.length){
      const label = coachPracticeViewFilter === 'draft' ? 'drafts' : `${coachPracticeViewFilter} assignments`;
      coachPracticeList.innerHTML = `<div class="practice-empty"><strong>No ${escapeHtml(label)}</strong><span>Change the status tab or search, or create a new practice queue.</span></div>`;
    }else{
      coachPracticeList.innerHTML = assignments.map(assignment=>{
        const percent = assignment.recipientCount
          ? Math.round(Number(assignment.completedRecipientCount || 0) / Number(assignment.recipientCount) * 100)
          : 0;
        const displayStatus = practiceAssignmentStatus(assignment);
        return `<article class="practice-assignment-card compact${assignment.overdue ? ' is-overdue' : ''}">
          <div class="practice-card-heading"><div><span class="practice-status is-${escapeHtml(displayStatus)}">${escapeHtml(displayStatus)}</span><h3>${escapeHtml(assignment.title)}</h3></div><span class="practice-due">${escapeHtml(practiceDueLabel(assignment))}</span></div>
          ${assignment.instructions ? `<p>${escapeHtml(assignment.instructions)}</p>` : ''}
          <div class="practice-card-metrics"><span><strong>${Number(assignment.situationCount || 0)}</strong> situations</span><span><strong>${Number(assignment.completedRecipientCount || 0)}/${Number(assignment.recipientCount || 0)}</strong> players complete</span></div>
          <div class="practice-progress"><span style="width:${percent}%"></span></div>
          <div class="practice-recipient-summary">${(assignment.recipients || []).map(recipient=>`<span class="is-${escapeHtml(recipient.status)}">${escapeHtml(recipient.playerNumber ? `#${recipient.playerNumber} ` : '')}${escapeHtml(recipient.playerName)}</span>`).join('')}</div>
          <div class="practice-card-actions">
            ${assignment.status === 'draft' || (assignment.status === 'active' && !assignment.closedAt && !assignment.cancelledAt) ? `<button class="btn btn-ghost" type="button" data-practice-edit="${escapeHtml(assignment.id)}">Edit</button>` : ''}
            ${assignment.status === 'draft' ? `<button class="btn-green" type="button" data-practice-action="publish" data-assignment-id="${escapeHtml(assignment.id)}">Publish</button>` : ''}
            ${assignment.status === 'active' && !assignment.closedAt && !assignment.cancelledAt ? `<button class="btn btn-ghost" type="button" data-practice-action="close" data-assignment-id="${escapeHtml(assignment.id)}">Close</button><button class="btn btn-danger" type="button" data-practice-action="cancel" data-assignment-id="${escapeHtml(assignment.id)}">Cancel</button>` : ''}
            <button class="btn btn-ghost" type="button" data-practice-action="duplicate" data-assignment-id="${escapeHtml(assignment.id)}">Duplicate</button>
            ${assignment.status !== 'draft' ? `<button class="btn btn-ghost" type="button" data-practice-action="retake" data-assignment-id="${escapeHtml(assignment.id)}">Retake</button>` : ''}
            ${assignment.status === 'archived' ? `<button class="btn-green" type="button" data-practice-action="restore" data-assignment-id="${escapeHtml(assignment.id)}">Restore</button>` : `<button class="btn btn-danger" type="button" data-practice-action="archive" data-assignment-id="${escapeHtml(assignment.id)}">Archive</button>`}
            ${assignment.status === 'draft' ? `<button class="btn btn-danger" type="button" data-practice-delete="${escapeHtml(assignment.id)}">Delete draft</button>` : ''}
          </div>
        </article>`;
      }).join('');
    }
    if(coachPracticePagination) coachPracticePagination.innerHTML = paginationHtml(report, 'coach');
  }

  async function loadPracticeAssignments(role){
    const user = DIQ_AUTH_USER || window.__DIQ_AUTH_USER__;
    if(!user) return;
    const player = role === 'player';
    const status = player ? playerPracticeStatus : coachPracticeStatus;
    setPracticeStatus(status, 'Loading assignments…');
    try{
      const page = player ? playerPracticePage : coachPracticePage;
      const params = new URLSearchParams({ page:String(page), pageSize:'6' });
      if(!player){
        params.set('view', coachPracticeViewFilter);
        params.set('sort', practiceSort?.value || 'newest');
        if(practiceSearch?.value.trim()) params.set('search', practiceSearch.value.trim());
      }
      const report = await diqApiRequest(`practice/assignments?${params}`, { cache:'no-store' });
      if(!player && Number(report.page || 1) > Number(report.totalPages || 1)){
        coachPracticePage = Number(report.totalPages || 1);
        return loadPracticeAssignments('coach');
      }
      if(player) renderPlayerPractice(report);
      else renderCoachPractice(report);
      if(player) await refreshPlayerPracticeState();
      setPracticeStatus(status);
    }catch(error){
      setPracticeStatus(status, error?.message || 'Assignments could not be loaded.', 'error');
    }
  }

  async function refreshCoachPracticeWorkspace(){
    try{
      await loadTeamsFromJson();
      renderPracticeFormChoices();
      await loadPracticeAssignments('coach');
    }catch(error){
      setPracticeStatus(coachPracticeStatus, error?.message || 'Practice data could not be refreshed.', 'error');
    }
  }

  function renderPracticeFormChoices(assignment=practiceEditingAssignment){
    const user = DIQ_AUTH_USER || window.__DIQ_AUTH_USER__;
    const team = findTeam(user?.teamId);
    const assignedPlayers = new Set((assignment?.recipients || []).map(recipient=>recipient.playerId));
    const assignedSituations = new Set((assignment?.situations || []).map(situation=>situation.situationKey));
    const activeEdit = assignment?.status === 'active';
    if(practicePlayerChoices){
      practicePlayerChoices.innerHTML = (team?.roster || [])
        .filter(member=>member.role !== 'coach' && member.active !== false)
        .map(member=>`<label><input type="checkbox" value="${escapeHtml(member.playerId)}" ${assignedPlayers.has(member.playerId) ? 'checked' : ''} ${activeEdit && assignedPlayers.has(member.playerId) ? 'disabled' : ''}> <span>${escapeHtml(member.number ? `#${member.number} ` : '')}${escapeHtml(member.name)}</span></label>`)
        .join('') || '<span class="muted">No active players are available.</span>';
    }
    if(practiceSituationChoices){
      practiceSituationChoices.innerHTML = (Array.isArray(SITUATIONS) ? SITUATIONS : []).map(situation=>`
        <label class="practice-situation-choice">
          <input type="checkbox" value="${escapeHtml(situation.key)}" ${assignedSituations.has(situation.key) ? 'checked' : ''} ${activeEdit ? 'disabled' : ''}>
          <span><strong>${escapeHtml(practiceSituationLabel(situation))}</strong><small>${escapeHtml(situation.category || 'General')} · ${escapeHtml(situation.difficulty || 'intermediate')}</small></span>
        </label>`).join('');
    }
  }

  function resetPracticeForm(){
    practiceEditingAssignment = null;
    practiceAssignmentForm?.reset();
    if(practiceFormEyebrow) practiceFormEyebrow.textContent = 'New assignment';
    if(practiceFormTitle) practiceFormTitle.textContent = 'Build a practice queue';
    if(practiceSaveDraft) practiceSaveDraft.textContent = 'Save draft';
    practicePublish?.classList.remove('hidden');
    practiceCancelEdit?.classList.add('hidden');
    const selectTeam = document.getElementById('practiceSelectTeam');
    if(selectTeam) selectTeam.textContent = 'Select team';
    renderPracticeFormChoices(null);
  }

  function editPracticeAssignment(assignment){
    if(!assignment) return;
    practiceEditingAssignment = assignment;
    if(practiceTitle) practiceTitle.value = assignment.title || '';
    if(practiceInstructions) practiceInstructions.value = assignment.instructions || '';
    if(practiceDueAt) practiceDueAt.value = assignment.dueAt ? String(assignment.dueAt).slice(0,10) : '';
    if(practiceFormEyebrow) practiceFormEyebrow.textContent = assignment.status === 'draft' ? 'Edit draft' : 'Edit active practice';
    if(practiceFormTitle) practiceFormTitle.textContent = assignment.status === 'draft'
      ? 'Update the complete practice queue'
      : 'Update details or add new players';
    if(practiceSaveDraft) practiceSaveDraft.textContent = 'Save changes';
    practicePublish?.classList.add('hidden');
    practiceCancelEdit?.classList.remove('hidden');
    const selectTeam = document.getElementById('practiceSelectTeam');
    if(selectTeam) selectTeam.textContent = assignment.status === 'active' ? 'Select new players' : 'Select team';
    renderPracticeFormChoices(assignment);
    practiceAssignmentForm?.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function selectedPracticeInput(publish){
    const playerIds = [...(practicePlayerChoices?.querySelectorAll('input[type="checkbox"]:checked') || [])].map(input=>input.value);
    const situations = [...(practiceSituationChoices?.querySelectorAll('.practice-situation-choice') || [])]
      .filter(row=>row.querySelector('input[type="checkbox"]')?.checked)
      .map(row=>({ situationKey:row.querySelector('input[type="checkbox"]')?.value || '' }));
    const input = {
      title:practiceTitle?.value || '',
      instructions:practiceInstructions?.value || '',
      dueAt:practiceDueAt?.value || null,
      playerIds,
      situations,
      publish,
    };
    if(practiceEditingAssignment?.status === 'active'){
      const existing = new Set((practiceEditingAssignment.recipients || []).map(recipient=>recipient.playerId));
      input.addPlayerIds = playerIds.filter(playerId=>!existing.has(playerId));
    }
    return input;
  }

  async function createPracticeAssignment(publish){
    const editing = practiceEditingAssignment;
    setPracticeStatus(coachPracticeStatus, editing ? 'Saving changes…' : publish ? 'Publishing assignment…' : 'Saving draft…');
    try{
      await diqApiRequest(editing ? `practice/assignments/${encodeURIComponent(editing.id)}` : 'practice/assignments', {
        method:editing ? 'PUT' : 'POST',
        body:JSON.stringify(selectedPracticeInput(publish)),
      });
      resetPracticeForm();
      if(!editing){
        coachPracticeViewFilter = publish ? 'active' : 'draft';
        practiceLifecycleTabs?.querySelectorAll('[data-practice-view]').forEach(tab=>{
          tab.classList.toggle('is-active', tab.dataset.practiceView === coachPracticeViewFilter);
          tab.setAttribute('aria-selected', String(tab.dataset.practiceView === coachPracticeViewFilter));
        });
      }
      coachPracticePage = 1;
      setPracticeStatus(coachPracticeStatus, editing ? 'Assignment updated.' : publish ? 'Assignment published.' : 'Draft saved.', 'success');
      await loadPracticeAssignments('coach');
    }catch(error){
      setPracticeStatus(coachPracticeStatus, error?.message || 'Assignment could not be saved.', 'error');
    }
  }

  function showFieldWorkspace(){
    practiceWorkspace?.classList.add('hidden');
    document.querySelector('.field-card')?.classList.remove('hidden');
    window.dispatchEvent(new Event('resize'));
  }

  function openPracticeWorkspace(role='player'){
    const user = DIQ_AUTH_USER || window.__DIQ_AUTH_USER__;
    if(!user) return window._diqOpenAuthModal?.('player');
    const player = role === 'player' && user.role === 'player';
    document.getElementById('coachResultsWorkspace')?.classList.add('hidden');
    document.getElementById('adminWorkspace')?.classList.add('hidden');
    document.querySelector('.field-card')?.classList.add('hidden');
    practiceWorkspace?.classList.remove('hidden');
    playerPracticeView?.classList.toggle('hidden', !player);
    coachPracticeView?.classList.toggle('hidden', player);
    const title = document.getElementById('practiceWorkspaceTitle');
    const subtitle = document.getElementById('practiceWorkspaceSubtitle');
    const eyebrow = document.getElementById('practiceWorkspaceEyebrow');
    if(title) title.textContent = player ? 'Your Practice' : 'Practice Assignments';
    if(subtitle) subtitle.textContent = player
      ? 'Complete the situations assigned by your coach.'
      : 'Create practice queues and monitor player completion.';
    if(eyebrow) eyebrow.textContent = player ? 'Assigned practice' : 'Coach workspace';
    if(player){
      playerPracticePage = 1;
      void loadPracticeAssignments('player');
    }else{
      resetPracticeForm();
      coachPracticePage = 1;
      void refreshCoachPracticeWorkspace();
    }
  }

  window._diqOpenPracticeWorkspace = openPracticeWorkspace;
  window._diqRefreshPracticeState = refreshPlayerPracticeState;
  window._diqApplyPracticeState = applyPracticeState;
  window._diqHidePracticeAdvance = hidePracticeAdvance;
  window._diqSetActivePracticeAssignment = assignmentId=>{
    DIQ_ACTIVE_PRACTICE_ASSIGNMENT_ID = String(assignmentId || '');
  };
  window._diqClearActivePracticeAssignment = ()=>{
    DIQ_ACTIVE_PRACTICE_ASSIGNMENT_ID = '';
  };

  document.getElementById('practiceAdvanceButton')?.addEventListener('click', ()=>{
    const action = DIQ_PRACTICE_ADVANCE_ACTION;
    if(action?.type === 'continue') void startGuidedPractice(action.assignmentId);
    else if(action?.type === 'practice-list'){
      hidePracticeAdvance();
      openPracticeWorkspace('player');
    }else hidePracticeAdvance();
  });
  window.addEventListener('focus', ()=>{
    if((DIQ_AUTH_USER || window.__DIQ_AUTH_USER__)?.role === 'player'){
      void refreshPlayerPracticeState().catch(()=>null);
    }
  });

  document.getElementById('practiceWorkspaceClose')?.addEventListener('click', ()=>{
    const user = DIQ_AUTH_USER || window.__DIQ_AUTH_USER__;
    if(user?.role === 'coach') document.getElementById('coachCardCloseBtn')?.click();
    else showFieldWorkspace();
  });
  document.getElementById('practiceCoachRefresh')?.addEventListener('click', ()=>void refreshCoachPracticeWorkspace());
  document.getElementById('practiceSelectTeam')?.addEventListener('click', ()=>{
    const boxes = [...(practicePlayerChoices?.querySelectorAll('input[type="checkbox"]:not(:disabled)') || [])];
    const select = boxes.some(box=>!box.checked);
    boxes.forEach(box=>{ box.checked = select; });
  });
  practiceSaveDraft?.addEventListener('click', ()=>void createPracticeAssignment(false));
  practiceCancelEdit?.addEventListener('click', resetPracticeForm);
  practiceLifecycleTabs?.addEventListener('click', event=>{
    const button = event.target.closest('[data-practice-view]');
    if(!button) return;
    coachPracticeViewFilter = button.dataset.practiceView;
    coachPracticePage = 1;
    practiceLifecycleTabs.querySelectorAll('[data-practice-view]').forEach(tab=>{
      tab.classList.toggle('is-active', tab === button);
      tab.setAttribute('aria-selected', String(tab === button));
    });
    resetPracticeForm();
    void loadPracticeAssignments('coach');
  });
  document.getElementById('practiceApplyFilters')?.addEventListener('click', ()=>{
    coachPracticePage = 1;
    void loadPracticeAssignments('coach');
  });
  practiceSearch?.addEventListener('keydown', event=>{
    if(event.key === 'Enter'){
      event.preventDefault();
      coachPracticePage = 1;
      void loadPracticeAssignments('coach');
    }
  });
  practiceSort?.addEventListener('change', ()=>{
    coachPracticePage = 1;
    void loadPracticeAssignments('coach');
  });
  practiceAssignmentForm?.addEventListener('submit', event=>{
    event.preventDefault();
    void createPracticeAssignment(true);
  });
  practiceWorkspace?.addEventListener('click', event=>{
    const pageButton = event.target.closest('[data-practice-page]');
    if(pageButton && !pageButton.disabled){
      const page = Number(pageButton.dataset.practicePage || 1);
      if(pageButton.dataset.practiceRole === 'player'){
        playerPracticePage = page;
        void loadPracticeAssignments('player');
      }else{
        coachPracticePage = page;
        void loadPracticeAssignments('coach');
      }
      return;
    }
    const start = event.target.closest('[data-practice-start]');
    if(start){
      void startGuidedPractice(start.dataset.practiceStart);
      return;
    }
    const edit = event.target.closest('[data-practice-edit]');
    if(edit){
      editPracticeAssignment(coachPracticeAssignments.find(assignment=>assignment.id === edit.dataset.practiceEdit));
      return;
    }
    const remove = event.target.closest('[data-practice-delete]');
    if(remove){
      if(!window.confirm('Permanently delete this unused draft? This cannot be undone.')) return;
      remove.disabled = true;
      void diqApiRequest(`practice/assignments/${encodeURIComponent(remove.dataset.practiceDelete)}`, {
        method:'DELETE',
      }).then(()=>{
        resetPracticeForm();
        setPracticeStatus(coachPracticeStatus, 'Draft deleted.', 'success');
        return loadPracticeAssignments('coach');
      }).catch(error=>setPracticeStatus(coachPracticeStatus, error?.message || 'Draft could not be deleted.', 'error'));
      return;
    }
    const action = event.target.closest('[data-practice-action]');
    if(action){
      const verb = action.dataset.practiceAction;
      if(['cancel','archive'].includes(verb) && !window.confirm(
        verb === 'cancel'
          ? 'Cancel this practice? It will immediately leave every player queue.'
          : 'Archive this practice? It will immediately leave every player queue.',
      )) return;
      action.disabled = true;
      void diqApiRequest(`practice/assignments/${encodeURIComponent(action.dataset.assignmentId)}`, {
        method:'PATCH',
        body:JSON.stringify({ action:verb }),
      }).then(result=>{
        const actionLabel = { publish:'published', archive:'archived', close:'closed', cancel:'cancelled', restore:'restored', duplicate:'duplicated', retake:'created as a new retake draft' }[verb] || 'updated';
        if(['duplicate','retake'].includes(verb)){
          coachPracticeViewFilter = 'draft';
          coachPracticePage = 1;
          practiceLifecycleTabs?.querySelectorAll('[data-practice-view]').forEach(tab=>{
            tab.classList.toggle('is-active', tab.dataset.practiceView === 'draft');
            tab.setAttribute('aria-selected', String(tab.dataset.practiceView === 'draft'));
          });
          practiceEditingAssignment = result.assignment || null;
        }
        setPracticeStatus(coachPracticeStatus, `Assignment ${actionLabel}.`, 'success');
        return loadPracticeAssignments('coach');
      }).then(()=>{
        if(practiceEditingAssignment) editPracticeAssignment(practiceEditingAssignment);
      }).catch(error=>setPracticeStatus(coachPracticeStatus, error?.message || 'Assignment could not be updated.', 'error'));
    }
  });

  function setCoachResultsStatus(message, state=''){
    if(!coachResultsStatus) return;
    coachResultsStatus.textContent = message || '';
    coachResultsStatus.className = `operation-status${state ? ` is-${state}` : ''}`;
  }

  function populateCoachResultsPlayers(teamId){
    if(!coachResultsPlayerSelect) return;
    const selected = coachResultsPlayerSelect.value;
    coachResultsPlayerSelect.innerHTML = '<option value="">All recent team activity</option>';
    const team = findTeam(teamId);
    (team?.roster || []).filter(player => player.role !== 'coach').forEach(player=>{
      const option = document.createElement('option');
      option.value = player.playerId;
      option.textContent = `#${player.number || '—'} ${player.name}`;
      coachResultsPlayerSelect.appendChild(option);
    });
    if(selected && [...coachResultsPlayerSelect.options].some(option=>option.value === selected)){
      coachResultsPlayerSelect.value = selected;
    }
  }

  function populateCoachResultsSituations(){
    if(!coachResultsSituationSelect) return;
    const selected = coachResultsSituationSelect.value;
    coachResultsSituationSelect.innerHTML = '<option value="">All situations</option>';
    (Array.isArray(SITUATIONS) ? SITUATIONS : []).forEach(situation=>{
      const option = document.createElement('option');
      option.value = String(situation.key || '');
      option.textContent = situation.title
        ? `${situation.title}`
        : String(situation.key || 'Situation');
      coachResultsSituationSelect.appendChild(option);
    });
    if(selected && [...coachResultsSituationSelect.options].some(option=>option.value === selected)){
      coachResultsSituationSelect.value = selected;
    }
  }

  function readCoachResultsFilters(){
    return {
      playerId:String(coachResultsPlayerSelect?.value || ''),
      situationKey:String(coachResultsSituationSelect?.value || ''),
      outcome:String(coachResultsOutcomeSelect?.value || ''),
      dateFrom:String(coachResultsDateFrom?.value || ''),
      dateTo:String(coachResultsDateTo?.value || ''),
    };
  }

  function coachResultsQuery(page=coachResultsPage){
    const query = new URLSearchParams({ page:String(page) });
    Object.entries(coachResultsAppliedFilters).forEach(([key,value])=>{
      if(value) query.set(key, String(value));
    });
    return query;
  }

  function renderCoachResultsSummary(summary={}){
    if(!coachResultsSummary) return;
    const formatPercent = value => Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : '—';
    const formatSeconds = value => Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}s` : '—';
    const cards = [
      ['Attempts', Number(summary.attempts || 0)],
      ['Players', Number(summary.players || 0)],
      ['Pass rate', formatPercent(summary.passRate)],
      ['Passed', Number(summary.passed || 0)],
      ['Failed', Number(summary.failed || 0)],
      ['Abandoned', Number(summary.abandoned || 0)],
      ['Average score', formatPercent(summary.averageScorePercent)],
      ['Average completion', formatSeconds(summary.averageCompletionSeconds)],
    ];
    coachResultsSummary.innerHTML = cards.map(([label,value])=>`<div class="coach-summary-card">
      <span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>
    </div>`).join('');
  }

  function resultBadge(value, state){
    if(value === '—') return '<span class="coach-review-empty">—</span>';
    return `<span class="coach-review-badge is-${state}">${escapeHtml(value)}</span>`;
  }

  function countText(value, kind){
    if(value === '—') return '<span class="coach-review-empty">—</span>';
    const [currentValue, totalValue] = String(value).split('/').map(Number);
    let state = 'warning';
    if(Number.isFinite(currentValue) && Number.isFinite(totalValue) && totalValue > 0){
      if(kind === 'tries'){
        state = currentValue <= 1 ? 'success' : currentValue >= totalValue ? 'fail' : 'warning';
      }else{
        const ratio = currentValue / totalValue;
        state = ratio >= 1 ? 'success' : ratio >= 0.5 ? 'warning' : 'fail';
      }
    }
    return `<span class="coach-review-count is-${state}">${escapeHtml(value)}</span>`;
  }

  function coachReviewValues(attempt){
    const phaseOne = attempt.phase1 || {
      ok:attempt.phase1Ok ?? (
        Number(attempt.phase) === 1
          ? Number(attempt.score) >= Number(attempt.total) && Number(attempt.total) > 0
          : null
      ),
      scoreCorrect:attempt.phase1ScoreCorrect ?? attempt.score,
      scoreTotal:attempt.phase1ScoreTotal ?? attempt.total,
      triesUsed:attempt.phase1TriesUsed ?? (Number(attempt.phase) === 1 ? attempt.triesUsed : null),
      elapsed:attempt.phase1Elapsed ?? (Number(attempt.phase) === 1 ? attempt.timeElapsed : null),
    };
    const stages = Array.isArray(attempt.sequenceStages) ? attempt.sequenceStages : [];
    const lastStage = stages[stages.length - 1] || (Number(attempt.phase) === 2 ? {
      success:attempt.sequenceSuccess ?? attempt.success,
      triesUsed:attempt.triesUsed,
      timeElapsed:attempt.timeElapsed,
      picked:attempt.picked,
    } : null);
    const sequence = Array.isArray(lastStage?.picked) ? lastStage.picked : [];
    const outcome = attempt.outcome
      || (attempt.success === true ? 'passed' : attempt.success === false ? 'failed' : null);
    return {
      dateTime: new Date(attempt.createdAt || attempt.ts).toLocaleString(),
      positionResult: outcome === 'abandoned' ? 'ABANDONED' : outcome === 'passed' ? 'PASS' : outcome === 'failed' ? 'FAIL' : '—',
      positionScore: phaseOne?.scoreCorrect != null && phaseOne?.scoreTotal != null
        ? `${phaseOne.scoreCorrect}/${phaseOne.scoreTotal}` : '—',
      positionTries: phaseOne?.triesUsed != null ? `${phaseOne.triesUsed}/${MAX_TRIES}` : '—',
      positionTime: phaseOne?.elapsed != null ? `${phaseOne.elapsed}s` : '—',
      sequenceResult: lastStage ? (lastStage.success ? 'PASS' : 'FAIL') : '—',
      sequenceTries: lastStage?.triesUsed != null ? `${lastStage.triesUsed}/${MAX_TRIES}` : '—',
      sequenceTime: lastStage?.timeElapsed != null ? `${lastStage.timeElapsed}s` : '—',
      selectedSequence: sequence.length ? sequence.join(' → ') : '—',
    };
  }

  function renderCoachResultsPage(report){
    if(!coachResultsList || !coachResultsPagination) return;
    const attempts = Array.isArray(report.attempts) ? report.attempts : [];
    const selectedPlayer = String(report?.playerId || '');
    const heading = document.getElementById('coachResultsTitle');
    const subtitle = document.getElementById('coachResultsSubtitle');
    if(heading) heading.textContent = selectedPlayer ? 'Player Results' : 'Team Activity';
    if(subtitle) subtitle.textContent = selectedPlayer
      ? 'Recent saved attempts for the selected player.'
      : 'The latest matching saved result for each player.';
    renderCoachResultsSummary(report.summary || {});
    coachResultsList.replaceChildren();
    if(!attempts.length){
      coachResultsList.innerHTML = '<div class="coach-results-empty">No saved player results were found.</div>';
    }else{
      const rows = attempts.map(attempt=>{
        const values = coachReviewValues(attempt);
        const positionState = values.positionResult === 'PASS'
          ? 'success'
          : values.positionResult === 'ABANDONED' ? 'warning' : 'fail';
        const sequenceState = values.sequenceResult === 'PASS' ? 'success' : 'fail';
        return `<tr>
          <td class="coach-review-datetime">${escapeHtml(values.dateTime)}</td>
          ${selectedPlayer ? '' : `<td><span class="coach-review-primary">#${escapeHtml(attempt.playerNumber || '—')} ${escapeHtml(attempt.playerName || '')}</span></td>`}
          <td><span class="coach-review-primary">${escapeHtml(attempt.situationTitle || 'Situation')}</span></td>
          <td>${resultBadge(values.positionResult, positionState)}</td>
          <td>${countText(values.positionScore, 'score')}</td>
          <td>${countText(values.positionTries, 'tries')}</td>
          <td>${escapeHtml(values.positionTime)}</td>
          <td>${resultBadge(values.sequenceResult, sequenceState)}</td>
          <td>${countText(values.sequenceTries, 'tries')}</td>
          <td>${escapeHtml(values.sequenceTime)}</td>
          <td class="coach-review-sequence">${escapeHtml(values.selectedSequence)}</td>
        </tr>`;
      }).join('');
      coachResultsList.innerHTML = `<div class="coach-review-table-wrap">
        <table class="coach-review-table coach-results-table">
          <thead><tr>
            <th>Date &amp; Time</th>${selectedPlayer ? '' : '<th>Player</th>'}<th>Situation</th><th>Result</th>
            <th>Score</th><th>Tries</th><th>Positioning Time</th><th>Sequence Result</th>
            <th>Seq Tries</th><th>Seq Time</th><th>Selected Sequence</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }
    coachResultsPagination.innerHTML = `
      <button class="btn btn-ghost" type="button" data-page="previous" ${report.hasPrevious ? '' : 'disabled'}>← Previous</button>
      <span>Page ${report.page} of ${report.totalPages} · ${report.total} result${report.total === 1 ? '' : 's'}</span>
      <button class="btn btn-ghost" type="button" data-page="next" ${report.hasNext ? '' : 'disabled'}>Next →</button>`;
    coachResultsPagination.querySelector('[data-page="previous"]')?.addEventListener('click', ()=>{ coachResultsPage -= 1; void loadCoachDatabaseReport(); });
    coachResultsPagination.querySelector('[data-page="next"]')?.addEventListener('click', ()=>{ coachResultsPage += 1; void loadCoachDatabaseReport(); });
  }

  async function loadCoachDatabaseReport(){
    const user = DIQ_AUTH_USER || window.__DIQ_AUTH_USER__;
    if(!user || !user.teamId || !coachResultsList) return;
    populateCoachResultsPlayers(user.teamId);
    populateCoachResultsSituations();
    setCoachResultsStatus('Loading saved team results…', 'pending');
    try{
      const query = coachResultsQuery();
      const report = await diqApiRequest(`reports/team/${encodeURIComponent(user.teamId)}?${query}`, { cache:'no-store' });
      renderCoachResultsPage(report);
      setCoachResultsStatus('');
    }catch(error){
      setCoachResultsStatus(error?.message || 'Unable to load saved team results.', 'error');
    }
  }
  window._diqLoadCoachDatabaseReport = loadCoachDatabaseReport;

  async function exportCoachDatabaseReport(){
    const user = DIQ_AUTH_USER || window.__DIQ_AUTH_USER__;
    if(!user?.teamId) return;
    setCoachResultsStatus('Preparing CSV export…', 'pending');
    try{
      const query = coachResultsQuery(1);
      query.delete('page');
      const response = await fetch(diqApiUrl(`reports/team/${encodeURIComponent(user.teamId)}/export?${query}`), {
        credentials:'same-origin',
        headers:{ Accept:'text/csv' },
      });
      if(!response.ok){
        let message = `CSV export failed (${response.status}).`;
        try{
          const body = await response.json();
          if(body?.error) message = body.error;
        }catch(_error){}
        throw new Error(message);
      }
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/i)?.[1]
        || 'diamond-defense-results.csv';
      downloadText(filename, await response.text(), 'text/csv;charset=utf-8');
      setCoachResultsStatus('CSV export downloaded.', 'success');
    }catch(error){
      setCoachResultsStatus(error?.message || 'Unable to export saved results.', 'error');
    }
  }

  function applyCoachResultsFilters(){
    const filters = readCoachResultsFilters();
    if(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo){
      setCoachResultsStatus('The From date must be before the Through date.', 'error');
      return;
    }
    coachResultsAppliedFilters = filters;
    coachResultsPage = 1;
    void loadCoachDatabaseReport();
  }

  function clearCoachResultsFilters(){
    if(coachResultsPlayerSelect) coachResultsPlayerSelect.value = '';
    if(coachResultsSituationSelect) coachResultsSituationSelect.value = '';
    if(coachResultsOutcomeSelect) coachResultsOutcomeSelect.value = '';
    if(coachResultsDateFrom) coachResultsDateFrom.value = '';
    if(coachResultsDateTo) coachResultsDateTo.value = '';
    coachResultsAppliedFilters = {};
    coachResultsPage = 1;
    void loadCoachDatabaseReport();
  }

  function setCoachWorkspaceMode(mode){
    const reviewsActive = mode === 'reviews';
    const assignmentsActive = mode === 'assignments';
    const proposalsActive = mode === 'proposals';
    document.querySelectorAll('[data-coach-tab]').forEach(button=>{
      const active = button.getAttribute('data-coach-tab') === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelector('[data-coach-view="reviews"]')?.classList.toggle('hidden', !reviewsActive);
    document.querySelector('[data-coach-view="assignments"]')?.classList.toggle('hidden', !assignmentsActive);
    document.getElementById('coachSituationEditorMount')?.classList.toggle('hidden', !proposalsActive);
    document.querySelector('.field-card')?.classList.toggle('hidden', reviewsActive || assignmentsActive);
    coachResultsWorkspace?.classList.toggle('hidden', !reviewsActive);
    practiceWorkspace?.classList.toggle('hidden', !assignmentsActive);
    if(reviewsActive){
      coachResultsPage = 1;
      void loadCoachDatabaseReport();
    }else if(assignmentsActive){
      openPracticeWorkspace('coach');
    }else{
      window._diqSituationEditorOpened?.('coach');
      window.dispatchEvent(new Event('resize'));
    }
  }
  window._diqSetCoachWorkspaceMode = setCoachWorkspaceMode;

  document.querySelectorAll('[data-coach-tab]').forEach(button=>{
    button.addEventListener('click', ()=>setCoachWorkspaceMode(button.getAttribute('data-coach-tab')));
  });
  coachResultsPlayerSelect?.addEventListener('change', ()=>{
    applyCoachResultsFilters();
  });
  document.getElementById('coachResultsRefreshBtn')?.addEventListener('click', ()=>void loadCoachDatabaseReport());
  document.getElementById('coachResultsApplyBtn')?.addEventListener('click', applyCoachResultsFilters);
  document.getElementById('coachResultsClearBtn')?.addEventListener('click', clearCoachResultsFilters);
  document.getElementById('coachResultsExportBtn')?.addEventListener('click', ()=>void exportCoachDatabaseReport());

  const coachCollapseAllBtn = document.getElementById("coachCollapseAllBtn");
  const coachExpandAllBtn = document.getElementById("coachExpandAllBtn");

  const coachRosterSelect = document.getElementById("coachRosterSelect");
  const coachPlayerName = document.getElementById("coachPlayerName");
  const coachPlayerNumber = document.getElementById("coachPlayerNumber");
  const coachPlayerPass = document.getElementById("coachPlayerPass");
  const coachGenPassBtn = document.getElementById("coachGenPassBtn");
  const coachPlayerIdPreview = document.getElementById("coachPlayerIdPreview");
  const coachPlayerAddBtn = document.getElementById("coachPlayerAddBtn");
  const coachPlayerUpdateBtn = document.getElementById("coachPlayerUpdateBtn");
  const coachPlayerRemoveBtn = document.getElementById("coachPlayerRemoveBtn");


  const teamsCsvFile = document.getElementById("teamsCsvFile");
  const teamsCsvUploadBtn = document.getElementById("teamsCsvUploadBtn");

  const teamsCsvExportBtn = document.getElementById("teamsCsvExportBtn");
function setRosterControlsEnabled(enabled){
    if(coachRosterSelect) coachRosterSelect.disabled = !enabled;
    if(coachPlayerName) coachPlayerName.disabled = !enabled;
    if(coachPlayerNumber) coachPlayerNumber.disabled = !enabled;
    if(coachPlayerPass) coachPlayerPass.disabled = !enabled;
    if(coachGenPassBtn) coachGenPassBtn.disabled = !enabled;
    if(coachPlayerAddBtn) coachPlayerAddBtn.disabled = !enabled;
    if(coachPlayerUpdateBtn) coachPlayerUpdateBtn.disabled = !enabled;
    if(coachPlayerRemoveBtn) coachPlayerRemoveBtn.disabled = !enabled;
  }

  function refreshCoachTeamSelect(){
    if(!coachTeamSelect) return;
    const prev = coachTeamSelect.value;
    coachTeamSelect.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Select team —";
    coachTeamSelect.appendChild(opt0);

    (TEAMS.teams || []).forEach(t=>{
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.displayName || t.name || t.id;
      coachTeamSelect.appendChild(o);
    });

    if(prev && findTeam(prev)) coachTeamSelect.value = prev;
  }

  function refreshCoachRosterSelect(){
    if(!coachRosterSelect) return;

    const teamId = coachTeamSelect ? coachTeamSelect.value : "";
    const t = teamId ? findTeam(teamId) : null;

    coachRosterSelect.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Select player —";
    coachRosterSelect.appendChild(opt0);

    if(!t){
      setRosterControlsEnabled(false);
      if(coachPlayerIdPreview) coachPlayerIdPreview.textContent = "";
      return;
    }

    setRosterControlsEnabled(true);

    (t.roster || []).forEach(p=>{
      const o = document.createElement("option");
      const pid = (p && p.playerId) ? String(p.playerId) : slugifyLoose(`${(t && t.id) ? t.id : teamId}-${p && p.number ? p.number : ''}-${p && p.name ? p.name : ''}`);
      o.value = pid;
      o.textContent = `${p.number ? "#"+p.number+" " : ""}${p.name}`;
      coachRosterSelect.appendChild(o);
    });

    coachRosterSelect.value = "";
    if(coachPlayerName) coachPlayerName.value = "";
    if(coachPlayerNumber) coachPlayerNumber.value = "";
    if(coachPlayerPass) coachPlayerPass.value = "";
    if(coachPlayerIdPreview) coachPlayerIdPreview.textContent = "";
  }


  function setCoachTeamFieldsFromSelection(){
    if(!coachTeamSelect) return;

    const teamId = coachTeamSelect.value;
    const t = teamId ? findTeam(teamId) : null;

    if(coachTeamName) coachTeamName.value = t ? (t.name || "") : "";
    // Only refresh roster controls if those elements exist (coach tools may omit them)
    if(coachRosterSelect) refreshCoachRosterSelect();

    refreshPlayerTeamDropdown(); // keep player UI in sync
    refreshPlayerLoginUI();
  }

  function setCoachPlayerFieldsFromSelection(){
    if(!coachTeamSelect || !coachRosterSelect) return;

    const teamId = coachTeamSelect.value;
    const playerId = coachRosterSelect.value;
    const p = (teamId && playerId) ? findPlayer(teamId, playerId) : null;

    if(coachPlayerName) coachPlayerName.value = p ? (p.name || "") : "";
    if(coachPlayerNumber) coachPlayerNumber.value = p ? (p.number || "") : "";
    if(coachPlayerPass) coachPlayerPass.value = p ? (p.password || "") : "";

    if(coachPlayerIdPreview) coachPlayerIdPreview.textContent = p ? `Player ID: ${p.playerId}` : "";
  }

  function buildPlayerIdForTeam(teamName, playerName, playerNumber, baseId){
    // Deterministic, coach-friendly ID (no random prefix): <team>-<name>-<number>
    // baseId is kept only for backward compatibility in callers (results storage uses baseId separately).
    const teamSlug = slugifyLoose(teamName) || "team";
    const nameSlug = slugifyLoose(playerName) || "player";
    const num = String(playerNumber || "").trim().replace(/\s+/g,"");
    const numSafe = num ? num.replace(/[^0-9a-zA-Z-]/g,"") : "0";
    return `${teamSlug}-${nameSlug}-${numSafe}`;
  }

  function genSimplePassword(length=12){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const size = Math.max(8, Number(length) || 12);
    const values = new Uint32Array(size);
    crypto.getRandomValues(values);
    return Array.from(values, value=>chars[value % chars.length]).join('');
  }

  function randomId(len){
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for(let i=0;i<len;i++) out += chars[Math.floor(Math.random()*chars.length)];
    return out;
  }


  function upsertTeam(name){
    const teamName = String(name || "").trim();
    if(!teamName) return null;
    const id = slugifyLoose(teamName) || "team";

    let t = findTeam(id);
    if(!t){
      t = { id, name: teamName, revision:0, active:true, roster: [] };
      TEAMS.teams.push(t);
    }else{
      t.name = teamName;
    }
    TEAMS.teams = TEAMS.teams.sort((a,b)=> (a.name||"").localeCompare(b.name||""));
    saveTeamsToLocal(t.id);
    return t;
  }

  function removeTeam(teamId){
    const team = findTeam(teamId);
    if(team && Number(team.revision) > 0){
      diqApiRequest(`admin/teams/${encodeURIComponent(teamId)}`, {
        method:'DELETE',
        headers:{ 'If-Match':String(team.revision) }
      }).catch(error=>reportDatabaseWriteError('Team archive failed', error));
    }
    TEAMS.teams = (TEAMS.teams || []).filter(t => t.id !== teamId);
  }

  function upsertPlayer(teamId, playerName, playerNumber, password){
    const t = findTeam(teamId);
    if(!t) return null;

    const name = String(playerName||"").trim();
    const number = String(playerNumber??"").trim();
    const pass = String(password||"").trim();

    if(!name || !number || !pass) return null;

    // stable baseId per player
    let existing = (t.roster || []).find(p => slugifyLoose(p.name)===slugifyLoose(name) && String(p.number)===String(number));
    if(existing){
      existing.name = name;
      existing.number = number;
      existing.password = pass;
    }
    else{
      const baseId = randomId(8);
      const playerId = buildPlayerIdForTeam(t.name, name, number, baseId);
      existing = { name, number, password: pass, baseId, playerId, role:'player', revision:0, userRevision:0, active:true };
      t.roster.push(existing);
    }

    t.roster = (t.roster || []).sort((a,b)=> (a.number||"").localeCompare(b.number||"") || (a.name||"").localeCompare(b.name||""));
    saveTeamsToLocal(teamId, existing.playerId);
    return existing;
  }

  function removePlayer(teamId, playerId){
    const t = findTeam(teamId);
    if(!t) return;
    const member = (t.roster || []).find(p=>p.playerId === playerId);
    if(member && Number(member.revision) > 0){
      diqApiRequest(`admin/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(playerId)}`, {
        method:'DELETE',
        headers:{ 'If-Match':String(member.revision) }
      }).catch(error=>reportDatabaseWriteError('Player archive failed', error));
    }
    t.roster = (t.roster || []).filter(p => p.playerId !== playerId);
  }

  function downloadText(filename, text, mime='text/plain'){
    const blob = new Blob([String(text ?? '')], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // Lightweight toast (non-blocking). Falls back to alert if DOM not ready.
  let _toastEl = null;
  let _toastTimer = null;
  function toast(msg, ms=1800){
    try{
      if(!_toastEl){
        _toastEl = document.createElement('div');
        _toastEl.id = 'diqToast';
        _toastEl.className = 'fixed left-1/2 top-4 -translate-x-1/2 z-[9999] px-4 py-2 rounded-xl border border-slate-200 bg-white shadow-lg text-sm font-semibold text-slate-800 hidden';
        document.body.appendChild(_toastEl);
      }
      _toastEl.textContent = String(msg ?? '');
      _toastEl.classList.remove('hidden');
      if(_toastTimer) clearTimeout(_toastTimer);
      _toastTimer = setTimeout(()=>{ try{ _toastEl.classList.add('hidden'); }catch(e){} }, Math.max(800, ms||0));
    }catch(e){
      // last resort
      try{ alert(String(msg ?? '')); }catch(_){}
    }
  }



  function copyTextToClipboard(text){
    return navigator.clipboard.writeText(text);
  }

  if(coachTeamSelect){
    coachTeamSelect.addEventListener("change", setCoachTeamFieldsFromSelection);
  }
  if(coachRosterSelect){
    coachRosterSelect.addEventListener("change", setCoachPlayerFieldsFromSelection);
  }

  if(coachTeamAddBtn){
    coachTeamAddBtn.addEventListener("click", ()=>{
      const t = upsertTeam(coachTeamName.value);
      refreshCoachTeamSelect();
      if(t) coachTeamSelect.value = t.id;
      setCoachTeamFieldsFromSelection();
    });
  }
  if(coachTeamUpdateBtn){
    coachTeamUpdateBtn.addEventListener("click", ()=>{
      const teamId = coachTeamSelect.value;
      if(!teamId) return alert("Select a team to update.");
      // allow rename by updating via current name (will slugify)
      // if slug changes, migrate roster
      const old = findTeam(teamId);
      if(!old) return;
      const newName = String(coachTeamName.value||"").trim();
      old.name = newName || old.name;

      TEAMS.teams = TEAMS.teams.sort((a,b)=> (a.name||"").localeCompare(b.name||""));
      saveTeamsToLocal(teamId);
      refreshCoachTeamSelect();
      coachTeamSelect.value = teamId;
      setCoachTeamFieldsFromSelection();
    });
  }
  if(coachTeamRemoveBtn){
    coachTeamRemoveBtn.addEventListener("click", ()=>{
      const teamId = coachTeamSelect.value;
      if(!teamId) return alert("Select a team to remove.");
      if(!confirm("Archive this team? Historical results will be preserved.")) return;
      removeTeam(teamId);
      refreshCoachTeamSelect();
      coachTeamSelect.value = "";
      setCoachTeamFieldsFromSelection();
    });
  }

  if(coachGenPassBtn){
    coachGenPassBtn.addEventListener("click", ()=>{
      coachPlayerPass.value = genSimplePassword();
      // update preview
      const t = findTeam(coachTeamSelect.value);
coachPlayerIdPreview.textContent = `Player ID preview: ${buildPlayerIdForTeam(t ? t.name : coachTeamName.value, coachPlayerName.value, coachPlayerNumber.value, baseId)}`;
    });
  }

  function refreshCoachPlayerIdPreview(){
    const teamId = coachTeamSelect.value;
    const t = teamId ? findTeam(teamId) : null;
    if(!t){
      coachPlayerIdPreview.textContent = "";
      return;
    }
const preview = buildPlayerIdForTeam(t.name, coachPlayerName.value, coachPlayerNumber.value, baseId);
    coachPlayerIdPreview.textContent = `Player ID preview: ${preview}`;
  }

  ["input","change"].forEach(ev=>{
    if(coachPlayerName) coachPlayerName.addEventListener(ev, refreshCoachPlayerIdPreview);
    if(coachPlayerNumber) coachPlayerNumber.addEventListener(ev, refreshCoachPlayerIdPreview);
    if(coachTeamName) coachTeamName.addEventListener(ev, ()=>{
      // if team name is being edited, preview updates, but actual ids rebuild on update
      refreshCoachPlayerIdPreview();
    });
  });

  if(coachPlayerAddBtn){
    coachPlayerAddBtn.addEventListener("click", ()=>{
      const teamId = coachTeamSelect.value;
      if(!teamId) return alert("Select a team first.");
      const pass = coachPlayerPass.value || genSimplePassword();
      coachPlayerPass.value = pass;
      const p = upsertPlayer(teamId, coachPlayerName.value, coachPlayerNumber.value, pass);
      if(!p) return alert("Enter player name, number, and password.");
      refreshCoachRosterSelect();
      coachRosterSelect.value = p.playerId;
      setCoachPlayerFieldsFromSelection();
      refreshPlayerTeamDropdown();
      refreshPlayerLoginUI();
    });
  }
  if(coachPlayerUpdateBtn){
    coachPlayerUpdateBtn.addEventListener("click", ()=>{
      const teamId = coachTeamSelect.value;
      const selectedPlayerId = coachRosterSelect.value;
      if(!teamId || !selectedPlayerId) return alert("Select a player to update.");
      const t = findTeam(teamId);
      const old = findPlayer(teamId, selectedPlayerId);
      if(!t || !old) return;

      // Update the record in-place (keep baseId)
      old.name = String(coachPlayerName.value||"").trim();
      old.number = String(coachPlayerNumber.value||"").trim();
      old.password = String(coachPlayerPass.value||"").trim();
      t.roster = (t.roster || []).sort((a,b)=> (a.number||"").localeCompare(b.number||"") || (a.name||"").localeCompare(b.name||""));
      saveTeamsToLocal(teamId, old.playerId);
      refreshCoachRosterSelect();
      coachRosterSelect.value = old.playerId;
      setCoachPlayerFieldsFromSelection();
      refreshPlayerTeamDropdown();
      refreshPlayerLoginUI();
    });
  }
  if(coachPlayerRemoveBtn){
    coachPlayerRemoveBtn.addEventListener("click", ()=>{
      const teamId = coachTeamSelect.value;
      const playerId = coachRosterSelect.value;
      if(!teamId || !playerId) return alert("Select a player to remove.");
      if(!confirm("Archive this player? Historical results will be preserved.")) return;
      removePlayer(teamId, playerId);
      refreshCoachRosterSelect();
      refreshPlayerTeamDropdown();
      refreshPlayerLoginUI();
    });
  }

  // Teams CSV upload (Excel-friendly)
  if(teamsCsvUploadBtn && teamsCsvFile){
    teamsCsvUploadBtn.addEventListener("click", ()=> teamsCsvFile.click());
    teamsCsvFile.addEventListener("change", ()=>{
      const f = teamsCsvFile.files && teamsCsvFile.files[0];
      if(!f) return;
      const name = String(f.name||'').toLowerCase();
      if(name.endsWith(".xlsx")){
        alert("Please export your Excel file as CSV first (File → Save As → CSV), then upload the CSV.");
        teamsCsvFile.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = ()=>{
        try{
          const text = String(reader.result || "");
          const parsed = parseDelimited(text);
          const res = applyTeamsRosterRows(parsed.rows, parsed.headers);
          toast(`Roster import complete. Added/updated: ${res.players}. Removed players: ${res.removedPlayers||0}. Removed teams: ${res.removedTeams||0}.`);
        }catch(e){
          alert("Could not import CSV: " + (e && e.message ? e.message : e));
        }finally{
          teamsCsvFile.value = "";
        }
      };
      reader.onerror = ()=>{
        alert("Could not read file.");
        teamsCsvFile.value = "";
      };
      reader.readAsText(f);
    });
  }
  if(teamsCsvExportBtn){
    teamsCsvExportBtn.addEventListener("click", ()=>{
      downloadTeamsCsvExport();
    });
  }


  function refreshTeamsUIAll(){
    // Coach Teams UI may be intentionally minimal/absent; guard calls accordingly
    if(coachTeamSelect){
      refreshCoachTeamSelect();
      setCoachTeamFieldsFromSelection();
    }
    refreshPlayerTeamDropdown();
    refreshPlayerLoginUI();
  }

  // --- Player login UI wiring ---
  const playerBtn = document.getElementById("playerBtn");
  const playerModalOverlay = document.getElementById("playerModalOverlay");
  const playerModalCloseX = document.getElementById("playerModalCloseX");
  const playerTeamSelect = document.getElementById("playerTeamSelect");
  const playerNameSelect = document.getElementById("playerNameSelect");
  const playerPassInput = document.getElementById("playerPass");
  const playerLoginBtn = document.getElementById("playerLoginBtn");
  const playerIdLine = document.getElementById("playerIdLine");
  const playerIdText = document.getElementById("playerIdText");
  const authRoleTabs = Array.from(document.querySelectorAll('[data-auth-role]'));
  const authRoleViews = Array.from(document.querySelectorAll('[data-auth-view]'));
  const authPlayerView = document.getElementById('authPlayerView');
  const accountSecurityOverlay = document.getElementById('accountSecurityOverlay');
  const accountSecurityClose = document.getElementById('accountSecurityClose');
  const accountSecurityIdentity = document.getElementById('accountSecurityIdentity');
  const temporaryPasswordNotice = document.getElementById('temporaryPasswordNotice');
  const accountPasswordForm = document.getElementById('accountPasswordForm');
  const accountCurrentPassword = document.getElementById('accountCurrentPassword');
  const accountNewPassword = document.getElementById('accountNewPassword');
  const accountConfirmPassword = document.getElementById('accountConfirmPassword');
  const accountChangePassword = document.getElementById('accountChangePassword');
  const accountSecurityStatus = document.getElementById('accountSecurityStatus');
  const accountLogoutAll = document.getElementById('accountLogoutAll');

  function setAuthRole(role){
    const safeRole = ['player','coach','admin'].includes(role) ? role : 'player';
    authRoleTabs.forEach(tab=>{
      const selected = tab.dataset.authRole === safeRole;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    authRoleViews.forEach(view=>{
      view.classList.toggle('hidden', view.dataset.authView !== safeRole);
    });
    const title = document.getElementById('playerModalTitle');
    if(title) title.textContent = 'Login';
    const playerPassword = document.getElementById('playerPass');
    const coachPassword = document.getElementById('pwInput');
    const adminPassword = document.getElementById('adminPwInput');
    if(safeRole === 'coach') void window._diqPrepareCoachLogin?.();
    queueMicrotask(()=>{
      const focusTarget = safeRole === 'player'
        ? (playerTeamSelect?.value ? playerPassword : playerTeamSelect)
        : safeRole === 'coach'
          ? document.getElementById('coachLoginTeamSelect')
          : adminPassword;
      focusTarget?.focus?.();
    });
    if(safeRole !== 'player' && playerPassword) playerPassword.value = '';
    if(safeRole !== 'coach' && coachPassword) coachPassword.value = '';
    if(safeRole !== 'admin' && adminPassword) adminPassword.value = '';
  }

  function getCurrentPlayerFromMeta(){
    // The server session is authoritative; PLAYER_META is an in-memory UI projection.
    const m = (PLAYER_META && typeof PLAYER_META === 'object') ? PLAYER_META : {team:"", name:"", number:""};
    const teamId = slugifyLoose(m.team || "");
    if(!teamId) return null;
    const team = findTeam(teamId);
    if(!team) return null;
    const num = String(m.number || "").trim();
    const name = String(m.name || "").trim();
    const p = (team.roster || []).find(x => String(x.number).trim()===num && slugifyLoose(x.name)===slugifyLoose(name)) || null;
    if(!p) return null;
    return { team, player: p };
  }

  function refreshPlayerTeamDropdown(){
    if(!playerTeamSelect) return;
    const prev = playerTeamSelect.value;
    playerTeamSelect.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— Select team —";
    playerTeamSelect.appendChild(o0);

    (TEAMS.teams || []).forEach(t=>{
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name || t.id;
      playerTeamSelect.appendChild(o);
    });

    if(prev && findTeam(prev)) playerTeamSelect.value = prev;
  }

  function refreshPlayerNameDropdown(){
    if(!playerNameSelect) return;
    const teamId = playerTeamSelect.value;
    const t = teamId ? findTeam(teamId) : null;

    playerNameSelect.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— Select player —";
    playerNameSelect.appendChild(o0);

    if(!t){
      playerNameSelect.disabled = true;
      return;
    }

    (t.roster || []).forEach(p=>{
      const o = document.createElement("option");
      const pid = (p && p.playerId) ? String(p.playerId) : slugifyLoose(`${(t && t.id) ? t.id : teamId}-${p && p.number ? p.number : ''}-${p && p.name ? p.name : ''}`);
      o.value = pid;
      o.textContent = `${p.number ? "#"+p.number+" " : ""}${p.name}`;
      playerNameSelect.appendChild(o);
    });

    playerNameSelect.disabled = false;
  }

  function setPlayerUIForLoggedIn(){
    const cur = getCurrentPlayerFromMeta();
    if(cur){
      const _ps = document.getElementById('playerSidebarStatus'); if(_ps) _ps.textContent = 'logged in';
      playerIdLine.style.display = "block";
      playerIdText.textContent = cur.player.playerId;

      playerLoginBtn.style.display = "none";

// set selects to match meta
      const teamId = cur.team.id;
      playerTeamSelect.value = teamId;
      refreshPlayerNameDropdown();
      playerNameSelect.value = cur.player.playerId;

    }else{
      const _ps = document.getElementById('playerSidebarStatus'); if(_ps) _ps.textContent = 'not logged in';
      playerIdLine.style.display = "none";
      playerIdText.textContent = "";

      playerLoginBtn.style.display = "inline-flex";

    }
  }

  function refreshPlayerLoginUI(){
    // Preserve current UI selections (don't clobber player pick while logged out)
    const prevTeam = playerTeamSelect && playerTeamSelect.value ? String(playerTeamSelect.value) : "";
    const prevPlayer = playerNameSelect && playerNameSelect.value ? String(playerNameSelect.value) : "";

    // Rebuild team dropdown from TEAMS
    refreshPlayerTeamDropdown();

    // Determine desired team
    const cur = getCurrentPlayerFromMeta();
    let desiredTeam = "";
    if(cur && cur.team && cur.team.id){
      desiredTeam = String(cur.team.id);
    }else if(prevTeam){
      desiredTeam = prevTeam;
    }else{
      const metaTeamId = slugifyLoose(((PLAYER_META && typeof PLAYER_META==='object') ? PLAYER_META.team : '') || "");
      if(metaTeamId && findTeam(metaTeamId)) desiredTeam = metaTeamId;
    }
    if(desiredTeam && findTeam(desiredTeam)){
      playerTeamSelect.value = desiredTeam;
    }

    // Rebuild player dropdown for chosen team
    refreshPlayerNameDropdown();

    // Determine desired player
    if(cur && cur.player && cur.player.playerId){
      playerNameSelect.value = String(cur.player.playerId);
    }else if(prevPlayer){
      const exists = Array.from(playerNameSelect.options || []).some(o => o && o.value === prevPlayer);
      if(exists) playerNameSelect.value = prevPlayer;
    }

    // Do NOT clear password here; only clear on successful login / explicit actions.
    setPlayerUIForLoggedIn();

    // keep header Player Login button state in sync (no refresh needed)
    updatePlayerHeaderButton();

  }

  let playerModalLastFocus = null;

  function mountPlayerModal(){
    const card = document.getElementById("playerSidebarCard");
    const body = authPlayerView;
    if(!card || !body || !playerModalOverlay) return;

    // Reuse the established player controls inside the modal without duplicating IDs.
    const legacyHeader = card.querySelector(".cardTitleRow");
    if(legacyHeader) legacyHeader.remove();
    while(card.firstChild){
      body.appendChild(card.firstChild);
    }
    card.remove();

    playerModalOverlay.setAttribute("role", "dialog");
    playerModalOverlay.setAttribute("aria-modal", "true");
    playerModalOverlay.setAttribute("aria-labelledby", "playerModalTitle");
    playerModalOverlay.setAttribute("aria-hidden", "true");
    playerModalOverlay.style.display = "none";
    playerModalOverlay.classList.add("hidden");

    if(playerModalCloseX){
      playerModalCloseX.addEventListener("click", closePlayerModal);
    }
    authRoleTabs.forEach(tab=>{
      tab.addEventListener('click', ()=>setAuthRole(tab.dataset.authRole || 'player'));
    });
    playerModalOverlay.addEventListener("click", event=>{
      if(event.target === playerModalOverlay) closePlayerModal();
    });
    document.addEventListener("keydown", event=>{
      if(event.key === "Escape" && !playerModalOverlay.classList.contains("hidden")){
        closePlayerModal();
      }
    });

    updatePlayerHeaderButton();
  }

function isPlayerLoggedInNow(){
  const cur = getCurrentPlayerFromMeta();
  return !!(cur && cur.player && cur.team);
}
  // expose for header button logic (avoids scoping quirks)
  window.isPlayerLoggedInNow = isPlayerLoggedInNow;

function updatePlayerHeaderButton(){
    window._diqUpdateAuthNavigation?.();
  }

  function openPlayerModal(role='player'){
    if(!playerModalOverlay) return;
    window._diqClosePlaybookBrowser?.();
    refreshPlayerLoginUI();
    setAuthRole(role);
    playerModalLastFocus = document.activeElement;
    playerModalOverlay.classList.remove("hidden");
    playerModalOverlay.style.display = "flex";
    playerModalOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("player-modal-open");
    queueMicrotask(()=>{
      const activeView = document.querySelector(`[data-auth-view="${role}"]`);
      const focusTarget = activeView?.querySelector('select:not(:disabled), input:not(:disabled), button:not(:disabled)');
      focusTarget?.focus?.();
    });
  }

  function closePlayerModal(){
    if(!playerModalOverlay) return;
    playerModalOverlay.classList.add("hidden");
    playerModalOverlay.style.display = "none";
    playerModalOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("player-modal-open");
    if(playerModalLastFocus && typeof playerModalLastFocus.focus === "function"){
      playerModalLastFocus.focus();
    }
    playerModalLastFocus = null;
  }

  function authButtonLabel(user){
    if(!user) return 'Login';
    if(user.role === 'player'){
      const number = String(user.jerseyNumber || '').trim();
      return `${number ? `#${number} ` : ''}${user.displayName}`;
    }
    if(user.role === 'coach') return user.displayName || 'Coach';
    return 'Administrator';
  }

  function authMenuMeta(user){
    if(!user) return '';
    const role = user.role === 'admin' ? 'Administrator' : user.role === 'coach' ? 'Coach' : 'Player';
    const details = [];
    if(user.role === 'player' && user.jerseyNumber) details.push(`#${user.jerseyNumber}`);
    if(user.teamName) details.push(user.teamName);
    return [role, ...details].join(' · ');
  }

  function closeAccountMenu({ returnFocus = false } = {}){
    const menu = document.getElementById('accountMenu');
    const trigger = document.getElementById('playerBtn');
    if(!menu) return;
    menu.classList.add('hidden');
    menu.setAttribute('aria-hidden', 'true');
    trigger?.setAttribute('aria-expanded', 'false');
    if(returnFocus) trigger?.focus?.();
  }

  function openAccountMenu(){
    const user = DIQ_AUTH_USER || window.__DIQ_AUTH_USER__ || null;
    const menu = document.getElementById('accountMenu');
    const trigger = document.getElementById('playerBtn');
    if(!user || !menu || !trigger) return;
    if(user.mustChangePassword){
      openAccountSecurity({ required:true });
      return;
    }
    closeAccountSecurity();
    window._diqClosePlaybookBrowser?.();
    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function toggleAccountMenu(){
    const menu = document.getElementById('accountMenu');
    if(!menu || menu.classList.contains('hidden')) openAccountMenu();
    else closeAccountMenu();
  }

  function updateAuthNavigation(){
    const user = DIQ_AUTH_USER || window.__DIQ_AUTH_USER__ || null;
    const btn = document.getElementById('playerBtn');
    const btnLabel = document.getElementById('accountMenuTriggerLabel');
    const menu = document.getElementById('accountMenu');
    const menuName = document.getElementById('accountMenuName');
    const menuMeta = document.getElementById('accountMenuMeta');
    const tools = document.getElementById('staffToolsBtn');
    const practice = document.getElementById('practiceToggle');
    const account = document.getElementById('accountSecurityBtn');
    const staff = !user?.mustChangePassword && (user?.role === 'coach' || user?.role === 'admin');
    if(btn){
      if(btnLabel) btnLabel.textContent = authButtonLabel(user);
      else btn.textContent = authButtonLabel(user);
      btn.classList.remove('btn-orange','btn-yellow','btn-green');
      btn.classList.add(user ? 'btn-green' : 'btn-orange');
      btn.dataset.authState = user ? 'logged-in' : 'logged-out';
      btn.title = user ? `Open account menu for ${user.displayName || user.role}` : 'Log in';
      btn.setAttribute('aria-haspopup', user ? 'menu' : 'dialog');
      btn.setAttribute('aria-controls', user ? 'accountMenu' : 'playerModalOverlay');
      if(!user) btn.setAttribute('aria-expanded', 'false');
    }
    if(menu && !user){
      menu.classList.add('hidden');
      menu.setAttribute('aria-hidden', 'true');
    }
    if(menuName) menuName.textContent = user?.displayName || '';
    if(menuMeta) menuMeta.textContent = authMenuMeta(user);
    if(!user) closeAccountMenu();
    if(tools){
      const fullLabel = tools.querySelector('.staff-tools-label-full');
      const shortLabel = tools.querySelector('.staff-tools-label-short');
      const fullText = user?.role === 'coach' ? 'Coach workspace' : user?.role === 'admin' ? 'Admin workspace' : 'Workspace';
      const shortText = user?.role === 'coach' ? 'Coach' : user?.role === 'admin' ? 'Admin' : 'Tools';
      if(fullLabel) fullLabel.textContent = fullText;
      if(shortLabel) shortLabel.textContent = shortText;
      tools.setAttribute('aria-label', fullText);
    }
    if(practice){
      const visible = Boolean(user?.role === 'player' && !user?.mustChangePassword);
      practice.classList.toggle('hidden', !visible);
      practice.setAttribute('aria-hidden', String(!visible));
      practice.title = visible ? 'Open your assigned practice' : '';
    }
    if(tools){
      tools.classList.toggle('hidden', !staff);
      tools.setAttribute('aria-hidden', String(!staff));
      tools.title = user?.role === 'coach' ? 'Open Coach Tools' : user?.role === 'admin' ? 'Open Admin Tools' : '';
    }
    if(account){
      account.classList.toggle('hidden', !user);
      account.setAttribute('aria-hidden', String(!user));
      account.classList.toggle('account-action-required', Boolean(user?.mustChangePassword));
      account.textContent = user?.mustChangePassword ? 'Change password' : 'Account';
    }
    window._diqApplyGameAccess?.();
    updatePracticeNavigation();
  }

  function setAccountSecurityStatus(message='', state=''){
    if(!accountSecurityStatus) return;
    accountSecurityStatus.textContent = message;
    accountSecurityStatus.className = `operation-status${state ? ` is-${state}` : ''}`;
  }

  function clearAccountPasswordFields(){
    if(accountCurrentPassword) accountCurrentPassword.value = '';
    if(accountNewPassword) accountNewPassword.value = '';
    if(accountConfirmPassword) accountConfirmPassword.value = '';
  }

  function openAccountSecurity(options={}){
    const user = DIQ_AUTH_USER || window.__DIQ_AUTH_USER__ || null;
    if(!user || !accountSecurityOverlay) return;
    const required = options.required === true || user.mustChangePassword === true;
    if(accountSecurityIdentity){
      const role = String(user.role || 'account');
      accountSecurityIdentity.textContent = `${user.displayName || user.id} · ${role.charAt(0).toUpperCase()}${role.slice(1)}`;
    }
    temporaryPasswordNotice?.classList.toggle('hidden', !required);
    document.body.classList.toggle('account-security-required', required);
    closeAccountMenu();
    document.querySelector('#coachCard:not(.hidden) #coachCardCloseBtn')?.click();
    document.querySelector('#adminCard:not(.hidden) #adminCardCloseBtn')?.click();
    document.getElementById('playbookClose')?.click();
    window._diqClosePlaybookBrowser?.();
    clearAccountPasswordFields();
    setAccountSecurityStatus();
    accountSecurityOverlay.classList.remove('hidden');
    accountSecurityOverlay.style.display = 'flex';
    accountSecurityOverlay.setAttribute('aria-hidden', 'false');
    document.getElementById('accountSecurityBtn')?.setAttribute('aria-expanded', 'true');
    queueMicrotask(()=>accountCurrentPassword?.focus());
  }

  function closeAccountSecurity(force=false){
    const user = DIQ_AUTH_USER || window.__DIQ_AUTH_USER__ || null;
    if(!force && user?.mustChangePassword) return;
    if(!accountSecurityOverlay) return;
    accountSecurityOverlay.classList.add('hidden');
    accountSecurityOverlay.style.display = 'none';
    accountSecurityOverlay.setAttribute('aria-hidden', 'true');
    document.getElementById('accountSecurityBtn')?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('account-security-required');
    clearAccountPasswordFields();
    setAccountSecurityStatus();
  }

  async function clearAuthenticatedClientState(){
    window._diqSituationEditorClosed?.('coach');
    window._diqSetEditorMode?.(null);
    window._diqSetAdminMode?.(false);
    DIQ_AUTH_USER = null;
    window.__DIQ_AUTH_USER__ = null;
    DIQ_ACTIVE_PRACTICE_ASSIGNMENT_ID = '';
    DIQ_PRACTICE_NOTICE_SIGNATURE = '';
    applyPracticeState(null);
    hidePracticeAdvance();
    PLAYER_META = { team:'', name:'', number:'' };
    PLAYER_BASE_ID = 'anonymous';
    RESULTS = emptyResults();
    closeAccountMenu();
    closePlayerModal();
    closeAccountSecurity(true);
    practiceWorkspace?.classList.add('hidden');
    document.querySelector('.field-card')?.classList.remove('hidden');
    refreshPlayerLoginUI();
    updateCoachHeaderButton();
    updateAuthNavigation();
  }

  async function logoutCurrentAccount(){
    if((DIQ_AUTH_USER || window.__DIQ_AUTH_USER__)?.role === 'player'){
      await abandonCurrentPlayAttempt('logout');
    }
    try{ await diqApiRequest('auth/logout', { method:'POST' }); }
    catch(error){ reportDatabaseWriteError('Logout failed', error); return false; }
    await clearAuthenticatedClientState();
    return true;
  }

  async function changeCurrentPassword(event){
    event?.preventDefault?.();
    const currentPassword = String(accountCurrentPassword?.value || '');
    const newPassword = String(accountNewPassword?.value || '');
    const confirmation = String(accountConfirmPassword?.value || '');
    if(!currentPassword) return setAccountSecurityStatus('Enter your current password.', 'error');
    if(newPassword.length < 8) return setAccountSecurityStatus('The new password must contain at least 8 characters.', 'error');
    if(newPassword !== confirmation) return setAccountSecurityStatus('The new passwords do not match.', 'error');
    if(accountChangePassword) accountChangePassword.disabled = true;
    setAccountSecurityStatus('Changing password…', 'pending');
    try{
      const result = await diqApiRequest('auth/password', {
        method:'PUT',
        body:JSON.stringify({ currentPassword, newPassword })
      });
      DIQ_AUTH_USER = result?.user || DIQ_AUTH_USER;
      window.__DIQ_AUTH_USER__ = DIQ_AUTH_USER;
      temporaryPasswordNotice?.classList.add('hidden');
      document.body.classList.remove('account-security-required');
      clearAccountPasswordFields();
      updateAuthNavigation();
      setAccountSecurityStatus(result?.message || 'Password changed. Other signed-in devices were logged out.', 'success');
    }catch(error){
      const message = error?.status === 401
        ? 'The current password is incorrect.'
        : error?.message || 'The password could not be changed. Try again.';
      setAccountSecurityStatus(message, 'error');
    }finally{
      if(accountChangePassword) accountChangePassword.disabled = false;
    }
  }

  async function logoutEverywhere(){
    if(accountLogoutAll) accountLogoutAll.disabled = true;
    setAccountSecurityStatus('Signing out all sessions…', 'pending');
    try{
      await diqApiRequest('auth/logout-all', { method:'POST' });
      await clearAuthenticatedClientState();
    }catch(error){
      setAccountSecurityStatus(error?.message || 'Sessions could not be signed out.', 'error');
      if(accountLogoutAll) accountLogoutAll.disabled = false;
    }
  }

  accountSecurityClose?.addEventListener('click', ()=>closeAccountSecurity());
  accountSecurityOverlay?.addEventListener('click', event=>{
    if(event.target === accountSecurityOverlay) closeAccountSecurity();
  });
  accountPasswordForm?.addEventListener('submit', changeCurrentPassword);
  accountLogoutAll?.addEventListener('click', logoutEverywhere);
  document.addEventListener('keydown', event=>{
    if(event.key === 'Escape' && !accountSecurityOverlay?.classList.contains('hidden')) closeAccountSecurity();
  });

  window._diqOpenAuthModal = openPlayerModal;
  window._diqCloseAuthModal = closePlayerModal;
  window._diqSetAuthRole = setAuthRole;
  window._diqUpdateAuthNavigation = updateAuthNavigation;
  window._diqLogoutCurrentAccount = logoutCurrentAccount;
  window._diqOpenAccountMenu = openAccountMenu;
  window._diqCloseAccountMenu = closeAccountMenu;
  window._diqOpenAccountSecurity = openAccountSecurity;
  window._diqCloseAccountSecurity = closeAccountSecurity;

  if(playerBtn) playerBtn.addEventListener("click", ()=>{
    if(DIQ_AUTH_USER || window.__DIQ_AUTH_USER__){
      toggleAccountMenu();
      return;
    }
    if(playerModalOverlay && !playerModalOverlay.classList.contains("hidden")) closePlayerModal();
    else openPlayerModal('player');
  });

  document.addEventListener('click', event=>{
    const menu = document.getElementById('accountMenu');
    const actions = document.querySelector('.account-actions');
    if(menu?.classList.contains('hidden') || actions?.contains(event.target)) return;
    closeAccountMenu();
  });

  document.addEventListener('keydown', event=>{
    const menu = document.getElementById('accountMenu');
    if(event.key === 'Escape' && menu && !menu.classList.contains('hidden')){
      event.preventDefault();
      closeAccountMenu({ returnFocus:true });
    }
  });

  if(playerTeamSelect){
    playerTeamSelect.addEventListener("change", ()=>{
      refreshPlayerNameDropdown();
    });
  }

  async function doPlayerLogin(){
    const teamId = playerTeamSelect.value;
    const playerId = playerNameSelect.value;
    const pass = String(playerPassInput.value || "").trim();

    if(!teamId) return alert("Select a team.");
    if(!playerId) return alert("Select a player.");
    const t = findTeam(teamId);
    const p = findPlayer(teamId, playerId);
    if(!t || !p) return alert("Invalid team/player selection.");
    if(!pass) return alert("Enter your password.");
    try{
      const result = await diqApiRequest('auth/login', {
        method:'POST',
        body:JSON.stringify({ role:'player', teamId, playerId, password:pass })
      });
      DIQ_AUTH_USER = result && result.user ? result.user : null;
      window.__DIQ_AUTH_USER__ = DIQ_AUTH_USER;
      DIQ_LAST_AUTH_ERROR = '';
    }catch(error){
      const message = rememberAuthenticationError('Player login failed', error);
      return alert(message);
    }

    // Keep a UI projection of the authenticated database user for this page.
    PLAYER_META = { team: t.name, name: p.name, number: p.number };
    PLAYER_BASE_ID = p.playerId;
    await loadCurrentPlayerResults();
    await refreshPlayerPracticeState({ notify:true });

    refreshPlayerLoginUI();
    updatePlayerHeaderButton();
    closePlayerModal();
    if(DIQ_AUTH_USER?.mustChangePassword) queueMicrotask(()=>openAccountSecurity({ required:true }));
  
  // Ensure dropdowns are populated once the sidebar is mounted
  try{ refreshTeamsUIAll(); }catch(_e){}
}

  async function doPlayerLogout(){
    await logoutCurrentAccount();
  }

  if(playerLoginBtn) playerLoginBtn.addEventListener("click", doPlayerLogin);
  if(playerPassInput) playerPassInput.addEventListener("keydown", event=>{
    if(event.key === "Enter") void doPlayerLogin();
  });

  mountPlayerModal();

  function emptyResults(){
    return { playerBaseId: PLAYER_BASE_ID, playerId: getPlayerId(), log: [], bySituation: {} };
  }

  async function loadCurrentPlayerResults(){
    if(!DIQ_AUTH_USER || DIQ_AUTH_USER.role !== 'player'){
      RESULTS = emptyResults();
      return;
    }
    const remote = await diqApiRequest('results/me', { cache:'no-store' });
    RESULTS = {
      playerBaseId:DIQ_AUTH_USER.id,
      playerId:remote.playerId || DIQ_AUTH_USER.id,
      log:Array.isArray(remote.log) ? remote.log : [],
      bySituation:(remote.bySituation && typeof remote.bySituation === 'object') ? remote.bySituation : {}
    };
  }

  async function loadDatabaseSession(){
    const session = await diqApiRequest('auth/session', { cache:'no-store' });
    DIQ_AUTH_USER = session && session.user ? session.user : null;
    window.__DIQ_AUTH_USER__ = DIQ_AUTH_USER;
    if(DIQ_AUTH_USER && DIQ_AUTH_USER.role === 'player'){
      const team = findTeam(DIQ_AUTH_USER.teamId);
      const player = team && (team.roster || []).find(p=>p.playerId === DIQ_AUTH_USER.id);
      if(team && player){
        PLAYER_BASE_ID = player.playerId;
        PLAYER_META = { team:team.name, name:player.name, number:player.number };
      }
      await loadCurrentPlayerResults();
      await refreshPlayerPracticeState({ notify:true });
    }else{
      PLAYER_BASE_ID = 'anonymous';
      PLAYER_META = { team:"", name:"", number:"" };
      RESULTS = emptyResults();
      applyPracticeState(null);
    }
    updateCoachHeaderButton();
    window._diqUpdateAuthNavigation?.();
    if(DIQ_AUTH_USER?.mustChangePassword) queueMicrotask(()=>openAccountSecurity({ required:true }));
  }


let RESULTS = emptyResults();

let _activePlayAttempt = null;

function newAttemptRunId(){
  try{ return crypto.randomUUID(); }
  catch(_error){ return `run-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

function copyAttemptValue(value){
  try{ return JSON.parse(JSON.stringify(value)); }
  catch(_error){ return value; }
}

function currentAttemptPositions(){
  try{
    return typeof getOnscreenStarts === 'function'
      ? copyAttemptValue(getOnscreenStarts())
      : {};
  }catch(_error){ return {}; }
}

function recordAttempt(entry, options={}){
  if(!DIQ_AUTH_USER || DIQ_AUTH_USER.role !== 'player'){
    if(typeof toast === 'function' && !options.quiet) toast('Log in before saving a result.');
    return Promise.resolve(null);
  }
  const e = Object.assign({ playerId:getPlayerId(), ts:new Date().toISOString() }, entry || {});
  RESULTS.log.push(e);

  const key = e.situationKey;
  if(key){
    const prev = RESULTS.bySituation[key] || {};
    const next = Object.assign({}, prev);
    next.key = key;
    next.title = e.situationTitle || prev.title || '';
    next.attempts = (prev.attempts || 0) + 1;
    next.lastTs = e.ts;

    const phaseOne = e.phase1 || (e.phase === 1 ? {
      scoreCorrect:e.score,
      scoreTotal:e.total,
      triesUsed:e.triesUsed,
      elapsed:e.timeElapsed,
    } : null);
    if(phaseOne && Number.isFinite(Number(phaseOne.scoreCorrect)) && Number.isFinite(Number(phaseOne.scoreTotal))){
      const best = prev.bestPhase1 || null;
      const cand = {
        score:Number(phaseOne.scoreCorrect),
        total:Number(phaseOne.scoreTotal),
        triesUsed:Number(phaseOne.triesUsed || 0),
        timeElapsed:Number(phaseOne.elapsed || 0),
        ts:e.ts,
      };
      if(!best || cand.score > best.score || (cand.score === best.score && cand.triesUsed < best.triesUsed)){
        next.bestPhase1 = cand;
      }else next.bestPhase1 = best;
    }

    const stages = Array.isArray(e.sequenceStages) ? e.sequenceStages : [];
    stages.forEach(stage=>{
      if(stage.stage !== 1 && stage.stage !== 2) return;
      next[stage.stage === 2 ? 'lastPhase2Stage2' : 'lastPhase2Stage1'] = {
        success:!!stage.success,
        triesUsed:stage.triesUsed,
        timeElapsed:stage.timeElapsed,
        picked:stage.picked || [],
        ts:e.ts,
      };
    });
    RESULTS.bySituation[key] = next;
  }

  const request = diqApiRequest('attempts', {
    method:'POST',
    body:JSON.stringify(e),
    keepalive:options.keepalive === true,
  });
  request.then(response=>{
    if(response?.practice) applyPracticeState(response.practice);
    if(e.assignmentId && response?.lifecycleStatus !== 'incomplete'){
      if(response.practiceProgressed) showPracticeAdvance(DIQ_PRACTICE_STATE, { interrupted:e.outcome === 'abandoned' });
      else{
        hidePracticeAdvance();
        if(typeof toast === 'function' && !options.quiet) toast('This practice was ended by your coach. Your result was saved, and free-play access was updated.');
      }
    }
  }).catch(()=>{});
  request.catch(error=>{
    if(!options.quiet) reportDatabaseWriteError('Attempt save failed', error);
    else console.error('[Database] Attempt save failed:', error);
  });
  return request;
}

function persistAttemptStart(active){
  const entry = {
    formatVersion:2,
    runId:active.runId,
    assignmentId:active.assignmentId,
    startedAt:active.startedAt,
    situationKey:active.situationKey,
    situationTitle:active.situationTitle,
    situationRevision:active.situationRevision,
    situationSnapshot:copyAttemptValue(active.situationSnapshot),
    initialPositions:copyAttemptValue(active.initialPositions),
    phase:1,
  };
  const request = diqApiRequest('attempts', {
    method:'POST',
    body:JSON.stringify(entry),
  });
  request.then(response=>{
    if(response?.practice) applyPracticeState(response.practice);
  }).catch(()=>{});
  request.catch(error=>reportDatabaseWriteError('Attempt start save failed', error));
  return request;
}

function beginPlayAttempt(situation){
  if(!DIQ_AUTH_USER || DIQ_AUTH_USER.role !== 'player') return null;
  if(_activePlayAttempt && !_activePlayAttempt.finalized){
    void abandonCurrentPlayAttempt('new_attempt_started');
  }
  const startedAt = new Date().toISOString();
  _activePlayAttempt = {
    formatVersion:2,
    runId:newAttemptRunId(),
    assignmentId:DIQ_ACTIVE_PRACTICE_ASSIGNMENT_ID || undefined,
    startedAt,
    situationKey:String(situation?.key || ''),
    situationTitle:String(situation?.title || ''),
    situationRevision:Number.isInteger(Number(situation?.revision)) ? Number(situation.revision) : null,
    situationSnapshot:{
      key:String(situation?.key || ''),
      title:String(situation?.title || ''),
      description:String(situation?.desc || ''),
      revision:Number.isInteger(Number(situation?.revision)) ? Number(situation.revision) : null,
      outs:situation?.outs ?? null,
      runnersOn:copyAttemptValue(situation?.runnersOn || null),
      playSeq:copyAttemptValue(situation?.playSeq || []),
      playSeq2:copyAttemptValue(situation?.playSeq2 || []),
    },
    initialPositions:currentAttemptPositions(),
    phase1Checks:[],
    sequenceChecks:[],
    sequenceStages:[],
    phase1:null,
    finalized:false,
  };
  _activePlayAttempt.startSave = persistAttemptStart(_activePlayAttempt);
  return _activePlayAttempt.runId;
}

function trackPhaseOneCheck(check){
  if(!_activePlayAttempt || _activePlayAttempt.finalized) return;
  _activePlayAttempt.phase1Checks.push({
    checkedAt:new Date().toISOString(),
    scoreCorrect:Number(check?.scoreCorrect || 0),
    scoreTotal:Number(check?.scoreTotal || POS_IDS.length),
    triesUsed:Number(check?.triesUsed || 0),
    remainingTries:Number(check?.remainingTries || 0),
    positions:currentAttemptPositions(),
  });
}

function completePhaseOneAttempt(summary, hasSequence){
  if(!_activePlayAttempt || _activePlayAttempt.finalized || !summary) return Promise.resolve(null);
  _activePlayAttempt.phase1 = {
    ok:summary.ok === true,
    scoreCorrect:Number(summary.scoreCorrect || 0),
    scoreTotal:Number(summary.scoreTotal || POS_IDS.length),
    triesUsed:Number(summary.triesUsed || 0),
    elapsed:Number.isFinite(Number(summary.elapsed)) ? Number(summary.elapsed) : null,
    completedAt:new Date().toISOString(),
  };
  if(hasSequence) return Promise.resolve(null);
  return finalizePlayAttempt(summary.ok ? 'passed' : 'failed', 'positioning_complete');
}

function trackSequenceCheck(check){
  if(!_activePlayAttempt || _activePlayAttempt.finalized) return;
  _activePlayAttempt.sequenceChecks.push({
    checkedAt:new Date().toISOString(),
    stage:Number(check?.stage || 1),
    picked:copyAttemptValue(check?.picked || []),
    expected:copyAttemptValue(check?.expected || []),
    success:check?.success === true,
    triesUsed:Number(check?.triesUsed || 0),
  });
}

function completeSequenceStage(stage){
  if(!_activePlayAttempt || _activePlayAttempt.finalized) return;
  _activePlayAttempt.sequenceStages.push({
    stage:Number(stage?.stage || 1),
    success:stage?.success === true,
    triesUsed:Number(stage?.triesUsed || 0),
    timeElapsed:Number.isFinite(Number(stage?.timeElapsed)) ? Number(stage.timeElapsed) : null,
    picked:copyAttemptValue(stage?.picked || []),
    expected:copyAttemptValue(stage?.expected || []),
    completedAt:new Date().toISOString(),
  });
}

function finalizePlayAttempt(outcome, reason='', options={}){
  const active = _activePlayAttempt;
  if(!active || active.finalized) return Promise.resolve(null);
  active.finalized = true;
  _activePlayAttempt = null;

  const completedAt = new Date().toISOString();
  const stages = copyAttemptValue(active.sequenceStages || []);
  const lastStage = stages[stages.length - 1] || null;
  const phaseOne = copyAttemptValue(active.phase1);
  const record = {
    formatVersion:2,
    runId:active.runId,
    assignmentId:active.assignmentId,
    outcome,
    abandonReason:outcome === 'abandoned' ? String(reason || 'interrupted') : null,
    startedAt:active.startedAt,
    completedAt,
    ts:completedAt,
    situationKey:active.situationKey,
    situationTitle:active.situationTitle,
    situationRevision:active.situationRevision,
    situationSnapshot:copyAttemptValue(active.situationSnapshot),
    initialPositions:copyAttemptValue(active.initialPositions),
    finalPositions:currentAttemptPositions(),
    phase:lastStage ? 2 : 1,
    stage:lastStage?.stage,
    score:phaseOne?.scoreCorrect,
    total:phaseOne?.scoreTotal,
    success:outcome === 'passed',
    triesUsed:lastStage ? lastStage.triesUsed : (phaseOne?.triesUsed || 0),
    timeElapsed:lastStage ? lastStage.timeElapsed : (phaseOne?.elapsed || 0),
    phase1:phaseOne,
    phase1Ok:phaseOne?.ok ?? null,
    phase1TriesUsed:phaseOne?.triesUsed ?? null,
    phase1Elapsed:phaseOne?.elapsed ?? null,
    phase1ScoreCorrect:phaseOne?.scoreCorrect ?? null,
    phase1ScoreTotal:phaseOne?.scoreTotal ?? null,
    phase1Checks:copyAttemptValue(active.phase1Checks || []),
    sequenceChecks:copyAttemptValue(active.sequenceChecks || []),
    sequenceStages:stages,
    sequenceSuccess:lastStage?.success ?? null,
    picked:copyAttemptValue(lastStage?.picked || []),
  };
  return recordAttempt(record, options);
}

function abandonCurrentPlayAttempt(reason='interrupted', options={}){
  return finalizePlayAttempt('abandoned', reason, options);
}

window._diqBeginPlayAttempt = beginPlayAttempt;
window._diqTrackPhaseOneCheck = trackPhaseOneCheck;
window._diqCompletePhaseOneAttempt = completePhaseOneAttempt;
window._diqTrackSequenceCheck = trackSequenceCheck;
window._diqCompleteSequenceStage = completeSequenceStage;
window._diqFinalizePlayAttempt = finalizePlayAttempt;
window._diqAbandonCurrentPlayAttempt = abandonCurrentPlayAttempt;
window.addEventListener('pagehide', ()=>{
  void abandonCurrentPlayAttempt('page_closed', { keepalive:true, quiet:true });
});
// --- end results ---

const Fcopy = o => JSON.parse(JSON.stringify(o));
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const clampInt=(v,min,max)=>{v=Math.floor(Number(v)); if(Number.isNaN(v)) v=min; return clamp(v,min,max);};
// --- Guard to ignore programmatic changes in input handlers
let _muteCoachInputs = false;
function withInputMute(fn){
  _muteCoachInputs = true;
  try { fn(); } finally { _muteCoachInputs = false; }
}

function safeSetText(el, text){ if (el) el.textContent = String(text ?? ''); }
function safeSetValue(el, val){ if (el) el.value = String(val ?? ''); }

const lerp=(a,b,t)=>a+(b-a)*t;
function quadBezier(p0,p1,p2,t){return {x:(1-t)*(1-t)*p0.x+2*(1-t)*t*p1.x+t*t*p2.x,y:(1-t)*(1-t)*p0.y+2*(1-t)*t*p1.y+t*t*p2.y};}

// --- How To Play templates + renderer ---
const HOWTO_PHASE1_HTML = `
  <ol style="margin:6px 0 0 1.2em">
    <li>Log in, then open <em>Playbook</em> to browse situations or use <em>Random</em> for a quick selection.</li>
    <li>Confirm the selected situation’s S-number and title, then review Runners and Outs in the header.</li>
    <li>Press <em>Start Situation</em> to begin.</li>
    <li>Drag the 9 player chips into the correct defensive positions.</li>
    <li>Press <em>Check Positions</em> to verify. You have 3 tries to get them correct.</li>
    <li>Select <em>Watch Solution</em> to see every fielder move from the standard alignment to the correct position.</li>
    <li>Faint tokens mark missed submitted positions. Select target rings for coaching notes, then continue when a throw sequence is included.</li>
  </ol>
  <div class="hint" style="margin-top:8px">
    Correct chips display within a highlighted target ring.
  </div>
`;

const HOWTO_PHASE2_HTML = `
  <ol style="margin:6px 0 0 1.2em">
    <li>Select <em>Continue</em> to begin the throw-sequence challenge.</li>
    <li>Select the players (chips) in the correct throw order to execute the play.</li>
    <li>Click chips to add them to your sequence; click again to unselect (unless a chip is already locked as correct).</li>
    <li>Press <em>Verify Sequence</em> to check your picks. You have 3 tries.</li>
  </ol>
  <div class="hint" style="margin-top:8px">
    Correct chips in the proper order lock and remain highlighted.
  </div>
`;

// Cache refs once
const howToDetails = document.getElementById('howToDetails');
const howToBody    = document.querySelector('#howToCard .howto-body');

function setHowToPhase(phase /* 'p1' | 'p2' */){
  if (!howToBody) return;
  // preserve open/closed state
  const wasOpen = !!(howToDetails && howToDetails.open);
  howToBody.innerHTML = (phase === 'p2') ? HOWTO_PHASE2_HTML : HOWTO_PHASE1_HTML;
  if (howToDetails && wasOpen) howToDetails.open = true;
}

function getSituationByKey(key){ return (SITUATIONS || []).find(s => s.key === key) || null; }

function setTargetNotes(sKey, id, text){
  const s = SITUATIONS.find(x => x.key === sKey); if (!s) return;
  if (!s.targets) s.targets = {};
  const prev = s.targets[id] || {};
  s.targets[id] = { ...prev, notes: String(text || '') };
  if(currentSituation && currentSituation.key === sKey && typeof queueCurrentSituationDatabaseSync === 'function') queueCurrentSituationDatabaseSync();
}

function getTargetNotes(sKey, id){
  const s = SITUATIONS.find(x => x.key === sKey);
  return s?.targets?.[id]?.notes || '';
}

// Add this helper near your other small helpers
function isPostRound(){
  // Only between Phase 1 end and Phase 2 start — not after Phase 2 has ended
  return (
    !coachUnlocked &&
    _roundHasStarted === true &&
    !phase2Active &&
    !_phase2Ended &&
    ( _allTargetsCorrect || (!gameActive && remainingTries === 0) )
  );
}

function snapChipsToTargets(){
  if (!currentSituation || !currentSituation.targets) return;
  POS_IDS.forEach(id=>{
    const t = currentSituation.targets[id];
    if (!t) return;
    const rec = tokens.get(id);
    if (!rec) return;
    rec.pos = { x: Math.round(t.x), y: Math.round(t.y) };
    placeToken(id);
  });
}

function getSeqForCurrent(){
  // Returns sanitized sequence array or empty if disabled
  const raw = (currentSituation && Array.isArray(currentSituation.playSeq))
    ? currentSituation.playSeq
    : [];
  return raw
    .map(s => String(s||'').toUpperCase().trim())
    .filter(s => POS_IDS.includes(s));
}

function getSeq2ForCurrent(){
  // Optional Stage-2 sequence
  const raw = (currentSituation && Array.isArray(currentSituation.playSeq2)) ? currentSituation.playSeq2 : [];
  return raw.map(s => String(s||'').trim()).filter(Boolean);
}

function showSeqPanel(textHTML){
  if (!seqPanel || !seqBody) return;

  // Build note (if any) from the current situation
  const note = (currentSituation && typeof currentSituation.seqNote === 'string' && currentSituation.seqNote.trim())
    ? `<div style="margin-top:10px;padding:8px;border:1px dashed #cbd5e1;border-radius:8px;background:#f8fafc">
         <div style="font-weight:800;color:#334155;margin-bottom:4px">Coach Note</div>
         <div style="white-space:pre-wrap">${currentSituation.seqNote.trim().replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}</div>
       </div>`
    : '';

  seqPanel.classList.remove('hidden');
  seqBody.innerHTML = (textHTML || '') + note;
}

function hideSeqPanel(){
  if (!seqPanel) return;
  seqPanel.classList.add('hidden');
  if (seqBody) seqBody.innerHTML = '';
}

function setChipsSelectable(on){
  tokens.forEach(({el}, id)=>{
    if (!el) return;
    if (on){
      el.classList.add('selectableChip');
      el.style.pointerEvents = 'auto';            // allow clicking chips in Phase 2
    } else {
      el.classList.remove('selectableChip','correctPulse','wrongShake');
      el.style.pointerEvents = '';                // ← remove any inline override
      // Dragging is still governed by canDrag() inside makeChipDraggable()
    }
  });
}

function phase2UpdateHud(){
  // Only show panel if Phase 2 is active AND we allow showing it
  if (!phase2Active || !allowSeqPanel){
    hideSeqPanel();
    return;
  }

  if (!seqOrder.length){
    hideSeqPanel(); // nothing to do if no sequence
    return;
  }

  const next  = seqOrder[seqIndex];
  const done  = seqIndex;
  const total = seqOrder.length;

  const path = seqOrder.map((p,i)=>
    i < done
      ? `<span style="opacity:.5;text-decoration:line-through">${p}</span>`
      : (i === done ? `<b>${p}</b>` : p)
  ).join(' → ');

  showSeqPanel(
    `<div>Step ${Math.min(done+1,total)} of ${total}: select <b>${next || '—'}</b></div>
     <div style="margin-top:6px">Sequence: ${path}</div>`
  );
}

/// @diq:begin Play Sequence Builder (Coach)
/** Ensures array is valid POS_IDS only, uppercased */
function sanitizeSeq(arr){
  return (arr || [])
    .map(s => String(s||'').toUpperCase().trim())
    .filter(s => POS_IDS.includes(s))
    .filter((id, index, sequence) => sequence.indexOf(id) === index);
}

/** Write to model + repaint builder */
function setPlaySeq(next){
  if (!currentSituation) return;
  currentSituation.playSeq = sanitizeSeq(next);
  renderSeqBuilder();
  if(typeof queueCurrentSituationDatabaseSync === 'function') queueCurrentSituationDatabaseSync();
}
window._diqSetPlaySequence = (next)=>setPlaySeq(next);
window._diqPreviewSequence = ()=>{
  const sequence = sanitizeSeq(currentSituation?.playSeq || []);
  if(sequence.length < 2) return false;
  void animateSequenceThrows(sequence);
  return true;
};





/** Clickable grid for adding steps */
function buildSeqPosGrid(){
  if (!seqPosGrid) return;
  seqPosGrid.innerHTML = '';
  POS_IDS.forEach(id=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pos-btn';
    btn.textContent = id;
    const group = (['P','C'].includes(id) ? 'Battery' : (['1B','2B','SS','3B'].includes(id) ? 'Infield' : 'Outfield'));
    btn.dataset.group = group;
    btn.disabled = sanitizeSeq(currentSituation?.playSeq || []).includes(id);
    if(btn.disabled) btn.title = `${id} is already in the sequence`;
    btn.addEventListener('click', ()=>{
      const next = (currentSituation.playSeq || []).slice();
      next.push(id);
      setPlaySeq(next);
    });
    seqPosGrid.appendChild(btn);
  });
}

/** Draggable list item (no per-item dragover/drop — handled at list level) */
function makeSeqItem(id, index){
  const li = document.createElement('div');
  li.className = 'seq-item';
  li.draggable = true;
  li.dataset.index = String(index);

  const num = document.createElement('div');
  num.className = 'seq-num';
  num.textContent = String(index + 1);

  const tag = document.createElement('div');
  tag.className = 'seq-tag';
  tag.textContent = id;

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'seq-remove';
  del.textContent = '❌';
  del.title = 'Remove this step';
  del.addEventListener('click', ()=>{
    const next = (currentSituation.playSeq || []).slice();
    next.splice(index, 1);
    setPlaySeq(next);
  });

  li.appendChild(num);
  li.appendChild(tag);
  li.appendChild(del);

  // Only start/end here; list container handles positioning
  li.addEventListener('dragstart', ()=>{
    li.classList.add('dragging');
  });
  li.addEventListener('dragend', ()=>{
    li.classList.remove('dragging');
  });

  return li;
}

/** Re-render the sequence list and count */
function renderSeqBuilder(){
  if (!seqList || !currentSituation) return;
  const seq = sanitizeSeq(currentSituation.playSeq);
  seqList.innerHTML = '';
  seq.forEach((id, i)=> seqList.appendChild(makeSeqItem(id, i)));
  if (seqCountHud) seqCountHud.textContent = String(seq.length);
  if (seqPosGrid) {
    seqPosGrid.querySelectorAll('.pos-btn').forEach((button) => {
      const used = seq.includes(String(button.textContent || '').trim());
      button.disabled = used;
      button.title = used ? `${button.textContent} is already in the sequence` : '';
    });
  }

  // Keep Phase 2 HUD in sync
  if (typeof updateHud === 'function'){
    if (phase2Active){
      updateHud();
    } else {
      updateHud(Number(scoreVal?.textContent) || 0);
    }
  }
}

/** Enable drag-reorder at the LIST level (robust across browsers) */
function wireSeqListDnDOnce(){
  if (!seqList || seqList._dndWired) return;
  seqList._dndWired = true;

  let ghost = null;

  function ensureGhost(){
    if (!ghost){
      ghost = document.createElement('div');
      ghost.className = 'seq-ghost';
    }
    return ghost;
  }

  function getAfterElement(container, y){
    const items = [...container.querySelectorAll('.seq-item:not(.dragging)')];
    let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
    for (const el of items){
      const rect = el.getBoundingClientRect();
      const offset = y - (rect.top + rect.height / 2);
      if (offset < 0 && offset > closest.offset){
        closest = { offset, element: el };
      }
    }
    return closest.element; // null means append at end
  }

  seqList.addEventListener('dragover', (e)=>{
    e.preventDefault();
    const g = ensureGhost();
    const after = getAfterElement(seqList, e.clientY);
    if (after) seqList.insertBefore(g, after);
    else seqList.appendChild(g);
  });

  seqList.addEventListener('drop', (e)=>{
    e.preventDefault();
    const dragging = seqList.querySelector('.seq-item.dragging');
    if (!dragging) return;

    // Compute new index from ghost position
    const children = [...seqList.children];
    const newIndex = children.indexOf(ghost);
    const oldIndex = Number(dragging.dataset.index);

    // Clean up early so renderSeqBuilder paints a clean list
    if (ghost && ghost.parentNode) ghost.remove();

    if (Number.isInteger(oldIndex) && newIndex >= 0 && oldIndex !== newIndex){
      const next = (currentSituation.playSeq || []).slice();
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      setPlaySeq(next); // re-renders list and renumbers
    } else {
      // No change — just re-render to refresh indices
      renderSeqBuilder();
    }
  });

  seqList.addEventListener('dragend', ()=>{
    if (ghost && ghost.parentNode) ghost.remove();
  });
}

/** Templates */
function applySeqTemplate(val){
  if (!val) return;
  const arr = String(val).split(',').map(s=>s.trim());
  setPlaySeq(arr);
}

/** Wire up builder controls once */
function wireSeqBuilderOnce(){
  if (!seqSubsec) return;
  if (seqSubsec._wired) return;
  seqSubsec._wired = true;

  buildSeqPosGrid();
  renderSeqBuilder();
  wireSeqListDnDOnce();

  if (seqTemplateSel){
    seqTemplateSel.addEventListener('change', ()=>{
      applySeqTemplate(seqTemplateSel.value);
      // reset to placeholder
      seqTemplateSel.value = '';
    });
  }
  if (seqClearBtn){
    seqClearBtn.addEventListener('click', ()=>{
      setPlaySeq([]);
    });
  }

  // Keep the existing overall note behavior
  if (seqNoteInput){
    const syncSeqNote = () => {
      if (!currentSituation) return;
      currentSituation.seqNote = String(seqNoteInput.value || '');
      if(typeof queueCurrentSituationDatabaseSync === 'function') queueCurrentSituationDatabaseSync();
    };
    seqNoteInput.addEventListener('input',  syncSeqNote);
    seqNoteInput.addEventListener('change', syncSeqNote);
  }



}

// Remove any in-progress Phase 2 sequence-throw visualization (ball + trail + RAF)
function cleanupSeqThrowViz(){
  try{ if (_seqAnimRaf){ cancelAnimationFrame(_seqAnimRaf); } }catch{}
  _seqAnimRaf = null;

  if (_seqTrail && _seqTrail.parentNode) _seqTrail.remove();
  _seqTrail = null;

  if (_seqBallEl && _seqBallEl.parentNode) _seqBallEl.remove();
  _seqBallEl = null;
}

function formatSecs(s){
  // Show mm:ss if you'd like; spec only asks for seconds, but this reads nicer.
  const m = Math.floor(s/60), sec = s%60;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

function updateTimerHud(){
  if (!timerVal || !timerBadge) return;
  // Display as seconds with an "s" OR as mm:ss — choose one line below

  // Option A: plain seconds with trailing 's' (matches your HTML shell)
  timerVal.textContent = String(_timerSecs);

  // Option B: mm:ss (then also change the HTML shell to not append 's'):
  // timerVal.textContent = formatSecs(_timerSecs);

  // Visual warning under 10s
  if (_timerSecs <= 10) timerBadge.classList.add('low');
  else timerBadge.classList.remove('low');
}

function stopTimer(){
  if (_timerId){ clearInterval(_timerId); _timerId = null; }
}

function startTimer(seconds = TIMER_START_SECS){
  stopTimer();
  _timerSecs = Math.max(0, seconds|0);
  updateTimerHud();
  _timerId = setInterval(()=>{
    _timerSecs = Math.max(0, _timerSecs - 1);
    updateTimerHud();
    if (_timerSecs === 0){
      // Time's up → behave like tries are exhausted
      if (!coachUnlocked && _roundHasStarted){
        if (phase2Active){
          try{
            // Phase 2: out of time = out of tries → show fail card + animate sequence
            phase2TriesLeft = 0;
            endPhase2(false);
          }catch{}
        } else if (gameActive){
          try{
            // Phase 1: force a final check so rings reveal and round ends
            remainingTries = 1; // makes isFinalTry true inside checkPositions()
            checkPositions();   // will decrement to 0 and run end-of-round logic
          }catch{}
        }
      }
      stopTimer();
    }
  }, 1000);
}


function resetTimer(seconds = TIMER_START_SECS){
  startTimer(seconds);
}

/** Exact match: same length and each pick equals expected in order */
function isExactSequenceMatch(picks, order){
  if (!Array.isArray(picks) || !Array.isArray(order)) return false;
  if (picks.length !== order.length) return false;
  for (let i = 0; i < order.length; i++){
    if (picks[i] !== order[i]) return false;
  }
  return true;
}

function wipePhase2StateUI(){
  // model
  phase2Active    = false;
  allowSeqPanel   = false;
  seqIndex        = 0;
  phase2TriesLeft = PHASE2_MAX_TRIES;
  phase2Picks     = [];
  phase2Locked    = new Set();

  // UI (chips)
  tokens.forEach(({el})=>{
    if (!el) return;
    el.classList.remove('seq-locked','selectableChip','correctPulse','wrongShake');
    el.style.pointerEvents = '';        // restore default clickability
    // remove any pick/index badges and attrs, regardless of variant
    clearChipPickMarker?.(el);          // uses your consolidated remover
    // belt-and-suspenders if you keep older helpers around:
    el.removeAttribute('data-pick-index');
    el.removeAttribute('data-pick-idx');
  });

  // UI (controls/panels/animations)
  hideSeqPanel?.();
  verifySeqBtn?.classList.add('hidden');
  setChipsSelectable?.(false);
  cleanupSeqThrowViz?.();               // remove seq ball + trail, if present
  hideFieldNotice?.();

  // HUD
  updateHud?.(0);
}

// NEW: count how many picks are correct in order, consecutively from the start
function getPhase2ConsecutiveCorrect(){
  if (!phase2Active || !Array.isArray(seqOrder) || !seqOrder.length) return 0;
  let i = 0;
  while (i < phase2Picks.length && i < seqOrder.length && phase2Picks[i] === seqOrder[i]) i++;
  return i; // number of correct-in-order picks from the beginning
}

// ----- Phase 2 hygiene: clear all UI + state -----
function phase2ClearAllUI(){
  // data
  phase2Picks = [];
  phase2Locked = new Set();

  // chip visuals (numbers + highlight)
  tokens.forEach(({el})=>{
    if (!el) return;
    clearChipPickMarker(el);     // remove any sequence badge/attr
    el.classList.remove('seq-locked','correctPulse','wrongShake');
  });

  // controls / panel
  if (verifySeqBtn) verifySeqBtn.classList.add('hidden');
  setChipsSelectable(false);
  hideSeqPanel();

  // state flags
  phase2Active = false;
  allowSeqPanel = false;

  // ensure HUD reflects non-phase-2 state (score visible again)
  updateHud(Number(scoreVal?.textContent) || 0);
}

// ===== Sequence marker helpers (consolidated – single source of truth) =====

/** Remove any/all visual sequence markers from one chip element. */
function clearChipPickMarker(el){
  if (!el) return;
  // Remove known attrs
  el.removeAttribute('data-pick');
  el.removeAttribute('data-pick-idx');
  el.removeAttribute('data-pick-index');
  el.removeAttribute('data-seq');
  // Remove known badge nodes
  el.querySelectorAll('.seq-badge, .seqBadge, .pick-badge, .chip-index, [data-role="seq-badge"]').forEach(n => n.remove());
}


/** Add/update a small numeric badge at top-right of chip (1-based). */
function setChipPickIndex(el, n){
  if (!el) return;
  // Start clean
  clearChipPickMarker(el);
  if (!Number.isFinite(n) || n <= 0) return;

  const badge = document.createElement('span');
  badge.className = 'seq-badge';
  badge.setAttribute('data-role', 'seq-badge');
  badge.textContent = String(n);
  Object.assign(badge.style, {
    position: 'absolute',
    right: '-6px',
    top: '-6px',
    minWidth: '16px',
    height: '16px',
    padding: '0 4px',
    borderRadius: '999px',
    fontWeight: '900',
    fontSize: '11px',
    lineHeight: '16px',
    textAlign: 'center',
    color: '#0b1321',
    background: '#f1f5f9',
    border: '1px solid rgba(0,0,0,.25)',
    boxShadow: '0 1px 2px rgba(0,0,0,.25)',
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: 2
  });

  el.appendChild(badge);
  el.setAttribute('data-pick-idx', String(n));
}



/** Full re-render: wipe all markers, then number 1..N from phase2Picks */
function rerenderPickMarkers(){
  tokens.forEach(({el}) => clearChipPickMarker(el));
  (phase2Picks || []).forEach((pid, i)=>{
    const rec = tokens.get(pid);
    if (rec?.el) setChipPickIndex(rec.el, i + 1);
  });
}



/** Clear the model & visuals of all picks. */
function clearAllPicks(){
  phase2Picks = [];
  tokens.forEach(({el})=>{
    if (!el) return;
    clearChipPickMarker(el);
    el.classList.remove('correctPulse','wrongShake');
  });
}



/// @diq:begin [Phase 2: End & Result Panels]
function endPhase2(success = true) {
  stopTimer();

  // Mark Phase 2 as finished and ensure rings/panel don't reappear
  _phase2Ended = true;
  disableTargetSelection?.();
  hideTargetPanel?.();

  // If Phase 2 was never actually started, just clear & return
  if (!phase2Active) {
    phase2Active = false;
    allowSeqPanel = false;
    hideSeqPanel?.();
    if (verifySeqBtn) verifySeqBtn.classList.add('hidden');
    setChipsSelectable?.(false);
    phase2Locked = new Set();
    phase2Picks  = [];
    tokens.forEach(({el})=>{
      if (!el) return;
      clearChipPickMarker?.(el);
      el.classList.remove('seq-locked','correctPulse','wrongShake');
      el.style.pointerEvents = '';
    });
    cleanupSeqThrowViz?.();
    return;
  }

  // Preserve each sequence stage inside the one play-attempt record.
  try{
    completeSequenceStage({
      stage: phase2Stage,
      success: !!success,
      triesUsed: (typeof phase2TriesLeft === 'number') ? (PHASE2_MAX_TRIES - phase2TriesLeft) : null,
      timeElapsed: (typeof _timerSecs === 'number') ? Math.max(0, TIMER_START_SECS - _timerSecs) : null,
      picked: Array.isArray(phase2Picks) ? phase2Picks.slice() : [],
      expected: Array.isArray(seqOrder) ? seqOrder.slice() : [],
    });
  }catch(e){}

  // If Stage 1 succeeded and this situation has a Stage 2 sequence, immediately run Stage 2
  if (success && phase2Stage === 1){
    const seq2 = getSeq2ForCurrent();
    if (Array.isArray(seq2) && seq2.length){
      phase2Stage = 2;

      // Reset Phase 2 state for Stage 2 (do NOT end Phase 2)
      seqOrder = seq2.slice();
      seqIndex = 0;
      phase2TriesLeft = PHASE2_MAX_TRIES;
      if (phase2TriesLeftEl) phase2TriesLeftEl.textContent = phase2TriesLeft;
      phase2Locked = new Set();
      phase2Picks = [];
      clearAllPicks();
      updatePhase2Hud();

      // Make sure the UI is in "sequence picking" mode
      allowSeqPanel = false;
      hideSeqPanel();
      if (continueBtn) continueBtn.classList.add('hidden');

  // Situation Builder undo/redo availability follows coach lock + current situation
  try{ sbEnsureKey(); sbUpdateButtons(); }catch(e){}
      if (verifySeqBtn) verifySeqBtn.classList.remove('hidden');

      // Keep chips clickable for the next pick
      phase2Active = true;
      setChipsSelectable(true);
      resetTimer(TIMER_START_SECS);
      startTimer();

      return;
    }
  }

  const attemptPassed = !!success && (!_phase1Summary || _phase1Summary.ok === true);
  void finalizePlayAttempt(
    attemptPassed ? 'passed' : 'failed',
    success ? 'sequence_complete' : 'sequence_failed',
  );

// Stop interaction for a real Phase 2 end
  phase2Active = false;
  phase2Stage = 1;
  setChipsSelectable(false);

  if (continueBtn) continueBtn.classList.add('hidden');
  if (verifySeqBtn) verifySeqBtn.classList.add('hidden');

  // Now allow the sequence panel to appear with result info
  allowSeqPanel = true;

  if (success) {
    showSeqSuccessPanel?.();
  } else {
    phase2TriesLeft = 0;
    showSeqFailPanel?.();
  }

  // Chips that were locked-in as correct remain highlighted & marked.
  // Everything else should not be clickable anymore.
  tokens.forEach(({el}, id)=>{
    if (!el) return;
    const locked = phase2Locked.has(id);
    if (!locked){
      clearChipPickMarker?.(el);
      el.classList.remove('seq-locked');
      el.style.pointerEvents = '';
    } else {
      el.style.pointerEvents = 'none';
    }
  });

  // === Teaching moment: animate the intended relay path ===
  if (Array.isArray(seqOrder) && seqOrder.length >= 2) {
    setTimeout(() => {
      try { animateSequenceThrows(seqOrder); } catch {}
    }, 350);
  }
}

// Treat any badge/attr as "marked"
function chipIsMarked(el){
  return !!(el && (el.hasAttribute('data-pick') || el.querySelector('.seq-badge')));
}

let _seqBallEl = null;
let _seqTrail = null;
let _seqAnimRaf = null;

/** Build (or reuse) the tiny ball used for throw animations */
function ensureSeqBall(){
  if (_seqBallEl && _seqBallEl.parentNode) return _seqBallEl;
  _seqBallEl = document.createElement('div');
  _seqBallEl.className = 'seqBall';
  wrap.appendChild(_seqBallEl);
  return _seqBallEl;
}

/** Build (or reuse) an SVG overlay to draw throw lines, with arrowhead marker */
/** Build (or reuse) an SVG overlay to draw throw lines, with a small arrowhead marker */
function ensureSeqTrail(){
  if (_seqTrail && _seqTrail.parentNode) return _seqTrail;
  _seqTrail = document.createElement('div');
  _seqTrail.className = 'throwTrail';
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS,'svg');
  svg.setAttribute('viewBox', `0 0 ${imgRect.width} ${imgRect.height}`);

  // Define a smaller arrowhead marker once (scaled by stroke width)
  const defs = document.createElementNS(svgNS, 'defs');
  const marker = document.createElementNS(svgNS, 'marker');
  marker.setAttribute('id', 'arrowHead');
  marker.setAttribute('markerUnits', 'strokeWidth'); // scale with stroke width
  marker.setAttribute('markerWidth', '4.5');         // smaller base
  marker.setAttribute('markerHeight', '4.5');
  marker.setAttribute('refX', '4.2');                // positions tip at end of path
  marker.setAttribute('refY', '2.25');
  marker.setAttribute('orient', 'auto');

  const arrowPath = document.createElementNS(svgNS, 'path');
  // small triangle; fill inherits line color via currentColor
  arrowPath.setAttribute('d', 'M0,0 L0,4.5 L4.5,2.25 z');
  arrowPath.setAttribute('fill', 'currentColor');
  arrowPath.setAttribute('stroke', 'none');
  marker.appendChild(arrowPath);

  defs.appendChild(marker);
  svg.appendChild(defs);

  _seqTrail.appendChild(svg);
  wrap.appendChild(_seqTrail);
  return _seqTrail;
}


/** Remove temporary ball + trail */
function sizeOverlays(){
  if (!wrap) return;

  // 1) Snapshot new container rect
  const r = wrap.getBoundingClientRect();
  imgRect = { width:r.width, height:r.height, left:r.left, top:r.top };

  // 2) Scale chip size + fonts and scale markers (ball/runner/hit marker)
  updateChipScale();

  // 3) Re-position all chips from native coords
  POS_IDS.forEach(id => placeToken(id));
  if(typeof positionSolutionGhosts === 'function') positionSolutionGhosts();

  // 4) Reposition + resize target rings from model
  if (currentSituation && currentSituation.targets){
    getAllRings().forEach(el => {
      const id  = el.dataset.id;
      const tgt = currentSituation.targets[id];
      if (!tgt) return;
      const css = unitToCss(tgt);
      el.style.left = css.left + 'px';
      el.style.top  = css.top  + 'px';
      const dpx = tolToCssDiameter(Number(tgt.tol) || DEFAULT_TOL, /*allowTiny*/ coachUnlocked);
      el.style.width  = dpx + 'px';
      el.style.height = dpx + 'px';
    });
  }

  // 5) Ball graphics: reset and rebuild SVG to match new viewBox
  if (animReq){ cancelAnimationFrame(animReq); animReq = null; }
  if (ballSvg) ballSvg.innerHTML = '';
  buildBallGraphics(); // also calls syncBallToHit()

  // 6) Reposition coach hit marker (if visible)
  if (hitMarker && currentSituation && currentSituation.hit){
    const css = unitToCss(currentSituation.hit);
    hitMarker.style.left = css.left + 'px';
    hitMarker.style.top  = css.top  + 'px';
  }

  // 7) Repaint static base-runner dots and snap animated runner to base
  renderBaseRunners();
  if (runnerEl && runnerEl.style.display !== 'none'){
    placeRunnerAtBase(runnerLastBase);
  }

  scaleMarkers();

  // Clear any in-progress Phase 2 throw animation after a resize/layout change
  cleanupSeqThrowViz();

  if (phase2Active && ballEl){
    ballEl.style.display = 'block';
    ballEl.style.zIndex = '10';
  }

}

/** Get CSS-space point for a position id, using target (snap) locations */
/** Get CSS-space point for a position id, using the chip’s actual DOM left/top if present. */
function getCssPointForPosId(posId){
  const rec = tokens.get(posId);
  if (rec?.el){
    const x = parseFloat(rec.el.style.left)  || 0;
    const y = parseFloat(rec.el.style.top)   || 0;
    return { x, y };
  }
  // Fallback to target location if the chip isn't built yet
  const tgt = currentSituation?.targets?.[posId];
  return tgt ? nativeToCssPoint({ x: tgt.x, y: tgt.y }) : null;
}

/** Small chip pulse for feedback */
function pulseChip(id){
  const rec = tokens.get(id);
  if (!rec?.el) return;
  rec.el.classList.add('correctPulse');
  setTimeout(()=> rec.el?.classList?.remove('correctPulse'), 260);
}

/** Animate a high-contrast strategy route from A→B and move the real ball along it. */
function animateThrowLeg(fromPt, toPt, _color, visualOffset){
  return new Promise(function(resolve){
    const trail = ensureSeqTrail();
    const svg   = trail.querySelector('svg');
    const svgNS = 'http://www.w3.org/2000/svg';

    const ROUTE_COLOR = '#59e7ff';
    const ROUTE_EDGE = '#061225';
    const LINE_WIDTH = clamp(Math.round(Math.min(imgRect.width, imgRect.height) * 0.006), 4, 7);

    function getOrMakeMarker(){
      const id = 'diamondDefenseRouteArrow';
      let m = svg.querySelector(`#${id}`);
      if (m) return m;

      let defs = svg.querySelector('defs');
      if (!defs){
        defs = document.createElementNS(svgNS, 'defs');
        svg.appendChild(defs);
      }

      m = document.createElementNS(svgNS, 'marker');
      m.setAttribute('id', id);
      m.setAttribute('markerUnits', 'userSpaceOnUse');
      m.setAttribute('markerWidth', '22');
      m.setAttribute('markerHeight', '18');
      m.setAttribute('refX', '20');
      m.setAttribute('refY', '9');
      m.setAttribute('orient', 'auto');

      const tri = document.createElementNS(svgNS, 'path');
      tri.setAttribute('d', 'M1,1 L21,9 L1,17 Z');
      tri.style.fill = ROUTE_COLOR;
      tri.style.stroke = ROUTE_EDGE;
      tri.style.strokeWidth = '2';
      m.appendChild(tri);
      defs.appendChild(m);
      return m;
    }

    const marker = getOrMakeMarker();

    // Offset duplicate legs, then trim the route so neither line nor arrowhead
    // covers the throwing or receiving player chip.
    const off = visualOffset || { x:0, y:0 };
    const rawA = { x: fromPt.x + off.x, y: fromPt.y + off.y };
    const rawB = { x: toPt.x   + off.x, y: toPt.y   + off.y };
    const dx = rawB.x - rawA.x;
    const dy = rawB.y - rawA.y;
    const routeLength = Math.hypot(dx, dy) || 1;
    const ux = dx / routeLength;
    const uy = dy / routeLength;
    const chipRadius = Math.max(11, CHIP_PX / 2);
    const startClearance = chipRadius + 5;
    const endClearance = chipRadius + 10;
    const canTrim = routeLength > startClearance + endClearance + 12;
    const A = canTrim
      ? { x: rawA.x + ux * startClearance, y: rawA.y + uy * startClearance }
      : rawA;
    const B = canTrim
      ? { x: rawB.x - ux * endClearance, y: rawB.y - uy * endClearance }
      : rawB;

    const route = `M ${A.x},${A.y} L ${B.x},${B.y}`;
    const underlay = document.createElementNS(svgNS, 'path');
    underlay.setAttribute('d', route);
    underlay.classList.add('seq-route-underlay');
    underlay.style.strokeWidth = String(LINE_WIDTH + 5);
    svg.appendChild(underlay);

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', route);
    path.setAttribute('marker-end', `url(#${marker.id})`);
    path.classList.add('seq-route-active');
    path.style.strokeWidth = String(LINE_WIDTH);
    svg.appendChild(path);

    const pathLength = Math.max(1, path.getTotalLength());
    path.style.strokeDasharray = String(pathLength);
    path.style.strokeDashoffset = String(pathLength);

    // move the actual ball
    if (ballEl){
      ballEl.style.display = 'block';
      ballEl.style.left = A.x + 'px';
      ballEl.style.top  = A.y + 'px';
      ballEl.style.zIndex = '10';
    }

    const dist = Math.hypot(B.x - A.x, B.y - A.y);
    const duration = clamp(420 + dist * 0.45, 380, 1100);

    const t0 = performance.now();
    function step(now){
      const t = clamp((now - t0) / duration, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      path.style.strokeDashoffset = String(pathLength * (1 - e));
      if (t < 1){
        if (ballEl){
          ballEl.style.left = (A.x + (B.x - A.x) * e) + 'px';
          ballEl.style.top  = (A.y + (B.y - A.y) * e) + 'px';
        }
        _seqAnimRaf = requestAnimationFrame(step);
      } else {
        if (ballEl){
          ballEl.style.left = B.x + 'px';
          ballEl.style.top  = B.y + 'px';
        }
        resolve();
      }
    }
    _seqAnimRaf = requestAnimationFrame(step);
  });
}


/** Animate throws along the provided order of POS_IDS.
 *  Uses distinct colors and offsets duplicate legs to avoid stacking. */
async function animateSequenceThrows(order){
  try{ if (_seqAnimRaf){ cancelAnimationFrame(_seqAnimRaf); } }catch{}
  _seqAnimRaf = null;

  var pts = (order || [])
    .map(function(id){ return { id:id, pt:getCssPointForPosId(id) }; })
    .filter(function(x){ return !!x.pt; });
  if (pts.length < 2) return;

  var trail = ensureSeqTrail();
  var svg = trail.querySelector('svg');
  svg.setAttribute('viewBox', '0 0 ' + imgRect.width + ' ' + imgRect.height);

  if (ballEl){
    ballEl.style.display = 'block';
    ballEl.style.zIndex = '10';
    ballEl.style.left = pts[0].pt.x + 'px';
    ballEl.style.top  = pts[0].pt.y + 'px';
  }

  var seenPairs = {}; // track duplicates

  pulseChip(pts[0].id);

  var chain = Promise.resolve();
  for (var i = 0; i < pts.length - 1; i++){
    (function(i){
      var a = pts[i];
      var b = pts[i + 1];

      // Key is undirected pair so A→B and B→A share
      var key = [a.id, b.id].sort().join('|');
      var count = seenPairs[key] || 0;
      seenPairs[key] = count + 1;

      // Compute perpendicular offset
      var dx = b.pt.x - a.pt.x;
      var dy = b.pt.y - a.pt.y;
      var len = Math.sqrt(dx*dx + dy*dy) || 1;
      var nx = -dy / len;
      var ny =  dx / len;
      var offsetPx = 8 * count; // 8px per duplicate
      var vOff = { x: nx * offsetPx, y: ny * offsetPx };

      chain = chain
        .then(function(){ pulseChip(a.id); return animateThrowLeg(a.pt, b.pt, null, vOff); })
        .then(function(){ pulseChip(b.id); return new Promise(r => setTimeout(r, 120)); });
    })(i);
  }

  chain.finally(function(){
    try{ if (_seqAnimRaf){ cancelAnimationFrame(_seqAnimRaf); } }catch{}
    _seqAnimRaf = null;
  });
}


/** Show a simple "success" message inside the Play Sequence card */
function showSeqSuccessPanel(){
  // Prefer the active order; fall back to the situation's playSeq
  const seqArr = (Array.isArray(seqOrder) && seqOrder.length)
    ? seqOrder
    : (currentSituation && Array.isArray(currentSituation.playSeq) ? currentSituation.playSeq : []);
  const seqStr = seqArr.length ? seqArr.join(' \u2192 ') : '—';

  showSeqPanel(`
    <div style="color:#16a34a;font-weight:700">✅ Correct sequence!</div>
    <div class="hint" style="margin-top:6px">Expected: <b>${seqStr}</b></div>
  `);
}


/** Show a "failure" message inside the Play Sequence card */
function showSeqFailPanel() {
  const seqStr = seqOrder.join(' → ') || '—';
  showSeqPanel(`
    <div style="color:#dc2626;font-weight:700">❌ Incorrect sequence</div>
    <div class="hint" style="margin-top:6px">Expected: <b>${seqStr}</b></div>
  `);
}

function wireOnce(){
  if (_wired) return;
  _wired = true;

  // Coach tools collapsible sections
  initCoachToolsCollapsibles();
  if(coachCollapseAllBtn) coachCollapseAllBtn.addEventListener('click', ()=> setAllCoachSubsecsCollapsed(true));
  if(coachExpandAllBtn) coachExpandAllBtn.addEventListener('click', ()=> setAllCoachSubsecsCollapsed(false));

  // --- everything from your “/* Wiring */” block goes here ---
  if (randomSitBtn) randomSitBtn.addEventListener('click', pickRandomSituation);
  if (playbookBrowserToggle) playbookBrowserToggle.addEventListener('click', openPlaybookBrowser);
  if (playbookBrowserClose) playbookBrowserClose.addEventListener('click', closePlaybookBrowser);
  if (playbookBrowserOverlay) playbookBrowserOverlay.addEventListener('click', (event)=>{
    if(event.target === playbookBrowserOverlay) closePlaybookBrowser();
  });
  [playbookSearch, playbookCategory, playbookDifficulty, playbookRunners].forEach(control=>{
    control?.addEventListener(control === playbookSearch ? 'input' : 'change', renderPlaybookBrowser);
  });
  if (playbookClearFilters) playbookClearFilters.addEventListener('click', ()=>{
    if(playbookSearch) playbookSearch.value = '';
    if(playbookCategory) playbookCategory.value = '';
    if(playbookDifficulty) playbookDifficulty.value = '';
    if(playbookRunners) playbookRunners.value = '';
    renderPlaybookBrowser();
  });
  if (playbookRandomFiltered) playbookRandomFiltered.addEventListener('click', ()=>{
    const filtered = filteredPlaybookSituations();
    if(filtered.length) choosePlaybookSituation(filtered[Math.floor(Math.random() * filtered.length)].key);
  });
  document.addEventListener('keydown', (event)=>{
    if(event.key === 'Escape' && playbookBrowserOverlay && !playbookBrowserOverlay.classList.contains('hidden')){
      closePlaybookBrowser();
      playbookBrowserToggle?.focus();
    }
  });
  if (gameLoginGateBtn) gameLoginGateBtn.addEventListener('click', ()=>window._diqOpenAuthModal?.('player'));

  if (resetBtn)  resetBtn.addEventListener('click', ()=>resetPlayers('reset'));
  if (checkBtn)  checkBtn.addEventListener('click', checkPositions);
  if (watchSolutionBtn) watchSolutionBtn.addEventListener('click', ()=>window._diqWatchSolution?.());

  if (startBtn)  startBtn.addEventListener('click', async ()=>{
    if (!currentSituation) return;
    if((DIQ_AUTH_USER || window.__DIQ_AUTH_USER__)?.role === 'player'){
      try{ await refreshPlayerPracticeState(); }
      catch(error){
        if(typeof toast === 'function') toast(error?.message || 'Practice status could not be verified. Try again.');
        return;
      }
    }
    if(typeof canPlayCurrentSituation === 'function' && !canPlayCurrentSituation()){
      if(typeof playerHasPendingPractice === 'function' && playerHasPendingPractice()){
        openPracticeWorkspace('player');
      }
      return;
    }

    startBtn.disabled = true;
    const attemptRunId = beginPlayAttempt(currentSituation);
    const attemptStartSave = _activePlayAttempt?.runId === attemptRunId
      ? _activePlayAttempt.startSave
      : null;
    if(attemptStartSave){
      try{
        await attemptStartSave;
      }catch(_error){
        if(_activePlayAttempt?.runId === attemptRunId){
          _activePlayAttempt.finalized = true;
          _activePlayAttempt = null;
        }
        await refreshPlayerPracticeState().catch(()=>null);
        startBtn.disabled = typeof canPlayCurrentSituation === 'function'
          ? !canPlayCurrentSituation()
          : false;
        return;
      }
    }
    _roundHasStarted = true;
    _phase2Ended = false;
    allowSeqPanel = false;

    // --- Set game state up front ---
    gameActive = true;
    resetTimer(TIMER_START_SECS);
    _phase1Summary = null;
    remainingTries = MAX_TRIES;
    updateHud(0);
    _allTargetsCorrect = false;

    wipePhase2StateUI();
    window._diqClearSolutionReview?.();
    if (continueBtn) continueBtn.classList.add('hidden');

    // --- Reset round UI ---
    disableTargetSelection();
    hideTargetPanel();
    if (!coachUnlocked) getAllRings().forEach(el=> el.style.display='none');
    startBtn.disabled = true;
    if (resetBtn) resetBtn.disabled = typeof playerHasPendingPractice === 'function' && playerHasPendingPractice();
    if (checkBtn) checkBtn.disabled = false;
    if (checkBtn){ checkBtn.classList.remove('hidden'); }
    setChipsLocked(false);
    syncBallToHit();

    // --- Animate hit + runners ---
    const ht = (currentSituation.hitType) || (hitTypeSel && hitTypeSel.value) || 'line';
    animateHit(ht);

    const advFromSit = (typeof currentSituation.batterAdvance === 'number') ? currentSituation.batterAdvance : null;
    const advFromUI  = advanceSel ? clampInt(advanceSel.value,0,4) : null;
    const advance    = (advFromSit ?? advFromUI ?? mapHitTypeToAdvance(ht));

    liveRunners = normalizeRunnersOn(currentSituation.runnersOn);

    let existingDone = false, batterDone = false;
    let finalExisting = null;
    let batterDest = null;

    animateExistingRunnersAdvance(advance, (finalState)=>{
      finalExisting = finalState;
      existingDone = true;
      maybeFinish();
   });

    animateBatterAdvance(advance, (destBase)=>{
      batterDest = destBase;
      batterDone = true;
      maybeFinish();
    });

    function maybeFinish(){
      if (!existingDone || !batterDone) return;
      liveRunners = normalizeRunnersOn(finalExisting || liveRunners);

      if (batterDest === 'first')        liveRunners.first  = true;
      else if (batterDest === 'second')  liveRunners.second = true;
      else if (batterDest === 'third')   liveRunners.third  = true;

      renderBaseRunners();
      updateRunnersHudFromLive();
    }
  });

  // --- Create a Verify Sequence button in the header row (once) ---
  const actionsRow = document.querySelector('.game-controls') || document.querySelector('.header-actions');
  if (!verifySeqBtn){
    verifySeqBtn = document.getElementById('verifySeqBtn');
    if (!verifySeqBtn){
      verifySeqBtn = document.createElement('button');
      verifySeqBtn.id = 'verifySeqBtn';
      verifySeqBtn.className = 'btn-green hidden';
      verifySeqBtn.textContent = 'Verify Sequence';
      if (actionsRow) actionsRow.appendChild(verifySeqBtn);
    }
  }

// ===== Small helpers (add once anywhere in <script>) =====
function getCorrectPrefixLen(picks, order){
  const n = Math.min(picks.length, order.length);
  let k = 0;
  for (; k < n; k++){
    if (picks[k] !== order[k]) break;
  }
  return k; // number of leading chips correct & in order
}

// Replace the old lockCorrectPrefix with this:
function lockCorrectPrefix(k){
  // Never reduce already-locked count
  const prev = phase2Locked.size || 0;
  const want = Math.max(prev, Math.max(0, Math.min(k, seqOrder.length)));

  const lockIds = seqOrder.slice(0, want);       // ← lock by the expected order only
  phase2Locked = new Set(lockIds);

  // Update visuals for ALL chips
  tokens.forEach(({el}, id)=>{
    if (!el) return;
    const locked = phase2Locked.has(id);
    clearChipPickMarker(el);
    el.classList.remove('seq-locked','correctPulse','wrongShake');

    if (locked){
      setChipPickIndex(el, lockIds.indexOf(id) + 1);
      el.classList.add('seq-locked');
      el.classList.remove('selectableChip');
      el.style.pointerEvents = 'none';
    } else {
      el.style.pointerEvents = ''; // keep them clickable
    }
  });

  // Keep the model picks trimmed to the locked prefix (helps re-numbering)
  phase2Picks = lockIds.slice();
  rerenderPickMarkers();

wireSeqBuilderOnce();
}

  // --- Verify Sequence (Phase 2) ---
  verifySeqBtn.addEventListener('click', ()=>{
    if (!phase2Active || !seqOrder.length) return;

    const tooMany  = phase2Picks.length > seqOrder.length;
    const kAttempt = getCorrectPrefixLen(phase2Picks, seqOrder); // how many from the start were correct
    const kPrev    = phase2Locked.size || 0;

    // ✅ Always lock the longest correct prefix (never regress),
    // even if the player over-selected chips this attempt.
    const newK = Math.max(kPrev, kAttempt);
    lockCorrectPrefix(newK);

    // Visual feedback for any extra, unnecessary picks
    if (tooMany){
      phase2Picks.slice(seqOrder.length).forEach(id=>{
        const el = tokens.get(id)?.el;
        if (el){
          el.classList.add('wrongShake');
          setTimeout(()=> el.classList.remove('wrongShake'), 220);
        }
      });
    }

    // Success requires exact match: same length AND same ordered picks.
    const exact = !tooMany && isExactSequenceMatch(phase2Picks, seqOrder);
    trackSequenceCheck({
      stage:phase2Stage,
      picked:phase2Picks.slice(),
      expected:seqOrder.slice(),
      success:exact,
      triesUsed:Math.min(PHASE2_MAX_TRIES, PHASE2_MAX_TRIES - phase2TriesLeft + (exact ? 0 : 1)),
    });
    if (exact){
      endPhase2(true);
      return;
    }

    // Not exact → consume a try (keep the panel hidden during attempts)
    phase2TriesLeft = Math.max(0, phase2TriesLeft - 1);
    updateHud();
    hideSeqPanel();

    if (phase2TriesLeft === 0){
      endPhase2(false);
    }
  });

  // --- CONTINUE button: start Phase 2, snap chips, hide rings/target panel, hide Check Positions ---
  if (continueBtn) continueBtn.addEventListener('click', ()=>{
    if (!isPostRound()) return;
    _phase2Ended = false;
    hideFieldNotice?.();
    window._diqClearSolutionReview?.();

    phase2Locked = new Set();
    phase2Picks  = [];
    tokens.forEach(({el})=>{
      if (!el) return;
      clearChipPickMarker(el);
      el.classList.remove('seq-locked','correctPulse','wrongShake','selectableChip');
      el.style.pointerEvents = '';
    });

    const seq = getSeqForCurrent();
    if (!seq.length){
      // No play sequence configured → never run Phase 2; hide the button and panel
      continueBtn.classList.add('hidden');
      hideSeqPanel();
      return;
    }

    // Phase 2 setup
    hideTargetPanel();             // hide Selected Target card immediately
    disableTargetSelection();      // stop ring selection in post-round view
    allowSeqPanel = false;         // keep the Play Sequence card hidden during attempts

    // Move chips to their correct targets, then hide the rings (non-coach)
    snapChipsToTargets();
    if (!coachUnlocked) getAllRings().forEach(el => el.style.display = 'none');

    // Hide "Check Positions" during Phase 2
    if (checkBtn){
      checkBtn.classList.add('hidden');
      checkBtn.disabled = true;
    }

    // Start Phase 2 state
  phase2Stage = 1;
    seqOrder = seq;
    seqIndex = 0; // not used in the new "pick then verify" flow, kept for compatibility
    phase2TriesLeft = PHASE2_MAX_TRIES;
    clearAllPicks();     // start fresh
    updateHud();         // show 0/<seq length> in the score HUD
    phase2Active = true;
    resetTimer(TIMER_START_SECS);

    // Always keep the regular ball visible in Phase 2
    if (ballEl){
      ballEl.style.display = 'block';
      ballEl.style.zIndex = '10';
    }

    setChipsSelectable(true);
    updateHud();

    // Show Verify button; keep Play Sequence panel hidden until success/exhaustion
    verifySeqBtn.classList.remove('hidden');
    hideSeqPanel();

    continueBtn.classList.add('hidden');
  });

  if (seqInput){
    const syncSeq = () => {
      if (!currentSituation) return;
      currentSituation.playSeq = String(seqInput.value || '')
        .split(',')
        .map(s => s.toUpperCase().trim())
        .filter(s => POS_IDS.includes(s));
      if(typeof queueCurrentSituationDatabaseSync === 'function') queueCurrentSituationDatabaseSync();
    };
    seqInput.addEventListener('input',  syncSeq);
    seqInput.addEventListener('change', syncSeq);
  }

  if (seqNoteInput){
    const syncSeqNote = () => {
      if (!currentSituation) return;
      currentSituation.seqNote = String(seqNoteInput.value || '');
      if(typeof queueCurrentSituationDatabaseSync === 'function') queueCurrentSituationDatabaseSync();
    };
    seqNoteInput.addEventListener('input',  syncSeqNote);
    seqNoteInput.addEventListener('change', syncSeqNote);
  }

  if (coachBtn) coachBtn.addEventListener('click', ()=>{
    closeGuideRail?.();
    const toolsMenu = coachBtn.closest('details');
    if (toolsMenu) toolsMenu.open = false;
    // Always reset the situation when the Coach Tools button is clicked
    resetPlayers();

    if (coachUnlocked){
      window._diqSituationEditorClosed?.('coach');
      document.querySelector('.field-card')?.classList.remove('hidden');
      coachResultsWorkspace?.classList.add('hidden');
      practiceWorkspace?.classList.add('hidden');
      setCoachMode(false);
      coachCard.classList.add('hidden');
      setChipsLocked(!gameActive||remainingTries===0);
      getAllRings().forEach(el=>el.style.display='none');
      syncBallToHit();
    } else if(window.__DIQ_AUTH_USER__?.role === 'coach'){
      setCoachMode(true, { role:'coach' });
      setCoachWorkspaceMode('reviews');
    } else {
      openPwModal();
    }
  });


  // Close button on Coach Tools card (does not reset situation)
  const coachCardCloseBtn = document.getElementById('coachCardCloseBtn');
  if (coachCardCloseBtn) coachCardCloseBtn.addEventListener('click', ()=>{
    if (coachUnlocked){
      window._diqSituationEditorClosed?.('coach');
      document.querySelector('.field-card')?.classList.remove('hidden');
      coachResultsWorkspace?.classList.add('hidden');
      practiceWorkspace?.classList.add('hidden');
      setCoachMode(false);
      if (coachCard) coachCard.classList.add('hidden');
      setChipsLocked(!gameActive||remainingTries===0);
      getAllRings().forEach(el=>el.style.display='none');
      syncBallToHit();
    } else {
      if (coachCard) coachCard.classList.add('hidden');
    }
  });

  const coachLogoutBtn = document.getElementById('coachLogoutBtn');
  if(coachLogoutBtn) coachLogoutBtn.addEventListener('click', async ()=>{
    window._diqSituationEditorClosed?.('coach');
    document.querySelector('.field-card')?.classList.remove('hidden');
    coachResultsWorkspace?.classList.add('hidden');
    practiceWorkspace?.classList.add('hidden');
    setCoachMode(false);
    await window._diqLogoutCurrentAccount?.();
  });


  // --- Admin button / modal (separate password) ---
  const adminBtn = document.getElementById('adminBtn');
  const adminCard = document.getElementById('adminCard');
  const adminStatus = document.getElementById('adminStatus');

  const adminPwModal = document.getElementById('adminPwModal');
  const adminPwInput = document.getElementById('adminPwInput');
  const adminPwOk = document.getElementById('adminPwOk');
  const adminPwCancel = document.getElementById('adminPwCancel');
  const adminPwMsg = document.getElementById('adminPwMsg');

  let adminUnlocked = false;

  function openAdminPwModal(){
    if (!adminPwModal) return;
    adminPwMsg.textContent = '';
    adminPwInput.value = '';
    window._diqOpenAuthModal?.('admin');
    setTimeout(()=>adminPwInput.focus(), 0);
  }
  function closeAdminPwModal(){
    window._diqCloseAuthModal?.();
  }
  function setAdminMode(on){
    adminUnlocked = !!on;
    if (adminUnlocked){
      closeGuideRail?.();
      if (typeof setCoachMode === 'function' && coachUnlocked) setCoachMode(false);
    }
    if (adminCard) adminCard.classList.toggle('hidden', !adminUnlocked);
    if (adminStatus) adminStatus.textContent = adminUnlocked ? 'unlocked' : 'locked';
    if(adminUnlocked) void window._diqAdminPanelOpened?.();
    else window._diqAdminPanelClosed?.();
  }
  window._diqSetAdminMode = setAdminMode;
  async function tryUnlockAdmin(){
    if (!adminPwInput) return;
    const valid = await authenticateStaff('admin', adminPwInput.value);
    if (valid === null){
      adminPwMsg.textContent = window._diqLastAuthenticationError?.() || 'Login service is temporarily unavailable. Please try again.';
      return;
    }
    if (valid){
      closeAdminPwModal();
      window._diqUpdateAuthNavigation?.();
    } else {
      adminPwMsg.textContent = window._diqLastAuthenticationError?.() || 'The selected account or password is incorrect.';
    }
  }

  if (adminPwCancel) adminPwCancel.addEventListener('click', closeAdminPwModal);
  if (adminPwOk) adminPwOk.addEventListener('click', ()=>{ void tryUnlockAdmin(); });
  if (adminPwInput) adminPwInput.addEventListener('keydown', e=>{ if(e.key==='Enter') void tryUnlockAdmin(); });

  if (adminBtn) adminBtn.addEventListener('click', ()=>{
    closeGuideRail?.();
    if (adminUnlocked){
      setAdminMode(false);
      if (adminCard) adminCard.classList.add('hidden');
    } else if(window.__DIQ_AUTH_USER__?.role === 'admin'){
      setAdminMode(true);
    } else {
      openAdminPwModal();
    }
  });

  // Close button on Admin Tools card
  const adminCardCloseBtn = document.getElementById('adminCardCloseBtn');
  if (adminCardCloseBtn) adminCardCloseBtn.addEventListener('click', ()=>{
    if (adminUnlocked){
      setAdminMode(false);
      if (adminCard) adminCard.classList.add('hidden');
    } else {
      if (adminCard) adminCard.classList.add('hidden');
    }
  });


  // When the target dropdown changes, sync tolerance + notes
  if (tolTargetSel) {
    tolTargetSel.addEventListener('change', () => {
      syncTolInputsFromModel(tolTargetSel.value);      // existing
      syncTolNotesFromModel(tolTargetSel.value);       // NEW
    });
  }

  // Notes typing -> save to model and re-render if same target is displayed
  if (tolNotes) {
    tolNotes.addEventListener('input', () => {
      if (!currentSituation || _muteCoachInputs) return;
      const id = tolTargetSel?.value || POS_IDS[0];
      setTargetNotes(currentSituation.key, id, tolNotes.value);
      if (_currentSelectedTargetId === id) renderTargetPanel(id);
    });
  }

  if (pwCancel) pwCancel.addEventListener('click', closePwModal);
  if (pwOk)     pwOk.addEventListener('click', tryUnlock);
  if (pwInput)  pwInput.addEventListener('keydown', e=>{ if(e.key==='Enter') tryUnlock(); });

  if (hitTypeSel)  hitTypeSel.addEventListener('change', ()=>{
    if (!currentSituation) return;
    currentSituation.hitType = hitTypeSel.value || 'line';
    if (currentSituation.batterAdvance == null) advanceSel.value = String(mapHitTypeToAdvance(currentSituation.hitType));
  });
  if (advanceSel)  advanceSel.addEventListener('change', ()=>{ if(currentSituation) currentSituation.batterAdvance=clampInt(advanceSel.value,0,4); });
  if (testHitBtn)  testHitBtn.addEventListener('click', ()=> animateHit());

  if (run1B) run1B.addEventListener('change', ()=> setRunnersOn(null, {quiet:false}));
  if (run2B) run2B.addEventListener('change', ()=> setRunnersOn(null, {quiet:false}));
  if (run3B) run3B.addEventListener('change', ()=> setRunnersOn(null, {quiet:false}));

  if (tolNum)        tolNum.addEventListener('input',   () => setTolLive(tolTargetSel.value, tolNum.value));
  if (tolRange)      tolRange.addEventListener('input', () => setTolLive(tolTargetSel.value, tolRange.value));

  if (newSituationBtn)  newSituationBtn.addEventListener('click', addNewSituation);
  if (saveSituationBtn) saveSituationBtn.addEventListener('click', ()=>{
    // Refresh = re-apply the currently selected situation to the field/UI (no saving).
    if (!currentSituation) return;
    const k = currentSituation.key;
    restoreSituationFromOrig(k);
    setSituation(k);
    if (situationMsg){
      situationMsg.textContent='Situation refreshed.';
      setTimeout(()=> situationMsg.textContent='', 1400);
    }
  });
  if (deleteSituationBtn && typeof deleteCurrentSituation === 'function') deleteSituationBtn.addEventListener('click', deleteCurrentSituation);
  if (resetStartsBtn)   resetStartsBtn.addEventListener('click', resetStartsToDefaults);

  if (sbUndoBtn) sbUndoBtn.addEventListener('click', sbUndo);
  if (sbRedoBtn) sbRedoBtn.addEventListener('click', sbRedo);

  // Snapshot/commit history for tolerance + notes edits (avoid one entry per keystroke)
  const sbCommitTol = ()=>{ if(_sbTolStartSnap){ sbPushUndo(_sbTolStartSnap); _sbTolStartSnap=null; } };
  const sbCommitNotes = ()=>{ if(_sbNotesStartSnap){ sbPushUndo(_sbNotesStartSnap); _sbNotesStartSnap=null; } };

  if (tolNum){
    tolNum.addEventListener('focus', ()=>{ if(coachUnlocked) _sbTolStartSnap = sbSnapshot(); });
    tolNum.addEventListener('change', sbCommitTol);
    tolNum.addEventListener('blur', sbCommitTol);
  }
  if (tolRange){
    tolRange.addEventListener('pointerdown', ()=>{ if(coachUnlocked) _sbTolStartSnap = sbSnapshot(); });
    tolRange.addEventListener('pointerup', sbCommitTol);
    tolRange.addEventListener('change', sbCommitTol);
    tolRange.addEventListener('blur', sbCommitTol);
  }
  if (tolNotes){
    tolNotes.addEventListener('focus', ()=>{ if(coachUnlocked) _sbNotesStartSnap = sbSnapshot(); });
    tolNotes.addEventListener('change', sbCommitNotes);
    tolNotes.addEventListener('blur', sbCommitNotes);
  }

  if (outsSelSituation) outsSelSituation.addEventListener('change', e=> setOuts(e.target.value, {quiet:false}));

  if (newTitleInput) {
    newTitleInput.addEventListener('input', () => {
      if (_muteCoachInputs || !currentSituation) return;
      currentSituation.title = newTitleInput.value.trim();
      updateCurrentOptionLabel();
      if(typeof queueCurrentSituationDatabaseSync === 'function') queueCurrentSituationDatabaseSync();
    });
  }

  if (newDescInput) {
    newDescInput.addEventListener('input', () => {
      if (_muteCoachInputs || !currentSituation) return;
      currentSituation.desc = newDescInput.value;
      if (typeof updateDescriptionHudText === 'function') updateDescriptionHudText();
      if(typeof queueCurrentSituationDatabaseSync === 'function') queueCurrentSituationDatabaseSync();
    });
  }

  if (situationCategoryInput) {
    situationCategoryInput.addEventListener('input', () => {
      if (_muteCoachInputs || !currentSituation) return;
      currentSituation.category = situationCategoryInput.value.trim();
      queueCurrentSituationDatabaseSync();
    });
  }

  if (situationDifficultySelect) {
    situationDifficultySelect.addEventListener('change', () => {
      if (_muteCoachInputs || !currentSituation) return;
      currentSituation.difficulty = situationDifficultySelect.value;
      queueCurrentSituationDatabaseSync();
    });
  }

      // Results export buttons (avoid relying on id->window globals)
  const copyResultsBtn = document.getElementById('copyResultsBtn');
  const downloadResultsBtn = document.getElementById('downloadResultsBtn');
  const copyResultsTopBtn = document.getElementById('copyResultsTopBtn'); // optional

  if (copyResultsBtn)      copyResultsBtn.addEventListener('click', async ()=>{ try{ await copyResults(); }catch{} });
  if (downloadResultsBtn)  downloadResultsBtn.addEventListener('click', ()=>{ downloadResults(); });
  if (copyResultsTopBtn)   copyResultsTopBtn.addEventListener('click', async ()=>{ try{ await copyResults(); }catch{} });

  wireSeqBuilderOnce();
}
