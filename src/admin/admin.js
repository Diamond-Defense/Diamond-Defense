// @diq:begin [A_ADMIN] Admin tools
  let adminUnlocked = false;

  const adminCollapseAllBtn = document.getElementById('adminCollapseAllBtn');
  const adminExpandAllBtn = document.getElementById('adminExpandAllBtn');

  const adminTeamsResetBtn = document.getElementById('adminTeamsResetBtn');

  const adminTeamSelect = document.getElementById('adminTeamSelect');
  const adminTeamName = document.getElementById('adminTeamName');
  const adminTeamEmail = document.getElementById('adminTeamEmail');
  const adminTeamAddBtn = document.getElementById('adminTeamAddBtn');
  const adminTeamUpdateBtn = document.getElementById('adminTeamUpdateBtn');
  const adminTeamRemoveBtn = document.getElementById('adminTeamRemoveBtn');

  const adminRosterSelect = document.getElementById('adminRosterSelect');
  const adminPlayerName = document.getElementById('adminPlayerName');
  const adminPlayerNumber = document.getElementById('adminPlayerNumber');
  const adminPlayerPass = document.getElementById('adminPlayerPass');
  const adminGenPassBtn = document.getElementById('adminGenPassBtn');
  const adminPlayerIdPreview = document.getElementById('adminPlayerIdPreview');
  const adminPlayerAddBtn = document.getElementById('adminPlayerAddBtn');
  const adminPlayerUpdateBtn = document.getElementById('adminPlayerUpdateBtn');
  const adminPlayerRemoveBtn = document.getElementById('adminPlayerRemoveBtn');
  const adminArchivedTeamSelect = document.getElementById('adminArchivedTeamSelect');
  const adminArchivedSituationSelect = document.getElementById('adminArchivedSituationSelect');
  const adminArchivedMemberSelect = document.getElementById('adminArchivedMemberSelect');
  const adminRestoreTeamBtn = document.getElementById('adminRestoreTeamBtn');
  const adminRestoreMemberBtn = document.getElementById('adminRestoreMemberBtn');
  const adminRestoreSituationBtn = document.getElementById('adminRestoreSituationBtn');
  let adminArchivedTeams = [];
  let adminArchivedSituations = [];
  let adminArchivedMembers = [];

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

  function adminSetSubsecCollapsed(secEl, collapsed){
    if (!secEl) return;
    secEl.dataset.collapsed = collapsed ? '1' : '0';
    const body = secEl.querySelector('.adminSubsecBody');
    if (body) body.style.display = collapsed ? 'none' : '';
    const toggle = secEl.querySelector('.adminSubsecToggle');
    if (toggle) toggle.textContent = collapsed ? '▸' : '▾';
  }

  function adminInitCollapsibles(){
    if (!adminCard) return;
    const secs = adminCard.querySelectorAll('.admin-subsec[data-admin-collapsible="1"]');
    secs.forEach(sec=>{
      const open = sec.dataset.adminOpen === '1';
      adminSetSubsecCollapsed(sec, !open);
      const t = sec.querySelector('.adminSubsecToggle');
      if (t){
        t.addEventListener('click', ()=>{
          const isCollapsed = sec.dataset.collapsed === '1';
          adminSetSubsecCollapsed(sec, !isCollapsed);
          if(isCollapsed && sec.id === 'adminArchivedSubsec') void adminLoadArchivedRecords();
        });
      }
    });
  }

  function adminSetAllSubsecs(collapsed){
    if (!adminCard) return;
    const secs = adminCard.querySelectorAll('.admin-subsec[data-admin-collapsible="1"]');
    secs.forEach(sec=>adminSetSubsecCollapsed(sec, collapsed));
  }

  function adminSetMode(on){
    adminUnlocked = !!on;
    if (adminCard) adminCard.classList.toggle('hidden', !adminUnlocked);
    if (adminStatus) adminStatus.textContent = adminUnlocked ? 'unlocked' : 'locked';
    if (adminUnlocked){
      adminInitCollapsibles();
      adminRefreshAll();
      void adminLoadArchivedRecords();
    }
  }

  async function tryUnlockAdmin(){
    if (!adminPwInput) return;
    const valid = (typeof authenticateStaff === 'function')
      ? await authenticateStaff('admin', adminPwInput.value)
      : false;
    if (valid){
      closeAdminPwModal();
      adminSetMode(true);
    } else {
      adminPwMsg.textContent = 'Incorrect password.';
    }
  }

  if (adminPwCancel) adminPwCancel.addEventListener('click', closeAdminPwModal);
  if (adminPwOk) adminPwOk.addEventListener('click', ()=>{ void tryUnlockAdmin(); });
  if (adminPwInput) adminPwInput.addEventListener('keydown', e=>{ if(e.key==='Enter') void tryUnlockAdmin(); });

  if (adminBtn) adminBtn.addEventListener('click', ()=>{
    if (adminUnlocked){
      adminSetMode(false);
      if (adminCard) adminCard.classList.add('hidden');
    } else {
      openAdminPwModal();
    }
  });

  if (adminCollapseAllBtn) adminCollapseAllBtn.addEventListener('click', ()=>adminSetAllSubsecs(true));
  if (adminExpandAllBtn) adminExpandAllBtn.addEventListener('click', ()=>adminSetAllSubsecs(false));

  // --- Admin TEAMS (uses same underlying teams model as Coach TEAMS) ---
  function adminRefreshTeamSelect(){
    if (!adminTeamSelect) return;
    const curVal = adminTeamSelect.value;
    adminTeamSelect.innerHTML = '<option value="">— Select team —</option>';
    const list = (TEAMS && Array.isArray(TEAMS.teams)) ? TEAMS.teams.slice() : [];
    list.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    list.forEach(t=>{
      const opt = document.createElement('option');
      opt.value = t.id || slugifyLoose(t.name||'');
      opt.textContent = t.name || t.id || '(unnamed)';
      adminTeamSelect.appendChild(opt);
    });
    if (curVal) adminTeamSelect.value = curVal;
  }

  function adminRefreshRosterSelect(){
    if (!adminRosterSelect) return;
    const teamId = adminTeamSelect ? adminTeamSelect.value : '';
    adminRosterSelect.innerHTML = '<option value="">— Select player —</option>';
    const t = teamId ? findTeam(teamId) : null;
    if (!t) return;

    (t.roster || []).forEach(p=>{
      const o = document.createElement('option');
      const pid = (p && p.playerId) ? String(p.playerId) : slugifyLoose(`${(t && t.id) ? t.id : teamId}-${p && p.number ? p.number : ''}-${p && p.name ? p.name : ''}`);
      o.value = pid;
      o.textContent = `${p.number ? "#"+p.number+" " : ""}${p.name||'(no name)'}`;
      adminRosterSelect.appendChild(o);
    });
  }

  function adminSetTeamFieldsFromSelection(){
    if (!adminTeamSelect) return;
    const teamId = adminTeamSelect.value;
    const t = teamId ? findTeam(teamId) : null;
    if (adminTeamName) adminTeamName.value = t ? (t.name||'') : '';
    if (adminTeamEmail) adminTeamEmail.value = t ? (t.coachEmail||'') : '';

    const hasTeam = !!teamId;
    if (adminTeamUpdateBtn) adminTeamUpdateBtn.disabled = !hasTeam;
    if (adminTeamRemoveBtn) adminTeamRemoveBtn.disabled = !hasTeam;

    adminRefreshRosterSelect();
    if (adminRosterSelect) adminRosterSelect.value = '';
    adminSetPlayerFieldsFromSelection();
  }

  function adminSetPlayerFieldsFromSelection(){
    if (!adminRosterSelect || !adminTeamSelect) return;
    const teamId = adminTeamSelect.value;
    const t = teamId ? findTeam(teamId) : null;
    const pid = adminRosterSelect.value;
    const p = (t && pid) ? findPlayer(teamId, pid) : null;

    if (adminPlayerName) adminPlayerName.value = p ? (p.name||'') : '';
    if (adminPlayerNumber) adminPlayerNumber.value = p ? (p.number!=null ? String(p.number) : '') : '';
    if (adminPlayerPass) adminPlayerPass.value = p ? (p.password||'') : '';

    const hasPlayer = !!p;
    if (adminPlayerUpdateBtn) adminPlayerUpdateBtn.disabled = !hasPlayer;
    if (adminPlayerRemoveBtn) adminPlayerRemoveBtn.disabled = !hasPlayer;

    adminUpdatePlayerIdPreview();
  }

  function adminUpdatePlayerIdPreview(){
    if (!adminPlayerIdPreview || !adminTeamSelect) return;
    const teamId = adminTeamSelect.value;
    const t = teamId ? findTeam(teamId) : null;
    if (!t){
      adminPlayerIdPreview.textContent = '';
      return;
    }
    const name = String(adminPlayerName ? adminPlayerName.value : '').trim();
    const num = String(adminPlayerNumber ? adminPlayerNumber.value : '').trim();
    const baseId = ''; // preview only
    const pid = (typeof buildPlayerIdForTeam === 'function')
      ? buildPlayerIdForTeam(t.name, name, num, baseId)
      : computeRosterPlayerId(t, { name, number:num });
    adminPlayerIdPreview.textContent = pid;
  }

  function adminRefreshAll(){
    adminRefreshTeamSelect();
    adminSetTeamFieldsFromSelection();
  }

  async function adminLoadArchivedRecords(){
    if(!adminUnlocked) return;
    try{
      const [teamsResult, situationsResult] = await Promise.all([
        diqApiRequest('admin/teams?includeArchived=true', { cache:'no-store' }),
        diqApiRequest('admin/situations', { cache:'no-store' })
      ]);
      adminArchivedTeams = ((teamsResult && teamsResult.teams) || []).filter(item=>item.active === false);
      adminArchivedSituations = ((situationsResult && situationsResult.situations) || []).filter(item=>item.active === false);
      adminArchivedMembers = [];
      ((teamsResult && teamsResult.teams) || []).forEach(team=>{
        (team.roster || []).filter(member=>member.active === false).forEach(member=>{
          adminArchivedMembers.push({ ...member, teamId:team.id, teamName:team.name });
        });
      });

      if(adminArchivedTeamSelect){
        adminArchivedTeamSelect.innerHTML = '<option value="">— No archived teams —</option>';
        adminArchivedTeams.forEach(team=>{
          const option = document.createElement('option');
          option.value = team.id;
          option.textContent = team.name || team.id;
          adminArchivedTeamSelect.appendChild(option);
        });
      }
      if(adminArchivedSituationSelect){
        adminArchivedSituationSelect.innerHTML = '<option value="">— No archived situations —</option>';
        adminArchivedSituations.forEach(situation=>{
          const option = document.createElement('option');
          option.value = situation.key;
          option.textContent = `${situation.key} — ${situation.title || situation.key}`;
          adminArchivedSituationSelect.appendChild(option);
        });
      }
      if(adminArchivedMemberSelect){
        adminArchivedMemberSelect.innerHTML = '<option value="">— No archived members —</option>';
        adminArchivedMembers.forEach(member=>{
          const option = document.createElement('option');
          option.value = `${member.teamId}\u0000${member.playerId}`;
          option.textContent = `${member.teamName} — ${member.name}`;
          adminArchivedMemberSelect.appendChild(option);
        });
      }
    }catch(error){ reportDatabaseWriteError('Archived records could not be loaded', error); }
  }

  if(adminRestoreTeamBtn) adminRestoreTeamBtn.addEventListener('click', async ()=>{
    const id = adminArchivedTeamSelect && adminArchivedTeamSelect.value;
    const team = adminArchivedTeams.find(item=>item.id === id);
    if(!team) return alert('Select an archived team.');
    try{
      await diqApiRequest(`admin/teams/${encodeURIComponent(id)}/restore`, {
        method:'POST', headers:{ 'If-Match':String(team.revision) }
      });
      await loadTeamsFromJson();
      refreshTeamsUIAll();
      adminRefreshAll();
      await adminLoadArchivedRecords();
    }catch(error){ reportDatabaseWriteError('Team restore failed', error); }
  });
  if(adminRestoreMemberBtn) adminRestoreMemberBtn.addEventListener('click', async ()=>{
    const value = adminArchivedMemberSelect && adminArchivedMemberSelect.value;
    const [teamId, userId] = String(value || '').split('\u0000');
    const member = adminArchivedMembers.find(item=>item.teamId === teamId && item.playerId === userId);
    if(!member) return alert('Select an archived player or coach.');
    try{
      await diqApiRequest(`admin/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}/restore`, {
        method:'POST', headers:{ 'If-Match':String(member.revision) }
      });
      await loadTeamsFromJson();
      refreshTeamsUIAll(); adminRefreshAll();
      await adminLoadArchivedRecords();
    }catch(error){ reportDatabaseWriteError('Member restore failed', error); }
  });
  if(adminRestoreSituationBtn) adminRestoreSituationBtn.addEventListener('click', async ()=>{
    const key = adminArchivedSituationSelect && adminArchivedSituationSelect.value;
    const situation = adminArchivedSituations.find(item=>item.key === key);
    if(!situation) return alert('Select an archived situation.');
    try{
      await diqApiRequest(`admin/situations/${encodeURIComponent(key)}/restore`, {
        method:'POST', headers:{ 'If-Match':String(situation.revision) }
      });
      await loadSituationsFromDatabase();
      loadStarts(); loadHits();
      populateSituations(key); setSituation(key);
      await adminLoadArchivedRecords();
    }catch(error){ reportDatabaseWriteError('Situation restore failed', error); }
  });

  if (adminTeamSelect) adminTeamSelect.addEventListener('change', adminSetTeamFieldsFromSelection);
  if (adminRosterSelect) adminRosterSelect.addEventListener('change', adminSetPlayerFieldsFromSelection);
  if (adminPlayerName) adminPlayerName.addEventListener('input', adminUpdatePlayerIdPreview);
  if (adminPlayerNumber) adminPlayerNumber.addEventListener('input', adminUpdatePlayerIdPreview);

  if (adminGenPassBtn){
    adminGenPassBtn.addEventListener('click', ()=>{
      if (!adminPlayerPass) return;
      adminPlayerPass.value = genSimplePassword(6);
    });
  }

  if (adminTeamsResetBtn){
    adminTeamsResetBtn.addEventListener('click', async ()=>{
      if(!confirm('Discard unsaved form changes and reload teams from the database?')) return;
      if (typeof loadTeamsFromJson === 'function'){
        try{ await loadTeamsFromJson(); }
        catch(error){
          if(typeof showDatabaseUnavailable === 'function') showDatabaseUnavailable(error);
          return;
        }
      }
      if (typeof refreshTeamsUIAll === 'function') refreshTeamsUIAll();
      adminRefreshAll();
      alert('Teams reloaded from the database.');
    });
  }

  // Admin CSV (v3) import/export
  const adminTeamsCsvFile = document.getElementById('adminTeamsCsvFile');
  const adminTeamsCsvUploadBtn = document.getElementById('adminTeamsCsvUploadBtn');
  const adminTeamsCsvTemplateBtn = document.getElementById('adminTeamsCsvTemplateBtn');
  const adminTeamsCsvSelectedBtn = document.getElementById('adminTeamsCsvSelectedBtn');

  if(adminTeamsCsvUploadBtn && adminTeamsCsvFile){
    adminTeamsCsvUploadBtn.addEventListener('click', ()=> adminTeamsCsvFile.click());
    adminTeamsCsvFile.addEventListener('change', ()=>{
      const f = adminTeamsCsvFile.files && adminTeamsCsvFile.files[0];
      if(!f) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        try{
          const txt = String(reader.result || '');
          const res = importTeamsFromCsvText(txt);
          alert(`Imported. Teams upserted: ${res.teams||0}. Players upserted: ${res.players||0}. Removed teams: ${res.removedTeams||0}. Removed players: ${res.removedPlayers||0}.`);
        }catch(e){
          alert('Could not import CSV: ' + (e && e.message ? e.message : e));
        }finally{
          adminTeamsCsvFile.value = '';
        }
      };
      reader.onerror = ()=>{
        alert('Could not read file.');
        adminTeamsCsvFile.value = '';
      };
      reader.readAsText(f);
    });
  }

  if(adminTeamsCsvTemplateBtn){
    adminTeamsCsvTemplateBtn.addEventListener('click', ()=> downloadTeamsCsvTemplate());
  }

  if(adminTeamsCsvSelectedBtn){
    adminTeamsCsvSelectedBtn.addEventListener('click', ()=>{
      const teamId = adminTeamSelect ? String(adminTeamSelect.value||'') : '';
      if(!teamId) return alert('Select a team first.');
      const csv = downloadSelectedTeamCsvV3(teamId);
      if(!csv) return alert('Could not export selected team.');
      const safeTeam = (findTeam(teamId) && findTeam(teamId).name) ? findTeam(teamId).name : 'team';
      downloadText(`diamondiq_${slugify(safeTeam)}_v3.csv`, csv, 'text/csv');
    });
  }
  if (adminTeamAddBtn){
    adminTeamAddBtn.addEventListener('click', ()=>{
      const t = upsertTeam(adminTeamName ? adminTeamName.value : '', adminTeamEmail ? adminTeamEmail.value : '');
      if (typeof refreshTeamsUIAll === 'function') refreshTeamsUIAll();
      adminRefreshAll();
      if (t && adminTeamSelect) adminTeamSelect.value = t.id;
      adminSetTeamFieldsFromSelection();
    });
  }

  if (adminTeamUpdateBtn){
    adminTeamUpdateBtn.addEventListener('click', ()=>{
      const teamId = adminTeamSelect ? adminTeamSelect.value : '';
      if(!teamId) return alert('Select a team to update.');
      const old = findTeam(teamId);
      if(!old) return;

      const newName = String(adminTeamName ? adminTeamName.value : '').trim();
      const newEmail = String(adminTeamEmail ? adminTeamEmail.value : '').trim();
      old.name = newName || old.name;
      old.coachEmail = newEmail;

      TEAMS.teams = TEAMS.teams.sort((a,b)=> (a.name||"").localeCompare(b.name||""));
      saveTeamsToLocal(teamId);
      if (typeof refreshTeamsUIAll === 'function') refreshTeamsUIAll();
      adminRefreshAll();
      if (adminTeamSelect) adminTeamSelect.value = teamId;
      adminSetTeamFieldsFromSelection();
    });
  }

  if (adminTeamRemoveBtn){
    adminTeamRemoveBtn.addEventListener('click', ()=>{
      const teamId = adminTeamSelect ? adminTeamSelect.value : '';
      if(!teamId) return;
      if(!confirm('Archive this team? Historical results will be preserved.')) return;
      removeTeam(teamId);
      if (typeof refreshTeamsUIAll === 'function') refreshTeamsUIAll();
      adminRefreshAll();
      if (adminTeamSelect) adminTeamSelect.value = '';
      adminSetTeamFieldsFromSelection();
    });
  }

  if (adminPlayerAddBtn){
    adminPlayerAddBtn.addEventListener('click', ()=>{
      const teamId = adminTeamSelect ? adminTeamSelect.value : '';
      if(!teamId) return alert('Select a team first.');
      const name = String(adminPlayerName ? adminPlayerName.value : '').trim();
      const num = String(adminPlayerNumber ? adminPlayerNumber.value : '').trim();
      const pass = String(adminPlayerPass ? adminPlayerPass.value : '').trim();
      if(!name) return alert('Player Name is required.');
      if(!num) return alert('Player Number is required.');

      const p = upsertPlayer(teamId, name, num, pass);
      if (typeof refreshTeamsUIAll === 'function') refreshTeamsUIAll();
      adminRefreshAll();
      adminRefreshRosterSelect();
      if (adminRosterSelect && p && p.playerId) adminRosterSelect.value = p.playerId;
      adminSetPlayerFieldsFromSelection();
    });
  }

  if (adminPlayerUpdateBtn){
    adminPlayerUpdateBtn.addEventListener('click', ()=>{
      const teamId = adminTeamSelect ? adminTeamSelect.value : '';
      if(!teamId) return;
      const t = findTeam(teamId);
      if(!t) return;
      const pid = adminRosterSelect ? adminRosterSelect.value : '';
      if(!pid) return alert('Select a player to update.');
      const p = findPlayer(teamId, pid);
      if(!p) return;

      p.name = String(adminPlayerName ? adminPlayerName.value : '').trim() || p.name;
      p.number = String(adminPlayerNumber ? adminPlayerNumber.value : '').trim() || p.number;
      p.password = String(adminPlayerPass ? adminPlayerPass.value : '').trim() || p.password;
      saveTeamsToLocal(teamId, p.playerId);

      if (typeof refreshTeamsUIAll === 'function') refreshTeamsUIAll();
      adminRefreshAll();
      adminRefreshRosterSelect();
      if (adminRosterSelect) adminRosterSelect.value = p.playerId;
      adminSetPlayerFieldsFromSelection();
    });
  }

  if (adminPlayerRemoveBtn){
    adminPlayerRemoveBtn.addEventListener('click', ()=>{
      const teamId = adminTeamSelect ? adminTeamSelect.value : '';
      if(!teamId) return;
      const pid = adminRosterSelect ? adminRosterSelect.value : '';
      if(!pid) return;
      if(!confirm('Archive this player? Historical results will be preserved.')) return;
      removePlayer(teamId, pid);

      if (typeof refreshTeamsUIAll === 'function') refreshTeamsUIAll();
      adminRefreshAll();
      adminRefreshRosterSelect();
      if (adminRosterSelect) adminRosterSelect.value = '';
      adminSetPlayerFieldsFromSelection();
    });
  }

  // Initialize hidden state
  adminSetMode(false);
  // @diq:end [A_ADMIN] Admin tools


// @diq:begin [A_RESETSTARTS_DELEGATE] Reset Starts delegated click
// Robust to DOM moves / collapsible wrappers.
document.addEventListener('click', (e)=>{
  const btn = e.target && e.target.closest ? e.target.closest('#resetStartsBtn') : null;
  if(!btn) return;
  // Prefer existing handler if one is wired on the element.
  // If not, fall back to calling the same reset function used elsewhere.
  try{
    if(typeof resetPlayerStarts === 'function') { resetPlayerStarts(); return; }
    if(typeof resetStarts === 'function') { resetStarts(); return; }
    // last-resort: trigger click on the element (if a listener exists)
    btn.click();
  } catch(_err){
    console.error('[ResetStarts] failed', _err);
  }
});
// @diq:end [A_RESETSTARTS_DELEGATE] Reset Starts delegated click
