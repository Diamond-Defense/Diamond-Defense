// @diq:begin [A_ADMIN] Admin tools
  let adminUnlocked = false;

  const adminCollapseAllBtn = document.getElementById('adminCollapseAllBtn');
  const adminExpandAllBtn = document.getElementById('adminExpandAllBtn');

  const adminTeamsSubsec = document.getElementById('adminTeamsSubsec');
  const adminTeamsDownloadBtn = document.getElementById('adminTeamsDownloadBtn');
  const adminTeamsCopyBtn = document.getElementById('adminTeamsCopyBtn');
  const adminTeamsImportBtn = document.getElementById('adminTeamsImportBtn');
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
    }
  }

  async function tryUnlockAdmin(){
    if (!adminPwInput) return;
    const valid = (typeof authenticateStaff === 'function')
      ? await authenticateStaff('admin', adminPwInput.value)
      : adminPwInput.value === ADMIN_PASSWORD;
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
    const p = (t && pid) ? findPlayer(t, pid) : null;

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

  if (adminTeamsDownloadBtn){
    adminTeamsDownloadBtn.addEventListener('click', ()=>{ downloadJson('teams.json', TEAMS); });
  }
  if (adminTeamsCopyBtn){
    adminTeamsCopyBtn.addEventListener('click', ()=>{
      const txt = JSON.stringify(TEAMS, null, 2);
      copyTextToClipboard(txt)
        .then(()=> alert('Teams JSON copied.'))
        .catch(()=> alert('Clipboard copy failed. Use Download teams.json instead.'));
    });
  }

  if (adminTeamsImportBtn){
    adminTeamsImportBtn.addEventListener('click', ()=>{
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json,application/json';
      inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.addEventListener('change', async ()=>{
        try{
          const f = inp.files && inp.files[0];
          if(!f) return;
          const txt = await f.text();
          const parsed = JSON.parse(txt);
          if (!parsed || !parsed.teams || !Array.isArray(parsed.teams)) throw new Error('Expected JSON with { teams: [...] }');
          TEAMS = normalizeTeamsData(parsed);
          saveTeamsToLocal();
          if (typeof refreshTeamsUIAll === 'function') refreshTeamsUIAll();
          adminRefreshAll();
          alert('Imported teams JSON.');
        }catch(err){
          alert('Import failed: ' + (err && err.message ? err.message : String(err)));
        } finally {
          try{ document.body.removeChild(inp); }catch(_e){}
        }
      }, { once:true });
      inp.click();
    });
  }

  if (adminTeamsResetBtn){
    adminTeamsResetBtn.addEventListener('click', async ()=>{
      if(!confirm('Clear locally saved teams (does not affect teams.json on disk)?')) return;
      try{ localStorage.removeItem(TEAMS_STORAGE_KEY); }catch(_e){}
      if (typeof loadTeamsFromJson === 'function'){
        try{ await loadTeamsFromJson(); }catch(_e){}
      }
      if (typeof refreshTeamsUIAll === 'function') refreshTeamsUIAll();
      adminRefreshAll();
      alert('Local teams cleared.');
    });
  }

  // Admin CSV (v3) import/export
  const adminTeamsCsvFile = document.getElementById('adminTeamsCsvFile');
  const adminTeamsCsvUploadBtn = document.getElementById('adminTeamsCsvUploadBtn');
  const adminTeamsCsvTemplateBtn = document.getElementById('adminTeamsCsvTemplateBtn');
  const adminTeamsCsvSelectedBtn = document.getElementById('adminTeamsCsvSelectedBtn');

  // Admin SITUATIONS import/merge
  const adminSituationsJsonFile = document.getElementById('adminSituationsJsonFile');
  const adminSituationsJsonUploadBtn = document.getElementById('adminSituationsJsonUploadBtn');
  const adminSituationsMsg = document.getElementById('adminSituationsMsg');


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
  if(adminSituationsJsonUploadBtn && adminSituationsJsonFile){
    adminSituationsJsonUploadBtn.addEventListener('click', ()=> adminSituationsJsonFile.click());
    adminSituationsJsonFile.addEventListener('change', async ()=>{
      const files = adminSituationsJsonFile.files ? Array.from(adminSituationsJsonFile.files) : [];
      if(!files.length) return;

      let addedTotal = 0, updatedTotal = 0;
      try{
        for(const f of files){
          const txt = await f.text();
          const parsed = JSON.parse(txt);
          const res = mergeSituationsFromArray(parsed);
          addedTotal += res.added || 0;
          updatedTotal += res.updated || 0;
        }

        // Refresh snapshots + dropdown + currently selected situation
        snapshotSituationsOrig();
        const keepKey = (currentSituation && currentSituation.key) ? currentSituation.key : (SITUATIONS[0] && SITUATIONS[0].key);
        populateSituations(keepKey);
        if (keepKey) setSituation(keepKey);

        if(adminSituationsMsg){
          adminSituationsMsg.textContent = `Merged situations. Added: ${addedTotal}. Updated: ${updatedTotal}.`;
          setTimeout(()=>{ if(adminSituationsMsg) adminSituationsMsg.textContent=''; }, 4000);
        }else{
          alert(`Merged situations. Added: ${addedTotal}. Updated: ${updatedTotal}.`);
        }
      }catch(err){
        alert('Situations import failed: ' + (err && err.message ? err.message : String(err)));
      }finally{
        try{ adminSituationsJsonFile.value = ''; }catch(_e){}
      }
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
      const newId = slugifyLoose(newName) || teamId;
      const newEmail = String(adminTeamEmail ? adminTeamEmail.value : '').trim();

      if(newId !== teamId){
        // migrate (match coach tools behavior)
        const migrated = { id: newId, name: newName, coachEmail: newEmail, roster: deepClone(old.roster || []) };
        migrated.roster.forEach(p=>{
          p.playerId = buildPlayerIdForTeam(migrated.name, p.name, p.number, p.baseId);
        });
        removeTeam(teamId);
        TEAMS.teams.push(migrated);
      }else{
        old.name = newName || old.name;
        old.coachEmail = newEmail;
        (old.roster||[]).forEach(p=>{
          p.playerId = buildPlayerIdForTeam(old.name, p.name, p.number, p.baseId);
        });
      }

      TEAMS.teams = TEAMS.teams.sort((a,b)=> (a.name||"").localeCompare(b.name||""));
      saveTeamsToLocal();
      if (typeof refreshTeamsUIAll === 'function') refreshTeamsUIAll();
      adminRefreshAll();
      if (adminTeamSelect) adminTeamSelect.value = newId;
      adminSetTeamFieldsFromSelection();
    });
  }

  if (adminTeamRemoveBtn){
    adminTeamRemoveBtn.addEventListener('click', ()=>{
      const teamId = adminTeamSelect ? adminTeamSelect.value : '';
      if(!teamId) return;
      if(!confirm('Remove this team and all players?')) return;
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
      const p = findPlayer(t, pid);
      if(!p) return;

      p.name = String(adminPlayerName ? adminPlayerName.value : '').trim() || p.name;
      p.number = String(adminPlayerNumber ? adminPlayerNumber.value : '').trim() || p.number;
      p.password = String(adminPlayerPass ? adminPlayerPass.value : '').trim() || p.password;
      p.playerId = buildPlayerIdForTeam(t.name, p.name, p.number, p.baseId);
      saveTeamsToLocal();

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
      if(!confirm('Remove this player?')) return;
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
