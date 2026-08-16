/// @diq:begin [A0] Constants & pure helpers
// Passwords (edit here)
// Note: Coach Tools password is also used to unlock chip/target editing.
// Keep these near the top for easy updates.
// Database API bridge. D1/SQLite is the runtime source of truth.
let DIQ_API_AVAILABLE = false;
let DIQ_AUTH_USER = null;
let _diqTeamSyncTimer = null;
let _diqSituationSyncTimer = null;
let _diqSituationSaveQueue = Promise.resolve();
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

async function authenticateStaff(role, password){
  try{
    const result = await diqApiRequest('auth/login', {
      method:'POST',
      body:JSON.stringify({ role, password })
    });
    DIQ_AUTH_USER = result && result.user ? result.user : null;
    window.__DIQ_AUTH_USER__ = DIQ_AUTH_USER;
    return !!(DIQ_AUTH_USER && DIQ_AUTH_USER.role === role);
  }catch(error){
    if(error && error.status === 401) return false;
    reportDatabaseWriteError('Staff login failed', error);
    return false;
  }
}

function queueTeamsDatabaseSync(){
  clearTimeout(_diqTeamSyncTimer);
  _diqTeamSyncTimer = setTimeout(async ()=>{
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
          body:JSON.stringify({ id:team.id, name:team.name, coachEmail:team.coachEmail || '' })
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
    }catch(error){ reportDatabaseWriteError('Team save failed', error); }
  }, 450);
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

// Patch map (JS):
// [A0] Boot / globals
// [A1] Utilities + storage
// [A2] Marker scaling + layout
// [A3] Situation model + selection
// [A4] Targets + tolerance + notes
// [A5] Export / import (situations, results, teams)
// [A6] Player login + results sharing
// [A7] Coach tools + teams/roster editor + results viewer
// Keep begin/end markers intact for patching.
/** @typedef {{ x:number, y:number }} Pt */
/** @typedef {{ [posId:string]: Pt }} Starts */
/** @typedef {{ [posId:string]: {x:number,y:number,tol:number} }} Targets */
/** @typedef {{ first:boolean, second:boolean, third:boolean }} RunnersOn */
/** @typedef {{
 *   key:string, title:string, desc:string,
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
    const coachEmail = String((t && (t.coachEmail || t.coachesEmail || t.coach_email || t.email)) || '').trim();

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
      coachEmail,
      revision:Number(t && t.revision) || 0,
      active:!t || t.active !== false,
      roster:roster.map(p => ({ ...p, playerId:computeRosterPlayerId({id, name}, p) }))
    });
  });

  return out;
}

function computeRosterPlayerId(teamObj, playerObj){
  // Deterministic, stable ID for roster entries (teams.json schema has no ids).
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
  // [TEAMS] team_name,coach_email,remove
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

      const coachEmail = String(get(r, th, 'coach_email', ['coach email','email','coachemail'])).trim();
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
        upsertTeam(teamName, coachEmail || '');
        out.teams++;
      }else{
        // Do NOT clear coach email when blank (requirement)
        if(coachEmail) existing.coachEmail = coachEmail;
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
        t = upsertTeam(teamName, '');
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

      const coachEmail = String(get(r,'Coach Email',['CoachEmail','Email'])).trim();
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
        t = upsertTeam(teamName, coachEmail || '');
        teamAdds++;
      }else{
        if(coachEmail) t.coachEmail = coachEmail;
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
      'team_name,coach_email,remove',
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
    lines.push('team_name,coach_email,remove');
    lines.push([t.name||'', t.coachEmail||'', ''].map(_csvEscape).join(','));
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
  const coachTeamEmail = document.getElementById("coachTeamEmail");
  const coachTeamAddBtn = document.getElementById("coachTeamAddBtn");
  const coachTeamUpdateBtn = document.getElementById("coachTeamUpdateBtn");
  const coachTeamRemoveBtn = document.getElementById("coachTeamRemoveBtn");

  const coachReviewInput = document.getElementById("coachReviewInput");
  const coachReviewLoadBtn = document.getElementById("coachReviewLoadBtn");
  const coachReviewClearBtn = document.getElementById("coachReviewClearBtn");
  const coachReviewOutput = document.getElementById("coachReviewOutput");
  const coachReviewPlayback = document.getElementById("coachReviewPlayback");

  async function loadCoachDatabaseReport(){
    const user = DIQ_AUTH_USER || window.__DIQ_AUTH_USER__;
    if(!user || !user.teamId || !coachReviewOutput) return;
    coachReviewOutput.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'muted';
    loading.textContent = 'Loading saved team results…';
    coachReviewOutput.appendChild(loading);
    try{
      const report = await diqApiRequest(`reports/team/${encodeURIComponent(user.teamId)}`, { cache:'no-store' });
      const attempts = Array.isArray(report && report.attempts) ? report.attempts : [];
      const wrapper = document.createElement('div');
      wrapper.className = 'coachTblWrap';

      const heading = document.createElement('div');
      heading.className = 'sectionTitle';
      heading.textContent = `Saved Team Results (${attempts.length})`;
      wrapper.appendChild(heading);

      const refresh = document.createElement('button');
      refresh.type = 'button';
      refresh.className = 'btn btn-ghost';
      refresh.textContent = 'Refresh saved results';
      refresh.addEventListener('click', ()=>{ void loadCoachDatabaseReport(); });
      wrapper.appendChild(refresh);

      if(!attempts.length){
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.style.marginTop = '8px';
        empty.textContent = 'No player attempts have been saved for this team yet.';
        wrapper.appendChild(empty);
      }else{
        const table = document.createElement('table');
        table.className = 'coachTbl';
        const head = document.createElement('thead');
        const headRow = document.createElement('tr');
        ['Player','Situation','Phase','Result','Tries','Time','Played'].forEach(label=>{
          const th = document.createElement('th');
          th.textContent = label;
          headRow.appendChild(th);
        });
        head.appendChild(headRow);
        table.appendChild(head);
        const body = document.createElement('tbody');
        attempts.forEach(attempt=>{
          const row = document.createElement('tr');
          const result = attempt.phase === 1
            ? `${attempt.score ?? '—'}/${attempt.total ?? '—'}`
            : (attempt.success ? 'Correct' : 'Retry');
          [
            `#${attempt.playerNumber || '—'} ${attempt.playerName || ''}`,
            attempt.situationTitle || attempt.situationKey || '—',
            attempt.stage ? `${attempt.phase}.${attempt.stage}` : String(attempt.phase || '—'),
            result,
            String(attempt.triesUsed ?? '—'),
            `${attempt.timeElapsed ?? '—'}s`,
            attempt.ts ? new Date(attempt.ts).toLocaleString() : '—'
          ].forEach(value=>{
            const td = document.createElement('td');
            td.textContent = value;
            row.appendChild(td);
          });
          body.appendChild(row);
        });
        table.appendChild(body);
        wrapper.appendChild(table);
      }
      coachReviewOutput.replaceChildren(wrapper);
    }catch(error){
      loading.textContent = error?.message || 'Unable to load saved team results.';
    }
  }
  window._diqLoadCoachDatabaseReport = loadCoachDatabaseReport;

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

  const teamsDownloadBtn = document.getElementById("teamsDownloadBtn");
  const teamsCopyBtn = document.getElementById("teamsCopyBtn");

  const teamsCsvFile = document.getElementById("teamsCsvFile");
  const teamsCsvUploadBtn = document.getElementById("teamsCsvUploadBtn");
  const teamsCsvTemplateBtn = document.getElementById("teamsCsvTemplateBtn");
  const teamsCsvSelectedBtn = document.getElementById("teamsCsvSelectedBtn");

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
      o.textContent = t.name || t.id;
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
    if(coachTeamEmail) coachTeamEmail.value = t ? (t.coachEmail || "") : "";

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

  function genSimplePassword(){
    // 4-digit numeric
    return String(Math.floor(1000 + Math.random()*9000));
  }

  function randomId(len){
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for(let i=0;i<len;i++) out += chars[Math.floor(Math.random()*chars.length)];
    return out;
  }


  function upsertTeam(name, email){
    const teamName = String(name || "").trim();
    if(!teamName) return null;
    const id = slugifyLoose(teamName) || "team";

    let t = findTeam(id);
    if(!t){
      t = { id, name: teamName, coachEmail: String(email||"").trim(), revision:0, active:true, roster: [] };
      TEAMS.teams.push(t);
    }else{
      t.name = teamName;
      t.coachEmail = String(email||"").trim();
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

  function downloadJson(filename, obj){
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
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
      const t = upsertTeam(coachTeamName.value, coachTeamEmail.value);
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
      const newEmail = String(coachTeamEmail.value||"").trim();
      old.name = newName || old.name;
      old.coachEmail = newEmail;

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

  if(teamsDownloadBtn){
    teamsDownloadBtn.addEventListener("click", ()=>{
      downloadJson("teams.json", TEAMS);
    });
  }
  if(teamsCopyBtn){
    teamsCopyBtn.addEventListener("click", ()=>{
      const txt = JSON.stringify(TEAMS, null, 2);
      copyTextToClipboard(txt)
        .then(()=> alert("Teams JSON copied."))
        .catch(()=>{ alert("Clipboard copy failed. Use Download teams.json instead."); });
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
  if(teamsCsvTemplateBtn){
    teamsCsvTemplateBtn.addEventListener("click", ()=>{
      downloadTeamsCsvTemplate();
    });
  }

  if(teamsCsvSelectedBtn){
    teamsCsvSelectedBtn.addEventListener("click", ()=>{
      const teamId = (coachTeamSelect && coachTeamSelect.value) ? String(coachTeamSelect.value||'') : (playerTeamSelect && playerTeamSelect.value) ? String(playerTeamSelect.value||'') : '';
      if(!teamId) return alert('Select a team first.');
      const csv = downloadSelectedTeamCsvV3(teamId);
      if(!csv) return alert('Could not export selected team.');
      const safeTeam = (findTeam(teamId) && findTeam(teamId).name) ? findTeam(teamId).name : 'team';
      downloadText(`diamondiq_${slugify(safeTeam)}_v3.csv`, csv, 'text/csv');
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
  const playerLogoutBtn = document.getElementById("playerLogoutBtn");
  const playerLoginStatus = document.getElementById("playerLoginStatus");
  const playerIdLine = document.getElementById("playerIdLine");
  const playerIdText = document.getElementById("playerIdText");

  const playerShareResultsBtn = document.getElementById("playerShareResultsBtn");

  const playerCopyReviewCodeBtn = document.getElementById("playerCopyReviewCodeBtn");
const playerShareHint = document.getElementById("playerShareHint");

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
      playerLoginStatus.textContent = `Logged in: ${cur.team.name} • #${cur.player.number} ${cur.player.name}`;
      const _ps = document.getElementById('playerSidebarStatus'); if(_ps) _ps.textContent = 'logged in';
      playerIdLine.style.display = "block";
      playerIdText.textContent = cur.player.playerId;

      playerLoginBtn.style.display = "none";
      playerLogoutBtn.style.display = "inline-flex";

      playerShareResultsBtn.disabled = false;
// set selects to match meta
      const teamId = cur.team.id;
      playerTeamSelect.value = teamId;
      refreshPlayerNameDropdown();
      playerNameSelect.value = cur.player.playerId;

      playerShareHint.textContent = cur.team.coachEmail ? `Coach email: ${cur.team.coachEmail}` : "No coach email configured for this team (ask coach to add one).";
    }else{
      playerLoginStatus.textContent = "Not logged in";
      const _ps = document.getElementById('playerSidebarStatus'); if(_ps) _ps.textContent = 'not logged in';
      playerIdLine.style.display = "none";
      playerIdText.textContent = "";

      playerLoginBtn.style.display = "inline-flex";
      playerLogoutBtn.style.display = "none";

      playerShareResultsBtn.disabled = true;
playerShareHint.textContent = "";
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

  function mountPlayerSidebar(){
    const card = document.getElementById("playerSidebarCard");
    const mount = document.getElementById("playerSidebarMount");
    if(!card || !mount || !playerModalOverlay) return;

    // Move the existing Player modal body into the sidebar mount (avoid duplicate IDs)
    const body = playerModalOverlay.querySelector(".modalBody");
    if(body && mount.childNodes.length === 0){
      while(body.firstChild) mount.appendChild(body.firstChild);
    }

    // Disable the overlay/modal UX (we're using the sidebar now)
    playerModalOverlay.style.display = "none";
    playerModalOverlay.classList.add("hidden");

    const closeBtn = document.getElementById("playerSidebarCloseBtn");
    if(closeBtn){
      closeBtn.addEventListener("click", ()=> card.classList.add("hidden"));
    }
  
  updatePlayerHeaderButton();
}

function isPlayerLoggedInNow(){
  const cur = getCurrentPlayerFromMeta();
  return !!(cur && cur.player && cur.team);
}
  // expose for header button logic (avoids scoping quirks)
  window.isPlayerLoggedInNow = isPlayerLoggedInNow;

function updatePlayerHeaderButton(){
    const btn = document.getElementById('playerBtn');
    if(!btn) return;

    let logged = false;
    try{
      if(typeof isPlayerLoggedInNow === 'function') logged = !!isPlayerLoggedInNow();
      else if(window.PLAYER && window.PLAYER.playerId) logged = true;
    }catch(_e){ logged = false; }

    btn.textContent = logged ? 'Player Info' : 'Player Login';
    btn.classList.remove('btn-orange','btn-yellow','btn-green');
    btn.classList.add(logged ? 'btn-green' : 'btn-orange');
    btn.setAttribute('aria-pressed', logged ? 'true' : 'false');
    btn.title = logged ? 'View Player Info' : 'Player Login';
  }

  function openPlayerSidebar(){
    const card = document.getElementById("playerSidebarCard");
    if(!card) return;
    refreshPlayerLoginUI();
    card.classList.remove("hidden");
  }

  function closePlayerSidebar(){
    const card = document.getElementById("playerSidebarCard");
    if(!card) return;
    card.classList.add("hidden");
  }

  if(playerBtn) playerBtn.addEventListener("click", ()=>{
    const card = document.getElementById("playerSidebarCard");
    if(card && !card.classList.contains("hidden")) closePlayerSidebar();
    else openPlayerSidebar();
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
    }catch(error){
      if(!error || error.status !== 401) reportDatabaseWriteError('Player login failed', error);
      return alert(error && error.status === 401 ? 'Incorrect password.' : (error?.message || 'Unable to login.'));
    }

    // Keep a UI projection of the authenticated database user for this page.
    PLAYER_META = { team: t.name, name: p.name, number: p.number };
    PLAYER_BASE_ID = p.playerId;
    await loadCurrentPlayerResults();

    refreshPlayerLoginUI();
    updatePlayerHeaderButton();
    alert("Logged in.");
  
  // Ensure dropdowns are populated once the sidebar is mounted
  try{ refreshTeamsUIAll(); }catch(_e){}
}

  async function doPlayerLogout(){
    if(!confirm("Logout?")) return;
    try{ await diqApiRequest('auth/logout', { method:'POST' }); }
    catch(error){ reportDatabaseWriteError('Logout failed', error); return; }
    DIQ_AUTH_USER = null;
    window.__DIQ_AUTH_USER__ = null;
    PLAYER_META = { team:"", name:"", number:"" };
    PLAYER_BASE_ID = 'anonymous';
    RESULTS = emptyResults();

    refreshPlayerLoginUI();
    updatePlayerHeaderButton();
  }

  if(playerLoginBtn) playerLoginBtn.addEventListener("click", doPlayerLogin);
  if(playerLogoutBtn) playerLogoutBtn.addEventListener("click", doPlayerLogout);

  function formatCoachFriendlySummary(payload){
    const lines = [];
    lines.push("Diamond Defense Results");
    lines.push("------------------");
    lines.push(`Player ID: ${payload.playerId || ""}`);
    if(payload.playerMeta){
      lines.push(`Player: ${payload.playerMeta.name || ""} #${payload.playerMeta.number || ""}`);
      lines.push(`Team: ${payload.playerMeta.team || ""}`);
    }
    if(payload.generatedAt) lines.push(`Generated: ${payload.generatedAt}`);
    lines.push("");

    const by = payload.bySituation || {};
    const keys = Object.keys(by);
    lines.push(`Situations recorded: ${keys.length}`);
    lines.push("");

    keys.sort().forEach(k=>{
      const r = by[k];
      const title = r.title || k;
      const p1 = r.phase1 || {};
      const p2 = r.phase2 || {};
      lines.push(`${k} — ${title}`);
      if(p1.attempts != null){
        lines.push(`  Phase 1: attempts=${p1.attempts}, best=${p1.bestPct ?? "—"}%, correct=${p1.lastCorrect ? "yes" : "no"}`);
      }
      if(p2.attempts != null){
        lines.push(`  Phase 2: attempts=${p2.attempts}, correct=${p2.lastCorrect ? "yes" : "no"}`);
      }
      if(r.lastPlayedAt){
        lines.push(`  Last played: ${r.lastPlayedAt}`);
      }
      lines.push("");
    });

    return lines.join("\n");
  }

  function mailtoEncode(s){
    return encodeURIComponent(String(s ?? '')).replace(/%0D%0A/g,'%0A');
  }

  function _fmtSecs(v){
    const n = Number(v);
    if(!Number.isFinite(n)) return '—';
    return (Math.round(n*10)/10).toFixed(1)+'s';
  }
  function _fmtIsoLocal(ts){
    if(!ts) return '—';
    try{ return new Date(ts).toLocaleString(); }catch(e){ return String(ts); }
  }
  function _padRight(s, w){
    s = String(s==null?'':s);
    return s.length >= w ? s.slice(0, w-1)+'…' : (s + ' '.repeat(w - s.length));
  }

  // Option A: Quick Summary + Situations Table (plain-text email friendly)
  function buildQuickCoachReportOptionA(cur){
    const teamName = (cur && cur.team && cur.team.name) ? cur.team.name : (PLAYER_META.team || '—');
    const playerName = (cur && cur.player && cur.player.name) ? cur.player.name : (PLAYER_META.name || '—');
    const playerNum  = (cur && cur.player && cur.player.number!=null) ? cur.player.number : (PLAYER_META.number || '—');

    const exportedAtStr = new Date().toLocaleString();
    const attempts = (RESULTS && Array.isArray(RESULTS.log)) ? RESULTS.log.length : 0;

    const by = (RESULTS && RESULTS.bySituation && typeof RESULTS.bySituation === 'object') ? RESULTS.bySituation : {};
    const keys = Object.keys(by);
    keys.sort((a,b)=>{
      const ta = (by[a] && by[a].lastTs) ? Date.parse(by[a].lastTs) : 0;
      const tb = (by[b] && by[b].lastTs) ? Date.parse(by[b].lastTs) : 0;
      return tb - ta || String(a).localeCompare(String(b), undefined, {numeric:true, sensitivity:'base'});
    });

    const rows = keys.map(k=>{
      const s = by[k] || {};
      const title = s.title || '';
      const p1 = s.bestPhase1 ? `${s.bestPhase1.score}/${s.bestPhase1.total} • t${s.bestPhase1.triesUsed ?? '—'} • ${_fmtSecs(s.bestPhase1.timeElapsed)}` : '—';
      const p2s1 = s.lastPhase2Stage1 ? `${s.lastPhase2Stage1.success ? '✅' : '❌'} • t${s.lastPhase2Stage1.triesUsed ?? '—'} • ${_fmtSecs(s.lastPhase2Stage1.timeElapsed)}` : '—';
      const p2s2 = s.lastPhase2Stage2 ? `${s.lastPhase2Stage2.success ? '✅' : '❌'} • t${s.lastPhase2Stage2.triesUsed ?? '—'} • ${_fmtSecs(s.lastPhase2Stage2.timeElapsed)}` : '—';
      const att = s.attempts != null ? String(s.attempts) : '0';
      const last = s.lastTs ? _fmtIsoLocal(s.lastTs) : '—';
      return { key:String(k), title:String(title), p1, p2s1, p2s2, attempts:att, last };
    });

    const subject = `Diamond Defense Results — ${teamName} — #${playerNum} ${playerName}`;

    const header = [
      _padRight('Key', 10),
      _padRight('Title', 22),
      _padRight('Phase 1', 20),
      _padRight('P2 Seq', 18),
      _padRight('P2 S2', 18),
      _padRight('Att', 4),
      'Last'
    ].join(' | ');
    const sep = '-'.repeat(header.length);

    const table = rows.length ? rows.map(r=>[
      _padRight(r.key, 10),
      _padRight(r.title, 22),
      _padRight(r.p1, 20),
      _padRight(r.p2s1, 18),
      _padRight(r.p2s2, 18),
      _padRight(r.attempts, 4),
      r.last
    ].join(' | ')).join('\n') : '(No attempts recorded yet.)';

    const body =
`Diamond Defense — Quick Report

Player: ${teamName} — #${playerNum} ${playerName}
Date: ${exportedAtStr}
Attempts recorded: ${attempts}

Situations:
${header}
${sep}
${table}

Notes:
- (Coach can add notes here after reviewing.)`;

    return { subject, body };
  }
  // Option B: Coach Review Code (paste into Coach Tools)
  function _b64urlEncode(str){
    const utf8 = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (m,p)=> String.fromCharCode(parseInt(p,16)));
    return btoa(utf8).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function _b64urlDecode(b64url){
    let b64 = String(b64url || '').replace(/-/g,'+').replace(/_/g,'/');
    while(b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const esc = bin.split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('');
    return decodeURIComponent(esc);
  }

  function buildCoachReviewPayload(dayKey){
    const cur = getCurrentPlayerFromMeta();
    if(!cur) return null;

    const teamName = (cur.team && cur.team.name) ? cur.team.name : (PLAYER_META.team || '—');
    const playerName = (cur.player && cur.player.name) ? cur.player.name : (PLAYER_META.name || '—');
    const playerNum  = (cur.player && cur.player.number!=null) ? cur.player.number : (PLAYER_META.number || '—');

    const rows = buildDailyAttemptRows(dayKey);
    return {
      v: 1,
      exportedAt: new Date().toISOString(),
      dayKey,
      team: { name: teamName, id: cur.team && cur.team.teamId ? cur.team.teamId : undefined },
      player: { name: playerName, number: playerNum, id: cur.player && cur.player.playerId ? cur.player.playerId : undefined },
      attempts: rows
    };
  }

  function encodeCoachReviewCode(payload){
    const json = JSON.stringify(payload);
    return `DIQ1:${_b64urlEncode(json)}`;
  }

  function decodeCoachReviewCode(code){
    const raw = String(code || '').trim();
    if(!raw) throw new Error('Empty code');
    const cleaned = raw.replace(/\s+/g,''); // allow pasted with line breaks
    if(!cleaned.startsWith('DIQ1:')) throw new Error('Not a DIQ1 code');
    const json = _b64urlDecode(cleaned.slice(5));
    const obj = JSON.parse(json);
    if(!obj || obj.v !== 1) throw new Error('Unsupported version');
    return obj;
  }

  function copyTextToClipboard(txt){
    if(navigator.clipboard && navigator.clipboard.writeText){
      return navigator.clipboard.writeText(txt);
    }
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try{ document.execCommand('copy'); }catch(e){}
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  // Coach Review render + playback (Phase 2 sequence)
  let _coachPlayTimer = null;
  function _stopCoachPlayback(pbId){
    if(_coachPlayTimer){ clearInterval(_coachPlayTimer); _coachPlayTimer = null; }
    const wrap = document.getElementById(pbId || 'coachReviewModalPlayback') || document.getElementById('coachReviewPlayback');
    if(wrap) wrap.innerHTML = '';
  }

  function renderCoachReview(obj){
    const esc = (s)=> String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const teamName = obj.team && obj.team.name ? obj.team.name : '—';
    const playerName = obj.player && obj.player.name ? obj.player.name : '—';
    const playerNum = obj.player && obj.player.number!=null ? obj.player.number : '—';
    const dayKey = obj.dayKey || '—';

    const attempts = Array.isArray(obj.attempts) ? obj.attempts : [];
    const attemptedSituations = new Set(attempts.map(r=>r.situationKey).filter(Boolean));

    // Mini summary in sidebar
    const mini = document.getElementById('coachReviewMini');
    const miniText = document.getElementById('coachReviewMiniText');
    if(mini && miniText){
      mini.style.display = 'block';
      miniText.innerHTML = `
        <div><span class="muted">Team:</span> <b>${esc(teamName)}</b></div>
        <div><span class="muted">Player:</span> <b>#${esc(playerNum)} ${esc(playerName)}</b></div>
        <div><span class="muted">Date:</span> <b>${esc(dayKey)}</b></div>
        <div><span class="muted">Attempts:</span> <b>${esc(attempts.length)}</b> &nbsp; <span class="muted">Situations:</span> <b>${esc(attemptedSituations.size)}</b></div>
      `;
    }

    // Group by situation
    const grouped = {};
    for(const r of attempts){
      const k = r.situationKey || '(unknown)';
      if(!grouped[k]) grouped[k] = { title: r.situationTitle || '', desc: r.situationDesc || '', outs: (r.outs==null?'':r.outs), runnersOn: (r.runnersOn||null), rows: [] };
      if(r.situationTitle) grouped[k].title = r.situationTitle;
      grouped[k].rows.push(r);
    }
    const keys = Object.keys(grouped).sort((a,b)=>a.localeCompare(b, undefined, {numeric:true, sensitivity:'base'}));

    const meta = document.getElementById('coachReviewModalMeta');
    const out = document.getElementById('coachReviewModalOutput');
    if(meta) meta.textContent = `${teamName} — #${playerNum} ${playerName} — ${dayKey} — Attempts ${attempts.length}`;
    if(out) out.innerHTML = '';
    _stopCoachPlayback('coachReviewModalPlayback');

    if(!out) return;

    if(keys.length === 0){
      out.innerHTML = '<div class="tiny muted">No attempts in this code.</div>';
      return;
    }

    let bodyRows = '';
    const playMap = [];
    for(const k of keys){
      const g = grouped[k];
      {
      const desc = g.desc ? ` • ${esc(g.desc)}` : '';
      const outsTxt = (g.outs!=='' && g.outs!=null) ? ` • Outs: ${esc(g.outs)}` : '';
      const runnersTxt = (()=>{ 
        const ro = g.runnersOn || {};
        const any = !!(ro.first || ro.second || ro.third);
        if(!g.runnersOn) return '';
        if(!any) return ' • Runners: —';
        const parts = [];
        if(ro.first) parts.push('1B');
        if(ro.second) parts.push('2B');
        if(ro.third) parts.push('3B');
        return ` • Runners: ${esc(parts.join(','))}`;
      })();
      bodyRows += `<tr class="grp"><td colspan="11">${esc(k)} — ${esc(g.title || '')}${desc}${outsTxt}${runnersTxt}</td></tr>`;
    }
      for(const r of g.rows){                        let playBtn = `<span class="text-slate-400 text-xs">—</span>`;
        if(Array.isArray(r.playbackPicked) && r.playbackPicked.length){
          const playIndex = playMap.length;
          playMap.push({ attempt: { picked: r.playbackPicked.slice() }, label: `${r.situationKey} #${r.attemptNo || ''}` });
          playBtn = `<button class="btn btn-white btn-xs" data-play-index="${playIndex}">Play</button>`;
        }

const posBadgeCls = (r.posResult==='SUCCESS') ? 'score-green' : (r.posResult==='FAIL' ? 'score-red' : 'score-yellow');
        const posBadge = (r.posResult && r.posResult!=='—')
          ? `<span class="badge badge-mini ${posBadgeCls}">${esc(r.posResult)}</span>`
          : `<span class="text-slate-400 text-xs">—</span>`;

        let posScoreBadge = `<span class="text-slate-400 text-xs">—</span>`;
        const pc = (r.posScoreCorrect==null?null:Number(r.posScoreCorrect));
        const pt = (r.posScoreTotal==null?null:Number(r.posScoreTotal));
        if(r.posScore && pc!=null && pt!=null && !Number.isNaN(pc) && !Number.isNaN(pt) && pt>0){
          const cls = (pc>=pt) ? 'score-green' : (pc>0 ? 'score-yellow' : 'score-red');
          posScoreBadge = `<span class="badge badge-mini ${cls}">${esc(r.posScore)}</span>`;
        }

        const triesBadge = (num)=>{
          if(num==null || Number.isNaN(num)) return `<span class="text-slate-400 text-xs">—</span>`;
          const n = Math.max(0, Math.floor(num));
          let cls = 'score-yellow';
          if(n <= 1) cls = 'score-green';
          else if(n >= MAX_TRIES) cls = 'score-red';
          return `<span class="badge badge-mini ${cls}">${n}/${MAX_TRIES}</span>`;
        };

        const posTriesBadge = triesBadge(r.posTriesUsedNum==null?null:Number(r.posTriesUsedNum));
        const seqTriesBadge = triesBadge(r.seqTriesUsedNum==null?null:Number(r.seqTriesUsedNum));

        let seqBadge = `<span class="text-slate-400 text-xs">—</span>`;
        const seqVal = (r.seqResult || '').trim();
        if(seqVal && seqVal !== '—'){
          // If any FAIL in the summary, mark red. If both SUCCESS and no FAIL, green. Otherwise yellow.
          const up = seqVal.toUpperCase();
          let cls = 'score-yellow';
          if(up.includes('FAIL')) cls = 'score-red';
          else if(up.includes('SUCCESS') && !up.includes('FAIL')) cls = 'score-green';
          seqBadge = `<span class="badge badge-mini ${cls}">${esc(seqVal)}</span>`;
        }

        bodyRows += `
          <tr>
            <td class="coachMono">${esc(r.time || '')}</td>
            <td class="coachMono num">${esc(r.attemptNo || '')}</td>

            <td class="coachMono">${posBadge}</td>
            <td class="coachMono num">${posScoreBadge}</td>
            <td class="coachMono num">${posTriesBadge}</td>
            <td class="coachMono num">${esc(r.posElapsed || '')}</td>

            <td class="coachMono">${seqBadge}</td>
            <td class="coachMono num">${seqTriesBadge}</td>
            <td class="coachMono num">${esc(r.seqElapsed || '')}</td>

            <td class="coachMono">${esc(r.details || '')}</td>
            <td class="num">${playBtn}</td>
          </tr>
        `;

      }
    }

    out.innerHTML = `
      <div class="coachTblWrap">
        <table class="coachTbl">
          <thead>
            <tr>
              <th>Time</th>
              <th class="num">#</th>
              <th>Position Result</th>
              <th class="num">Pos Score</th>
              <th class="num">Pos Tries</th>
              <th class="num">Pos Time</th>
              <th>Sequence Result</th>
              <th class="num">Seq Tries</th>
              <th class="num">Seq Time</th>
              <th>Selected Sequence</th>
              <th class="num">Playback</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    `;

    out.querySelectorAll('button[data-play-index]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const i = Number(btn.getAttribute('data-play-index'));
        const item = playMap[i];
        if(!item) return;
        startCoachPlayback(item.attempt, item.label, 'coachReviewModalPlayback');
      });
    });
  }

// Coach Review autoload helper (URL hash: #coachReview=...)
function _diqTryAutoloadCoachReview(){
  if(!_pendingCoachReviewCode) return false;
  try{
    if(coachReviewInput) coachReviewInput.value = _pendingCoachReviewCode;
    const obj = decodeCoachReviewCode(_pendingCoachReviewCode);
    renderCoachReview(obj);
    if(typeof openCoachReviewModal === 'function') openCoachReviewModal();
    if(typeof toast === 'function') toast('Coach Review report loaded from link.');
    return true;
  }catch(e){
    alert("Could not load Coach Review Code from link: " + (e && e.message ? e.message : e));
    return false;
  }finally{
    _pendingCoachReviewCode = null;
  }
}
window._diqCoachReviewAutoload = _diqTryAutoloadCoachReview;


  function startCoachPlayback(attempt, label, pbId){
    const pb = document.getElementById(pbId || 'coachReviewModalPlayback') || document.getElementById('coachReviewPlayback');
    if(!pb) return;
    _stopCoachPlayback(pbId);

    const tokens = Array.isArray(attempt.picked) ? attempt.picked.slice() : [];
    if(tokens.length === 0){
      pb.innerHTML = '<div class="tiny muted">No sequence data to play.</div>';
      return;
    }

    let idx = 0;

    const render = ()=>{
      const pills = tokens.map((t, i)=>{
        const cls = (i === idx) ? 'tokenPill active' : 'tokenPill';
        return `<span class="${cls}">${String(t)}</span>`;
      }).join(' ');

      pb.innerHTML = `
        <div class="card" style="padding:10px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <div style="font-weight:900;">Playback <span class="muted coachMono" style="font-weight:700; font-size:12px;">${String(label||'')}</span></div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button id="coachPlayPrev" class="btn btn-ghost" type="button">Prev</button>
              <button id="coachPlayToggle" class="btn btn-ghost" type="button">${_coachPlayTimer ? 'Pause' : 'Play'}</button>
              <button id="coachPlayNext" class="btn btn-ghost" type="button">Next</button>
              <button id="coachPlayStop" class="btn btn-ghost" type="button">Stop</button>
            </div>
          </div>
          <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px;">${pills}</div>
        </div>
      `;

      const prev = pb.querySelector('#coachPlayPrev');
      const next = pb.querySelector('#coachPlayNext');
      const stop = pb.querySelector('#coachPlayStop');
      const tog  = pb.querySelector('#coachPlayToggle');

      if(prev) prev.onclick = ()=>{ idx = Math.max(0, idx-1); render(); };
      if(next) next.onclick = ()=>{ idx = Math.min(tokens.length-1, idx+1); render(); };
      if(stop) stop.onclick = ()=>{ _stopCoachPlayback(pbId); };

      if(tog){
        tog.onclick = ()=>{
          if(_coachPlayTimer){
            clearInterval(_coachPlayTimer); _coachPlayTimer = null;
            tog.textContent = 'Play';
          }else{
            tog.textContent = 'Pause';
            _coachPlayTimer = setInterval(()=>{
              idx += 1;
              if(idx >= tokens.length){
                clearInterval(_coachPlayTimer); _coachPlayTimer = null;
                idx = tokens.length-1;
                render();
              }else{
                render();
              }
            }, 650);
          }
        };
      }
    };

    render();

    // Autoplay once started via Play button for a "replay" feel
    _coachPlayTimer = setInterval(()=>{
      idx += 1;
      if(idx >= tokens.length){
        clearInterval(_coachPlayTimer); _coachPlayTimer = null;
        idx = tokens.length-1;
        render();
      }else{
        render();
      }
    }, 650);
  }

  function _dayKeyLocal(d){
    const dt = (d instanceof Date) ? d : new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth()+1).padStart(2,'0');
    const da = String(dt.getDate()).padStart(2,'0');
    return `${y}-${m}-${da}`;
  }
  function _timeLocal(ts){
    try{
      const dd = new Date(ts);
      return dd.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    }catch(e){ return '—'; }
  }
  function _safe(s){ return String(s==null?'':s); }

  function buildDailyAttemptRows(dayKey){
  // Build per-situation, per-attempt rows for the given day (one row per full attempt)
  const rows = [];
  if(!RESULTS?.log?.length) return rows;

  const start = new Date(`${dayKey}T00:00:00`);
  const end   = new Date(`${dayKey}T23:59:59.999`);

  const evts = RESULTS.log
    .filter(e=>{
      const ts = new Date(e.ts || 0);
      return ts >= start && ts <= end;
    })
    .sort((a,b)=> (new Date(a.ts||0).getTime()) - (new Date(b.ts||0).getTime()));

  const byKey = {}; // situationKey -> { title, desc, outs, runnersOn, attempts:[], attemptNo:number }

  const fmtTime = (ts)=>{
    try{ return new Date(ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}); }
    catch{ return ''; }
  };

  const seqStr = (arr)=>{
    if(!Array.isArray(arr) || !arr.length) return '';
    return arr.join(' → ');
  };

  for(const e of evts){
    // Coach Review rows are anchored on Phase 2 attempts (which may include Phase 1 outcome)
    if(e.phase !== 2) continue;
    if(!e.situationKey) continue;

    const k = e.situationKey;
    if(!byKey[k]){
      byKey[k] = {
        title: _safe(e.situationTitle),
        desc: _safe(e.situationDesc),
        outs: (e.outs==null?'':_safe(e.outs)),
        runnersOn: (e.runnersOn==null?null:e.runnersOn),
        attempts: [],
        attemptNo: 0
      };
    }

    const g = byKey[k];

    if(Number(e.stage) === 1){
      // Stage 1 record begins a new attempt
      g.attemptNo += 1;

      const attempt = {
        situationKey: k,
        situationTitle: g.title,
        situationDesc: g.desc,
        outs: g.outs,
        runnersOn: g.runnersOn,

        ts: e.ts || 0,
        time: fmtTime(e.ts || 0),
        attemptNo: g.attemptNo,

        // Phase 1 (tokens/chips)
        posOk: (e.phase1Ok==null?null:!!e.phase1Ok),
        posTriesUsed: (e.phase1TriesUsed==null?'' : _safe(e.phase1TriesUsed)),

        posTriesUsedNum: (e.phase1TriesUsed==null?null:Number(e.phase1TriesUsed)),
        posElapsed: (e.phase1Elapsed==null?'' : _safe(e.phase1Elapsed) + 's'),

        posScoreCorrect: (e.phase1ScoreCorrect==null?'' : _safe(e.phase1ScoreCorrect)),
        posScoreTotal: (e.phase1ScoreTotal==null?'' : _safe(e.phase1ScoreTotal)),

        // Phase 2 (sequence/relay) stage 1 + stage 2
        seq1Ok: (e.success==null?null:!!e.success),
        seq2Ok: null,
        seqTriesUsed: (e.triesUsed==null?'' : _safe(e.triesUsed)),
        seqTriesUsedNum: (e.triesUsed==null?null:Number(e.triesUsed)),
        seqElapsed: (e.timeElapsed==null?'' : _safe(e.timeElapsed) + 's'),

        seq1: Array.isArray(e.picked) ? e.picked.slice() : [],
        seq2: []
      };

      g.attempts.push(attempt);
      continue;
    }

    if(Number(e.stage) === 2){
      // Stage 2 record attaches to the last attempt for this situationKey
      const last = g.attempts[g.attempts.length-1];
      if(last){
        last.seq2Ok = (e.success==null?null:!!e.success);
        last.seq2 = Array.isArray(e.picked) ? e.picked.slice() : [];
      }
      continue;
    }
  }

  // Flatten into rows
  Object.keys(byKey).sort().forEach(k=>{
    byKey[k].attempts.forEach(a=>{
      const s1 = seqStr(a.seq1);
      const s2 = seqStr(a.seq2);
      let detail = s1;
      if(s2) detail = `${s1}  |  S2: ${s2}`;

      // Sequence result summary
      let seqSummary = '—';
      if(a.seq1Ok==null) seqSummary = '—';
      else if(a.seq2Ok==null) seqSummary = (a.seq1Ok ? 'SUCCESS' : 'FAIL');
      else seqSummary = `S1:${a.seq1Ok?'SUCCESS':'FAIL'} / S2:${a.seq2Ok?'SUCCESS':'FAIL'}`;

      rows.push({
        situationKey: a.situationKey,
        situationTitle: a.situationTitle,
        situationDesc: a.situationDesc,
        outs: a.outs,
        runnersOn: a.runnersOn,

        ts: a.ts,
        time: a.time,
        attemptNo: a.attemptNo,

        // Phase 1 columns
        posResult: (a.posOk==null?'—':(a.posOk?'SUCCESS':'FAIL')),
        posTries: a.posTriesUsed,
        posTriesUsedNum: a.posTriesUsedNum,
        posTriesDisplay: (a.posTriesUsedNum==null||Number.isNaN(a.posTriesUsedNum)) ? '' : `${a.posTriesUsedNum}/${MAX_TRIES}`,
        posElapsed: a.posElapsed,
        posScore: (a.posScoreCorrect!=='' && a.posScoreTotal!=='') ? `${a.posScoreCorrect}/${a.posScoreTotal}` : '',
        posScoreCorrect: a.posScoreCorrect,
        posScoreTotal: a.posScoreTotal,

        // Phase 2 columns
        seqResult: seqSummary,
        seqTries: a.seqTriesUsed,
        seqTriesUsedNum: a.seqTriesUsedNum,
        seqTriesDisplay: (a.seqTriesUsedNum==null||Number.isNaN(a.seqTriesUsedNum)) ? '' : `${a.seqTriesUsedNum}/${MAX_TRIES}`,
        seqElapsed: a.seqElapsed,

        details: detail,

        playbackPicked: a.seq1
      });
    });
  });

  return rows;
}

function shareResultsByEmail(){
    const cur = getCurrentPlayerFromMeta();
    if(!cur) return alert("Login first.");

    const coachEmail = String(cur.team.coachEmail || "").trim();
    if(!coachEmail){
      alert("No coach email configured for your team. Ask your coach to add one in TEAMS.");
      return;
    }

    const dayKey = _dayKeyLocal(new Date());
    const payload = buildCoachReviewPayload(dayKey);
    const code = encodeCoachReviewCode(payload);

    const teamName = (cur.team && cur.team.name) ? cur.team.name : (PLAYER_META.team || '—');
    const playerName = (cur.player && cur.player.name) ? cur.player.name : (PLAYER_META.name || '—');
    const playerNum  = (cur.player && cur.player.number!=null) ? cur.player.number : (PLAYER_META.number || '—');

    const subject = `Diamond Defense Results ${teamName} #${playerNum} ${playerName} - ${dayKey}`;

    const body =
`Hi Coach,

Here are the Diamond Defense Results ${teamName} #${playerNum} ${playerName} - ${dayKey}

Coach Review Code:
${code}

(Use Coach Tools → Coach Review to paste this code.)`; 
const mailto = `mailto:${encodeURIComponent(coachEmail)}?subject=${mailtoEncode(subject)}&body=${mailtoEncode(body)}`;
    window.location.href = mailto;
  }

  if(playerShareResultsBtn){
    playerShareResultsBtn.addEventListener("click", shareResultsByEmail);
  }



  if(playerCopyReviewCodeBtn){
    playerCopyReviewCodeBtn.addEventListener('click', async ()=>{
      const cur = getCurrentPlayerFromMeta();
      if(!cur) return alert("Login first.");
      const dayKey = _dayKeyLocal(new Date());
      const payload = buildCoachReviewPayload(dayKey);
      const code = encodeCoachReviewCode(payload);
      await copyTextToClipboard(code);
      toast("Coach Review Code copied.");
    });
  }

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
    }else{
      PLAYER_BASE_ID = 'anonymous';
      PLAYER_META = { team:"", name:"", number:"" };
      RESULTS = emptyResults();
    }
  }


let RESULTS = emptyResults();

function recordAttempt(entry){
  try{
    if(!DIQ_AUTH_USER || DIQ_AUTH_USER.role !== 'player'){
      if(typeof toast === 'function') toast('Log in before saving a result.');
      return;
    }
    const e = Object.assign({ playerId: getPlayerId(), ts: new Date().toISOString() }, entry || {});
    RESULTS.log.push(e);

    const key = e.situationKey;
    if(key){
      const prev = RESULTS.bySituation[key] || {};
      const next = Object.assign({}, prev);
      next.key = key;
      next.title = e.situationTitle || prev.title || '';
      next.attempts = (prev.attempts || 0) + 1;
      next.lastTs = e.ts;

      // Phase 1 best score
      if(e.phase === 1 && Number.isFinite(e.score) && Number.isFinite(e.total)){
        const best = prev.bestPhase1 || null;
        const cand = { score: e.score, total: e.total, triesUsed: e.triesUsed, timeElapsed: e.timeElapsed, ts: e.ts };
        if(!best || cand.score > best.score || (cand.score === best.score && (cand.triesUsed||999) < (best.triesUsed||999))){
          next.bestPhase1 = cand;
        }else{
          next.bestPhase1 = best;
        }
      }

      // Phase 2 stage results
      if(e.phase === 2 && (e.stage === 1 || e.stage === 2)){
        const field = (e.stage === 2) ? 'lastPhase2Stage2' : 'lastPhase2Stage1';
        next[field] = { success: !!e.success, triesUsed: e.triesUsed, timeElapsed: e.timeElapsed, picked: e.picked || [], ts: e.ts };
      }

      RESULTS.bySituation[key] = next;
    }
    diqApiRequest('attempts', { method:'POST', body:JSON.stringify(e) })
      .catch(error=>reportDatabaseWriteError('Attempt save failed', error));
  }catch(err){}
}
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
    <li>Select a situation from the dropdown (or click <em>Random</em>).</li>
    <li>Review the Description, Runners, and Outs shown in the header.</li>
    <li>Press <em>Start Situation</em> to begin</li>
    <li>Drag the 9 player chips into the correct defensive positions.</li>
    <li>Press <em>Check Positions</em> to verify. You have 3 tries to get them correct.</li>
  </ol>
  <div class="hint" style="margin-top:8px">
    Note: Correct chips will display within a highlighted target ring
  </div>
`;

const HOWTO_PHASE2_HTML = `
  <ol style="margin:6px 0 0 1.2em">
    <li>Select <em>Continue</em> to begin</li>
    <li>Select the players (chips) in the correct throw order to execute the play.</li>
    <li>Click chips to add them to your sequence; click again to unselect (unless a chip is already locked as correct).</li>
    <li>Press <em>Verify Sequence</em> to check your picks. You have 3 tries.</li>
  </ol>
  <div class="hint" style="margin-top:8px">
    Note: Correct chips (in the proper order) will lock and remain highlighted.
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
    .filter(s => POS_IDS.includes(s));
}

/** Write to model + repaint builder */
function setPlaySeq(next){
  if (!currentSituation) return;
  currentSituation.playSeq = sanitizeSeq(next);
  renderSeqBuilder();
  if(typeof queueCurrentSituationDatabaseSync === 'function') queueCurrentSituationDatabaseSync();
}





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

  // Record Phase 2 attempt (per-stage) before we potentially transition/exit
  try{
    recordAttempt({
      phase: 2,
      stage: phase2Stage,
      situationKey: currentSituation ? currentSituation.key : null,
      situationTitle: currentSituation ? currentSituation.title : '',
      situationDesc: currentSituation ? (currentSituation.desc || '') : '',
      outs: currentSituation ? (currentSituation.outs ?? null) : null,
      runnersOn: currentSituation ? (currentSituation.runnersOn || null) : null,
      // Phase 1 outcome (tokens)
      phase1Ok: _phase1Summary ? !!_phase1Summary.ok : null,
      phase1TriesUsed: _phase1Summary ? _phase1Summary.triesUsed : null,
      phase1Elapsed: _phase1Summary ? _phase1Summary.elapsed : null,
      phase1ScoreCorrect: _phase1Summary ? _phase1Summary.scoreCorrect : null,
      phase1ScoreTotal: _phase1Summary ? _phase1Summary.scoreTotal : null,

      success: !!success,
      triesUsed: (typeof phase2TriesLeft === 'number') ? (PHASE2_MAX_TRIES - phase2TriesLeft) : null,
      timeElapsed: (typeof _timerSecs === 'number') ? Math.max(0, TIMER_START_SECS - _timerSecs) : null,
      picked: Array.isArray(phase2Picks) ? phase2Picks.slice() : []
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

  // Coach Review (paste code → modal table + playback)
  const coachReviewModal = document.getElementById('coachReviewModal');
  const coachReviewModalClose = document.getElementById('coachReviewModalClose');
  const coachReviewOpenBtn = document.getElementById('coachReviewOpenBtn');
  const coachReviewCopyCodeBtn = document.getElementById('coachReviewCopyCodeBtn');

  function openCoachReviewModal(){
    if(!coachReviewModal) return;
    coachReviewModal.classList.remove('hidden');
  }
  function closeCoachReviewModal(){
    if(!coachReviewModal) return;
    coachReviewModal.classList.add('hidden');
    _stopCoachPlayback('coachReviewModalPlayback');
  }

  if(coachReviewModalClose) coachReviewModalClose.addEventListener('click', closeCoachReviewModal);
  if(coachReviewModal){
    const backdrop = coachReviewModal.querySelector('.diq-modal-backdrop');
    if(backdrop) backdrop.addEventListener('click', closeCoachReviewModal);
    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape' && !coachReviewModal.classList.contains('hidden')) closeCoachReviewModal();
    });
  }

  if(coachReviewLoadBtn){
    coachReviewLoadBtn.addEventListener('click', ()=>{
      try{
        const obj = decodeCoachReviewCode(coachReviewInput ? coachReviewInput.value : '');
        renderCoachReview(obj);
        openCoachReviewModal();
      }catch(e){
        alert("Could not load Coach Review Code: " + (e && e.message ? e.message : e));
      }
    });
}
  if(coachReviewClearBtn){
    coachReviewClearBtn.addEventListener('click', ()=>{
      if(coachReviewInput) coachReviewInput.value = '';
      const mini = document.getElementById('coachReviewMini');
      if(mini) mini.style.display = 'none';
      const miniText = document.getElementById('coachReviewMiniText');
      if(miniText) miniText.innerHTML = '';
      if(coachReviewOutput) coachReviewOutput.innerHTML = '';
      if(coachReviewPlayback) coachReviewPlayback.innerHTML = '';
      const mout = document.getElementById('coachReviewModalOutput');
      if(mout) mout.innerHTML = '';
      const mpb = document.getElementById('coachReviewModalPlayback');
      if(mpb) mpb.innerHTML = '';
      closeCoachReviewModal();
    });
  }
  if(coachReviewOpenBtn){
    coachReviewOpenBtn.addEventListener('click', ()=> openCoachReviewModal());
  }
  if(coachReviewCopyCodeBtn){
    coachReviewCopyCodeBtn.addEventListener('click', async ()=>{
      try{
        const txt = (coachReviewInput && coachReviewInput.value) ? coachReviewInput.value.trim() : '';
        if(!txt) return alert('No code to copy.');
        await copyTextToClipboard(txt);
        toast('Coach Review Code copied.');
      }catch(e){}
    });
  }

  // --- everything from your “/* Wiring */” block goes here ---
  if (sitSelect) sitSelect.addEventListener('change', e=> setSituation(e.target.value));
  if (randomSitBtn) randomSitBtn.addEventListener('click', pickRandomSituation);

  if (resetBtn)  resetBtn.addEventListener('click', resetPlayers);
  if (checkBtn)  checkBtn.addEventListener('click', checkPositions);

  if (startBtn)  startBtn.addEventListener('click', ()=>{
    if (!currentSituation) return;

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
    if (continueBtn) continueBtn.classList.add('hidden');

    // --- Reset round UI ---
    disableTargetSelection();
    hideTargetPanel();
    if (!coachUnlocked) getAllRings().forEach(el=> el.style.display='none');
    startBtn.disabled = true;
    if (resetBtn) resetBtn.disabled = false;
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

  // Coach Review (paste code → table + playback)
  if(coachReviewLoadBtn){
    coachReviewLoadBtn.addEventListener('click', ()=>{
      try{
        const obj = decodeCoachReviewCode(coachReviewInput ? coachReviewInput.value : '');
        renderCoachReview(obj);
      }catch(e){
        alert("Could not load Coach Review Code: " + (e && e.message ? e.message : e));
      }
    });
  }
  if(coachReviewClearBtn){
    coachReviewClearBtn.addEventListener('click', ()=>{
      if(coachReviewInput) coachReviewInput.value = '';
      if(coachReviewOutput) coachReviewOutput.innerHTML = '';
      if(coachReviewPlayback) coachReviewPlayback.innerHTML = '';
      _stopCoachPlayback();
    });
  }

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
      setCoachMode(false);
      coachCard.classList.add('hidden');
      setChipsLocked(!gameActive||remainingTries===0);
      getAllRings().forEach(el=>el.style.display='none');
      syncBallToHit();
    } else {
      openPwModal();
    }
  });


  // Close button on Coach Tools card (does not reset situation)
  const coachCardCloseBtn = document.getElementById('coachCardCloseBtn');
  if (coachCardCloseBtn) coachCardCloseBtn.addEventListener('click', ()=>{
    if (coachUnlocked){
      setCoachMode(false);
      if (coachCard) coachCard.classList.add('hidden');
      setChipsLocked(!gameActive||remainingTries===0);
      getAllRings().forEach(el=>el.style.display='none');
      syncBallToHit();
    } else {
      if (coachCard) coachCard.classList.add('hidden');
    }
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
    adminPwModal.style.display = 'flex';
    setTimeout(()=>adminPwInput.focus(), 0);
  }
  function closeAdminPwModal(){
    if (!adminPwModal) return;
    adminPwModal.style.display = 'none';
  }
  function setAdminMode(on){
    adminUnlocked = !!on;
    if (adminUnlocked){
      closeGuideRail?.();
      if (typeof setCoachMode === 'function' && coachUnlocked) setCoachMode(false);
    }
    if (adminCard) adminCard.classList.toggle('hidden', !adminUnlocked);
    if (adminStatus) adminStatus.textContent = adminUnlocked ? 'unlocked' : 'locked';
  }
  window._diqSetAdminMode = setAdminMode;
  async function tryUnlockAdmin(){
    if (!adminPwInput) return;
    const valid = await authenticateStaff('admin', adminPwInput.value);
    if (valid){
      closeAdminPwModal();
      setAdminMode(true);
    } else {
      adminPwMsg.textContent = 'Incorrect password.';
    }
  }

  if (adminPwCancel) adminPwCancel.addEventListener('click', closeAdminPwModal);
  if (adminPwOk) adminPwOk.addEventListener('click', ()=>{ void tryUnlockAdmin(); });
  if (adminPwInput) adminPwInput.addEventListener('keydown', e=>{ if(e.key==='Enter') void tryUnlockAdmin(); });

  if (adminBtn) adminBtn.addEventListener('click', ()=>{
    closeGuideRail?.();
    const toolsMenu = adminBtn.closest('details');
    if (toolsMenu) toolsMenu.open = false;
    if (adminUnlocked){
      setAdminMode(false);
      if (adminCard) adminCard.classList.add('hidden');
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
      if (descHud) descHud.textContent = currentSituation.desc || '';
      if (typeof updateDescriptionHudText === 'function') updateDescriptionHudText();
      if(typeof queueCurrentSituationDatabaseSync === 'function') queueCurrentSituationDatabaseSync();
    });
  }

  if (downloadCurrentBtn) downloadCurrentBtn.addEventListener('click', ()=>{
    refreshSituationAll(); // ensure UI → model before exporting
    download(safeSituationJsonFilename((currentSituation && (currentSituation.title||currentSituation.key)) || 'situation-current'), buildCurrentSituationExport());
  });
  if (downloadAllBtn)     downloadAllBtn.addEventListener('click', ()=>{
    refreshSituationAll();
    download('situations-all.json', buildAllSituationsExport());
  });

      // Results export buttons (avoid relying on id->window globals)
  const copyResultsBtn = document.getElementById('copyResultsBtn');
  const downloadResultsBtn = document.getElementById('downloadResultsBtn');
  const copyResultsTopBtn = document.getElementById('copyResultsTopBtn'); // optional

  if (copyResultsBtn)      copyResultsBtn.addEventListener('click', async ()=>{ try{ await copyResults(); }catch{} });
  if (downloadResultsBtn)  downloadResultsBtn.addEventListener('click', ()=>{ downloadResults(); });
  if (copyResultsTopBtn)   copyResultsTopBtn.addEventListener('click', async ()=>{ try{ await copyResults(); }catch{} });

  wireSeqBuilderOnce();
}
