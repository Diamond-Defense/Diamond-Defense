// Database-backed administrator workspace.
(() => {
  const byId = (id) => document.getElementById(id);
  const adminCard = byId('adminCard');
  if (!adminCard) return;
  const adminWorkspace = byId('adminWorkspace');
  const fieldCard = document.querySelector('.field-card');
  const adminViews = Array.from(document.querySelectorAll('[data-admin-view]'));
  const mainWorkspaceViews = adminViews.filter(
    (view) => view.dataset.adminView !== 'situations',
  );
  mainWorkspaceViews.forEach((view) => adminWorkspace?.appendChild(view));
  const orgIcons={teams:'M3 21V3h12v18 M15 9h6v12 M7 7h4 M7 11h4 M7 15h4 M7 19h4 M18 13h1 M18 17h1',people:'M2 21a8 8 0 0 1 10.43-7.62 M15 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0 M22 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M16.88 18.12 14 21 M15 20l1 1',recovery:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4.93 4.93l4.24 4.24 M14.83 14.83l4.24 4.24 M14.83 9.17l4.24-4.24 M4.93 19.07l4.24-4.24'};
  adminCard.querySelectorAll('[data-admin-tab]').forEach(button=>{
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',orgIcons[button.dataset.adminTab]);svg.append(path);button.prepend(svg);
  });
  function syncOrgShell(){document.body.classList.toggle('org-redesign-open',!adminCard.classList.contains('hidden') && adminCard.dataset.workspace==='org' && !adminWorkspace.classList.contains('hidden'));}
  const orgShellObserver=new MutationObserver(syncOrgShell);
  orgShellObserver.observe(adminCard,{attributes:true,attributeFilter:['class','data-workspace']});
  orgShellObserver.observe(adminWorkspace,{attributes:true,attributeFilter:['class']});
  syncOrgShell();
  document.addEventListener('pointerdown',event=>{const picker=adminCard.querySelector('.org-context-switcher[open]');if(picker && !picker.contains(event.target))picker.open=false;});
  document.addEventListener('keydown',event=>{const picker=adminCard.querySelector('.org-context-switcher[open]');if(event.key==='Escape' && picker){picker.open=false;picker.querySelector('summary').focus();}});
  byId('orgWorkspaceRefresh').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{await loadAdminData(teamSelect?.value || '');}catch(error){setStatus(error.message,'error');}finally{button.disabled=false;}});


  let directoryLandingTab='organizations';
  const orgHeaderActions=document.createElement('div');orgHeaderActions.id='orgHeaderActions';orgHeaderActions.className='admin-actions';
  byId('orgWorkspaceRefresh').before(orgHeaderActions);
  const statusEl = byId('adminOperationStatus');
  const teamSelect = byId('adminTeamSelect');
  const newTeamButton = byId('adminNewTeamBtn');
  const teamName = byId('adminTeamName');
  const teamHeaderFields = byId('adminTeamHeaderFields');
  const initialSeasonName = byId('adminInitialSeasonName');
  const initialSeasonField = byId('adminInitialSeasonField');
  const playerSelect = byId('adminRosterSelect');
  const playerName = byId('adminPlayerName');
  const playerNumber = byId('adminPlayerNumber');
  const playerPassword = byId('adminPlayerPass');
  const coachSelect = byId('adminCoachSelect');
  const coachName = byId('adminCoachName');
  const coachPassword = byId('adminCoachPass');
  const unassignedPlayerSelect = byId('adminUnassignedPlayerSelect');
  const existingPlayerNumber = byId('adminExistingPlayerNumber');
  const transferTeamSelect = byId('adminTransferTeamSelect');
  const transferPlayerNumber = byId('adminTransferPlayerNumber');
  const transferPlayerWorkflow = byId('adminTransferPlayerWorkflow');
  const transferPlayerSummary = byId('adminTransferPlayerSummary');
  const transferPlayerGuidance = byId('adminTransferPlayerGuidance');
  const seasonSelect = byId('adminSeasonSelect');
  const cleanupSeasonSelect = byId('adminCleanupSeasonSelect');
  const seasonName = byId('adminSeasonName');
  const seasonStart = byId('adminSeasonStart');
  const seasonEnd = byId('adminSeasonEnd');
  const seasonCreateFields = byId('adminSeasonCreateFields');
  const seasonStatusBadge = byId('adminSeasonStatusBadge');
  const seasonSummary = byId('adminSeasonSummary');
  const seasonCleanupPreview = byId('adminSeasonCleanupPreview');
  const cleanupGuidance = byId('adminCleanupGuidance');
  const seasonPlayerSelect = byId('adminSeasonPlayerSelect');
  const deletePlayerSelect = byId('adminDeletePlayerSelect');
  const teamContextSummary = byId('adminTeamContextSummary');
  const advanceDestinationSelect = byId('adminAdvanceDestinationSelect');
  const advanceNewTeamFields = byId('adminAdvanceNewTeamFields');
  const advanceTeamName = byId('adminAdvanceTeamName');
  const advanceSeasonName = byId('adminAdvanceSeasonName');
  const advanceSeasonStart = byId('adminAdvanceSeasonStart');
  const advanceSeasonEnd = byId('adminAdvanceSeasonEnd');
  const advanceRosterMembers = byId('adminAdvanceRosterMembers');
  const advanceRosterList = byId('adminAdvanceRosterList');
  const advanceRosterGuidance = byId('adminAdvanceRosterGuidance');
  const advanceRosterTitle = byId('adminAdvanceRosterTitle');
  const advanceRosterSource = byId('adminAdvanceRosterSource');
  const advanceRosterLegend = byId('adminAdvanceRosterLegend');
  const archivedTeamSelect = byId('adminArchivedTeamSelect');
  const archivedMemberSelect = byId('adminArchivedMemberSelect');
  const archivedSituationSelect = byId('adminArchivedSituationSelect');
  const situationsTab = adminCard.querySelector('[data-admin-tab="situations"]');
  const proposalSelect = byId('adminProposalSelect');
  const proposalDetails = byId('adminProposalDetails');
  const proposalNotes = byId('adminProposalNotes');
  const proposalConflict = byId('adminProposalConflict');
  const proposalComparison = byId('adminProposalComparison');
  const proposalDiffList = byId('adminProposalDiffList');
  const proposalPreview = byId('adminProposalPreviewBtn');
  const outcomeReviewQueue = byId('adminOutcomeReviewQueue');
  const outcomeReviewSummary = byId('adminOutcomeReviewSummary');
  const outcomeReviewList = byId('adminOutcomeReviewList');
  const outcomeReviewNext = byId('adminOutcomeReviewNextBtn');
  const confirmDialog = byId('adminConfirmDialog');
  const confirmPanel = confirmDialog?.querySelector('.admin-confirm-panel');
  const confirmTitle = byId('adminConfirmTitle');
  const confirmMessage = byId('adminConfirmMessage');
  const confirmAction = byId('adminConfirmActionBtn');
  const confirmCancel = byId('adminConfirmCancelBtn');
  const confirmTextField = byId('adminConfirmTextField');
  const confirmTextLabel = byId('adminConfirmTextLabel');
  const confirmTextInput = byId('adminConfirmTextInput');
  if (confirmDialog?.parentElement !== document.body) {
    document.body.appendChild(confirmDialog);
  }

  let teams = [];

  let archivedSituations = [];
  let publishedSituations = [];
  let proposals = [];
  let seasons = [];
  let seasonMembers = [];
  let unassignedPlayers = [];
  let activeTab = 'teams';
  let activeTeamView = 'roster';
  let cleanupPreviewKey = '';
  let operationInProgress = false;
  let creatingTeam = false;
  let lastAdvanceSourceTeamId = '';
  let confirmationResolver = null;
  let confirmationTrigger = null;

  function setStatus(message = '', state = '') {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `operation-status${state ? ` is-${state}` : ''}`;
  }

  function clearFieldError(input) {
    if (!input) return;
    input.removeAttribute('aria-invalid');
    const errorId = `${input.id}-error`;
    const descriptions = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(id=>id && id !== errorId);
    if(descriptions.length) input.setAttribute('aria-describedby', descriptions.join(' '));
    else input.removeAttribute('aria-describedby');
    input.closest('.field')?.querySelector('.field-error')?.remove();
  }

  function setFieldError(input, message) {
    if (!input) return false;
    clearFieldError(input);
    input.setAttribute('aria-invalid', 'true');
    const error = document.createElement('span');
    error.className = 'field-error';
    error.id = `${input.id}-error`;
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));
    error.textContent = message;
    input.closest('.field')?.appendChild(error);
    return false;
  }

  function focusFirstInvalid() {
    const invalid = adminWorkspace?.querySelector('[aria-invalid="true"]')
      || adminCard.querySelector('[aria-invalid="true"]');
    invalid?.focus();
  }

  function validateTeamFields() {
    const name = String(teamName?.value || '').trim();
    clearFieldError(teamName);
    clearFieldError(initialSeasonName);
    let valid = true;
    if (!name) valid = setFieldError(teamName, 'Enter a team name.');
    else if (name.length > 100) {
      valid = setFieldError(teamName, 'Team names must be 100 characters or fewer.');
    }
    if (!selectedTeam() && !String(initialSeasonName?.value || '').trim()) {
      valid = setFieldError(initialSeasonName, 'Enter the initial season name.');
    }
    if (!valid) focusFirstInvalid();
    return valid;
  }

  function validateMemberFields(role, { requirePassword = false } = {}) {
    const nameInput = role === 'coach' ? coachName : playerName;
    const numberInput = role === 'coach' ? null : playerNumber;
    const passwordInput = role === 'coach' ? coachPassword : playerPassword;
    const name = String(nameInput?.value || '').trim();
    const number = String(numberInput?.value || '').trim();
    const password = String(passwordInput?.value || '');
    [nameInput, numberInput, passwordInput].forEach(clearFieldError);
    let valid = true;
    if (!name) valid = setFieldError(nameInput, `Enter the ${role}'s name.`);
    else if (name.length > 100) {
      valid = setFieldError(nameInput, 'Names must be 100 characters or fewer.');
    }
    if (numberInput && !number) {
      valid = setFieldError(numberInput, 'Enter the player number.');
    } else if (numberInput && number.length > 12) {
      valid = setFieldError(numberInput, 'Player numbers must be 12 characters or fewer.');
    }
    if (requirePassword && password.length < 8) {
      valid = setFieldError(passwordInput, 'Enter a temporary password with at least 8 characters.');
    } else if (password && password.length < 8) {
      valid = setFieldError(passwordInput, 'A temporary password must contain at least 8 characters.');
    }
    if (!valid) focusFirstInvalid();
    return valid;
  }

  function closeConfirmation(confirmed) {
    confirmDialog?.classList.add('hidden');
    const resolve = confirmationResolver;
    confirmationResolver = null;
    if (confirmTextInput) confirmTextInput.value = '';
    confirmTextField?.classList.add('hidden');
    const trigger = confirmationTrigger;
    confirmationTrigger = null;
    if(trigger?.isConnected) trigger.focus();
    resolve?.(confirmed);
  }

  function requestConfirmation({ title, message, confirmLabel = 'Confirm', requiredText = '' }) {
    if (!confirmDialog) return Promise.resolve(window.confirm(message));
    if (confirmationResolver) closeConfirmation(false);
    confirmationTrigger = document.activeElement;
    if (confirmTitle) confirmTitle.textContent = title;
    if (confirmMessage) confirmMessage.textContent = message;
    if (confirmAction) {
      confirmAction.textContent = confirmLabel;
      confirmAction.disabled = Boolean(requiredText);
    }
    if (confirmTextInput) {
      confirmTextInput.value = '';
      confirmTextInput.dataset.requiredText = requiredText;
    }
    if (confirmTextLabel) confirmTextLabel.textContent = requiredText
      ? `Type “${requiredText}” to confirm`
      : 'Type the name to confirm';
    confirmTextField?.classList.toggle('hidden', !requiredText);
    confirmDialog.classList.remove('hidden');
    window.setTimeout(() => confirmPanel?.focus(), 0);
    return new Promise((resolve) => {
      confirmationResolver = resolve;
    });
  }

  confirmAction?.addEventListener('click', () => closeConfirmation(true));
  confirmTextInput?.addEventListener('input', () => {
    if (confirmAction) confirmAction.disabled = confirmTextInput.value !== confirmTextInput.dataset.requiredText;
  });
  confirmCancel?.addEventListener('click', () => closeConfirmation(false));
  confirmDialog?.querySelector('[data-admin-confirm-cancel]')?.addEventListener(
    'click',
    () => closeConfirmation(false),
  );
  confirmDialog?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeConfirmation(false);
    }
    if (event.key === 'Tab') {
      const controls = Array.from(confirmPanel.querySelectorAll('button, input, [tabindex]'))
        .filter(el=>!el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if(first && (document.activeElement === confirmPanel || (event.shiftKey ? document.activeElement === first : document.activeElement === last))){
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
  });
  window._diqConfirmAdminAction = requestConfirmation;

  function option(value, text) {
    const item = document.createElement('option');
    item.value = value;
    item.textContent = text;
    return item;
  }

  function teamLabel(team) {
    if (!team) return '';
    if (team.displayName) return team.displayName;
    return team.activeSeasonName ? `${team.name} — ${team.activeSeasonName}` : `${team.name} — No active season`;
  }

  function seasonLabel(team, season) {
    if (!season) return '';
    const normalizedTeam = String(team?.name || '').trim().toLowerCase();
    const normalizedSeason = String(season.name || '').trim().toLowerCase();
    return normalizedTeam && normalizedSeason.startsWith(normalizedTeam)
      ? season.name
      : `${team?.name || ''} — ${season.name}`;
  }

  function setEnabled(elements, enabled) {
    elements.forEach((element) => {
      if (element) element.disabled = !enabled;
    });
  }

  function setVisible(element, visible) {
    if (!element) return;
    element.classList.toggle('hidden', !visible);
    element.setAttribute('aria-hidden', String(!visible));
  }

  function selectedTeam() {
    const id = String(teamSelect?.value || '');
    return teams.find((team) => team.id === id) || null;
  }

  function selectedMember(role) {
    const select = role === 'coach' ? coachSelect : playerSelect;
    const id = String(select?.value || '');
    return (
      selectedTeam()?.roster?.find(
        (member) =>
          member.playerId === id &&
          member.role === role &&
          member.active !== false,
      ) || null
    );
  }

  function selectedSeason() {
    const id = String(seasonSelect?.value || '');
    return seasons.find((season) => season.id === id) || null;
  }

  function selectedCleanupSeason() {
    const id = String(cleanupSeasonSelect?.value || '');
    return seasons.find((season) => season.id === id && season.status !== 'active') || null;
  }

  function selectedSeasonPlayer() {
    const season = selectedCleanupSeason();
    const id = String(seasonPlayerSelect?.value || '');
    return seasonMembers.find(
      (member) => member.seasonId === season?.id && member.userId === id && member.role === 'player',
    ) || null;
  }

  function selectedDeletionPlayer() {
    const id = String(deletePlayerSelect?.value || '');
    if (!id) return null;
    const member = seasonMembers.find((item) => item.userId === id && item.role === 'player');
    if (member) return member;
    const rosterMember = selectedTeam()?.roster?.find(
      (item) => item.playerId === id && item.role === 'player',
    );
    return rosterMember
      ? { userId: rosterMember.playerId, name: rosterMember.name, number: rosterMember.number || '' }
      : null;
  }

  function clearCleanupPreview() {
    cleanupPreviewKey = '';
    seasonCleanupPreview?.classList.add('hidden');
    setEnabled([byId('adminPlayerClearSeasonBtn')], false);
  }

  function renderSeasonPlayerSelect() {
    const season = selectedCleanupSeason();
    const previous = String(seasonPlayerSelect?.value || '');
    const players = seasonMembers.filter(
      (member) => member.seasonId === season?.id && member.role === 'player',
    );
    seasonPlayerSelect?.replaceChildren(option('', season ? '— Select player —' : '— Select a season first —'));
    players.forEach((member) => {
      const number = member.number ? `#${member.number} ` : '';
      const status = member.status === 'removed' ? ' · removed' : '';
      seasonPlayerSelect?.appendChild(option(member.userId, `${number}${member.name}${status}`));
    });
    if (seasonPlayerSelect) {
      seasonPlayerSelect.value = players.some((member) => member.userId === previous) ? previous : '';
    }
    setEnabled([seasonPlayerSelect], Boolean(season && players.length));
    const player = selectedSeasonPlayer();
    setEnabled([byId('adminSeasonPreviewBtn')], Boolean(season && player));
    if (cleanupGuidance) {
      cleanupGuidance.textContent = !season
        ? 'Close a season before deleting its historical player records.'
        : !players.length
          ? 'This season has no player records available for cleanup.'
          : !player
            ? 'Select a player, then preview exactly what will be deleted.'
            : 'Export the season if needed, then preview the deletion impact.';
    }
    clearCleanupPreview();
  }

  function renderCleanupControls(preferredId = '') {
    const team = selectedTeam();
    const previous = preferredId || cleanupSeasonSelect?.value || '';
    const eligible = seasons.filter((season) => season.status !== 'active');
    cleanupSeasonSelect?.replaceChildren(option('', team
      ? eligible.length ? '— Select historical season —' : '— No closed seasons —'
      : '— Select a team first —'));
    eligible.forEach((season) => cleanupSeasonSelect?.appendChild(
      option(season.id, `${season.name} · ${season.status}`),
    ));
    if (cleanupSeasonSelect) {
      cleanupSeasonSelect.value = eligible.some((season) => season.id === previous) ? previous : '';
    }
    setEnabled([cleanupSeasonSelect], Boolean(team && eligible.length));
    setEnabled([byId('adminCleanupExportBtn')], Boolean(selectedCleanupSeason()));
    renderSeasonPlayerSelect();
  }

  function renderDeletionPlayerSelect() {
    const previous = String(deletePlayerSelect?.value || '');
    const players = new Map();
    (selectedTeam()?.roster || [])
      .filter((member) => member.role === 'player')
      .forEach((member) => players.set(member.playerId, {
        userId: member.playerId,
        name: member.name,
        number: member.number || '',
      }));
    seasonMembers
      .filter((member) => member.role === 'player')
      .forEach((member) => {
        if (!players.has(member.userId)) players.set(member.userId, member);
      });
    const sorted = [...players.values()].sort((a, b) =>
      String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true })
      || String(a.name || '').localeCompare(String(b.name || '')),
    );
    deletePlayerSelect?.replaceChildren(option('', selectedTeam()
      ? sorted.length ? '— Select player account —' : '— No player accounts —'
      : '— Select a team first —'));
    sorted.forEach((player) => {
      const number = player.number ? `#${player.number} ` : '';
      deletePlayerSelect?.appendChild(option(player.userId, `${number}${player.name}`));
    });
    if (deletePlayerSelect) {
      deletePlayerSelect.value = sorted.some((player) => player.userId === previous) ? previous : '';
    }
    setEnabled([deletePlayerSelect], Boolean(selectedTeam() && sorted.length));
    setEnabled([byId('adminPlayerDeleteBtn')], Boolean(selectedDeletionPlayer()));
  }

  function renderSeasonControls(preferredId = '') {
    const team = selectedTeam();
    const previous = preferredId || seasonSelect?.value || '';
    seasonSelect?.replaceChildren(option('', team ? '— Select season —' : '— Select a team first —'));
    seasons.forEach((season) => {
      const label = `${seasonLabel(team, season)} · ${season.status}`;
      seasonSelect?.appendChild(option(season.id, label));
    });
    if (seasonSelect) {
      seasonSelect.value = seasons.some((season) => season.id === previous)
        ? previous
        : seasons.find((season) => season.status === 'active')?.id || seasons[0]?.id || '';
    }
    const season = selectedSeason();
    const hasActive = seasons.some((item) => item.status === 'active');
    setEnabled([seasonSelect], Boolean(team));
    setEnabled([seasonName, seasonStart, seasonEnd, byId('adminSeasonAddBtn')], Boolean(team) && !hasActive);
    setVisible(seasonCreateFields, Boolean(team) && !hasActive);
    setEnabled([byId('adminSeasonExportBtn')], Boolean(season));
    setEnabled([byId('adminSeasonCloseBtn')], season?.status === 'active');
    setEnabled([byId('adminSeasonDeleteBtn')], Boolean(season && season.status !== 'active'));
    setVisible(byId('adminSeasonCloseBtn'), season?.status === 'active');
    setVisible(byId('adminSeasonDeleteBtn'), Boolean(season && season.status !== 'active'));
    if (seasonStatusBadge) {
      seasonStatusBadge.textContent = season
        ? season.status[0].toUpperCase() + season.status.slice(1)
        : team ? 'No season' : 'No team selected';
      seasonStatusBadge.className = `season-status-badge${season ? ` is-${season.status}` : ''}`;
    }
    if (seasonSummary) {
      seasonSummary.replaceChildren();
      const counts = season ? [
        ['Roster', season.memberCount],
        ['Practices', season.assignmentCount],
        ['Results', season.attemptCount],
      ] : [];
      counts.forEach(([label, count]) => {
        const item = document.createElement('div');
        const labelElement = document.createElement('span');
        const countElement = document.createElement('strong');
        labelElement.textContent = label;
        countElement.textContent = String(Number(count || 0));
        item.append(labelElement, countElement);
        seasonSummary.appendChild(item);
      });
      seasonSummary.classList.toggle('hidden', !season);
    }
    renderCleanupControls();
    renderDeletionPlayerSelect();
    renderAdvanceRoster();
    renderSeasonsPage();
  }

  async function loadSeasonData(teamId, preferredId = '') {
    if (!teamId) {
      seasons = [];
      seasonMembers = [];
      renderSeasonControls();
      return;
    }
    const result = await diqApiRequest(
      `admin/teams/${encodeURIComponent(teamId)}/seasons`,
      { cache: 'no-store' },
    );
    seasons = Array.isArray(result?.seasons) ? result.seasons : [];
    seasonMembers = Array.isArray(result?.members) ? result.members : [];
    renderSeasonControls(preferredId);
    renderTeamContext();
  }

  function generatePassword() {
    return typeof genSimplePassword === 'function'
      ? genSimplePassword(12)
      : `${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}A7`;
  }

  function showAddMemberChoices(visible) {
    setVisible(byId('adminAddMemberChoices'), visible);
    byId('adminAddMember')?.setAttribute('aria-expanded', String(visible));
  }

  function closeMemberEditor(){
    const view = document.querySelector('[data-admin-team-view="roster"]');
    if (view?.dataset.memberEditor === 'csv') clearCsvPreview();
    view?.removeAttribute('data-member-editor');
    showAddMemberChoices(false);
    for(const id of ['adminPlayerPass','adminCoachPass']){const input=byId(id);if(input) input.value='';}
  }
  function openMemberEditor(role){
    const id='',resetPassword=false;
    const view=document.querySelector('[data-admin-team-view="roster"]');
    view.dataset.memberEditor=role;
    view.dataset.memberSection=resetPassword?'password':'details';
    byId(role==='coach'?'adminCoachUpdateBtn':role==='existing'?'adminAddExistingPlayerBtn':'adminPlayerUpdateBtn')?.after(byId('adminMemberCancel'));
    showAddMemberChoices(false);
    byId('adminMemberDestination').textContent = teamLabel(selectedTeam());
    const csvPanel = byId('adminCsvImportPanel');
    setVisible(csvPanel, role === 'csv');
    if (role === 'csv') {
      byId('adminMemberEditorTitle').textContent = 'Import roster CSV';
      setVisible(byId('adminCsvPlayerScope'), !isPlatformAdmin());
      byId('adminMemberEditorHeader').insertBefore(byId('adminMemberCancel'), csvPanel);
      byId('adminTeamsCsvChooseBtn').focus();
      return;
    }
    if (role === 'existing') {
      byId('adminMemberEditorTitle').textContent = 'Add existing player';
      byId('adminExistingPlayerSearch').value = '';
      renderPlayerMovement();
      byId('adminExistingPlayerSearch').focus();
      return;
    }
    const select=role==='coach'?coachSelect:playerSelect;
    select.value=id;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    const password=byId(role==='coach'?'adminCoachPass':'adminPlayerPass');
    password.value='';
    password.closest('label').classList.toggle('member-password-hidden',Boolean(id)&&!resetPassword);
    byId('adminMemberEditorTitle').textContent=resetPassword?'Reset password':id?'Edit member':`Create ${role} account`;
    const card=select.closest('.admin-record-card');
    card.querySelector('.sectionTitle').textContent=id?selectedMember(role)?.name||'Member':role==='coach'?'New coach':'New player';
    const save=byId(role==='coach'?'adminCoachUpdateBtn':'adminPlayerUpdateBtn');
    save.textContent=resetPassword?'Reset password':`Save ${role}`;
    (resetPassword?password:byId(role==='coach'?'adminCoachName':'adminPlayerName')).focus();
  }
  const selectedRosterIds = new Set();
  let rosterSelectionTeam = '';

  function updateRosterSelection() {
    const button = byId('adminRemoveSelectedMembers');
    if (!button) return;
    const count = selectedRosterIds.size;
    button.textContent = count ? `Remove selected (${count})` : 'Remove selected';
    setVisible(button, count > 0);
  }

  // Shared member actions keep routine edits in the roster context.
  function orgDialog(title,context='') {
    const active=document.activeElement;
    const opener=active?.closest('tr,.org-staff-card')?.querySelector('button.org-menu-trigger') || active;
    const dialog=document.createElement('dialog');dialog.className='org-member-dialog';
    const heading=directoryElement('h3',title);heading.id='org-dialog-'+crypto.randomUUID();dialog.setAttribute('aria-labelledby',heading.id);
    dialog.append(heading);if(context)dialog.append(directoryElement('p',context,'org-dialog-context'));
    const content=directoryElement('div','','org-dialog-content');dialog.append(content);
    document.body.append(dialog);
    dialog.addEventListener('close',()=>{dialog.remove();if(opener?.isConnected)opener.focus();else (document.querySelector('#adminTeamRecords .admin-team-view:not(.hidden) button.org-menu-trigger')||byId('adminDirectoryTitle'))?.focus();});
    dialog.showModal();return {dialog,content};
  }
  function dialogField(form,label,type='text',value='') {
    const field=directoryElement('label','','field');field.append(directoryElement('span',label));
    const input=document.createElement('input');input.className='input';input.type=type;input.value=value;field.append(input);form.append(field);return input;
  }
  function dialogForm(dialog,content,label,submit) {
    const form=document.createElement('form');const status=directoryElement('p','','operation-status');status.setAttribute('role','status');
    const actions=directoryElement('div','','admin-actions');const cancel=directoryButton('Cancel',()=>dialog.close());
    const save=directoryElement('button',label,'btn btn-brand');save.type='submit';actions.append(cancel,save);
    content.append(form);form.append(status,actions);
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(!form.reportValidity())return;
      const controls=[...form.querySelectorAll('button,input,select')];const disabled=controls.map(el=>el.disabled);
      controls.forEach(el=>el.disabled=true);status.textContent='Saving…';
      try{if(await submit(form,status,save))dialog.close();}
      catch(error){status.textContent=error.message;}
      finally{controls.forEach((el,i)=>el.disabled=disabled[i]);}
    });
    return {form,status,actions,save};
  }
  function openRosterEdit(member,passwordOnly=false,teamContext=null) {
    const team=teamContext||selectedTeam();if(!team || (member.role==='coach'&&!isPlatformAdmin()))return;
    const {dialog,content}=orgDialog(passwordOnly?'Reset password':'Edit details',`${member.name} · ${teamLabel(team)}`);
    let name,number,password;
    const {form,status}=dialogForm(dialog,content,passwordOnly?'Reset password':'Save changes',async()=>{
      const body={name:passwordOnly?member.name:name.value.trim(),number:member.role==='player'?(passwordOnly?member.number:number.value.trim()):'',role:member.role};
      if(!body.name || (member.role==='player'&&!body.number)){status.textContent='Enter a name and player number.';return false;}
      if(passwordOnly)body.password=password.value;
      const ok=await perform(passwordOnly?'Resetting password…':'Saving member…',()=>diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}/members/${encodeURIComponent(member.playerId)}`,{
        method:'PUT',headers:{'If-Match':String(member.revision)},body:JSON.stringify(body),
      }),passwordOnly?'Password reset. The temporary password must be changed at next login.':'Member details saved.',team.id);
      if(!ok)status.textContent='Unable to save. Check the workspace status and try again.';return ok;
    });
    const fields=document.createElement('div');fields.className='org-dialog-fields';form.prepend(fields);
    if(passwordOnly){
      fields.append(directoryElement('p','The member must change this temporary password at their next sign-in.','muted'));
      password=dialogField(fields,'Temporary password','password');password.required=true;password.minLength=8;password.maxLength=1024;password.autocomplete='new-password';
      const generate=directoryButton('Generate',()=>{password.value=generatePassword();password.type='text';password.focus();});fields.append(generate);password.focus();
    }else{
      name=dialogField(fields,'Name','text',member.name);name.required=true;name.maxLength=100;
      if(member.role==='player'){number=dialogField(fields,'Jersey number','text',member.number||'');number.required=true;number.maxLength=12;}
      name.focus();
    }
  }
  async function removeRosterMember(member,teamContext=null) {
    const team=teamContext||selectedTeam();if(!team || (member.role==='coach'&&!isPlatformAdmin()))return;
    if(!await requestConfirmation({title:'Remove from team',message:`Remove ${member.name} from ${team.name}? This removes only their membership in this team. Their account, other memberships, and all historical training attempts and results remain. Current practice for this team will stop. No account deletion is needed.`,confirmLabel:'Remove from team'}))return;
    await perform('Removing membership…',()=>removeTeamMembership(team,member),'Member removed from this team. Historical results were preserved.',team.id);
  }
  function openPlayerTransfer(member,teamContext=null) {
    const source=teamContext||selectedTeam();if(!source || member.role!=='player')return;
    const {dialog,content}=orgDialog('Transfer player',`${member.name} · From ${teamLabel(source)}`);
    let reviewed=false,destination,number;
    const {form,status,save}=dialogForm(dialog,content,'Review transfer',async()=>{
      const target=teams.find(item=>item.id===destination.value);
      if(!target || !number.value.trim()){status.textContent='Choose a destination and jersey number.';return false;}
      if(!reviewed){reviewed=true;save.textContent='Transfer player';status.textContent=`Move ${member.name} to ${teamLabel(target)} as #${number.value.trim()}? Current practice will stop and active sessions will be signed out. Historical results stay with ${teamLabel(source)}.`;return false;}
      const ok=await perform('Transferring player…',()=>diqApiRequest(`admin/players/${encodeURIComponent(member.playerId)}/transfer`,{method:'POST',body:JSON.stringify({destinationTeamId:target.id,number:number.value.trim()})}),`${member.name} transferred to ${teamLabel(target)}.`,source.id);
      if(!ok)status.textContent='Transfer failed. Check the workspace status before trying again.';return ok;
    });
    const fields=directoryElement('div','','org-dialog-fields');form.prepend(fields);
    const field=directoryElement('label','Destination team and active season','field');destination=document.createElement('select');destination.required=true;destination.className='select';
    destination.append(option('','Choose destination'),...teams.filter(item=>item.id!==source.id&&item.active!==false&&item.activeSeasonId).map(item=>option(item.id,teamLabel(item))));field.append(destination);fields.append(field);
    number=dialogField(fields,'New jersey number','text',member.number||'');number.required=true;number.maxLength=12;
    for(const input of [destination,number])input.addEventListener('input',()=>{reviewed=false;save.textContent='Review transfer';status.textContent='';});
    destination.focus();
  }
  function openStaffAccessDialog(person,membershipsOnly=false) {
    const {dialog,content}=orgDialog(membershipsOnly?'Manage team memberships':'Manage access',`${person.name} · ${person.username||''}`);
    content.append(directoryElement('p',membershipsOnly?'Each team membership is separate. Removing one preserves other memberships and historical results.':'Access can come from a direct team membership or an organization or regional appointment.','muted'));
    const entries=directory.assignments.filter(item=>item.userId===person.id&&(!membershipsOnly||item.teamId));
    const list=directoryElement('div','','org-access-entries');content.append(list);
    for(const assignment of entries){
      const card=directoryElement('section','','org-access-entry');card.append(directoryElement('strong',accessRoles[assignment.role]||assignment.role),directoryElement('p',accessScope(assignment),'muted'));
      if(assignment.regionId&&entries.some(item=>item.role==='organization_director'&&item.organizationId===assignment.staffOrganizationId))card.append(directoryElement('p','Also covered by the organization appointment','muted'));
      const canManage=isPlatformAdmin()||(assignment.role!=='organization_director'&&directsOrganization(assignment.staffOrganizationId));
      if(canManage&&canDelegateDesigner(assignment.staffOrganizationId))card.append(renderDesignerSetting(person,assignment));
      if(canManage&&assignment.teamId){const actions=directoryElement('div','','org-access-membership-actions');actions.append(directoryButton('Remove team membership',()=>{dialog.close();void removeCoachMembership(person,assignment);},'btn btn-danger'));card.append(actions);}
      if(!membershipsOnly&&canManage&&assignment.stagedDirectorId)card.append(directoryButton('Remove appointment',()=>{dialog.close();void removeDirectorAppointment(person,assignment);},'btn btn-danger'));
      list.append(card);
    }
    if(!entries.length)list.append(directoryElement('p','No matching assignments.','muted'));
    if(isPlatformAdmin()||window.__DIQ_AUTH_USER__?.directorScopes?.some(scope=>scope.role==='organization_director'))content.append(renderStaffAccessForm(person,()=>dialog.close(),{...(membershipsOnly?{fixedRole:'coach'}:{}),onSaved:()=>dialog.close()}));
    content.append(directoryButton('Close',()=>dialog.close()));
  }
  function openNewSeason() {
    const team=selectedTeam();if(!team||seasons.some(item=>item.status==='active'))return;
    const {dialog,content}=orgDialog('New season',team.name);let name,start,end;
    content.append(directoryElement('p','Start another season for this team. Current active players and coaches carry into it. To move members to a different team, use Advance roster instead.','muted'));
    const {form,status}=dialogForm(dialog,content,'Create season',async()=>{
      if(!name.value.trim()){status.textContent='Enter a season name.';return false;}
      if(start.value&&end.value&&end.value<start.value){status.textContent='End date must be on or after the start date.';return false;}
      const ok=await perform('Creating season…',()=>diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}/seasons`,{method:'POST',body:JSON.stringify({name:name.value.trim(),startsOn:start.value||null,endsOn:end.value||null})}),'Season created. Current active roster members were carried into it.',team.id);
      if(!ok)status.textContent='Unable to create the season. Check the workspace status before trying again.';return ok;
    });
    const fields=directoryElement('div','','org-dialog-fields');form.prepend(fields);
    name=dialogField(fields,'Season name');name.required=true;name.maxLength=120;name.placeholder='e.g., Spring 2029';
    const dates=directoryElement('div','','org-season-date-fields');fields.append(dates);start=dialogField(dates,'Start date (optional)','date');end=dialogField(dates,'End date (optional)','date');name.focus();
  }
  function openCloseSeason(season) {
    const team=selectedTeam();if(!team||season.status!=='active')return;
    const {dialog,content}=orgDialog('Close season',`${team.name} · ${season.name}`);
    content.append(directoryElement('p','Players will stop receiving this season’s practice, and unfinished attempts will be marked abandoned. Historical rosters and results remain available for export and review.','muted'));
    dataImpact(content,season,[['memberCount','Members'],['assignmentCount','Practices'],['attemptCount','Results']]);
    const {status}=dialogForm(dialog,content,'Close season',async()=>{
      const ok=await perform('Closing season…',()=>diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}/seasons/${encodeURIComponent(season.id)}`,{method:'PATCH',body:JSON.stringify({action:'close'})}),'Season closed.',team.id);
      if(!ok)status.textContent='Unable to close this season. Check the workspace status and refresh.';return ok;
    });
  }
  function openSeasonDeletion(season) {
    const team=selectedTeam();if(!isPlatformAdmin()||!team||season.status==='active')return;
    const {dialog,content}=orgDialog('Delete closed season',`${team.name} · ${season.name}`);
    content.append(directoryElement('p','This permanently deletes this season and its roster snapshots, practices, progress, and results. Export the season before deleting if you need to retain its history. Player accounts remain.','muted'));
    dataImpact(content,season,[['memberCount','Members'],['assignmentCount','Practices'],['attemptCount','Results']]);let confirmation;
    const {form,status,save}=dialogForm(dialog,content,'Delete season',async()=>{
      if(confirmation.value!==season.name){status.textContent='Enter the exact season name.';return false;}
      const ok=await perform('Deleting season…',()=>diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}/seasons/${encodeURIComponent(season.id)}`,{method:'DELETE',body:JSON.stringify({confirmation:season.name})}),'Season permanently deleted.',team.id);
      if(!ok)status.textContent='Unable to delete the season. Check the workspace status before trying again.';return ok;
    });save.className='btn btn-danger btn-danger-strong';const fields=directoryElement('div','','org-dialog-fields');form.prepend(fields);confirmation=dialogField(fields,`Type “${season.name}” to confirm`);confirmation.required=true;confirmation.autocomplete='off';save.disabled=true;confirmation.addEventListener('input',()=>save.disabled=confirmation.value!==season.name);confirmation.focus();
  }
  function openAdvanceWizard(season) {
    const source=selectedTeam();if(!isPlatformAdmin()||!source||seasons.some(item=>item.status==='active'))return;
    const {dialog,content}=orgDialog('Advance roster',`${source.name} · ${season.name}`);dialog.classList.add('org-advance-dialog');
    content.append(directoryElement('p','Move selected current members to another team. Their historical results remain with the original team and season.','muted'));
    const steps=directoryElement('ol','','org-wizard-steps');for(const label of ['Destination','Members','Review'])steps.append(directoryElement('li',label));content.append(steps);
    const panels=[0,1,2].map(()=>directoryElement('section','','org-wizard-panel'));content.append(...panels);
    const field=directoryElement('label','Destination','field');const destination=document.createElement('select');destination.className='select';
    destination.append(option('new','Create the next age-level team'),...teams.filter(item=>item.id!==source.id&&item.active!==false&&item.activeSeasonId).map(item=>option(item.id,teamLabel(item))));field.append(destination);panels[0].append(field);
    const newFields=directoryElement('div','','org-dialog-fields');panels[0].append(newFields);
    const teamName=dialogField(newFields,'New team name','text',suggestedNextAgeTeamName(source.name));teamName.required=true;teamName.maxLength=100;
    const seasonName=dialogField(newFields,'First season name');seasonName.required=true;seasonName.maxLength=120;seasonName.placeholder='e.g., Spring 2029';
    const dates=directoryElement('div','','org-season-date-fields');newFields.append(dates);const starts=dialogField(dates,'Start date (optional)','date'),ends=dialogField(dates,'End date (optional)','date');
    const targetContext=directoryElement('p','','muted');panels[0].append(targetContext);
    destination.addEventListener('change',()=>{newFields.hidden=destination.value!=='new';targetContext.textContent=destination.value==='new'?'A new team and its first season will be created.':`Members will join ${teamLabel(teams.find(item=>item.id===destination.value))}.`;});destination.dispatchEvent(new Event('change'));
    const members=(source.roster||[]).filter(item=>item.active!==false);const selected=new Set();const numbers=new Map(members.map(item=>[item.playerId,String(item.number||'')]));
    const filters=directoryElement('div','','org-wizard-filters');const searchField=directoryElement('label','Search members','field');const search=document.createElement('input');search.type='search';search.className='input';search.placeholder='Name or username';searchField.append(search);
    const roleField=directoryElement('label','Role','field');const role=document.createElement('select');role.className='select';role.append(option('','All members'),option('player','Players'),option('coach','Coaches'));roleField.append(role);filters.append(searchField,roleField);panels[1].append(filters);
    const toolbar=directoryElement('div','','admin-actions');const count=directoryElement('span','','muted');toolbar.append(count,directoryButton('Select matching',()=>{matching().forEach(item=>selected.add(item.playerId));drawMembers();}),directoryButton('Clear selection',()=>{selected.clear();drawMembers();}));panels[1].append(toolbar);
    const wrap=directoryElement('div','','admin-access-table-wrap');const table=document.createElement('table');table.className='org-wizard-table';table.setAttribute('aria-label','Members to advance');const header=table.createTHead().insertRow();
    for(const text of ['Select','Name','Role','New number']){const cell=document.createElement('th');cell.scope='col';cell.textContent=text;header.append(cell);}const body=table.createTBody();wrap.append(table);panels[1].append(wrap);
    function matching(){return members.filter(item=>(!role.value||item.role===role.value)&&[item.name,item.username].join(' ').toLowerCase().includes(search.value.toLowerCase()));}
    function drawMembers(){body.replaceChildren();count.textContent=`${selected.size} selected`;
      for(const member of matching()){
        const row=body.insertRow();const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(member.playerId);check.setAttribute('aria-label','Select '+member.name);row.insertCell().append(check);
        row.insertCell().textContent=member.name;row.insertCell().textContent=member.role==='coach'?'Coach':'Player';const numberCell=row.insertCell();
        if(member.role==='player'){const number=document.createElement('input');number.className='input';number.value=numbers.get(member.playerId);number.maxLength=12;number.setAttribute('aria-label','New number for '+member.name);number.addEventListener('input',()=>numbers.set(member.playerId,number.value));numberCell.append(number);}else numberCell.textContent='—';
        row.classList.toggle('is-selected',check.checked);check.addEventListener('change',()=>{if(check.checked)selected.add(member.playerId);else selected.delete(member.playerId);row.classList.toggle('is-selected',check.checked);count.textContent=`${selected.size} selected`;});
        row.addEventListener('click',event=>{if(!event.target.closest('input,button,a,select,label')){check.checked=!check.checked;check.dispatchEvent(new Event('change'));}});
      }
      if(!body.rows.length){const cell=body.insertRow().insertCell();cell.colSpan=4;cell.textContent='No matching members.';}
    }
    search.addEventListener('input',drawMembers);role.addEventListener('change',drawMembers);drawMembers();
    const status=directoryElement('p','','operation-status');status.setAttribute('role','status');content.append(status);
    const actions=directoryElement('div','','admin-actions');const cancel=directoryButton('Cancel',()=>dialog.close());const back=directoryButton('Back',()=>show(step-1));const next=directoryButton('Next',()=>void advance(),'btn btn-brand');actions.append(cancel,back,next);content.append(actions);let step=0,busy=false;
    function show(value){step=value;panels.forEach((panel,i)=>panel.hidden=i!==step);[...steps.children].forEach((item,i)=>{if(i===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});back.hidden=step===0;next.textContent=step===2?'Advance roster':step===1?'Review advancement':'Next';status.textContent='';(step===0?destination:step===1?search:next).focus();}
    function chosen(){return members.filter(item=>selected.has(item.playerId));}
    async function advance(){
      if(busy)return;
      if(step===0){if(destination.value==='new'){
        if(!teamName.value.trim()||!seasonName.value.trim()){status.textContent='Enter the new team and first season names.';return;}
        for(const input of [teamName,seasonName,starts,ends])if(!input.reportValidity())return;
        if(starts.value&&ends.value&&ends.value<starts.value){status.textContent='End date must be on or after the start date.';return;}
      }show(1);return;}
      if(step===1){
        if(!selected.size){status.textContent='Select at least one member.';return;}
        const used=new Set();const target=teams.find(item=>item.id===destination.value);for(const member of target?.roster||[])if(member.role==='player'&&member.active!==false)used.add(String(member.number||'').trim());
        for(const member of chosen())if(member.role==='player'){const value=numbers.get(member.playerId).trim();if(!value||used.has(value)){status.textContent='Every selected player needs a unique jersey number that is available on the destination team.';return;}used.add(value);}
        panels[2].replaceChildren(directoryElement('h4','Review advancement'),directoryElement('p',`From ${source.name} to ${destination.value==='new'?teamName.value.trim()+' — '+seasonName.value.trim():teamLabel(target)}.`));
        if(destination.value==='new'&&(starts.value||ends.value))panels[2].append(directoryElement('p',`Dates: ${starts.value||'Not set'} – ${ends.value||'Not set'}`,'muted'));
        const list=document.createElement('ul');for(const member of chosen())list.append(directoryElement('li',`${member.name} · ${member.role==='coach'?'Coach':'Player #'+numbers.get(member.playerId).trim()}`));panels[2].append(list,directoryElement('p','Only the selected memberships move. Historical results stay with their original season. Moved accounts will be signed out.','muted'));show(2);return;
      }
      busy=true;next.disabled=back.disabled=cancel.disabled=true;status.textContent='Advancing roster…';let destinationId=destination.value==='new'?'':destination.value;
      const ok=await perform('Advancing roster…',async()=>{
        const result=await diqApiRequest(`admin/teams/${encodeURIComponent(source.id)}/advance`,{method:'POST',body:JSON.stringify({destinationTeamId:destinationId||undefined,destinationTeamName:destinationId?undefined:teamName.value.trim(),seasonName:destinationId?undefined:seasonName.value.trim(),startsOn:destinationId?undefined:starts.value||null,endsOn:destinationId?undefined:ends.value||null,members:chosen().map(item=>({userId:item.playerId,number:item.role==='player'?numbers.get(item.playerId).trim():''}))})});destinationId=result.team?.id||destinationId;
      },'Selected roster members advanced. Historical records were preserved.',()=>destinationId);
      if(ok)dialog.close();else{busy=false;next.disabled=back.disabled=cancel.disabled=false;status.textContent='Unable to advance the roster. Check the workspace status and review your choices before retrying.';}
    }
    show(0);
  }
  function renderSeasonsPage() {
    const view=document.querySelector('[data-admin-team-view="seasons"]');if(!view)return;
    let root=byId('orgSeasonsPage');
    if(!root){const legacy=directoryElement('div','','org-seasons-legacy');legacy.hidden=true;legacy.append(...view.childNodes);view.append(legacy);root=directoryElement('div','','org-seasons-page');root.id='orgSeasonsPage';view.append(root);}
    const team=selectedTeam(),active=seasons.find(item=>item.status==='active');
    if(root.dataset.teamId!==team?.id){root.dataset.teamId=team?.id||'';delete root.dataset.seasonId;}
    root.replaceChildren();
    const detail=seasons.find(item=>item.id===root.dataset.seasonId);
    if(detail){renderSeasonDetail(root,detail);return;}
    const heading=directoryElement('div','','org-seasons-heading');const copy=directoryElement('div');copy.append(directoryElement('h3','Seasons'),directoryElement('p','Manage this team’s seasons, export records, or advance members to another team.','muted'));heading.append(copy);
    const create=directoryButton('+ New season',openNewSeason,'btn btn-brand');create.disabled=!team||Boolean(active);create.title=active?'Close the active season before starting another season.':'Start another season for this team';heading.append(create);root.append(heading);
    if(active)root.append(directoryElement('p','Close the active season to start another season or advance the roster.','org-season-hint'));
    const field=directoryElement('label','Search seasons','field org-season-search');const search=document.createElement('input');search.type='search';search.className='input';search.placeholder='Season name';field.append(search);root.append(field);
    const wrap=directoryElement('div','','admin-access-table-wrap');const table=document.createElement('table');table.className='org-seasons-table';table.setAttribute('aria-label','Team seasons');const header=table.createTHead().insertRow();for(const text of ['Season','Status','Members','Practices','Results','Actions']){const cell=document.createElement('th');cell.scope='col';cell.textContent=text;header.append(cell);}const body=table.createTBody();wrap.append(table);root.append(wrap);
    function draw(){body.replaceChildren();const matches=seasons.filter(item=>item.name.toLowerCase().includes(search.value.toLowerCase()));
      for(const season of matches){const row=body.insertRow();row.className='org-season-browse-row';row.addEventListener('click',event=>{if(!event.target.closest('button,a,input,select,[popover]'))openSeasonDetail(season.id);});const identity=row.insertCell();identity.append(directoryButton(season.name,()=>openSeasonDetail(season.id),'org-record-title'));if(season.startsOn||season.endsOn)identity.append(directoryElement('small',`${season.startsOn||'Not set'} – ${season.endsOn||'Not set'}`,'org-season-dates'));
        const badge=directoryElement('span',season.status[0].toUpperCase()+season.status.slice(1),'org-season-status is-'+season.status);row.insertCell().append(badge);for(const value of [season.memberCount,season.assignmentCount,season.attemptCount])row.insertCell().textContent=String(value||0);
        const choices=seasonActionsFor(season,true);
        row.insertCell().append(...directoryMenu(choices,'Actions for '+season.name));
      }
      if(!matches.length){const cell=body.insertRow().insertCell();cell.colSpan=6;cell.textContent=search.value?'No matching seasons.':'No seasons yet. Create a season to begin.';}
    }
    search.addEventListener('input',draw);draw();
  }
  function openSeasonDetail(id) {
    const root=byId('orgSeasonsPage');if(!root)return;root.dataset.seasonId=id;renderSeasonsPage();byId('orgSeasonDetailTitle')?.focus();
  }
  function seasonActionsFor(season,includeOpen=false) {
    const choices=[];if(includeOpen)choices.push(directoryButton('Open season',()=>openSeasonDetail(season.id)));
    choices.push(directoryButton('Export',()=>exportSeasonData(season)));
    if(season.status==='active')choices.push(directoryButton('Close season',()=>openCloseSeason(season)));
    if(isPlatformAdmin()&&!seasons.some(item=>item.status==='active')&&season.id===seasons.find(item=>item.status==='closed')?.id&&(selectedTeam()?.roster||[]).some(item=>item.active!==false))choices.push(directoryButton('Advance roster',()=>openAdvanceWizard(season)));
    if(isPlatformAdmin()&&season.status!=='active')choices.push(directoryButton('Delete closed season',()=>openSeasonDeletion(season),'btn btn-danger'));
    return choices;
  }
  function openEndParticipation(member,season,undo=false) {
    const team=selectedTeam();const current=team?.roster?.find(item=>item.playerId===member.userId&&item.active!==false);
    if(!team||!current||season.status!=='active'||current.seasonId!==season.id)return;
    if(current.role==='coach'&&!isPlatformAdmin())return;
    const {dialog,content}=orgDialog(undo?'Undo mistaken season entry':'End season participation',`${member.name} · ${season.name}`);
    content.append(directoryElement('p',undo?'This is allowed only if there are no training attempts or practice recipients for this person in the season. The season entry will be removed, current team membership ended, and the existing account kept as unassigned.':'This ends participation in this active season AND removes the current team membership. The account stays available in People as unassigned. Historical training attempts and results are retained.','muted'));
    const {status}=dialogForm(dialog,content,undo?'Undo entry':'End participation',async()=>{
      const ok=await perform('Ending participation…',()=>undo?diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}/seasons/${encodeURIComponent(season.id)}/participation`,{method:'POST',body:JSON.stringify({userId:member.userId,action:'undo'})}):removeTeamMembership(team,current),undo?'Mistaken season entry removed. The account was retained.':'Participation ended. Account and history were retained.',team.id);
      if(!ok)status.textContent='Unable to change participation. Check the workspace status and refresh.';return ok;
    });
  }
  function renderSeasonDetail(root,season) {
    const heading=directoryElement('div','','org-seasons-heading');const identity=directoryElement('div');const title=directoryElement('h3',season.name);title.id='orgSeasonDetailTitle';title.tabIndex=-1;
    identity.append(title,directoryElement('p',season.status[0].toUpperCase()+season.status.slice(1),'org-season-status is-'+season.status));heading.append(identity);
    const actions=directoryElement('div','','admin-actions');actions.append(directoryButton('← Back to seasons',()=>{delete root.dataset.seasonId;renderSeasonsPage();}),...directoryMenu(seasonActionsFor(season),'Actions for '+season.name));heading.append(actions);root.append(heading);
    root.append(directoryElement('p',`${season.memberCount||0} members · ${season.assignmentCount||0} practices · ${season.attemptCount||0} results`,'muted'));
    if(season.startsOn||season.endsOn)root.append(directoryElement('p',`${season.startsOn||'Start date not set'} – ${season.endsOn||'End date not set'}`,'org-season-dates'));
    root.append(directoryElement('h4','Season roster'));
    if(season.status==='active')root.append(directoryElement('p','This season is active. Close it before deleting season records. Account and team deletion are separate actions.','org-season-hint'));
    const filters=directoryElement('div','','org-season-roster-filters');const searchField=directoryElement('label','Search season members','field');const search=document.createElement('input');search.type='search';search.className='input';search.placeholder='Name or username';searchField.append(search);filters.append(searchField);
    const roleField=directoryElement('label','Role','field');const role=document.createElement('select');role.className='select';role.append(option('','All members'),option('player','Players'),option('coach','Coaches'));roleField.append(role);filters.append(roleField);root.append(filters);
    const wrap=directoryElement('div','','admin-access-table-wrap');const table=document.createElement('table');table.className='org-data-table';table.setAttribute('aria-label','Season roster');const header=table.createTHead().insertRow();
    for(const text of ['Name','Username','Number','Role','Membership','Actions']){const cell=document.createElement('th');cell.scope='col';cell.textContent=text;header.append(cell);}const body=table.createTBody();wrap.append(table);root.append(wrap);
    function draw(){body.replaceChildren();
      const matches=seasonMembers.filter(item=>item.seasonId===season.id).map(item=>({...item,username:(selectedTeam()?.roster||[]).find(member=>member.playerId===item.userId)?.username||''})).filter(item=>(!role.value||role.value===item.role)&&[item.name,item.username].join(' ').toLowerCase().includes(search.value.toLowerCase()));
      for(const member of matches){const row=body.insertRow();for(const value of [member.name,member.username||'—',member.role==='player'?member.number||'—':'—',member.role==='coach'?'Coach':'Player',member.status==='removed'?'Removed':'Member'])row.insertCell().textContent=value;
        const actions=row.insertCell();const choices=[];
        const current=selectedTeam()?.roster?.find(item=>item.playerId===member.userId&&item.active!==false&&item.seasonId===season.id);
        if(season.status==='active'&&current&&(member.role==='player'||isPlatformAdmin())){choices.push(directoryButton('End participation',()=>openEndParticipation(member,season)));if(isPlatformAdmin())choices.push(directoryButton('Undo mistaken entry',()=>openEndParticipation(member,season,true)));}
        if(isPlatformAdmin()&&member.role==='player'&&season.status!=='active')choices.push(directoryButton('Review record deletion',()=>void openDataReview('season',member,season),'btn btn-danger'));
        if(choices.length)actions.append(...directoryMenu(choices,'Actions for '+member.name));else actions.textContent='—';
      }
      if(!matches.length){const cell=body.insertRow().insertCell();cell.colSpan=6;cell.textContent=search.value||role.value?'No matching members.':'No roster records for this season.';}
    }
    search.addEventListener('input',draw);role.addEventListener('change',draw);draw();
  }
  function dataImpact(content,counts,labels) {
    const list=directoryElement('dl','','org-data-impact');
    for(const [key,label] of labels){list.append(directoryElement('dt',label),directoryElement('dd',String(Number(counts[key]||0))));}
    content.append(list);
  }
  async function openDataReview(kind,player=null,seasonContext=null) {
    const team=selectedTeam(),season=seasonContext||selectedCleanupSeason();
    if(!isPlatformAdmin()||(kind!=='account'&&!team)||(kind==='season'&&(!season||!player||season.status==='active'))||(kind==='team'&&team.activeSeasonId))return;
    const title=kind==='season'?'Delete season records':kind==='account'?'Delete account permanently':'Delete team permanently';
    const {dialog,content}=orgDialog(title,kind==='season'?`${player.name} · ${season.name}`:kind==='account'?player.name:teamLabel(team));
    const loading=directoryElement('p','Preparing deletion review…');content.append(loading);
    try{
      let preview={};
      if(kind!=='account'){
        const url=kind==='team'?`admin/teams/${encodeURIComponent(team.id)}/deletion-preview`:`admin/teams/${encodeURIComponent(team.id)}/seasons/${encodeURIComponent(season.id)}/cleanup?playerId=${encodeURIComponent(player.userId)}`;
        const result=await diqApiRequest(url,{cache:'no-store'});preview=result.preview||{};
      }
      if(!dialog.open)return;content.replaceChildren();
      if(kind==='season'){
        content.append(directoryElement('p','This permanently deletes this player’s training attempts, results, and progress only in the selected closed season. Their account and records in other seasons remain. Export the season first if needed.','muted'));
        dataImpact(content,preview,[['memberships','Season memberships'],['assignments','Assignments'],['recipients','Practice recipients'],['progressRecords','Progress records'],['attempts','Results']]);
      }else if(kind==='account'){
        content.append(directoryElement('p','This permanently deletes the account and ALL training attempts, results, progress, memberships, and personal information across every team and season. This cannot be undone. If the player is only leaving a team, cancel and use Remove from team on the Roster tab instead.','muted'));
        const memberships=teams.filter(item=>(item.roster||[]).some(member=>member.playerId===player.userId));
        content.append(directoryElement('strong','Teams associated with this account'));
        const list=document.createElement('ul');for(const item of memberships)list.append(directoryElement('li',teamLabel(item)));content.append(list);
        if(!memberships.length)content.append(directoryElement('p','Historical account associated with this team.','muted'));
      }else{
        content.append(directoryElement('p','Deleting this team permanently removes its seasons, practice assignments, and results. This cannot be undone.','muted'));
        dataImpact(content,preview,[['seasons','Seasons'],['memberships','Membership records'],['assignments','Practice assignments'],['attempts','Results']]);
      }
      let confirmation,deletePlayers;
      const required=kind==='team'?team.name:'DELETE';
      const {form,status,save}=dialogForm(dialog,content,kind==='team'?'Delete team':kind==='account'?'Delete account permanently':'Delete season records',async()=>{
        if(confirmation.value!==required){status.textContent=`Type ${required} to confirm.`;return false;}
        const url=kind==='team'?`admin/teams/${encodeURIComponent(team.id)}/permanent`:kind==='account'?`admin/users/${encodeURIComponent(player.userId)}`:`admin/teams/${encodeURIComponent(team.id)}/seasons/${encodeURIComponent(season.id)}/cleanup`;
        const body=kind==='team'?{confirmation:team.name,deletePlayers:deletePlayers.checked}:kind==='account'?{confirmation:player.role==='coach'?'DELETE ACCOUNT PERMANENTLY':'DELETE PLAYER PERMANENTLY'}:{playerId:player.userId,confirmation:'CLEAR SEASON RECORDS'};
        const ok=await perform('Deleting records…',()=>diqApiRequest(url,{method:kind==='season'?'POST':'DELETE',body:JSON.stringify(body)}),kind==='season'?'Season records deleted. The player account was retained.':kind==='account'?'Player account permanently deleted.':'Team permanently deleted.',kind==='team'?'':team?.id||'');
        if(!ok)status.textContent='Deletion did not complete. Check the workspace status and reopen this review before retrying.';return ok;
      });
      save.className='btn btn-danger btn-danger-strong';
      const fields=directoryElement('div','','org-dialog-fields');form.prepend(fields);
      if(kind==='team'){
        const players=(team.roster||[]).filter(member=>member.role==='player'&&member.active!==false);
        const field=directoryElement('label','','org-delete-option');deletePlayers=document.createElement('input');deletePlayers.type='checkbox';deletePlayers.checked=false;
        field.append(deletePlayers,directoryElement('span','Also permanently delete the assigned player accounts listed below and all their records across every team.'));fields.append(field);
        const list=document.createElement('ul');for(const member of players)list.append(directoryElement('li',`${member.name}${member.username?' · '+member.username:''}`));fields.append(list);
        if(!players.length)fields.append(directoryElement('p','No active player accounts are assigned to this team.','muted'));
        const warning=directoryElement('p','Player accounts will become unassigned. Their records outside this team remain.','muted');fields.append(warning);
        deletePlayers.addEventListener('change',()=>{warning.textContent=deletePlayers.checked?'The listed accounts and all their records across teams will also be permanently deleted.':'Player accounts will become unassigned. Their records outside this team remain.';});
        if(Number(preview.players)!==players.length){deletePlayers.disabled=true;warning.textContent='The assigned player list has changed. Refresh the team to enable account deletion. You can still delete the team without deleting accounts.';}
      }
      confirmation=dialogField(fields,`Type “${required}” to confirm`);confirmation.required=true;confirmation.autocomplete='off';
      save.disabled=true;confirmation.addEventListener('input',()=>{save.disabled=confirmation.value!==required;});confirmation.focus();
    }catch(error){if(dialog.open){content.replaceChildren(directoryElement('p',error.message,'operation-status'),directoryButton('Close',()=>dialog.close()));}}
  }
  function renderRosterBrowser(){
    const team=selectedTeam();
    const root=byId('adminRosterBrowser');if(!root)return;
    document.querySelector('[data-admin-view="teams"]')?.classList.toggle('no-team-selected',!team);
    const members=(team?.roster||[]).filter(member=>member.active!==false);
    if (rosterSelectionTeam !== team?.id) {
      rosterSelectionTeam = team?.id;
      selectedRosterIds.clear();
    }
    const activeIds = new Set(members.map(member => member.playerId));
    for (const id of selectedRosterIds) if (!activeIds.has(id)) selectedRosterIds.delete(id);
    updateRosterSelection();
    byId('adminRosterCounts').textContent=team?`${members.filter(m=>m.role==='player').length} players · ${members.filter(m=>m.role==='coach').length} coaches`:'';
    const query=byId('adminRosterSearch').value.toLowerCase(), role=byId('adminRosterRole').value;
    const body=byId('adminRosterRows');body.replaceChildren();
    members.filter(member=>(!role||member.role===role)&&[member.name,member.username].some(value=>String(value||'').toLowerCase().includes(query))).forEach(member=>{
      const row=document.createElement('tr');row.dataset.memberId=member.playerId;row.dataset.memberRole=member.role;
      const selection = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('aria-label', `Select ${member.name}`);
      checkbox.checked = selectedRosterIds.has(member.playerId);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedRosterIds.add(member.playerId);
        else selectedRosterIds.delete(member.playerId);
        row.classList.toggle('is-selected',checkbox.checked);row.setAttribute('aria-selected',String(checkbox.checked));
        updateRosterSelection();
      });
      row.classList.toggle('is-selected',checkbox.checked);row.setAttribute('aria-selected',String(checkbox.checked));
      row.addEventListener('click',event=>{if(!checkbox.disabled&&!event.target.closest('button,a,input,select,label,[popover]')){checkbox.checked=!checkbox.checked;checkbox.dispatchEvent(new Event('change'));}});
      selection.append(checkbox);
      row.append(selection);
      [member.name,member.username||'—',member.role==='player'?member.number||'—':'—',member.role==='coach'?'Coach':'Player'].forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);});
      const actions=document.createElement('td');
      if (member.role === 'coach' && !isPlatformAdmin()) {
        checkbox.disabled = true;
        row.append(actions);
        body.append(row);
        return;
      }
      const choices=[directoryButton('Edit details',()=>openRosterEdit(member)),directoryButton('Reset password',()=>openRosterEdit(member,true))];
      const person=directory.people.find(item=>item.id===member.playerId);
      if(member.role==='player')choices.push(directoryButton('Transfer player',()=>openPlayerTransfer(member)));
      if(member.role==='coach'&&person){choices.push(directoryButton('View access',()=>openStaffAccessDialog(person)),directoryButton('Manage team memberships',()=>openStaffAccessDialog(person,true)));}
      choices.push(directoryButton('Remove from team',()=>void removeRosterMember(member),'btn btn-danger'));
      actions.append(...directoryMenu(choices,'Actions for '+member.name));
      row.appendChild(actions);body.appendChild(row);
    });
    if(!body.children.length){const row=document.createElement('tr');const cell=document.createElement('td');cell.colSpan=6;cell.textContent=members.length?'No members match these filters.':'No members yet. Select Add member to build the roster.';row.appendChild(cell);body.appendChild(row);}
  }
  const rosterView=document.querySelector('[data-admin-team-view="roster"]');
  if(rosterView){
    rosterView.querySelector('.admin-section-heading')?.remove();
    const browser=document.createElement('section');browser.id='adminRosterBrowser';browser.innerHTML=`<div class="admin-roster-toolbar"><strong id="adminRosterCounts"></strong><button id="adminRemoveSelectedMembers" class="btn btn-danger hidden" type="button">Remove selected</button><div class="admin-add-member-dropdown"><button type="button" class="btn btn-brand" id="adminAddMember" aria-haspopup="menu" aria-expanded="false" aria-controls="adminAddMemberChoices">Add member <span class="admin-add-member-chevron" aria-hidden="true"></span></button><div id="adminAddMemberChoices" class="hidden" aria-labelledby="adminAddMember" role="menu"></div></div></div><div class="admin-roster-filters"><label class="field"><span>Search members</span><input id="adminRosterSearch" type="search" placeholder="Search by name or username"></label><label class="field"><span>Role</span><select id="adminRosterRole"><option value="">All members</option><option value="player">Players</option><option value="coach">Coaches</option></select></label></div><table class="admin-roster-table"><thead><tr><th scope="col"><span class="sr-only">Select member</span></th><th>Name</th><th>Username</th><th>Number</th><th>Role</th><th>Actions</th></tr></thead><tbody id="adminRosterRows"></tbody></table>`;
    rosterView.prepend(browser);
    const editorHeader=document.createElement('div');
    editorHeader.id='adminMemberEditorHeader';
    editorHeader.innerHTML=`<div><strong id="adminMemberEditorTitle"></strong><p id="adminMemberDestination" class="muted"></p></div><button type="button" class="btn btn-ghost" id="adminMemberCancel">Cancel</button>`;
    browser.after(editorHeader);
    playerSelect.closest('.admin-record-card').dataset.memberForm='player';coachSelect.closest('.admin-record-card').dataset.memberForm='coach';
    playerSelect.closest('label').hidden=true;coachSelect.closest('label').hidden=true;
    const addMember = byId('adminAddMember');
    const choices = byId('adminAddMemberChoices');
    const dropdown = addMember.parentElement;
    const menuItems = [
      ['player', 'Create player account'],
      ['coach', 'Create coach account'],
      ['existing', 'Add existing player'],
      ['csv', 'Import roster CSV'],
    ].map(([role, label]) => {
      const item = directoryButton(label, () => openMemberEditor(role));
      item.setAttribute('role', 'menuitem');
      if (role === 'existing') item.dataset.platformRosterAction = '';
      item.tabIndex = -1;
      return item;
    });
    choices.append(...menuItems);

    const menuIsOpen = () => addMember.getAttribute('aria-expanded') === 'true';
    const availableItems = () => menuItems.filter(item => !item.classList.contains('hidden'));
    const openMenu = (last = false) => {
      showAddMemberChoices(true);
      const items = availableItems();
      items[last ? items.length - 1 : 0].focus();
    };
    addMember.onclick = () => {
      if (menuIsOpen()) showAddMemberChoices(false);
      else openMenu();
    };
    dropdown.addEventListener('keydown', event => {
      if (event.target === addMember && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        openMenu(event.key === 'ArrowUp');
        return;
      }
      if (!menuIsOpen()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        showAddMemberChoices(false);
        addMember.focus();
        return;
      }
      const items = availableItems();
      const current = items.indexOf(event.target);
      if (current < 0) return;
      const next = {
        ArrowDown: (current + 1) % items.length,
        ArrowUp: (current + items.length - 1) % items.length,
        Home: 0,
        End: items.length - 1,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      items[next].focus();
    });
    dropdown.addEventListener('focusout', event => {
      if (!dropdown.contains(event.relatedTarget)) showAddMemberChoices(false);
    });
    document.addEventListener('pointerdown', event => {
      if (menuIsOpen() && !dropdown.contains(event.target)) showAddMemberChoices(false);
    });
    byId('adminMemberCancel').onclick = () => {
      closeMemberEditor();
      addMember.focus();
    };
    byId('adminExistingPlayerSearch').oninput = renderPlayerMovement;
    byId('adminRosterSearch').oninput=renderRosterBrowser;byId('adminRosterRole').onchange=renderRosterBrowser;
    const teamSettings=document.createElement('section');teamSettings.id='adminTeamSettings';
    const settingsHeading=document.createElement('h4');settingsHeading.textContent='Team settings';teamSettings.appendChild(settingsHeading);
    editorHeader.append(byId('adminCsvImportPanel'));
    byId('adminRemoveSelectedMembers').onclick = () => void removeSelectedRosterMembers();
    byId('adminTeamContext').prepend(teamSettings);
    teamSettings.appendChild(teamHeaderFields);
    const settingsActions=document.createElement('div');settingsActions.className='admin-actions';
    for(const id of ['adminTeamUpdateBtn','adminTeamsResetBtn','adminTeamRemoveBtn'])settingsActions.appendChild(byId(id));
    teamSettings.appendChild(settingsActions);

  }

  function renderTeamSelect(preferredId = '') {
    if (!teamSelect) return;
    const previous = preferredId || teamSelect.value;
    teamSelect.replaceChildren(option('', '— Select team —'));
    teams
      .filter((team) => team.active !== false)
      .sort((a, b) => teamLabel(a).localeCompare(teamLabel(b)))
      .forEach((team) => teamSelect.appendChild(option(team.id, teamLabel(team))));
    teamSelect.value = teams.some(
      (team) => team.id === previous && team.active !== false,
    )
      ? previous
      : '';
  }

  function renderMemberSelect(role, preferredId = '') {
    const select = role === 'coach' ? coachSelect : playerSelect;
    if (!select) return;
    const previous = preferredId || select.value;
    select.replaceChildren(
      option('', `— New ${role === 'coach' ? 'coach' : 'player'} —`),
    );
    const members = (selectedTeam()?.roster || [])
      .filter((member) => member.role === role && member.active !== false)
      .sort(
        (a, b) =>
          String(a.number || '').localeCompare(String(b.number || ''), undefined, {
            numeric: true,
          }) || String(a.name || '').localeCompare(String(b.name || '')),
      );
    members.forEach((member) =>
      select.appendChild(
        option(
          member.playerId,
          role === 'player' && member.number
            ? `#${member.number} ${member.name}`
            : member.name,
        ),
      ),
    );
    select.value = members.some((member) => member.playerId === previous)
      ? previous
      : '';
  }

  function renderPlayerForm() {
    const hasTeam = Boolean(selectedTeam());
    const member = selectedMember('player');
    const addButton = byId('adminPlayerAddBtn');
    setEnabled(
      [
        playerSelect,
        playerName,
        playerNumber,
        playerPassword,
        byId('adminGenPassBtn'),
        addButton,
      ],
      hasTeam,
    );
    setVisible(addButton, hasTeam && !member);
    setVisible(byId('adminPlayerUpdateBtn'), Boolean(member));
    setEnabled(
      [byId('adminPlayerUpdateBtn'), byId('adminPlayerRemoveBtn')],
      Boolean(member),
    );
    if (playerName) playerName.value = member?.name || '';
    if (playerNumber) playerNumber.value = member?.number || '';
    if (playerPassword) playerPassword.value = '';
    if (transferPlayerNumber) transferPlayerNumber.value = member?.number || '';
    renderPlayerMovement();
  }

  function renderCoachForm() {
    const hasTeam = Boolean(selectedTeam());
    const member = selectedMember('coach');
    const addButton = byId('adminCoachAddBtn');
    setEnabled(
      [
        coachSelect,
        coachName,
        coachPassword,
        byId('adminCoachGenPassBtn'),
        addButton,
      ],
      hasTeam,
    );
    setVisible(addButton, hasTeam && !member);
    setVisible(byId('adminCoachUpdateBtn'), Boolean(member));
    setEnabled(
      [byId('adminCoachUpdateBtn'), byId('adminCoachRemoveBtn')],
      Boolean(member),
    );
    if (coachName) coachName.value = member?.name || '';
    if (coachPassword) coachPassword.value = '';
  }

  function renderPlayerMovement() {
    const team = selectedTeam();
    const previousUnassigned = String(unassignedPlayerSelect?.value || '');
    const query = byId('adminExistingPlayerSearch')?.value.trim().toLowerCase() || '';
    const candidates = unassignedPlayers.filter(player => player.role !== 'coach'
      && [player.name, player.username].some(value => value?.toLowerCase().includes(query)));
    unassignedPlayerSelect?.replaceChildren(option('', candidates.length
      ? '— Select unassigned player —'
      : query ? '— No matching players —' : '— No unassigned players —'));
    candidates.forEach((player) => {
      const history = player.previousTeams?.length
        ? ` · formerly ${player.previousTeams.join(', ')}`
        : '';
      unassignedPlayerSelect?.appendChild(option(player.userId, `${player.name}${history}`));
    });
    if (unassignedPlayerSelect) {
      unassignedPlayerSelect.value = candidates.some(
        (player) => player.userId === previousUnassigned,
      ) ? previousUnassigned : '';
    }

    const previousDestination = String(transferTeamSelect?.value || '');
    transferTeamSelect?.replaceChildren(option('', '— Select destination —'));
    teams
      .filter((item) => item.active !== false && item.id !== team?.id)
      .sort((a, b) => teamLabel(a).localeCompare(teamLabel(b)))
      .forEach((item) => transferTeamSelect?.appendChild(option(item.id, teamLabel(item))));
    if (transferTeamSelect) {
      transferTeamSelect.value = teams.some(
        (item) => item.id === previousDestination && item.id !== team?.id && item.active !== false,
      ) ? previousDestination : '';
    }

    const unassignedSelected = Boolean(unassignedPlayerSelect?.value);
    const selectedPlayer = selectedMember('player');
    setVisible(transferPlayerWorkflow, Boolean(selectedPlayer));
    if (!selectedPlayer && transferPlayerWorkflow) transferPlayerWorkflow.open = false;
    if (transferPlayerSummary) {
      transferPlayerSummary.textContent = selectedPlayer
        ? `Transfer #${selectedPlayer.number} ${selectedPlayer.name}`
        : 'Transfer selected player';
    }
    if (transferPlayerGuidance && selectedPlayer) {
      transferPlayerGuidance.textContent = `Move #${selectedPlayer.number} ${selectedPlayer.name} to another active team while preserving their historical results.`;
    }
    setEnabled([unassignedPlayerSelect], Boolean(team && candidates.length));
    setEnabled([existingPlayerNumber], Boolean(team && unassignedSelected));
    setEnabled([byId('adminAddExistingPlayerBtn')], Boolean(
      team && unassignedSelected && String(existingPlayerNumber?.value || '').trim(),
    ));
    setEnabled([transferTeamSelect], Boolean(selectedPlayer && transferTeamSelect?.options.length > 1));
    setEnabled([transferPlayerNumber], Boolean(selectedPlayer));
    setEnabled([byId('adminTransferPlayerBtn')], Boolean(
      selectedPlayer
      && transferTeamSelect?.value
      && String(transferPlayerNumber?.value || '').trim(),
    ));
  }

  function updateAdvanceRosterButton() {
    const team = selectedTeam();
    const hasActiveSeason = seasons.some((season) => season.status === 'active');
    const selectedMembers = advanceRosterList
      ? advanceRosterList.querySelectorAll('input[type="checkbox"]:checked').length
      : 0;
    const creatingTeam = !advanceDestinationSelect?.value || advanceDestinationSelect.value === 'new';
    const destinationReady = creatingTeam
      ? Boolean(String(advanceTeamName?.value || '').trim() && String(advanceSeasonName?.value || '').trim())
      : Boolean(advanceDestinationSelect?.value);
    setEnabled([byId('adminAdvanceRosterBtn')], Boolean(
      team && !hasActiveSeason && selectedMembers && destinationReady,
    ));
  }

  function suggestedNextAgeTeamName(name = '') {
    const value = String(name);
    return /\b\d{1,2}U\b/i.test(value)
      ? value.replace(/\b(\d{1,2})U\b/i, (match, age) => `${Number(age) + 1}U`)
      : '';
  }

  function renderAdvanceRoster() {
    const team = selectedTeam();
    const hasActiveSeason = seasons.some((season) => season.status === 'active');
    const available = Boolean(team && !hasActiveSeason);
    const sourceChanged = String(team?.id || '') !== lastAdvanceSourceTeamId;
    const previousDestination = sourceChanged
      ? 'new'
      : String(advanceDestinationSelect?.value || 'new');
    if (sourceChanged && advanceTeamName) {
      advanceTeamName.value = team ? suggestedNextAgeTeamName(team.name) : '';
    }
    lastAdvanceSourceTeamId = String(team?.id || '');
    const sourceSeason = selectedSeason()
      || seasons.find((season) => season.status === 'closed')
      || seasons[0];
    const sourceLabel = team
      ? `${team.name}${sourceSeason?.name ? ` — ${sourceSeason.name}` : ''}`
      : '';
    if (advanceRosterTitle) {
      advanceRosterTitle.textContent = team ? `Advance ${team.name} roster` : 'Advance roster';
    }
    if (advanceRosterSource) {
      advanceRosterSource.textContent = team ? `From: ${sourceLabel}` : 'Select a source team above.';
    }
    if (advanceRosterLegend) {
      advanceRosterLegend.textContent = team
        ? `Players and coaches moving from ${team.name}`
        : 'Select players and coaches';
    }
    advanceDestinationSelect?.replaceChildren(option('new', 'Create a new destination team'));
    teams
      .filter((item) => item.active !== false && item.id !== team?.id)
      .sort((a, b) => teamLabel(a).localeCompare(teamLabel(b)))
      .forEach((item) => advanceDestinationSelect?.appendChild(option(item.id, `Existing team: ${teamLabel(item)}`)));
    if (advanceDestinationSelect) {
      advanceDestinationSelect.value = [...advanceDestinationSelect.options].some(
        (item) => item.value === previousDestination,
      ) ? previousDestination : 'new';
    }
    const creatingTeam = !advanceDestinationSelect?.value || advanceDestinationSelect.value === 'new';
    setVisible(advanceNewTeamFields, creatingTeam);
    setEnabled([
      advanceDestinationSelect,
      advanceTeamName,
      advanceSeasonName,
      advanceSeasonStart,
      advanceSeasonEnd,
    ], available);
    if (!creatingTeam) {
      setEnabled([advanceTeamName, advanceSeasonName, advanceSeasonStart, advanceSeasonEnd], false);
    }
    if (advanceRosterMembers) advanceRosterMembers.disabled = !available;
    setEnabled([byId('adminAdvanceSelectAllBtn'), byId('adminAdvanceClearAllBtn')], Boolean(available && (team?.roster || []).some((member) => member.active !== false)));
    if (advanceRosterGuidance) {
      advanceRosterGuidance.textContent = !team
        ? 'Select a source team first.'
        : hasActiveSeason
          ? 'Close the active season before advancing this roster.'
          : 'Select the accounts that should move. Their historical results remain with the source team and season.';
    }
    advanceRosterList?.replaceChildren();
    (team?.roster || [])
      .filter((member) => member.active !== false)
      .forEach((member) => {
        const row = document.createElement('label');
        row.className = 'admin-roster-picker-row';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.advanceUserId = member.playerId;
        checkbox.disabled = !available;
        const name = document.createElement('span');
        name.textContent = `${member.role === 'coach' ? 'Coach' : `#${member.number}`} ${member.name}`;
        row.append(checkbox, name);
        if (member.role === 'player') {
          const number = document.createElement('input');
          number.type = 'text';
          number.maxLength = 12;
          number.value = member.number || '';
          number.className = 'input admin-roster-number';
          number.setAttribute('aria-label', `New number for ${member.name}`);
          number.dataset.advanceNumberFor = member.playerId;
          number.disabled = !available;
          number.addEventListener('input', updateAdvanceRosterButton);
          row.appendChild(number);
        }
        checkbox.addEventListener('change', updateAdvanceRosterButton);
        advanceRosterList.appendChild(row);
      });
    updateAdvanceRosterButton();
  }

  function renderTeamContext() {
    const team = selectedTeam();
    if (!teamContextSummary) return;
    const activeSeason = seasons.find((season) => season.status === 'active');
    const activePlayers = (team?.roster || []).filter(
      (member) => member.role === 'player' && member.active !== false,
    ).length;
    teamContextSummary.textContent = team
      ? `${activePlayers} active player${activePlayers === 1 ? '' : 's'} · ${activeSeason?.name || 'No active season'}`
      : creatingTeam
        ? 'Enter a team name and its first season, then create the team.'
        : 'Select a team to manage its roster, seasons, and records.';
  }

  function renderSelectedTeam() {
    closeMemberEditor();
    renderRosterBrowser();
    const team = selectedTeam();
    const settings=byId('adminTeamSettings');
    if(settings){settings.hidden=!creatingTeam;settings.querySelector('h4').textContent='New team details';}
    [teamName, initialSeasonName, playerName, playerNumber, playerPassword, coachName, coachPassword]
      .forEach(clearFieldError);
    if (teamName) teamName.value = team?.name || '';
    if (initialSeasonName) initialSeasonName.value = '';
    setVisible(teamHeaderFields, Boolean(team || creatingTeam));
    setVisible(initialSeasonField, creatingTeam);
    setEnabled(
      [byId('adminTeamUpdateBtn'), byId('adminTeamRemoveBtn')],
      Boolean(team),
    );
    setVisible(byId('adminTeamAddBtn'), creatingTeam);
    setVisible(byId('adminTeamCancelCreateBtn'), creatingTeam);
    setVisible(byId('adminTeamUpdateBtn'), Boolean(team));
    setVisible(byId('adminTeamRemoveBtn'), Boolean(team));
    setEnabled([byId('adminTeamDeleteBtn'), byId('adminDeleteTeamPlayers')], Boolean(team && !team.activeSeasonId));
    renderTeamContext();
    renderMemberSelect('player');
    renderMemberSelect('coach');
    renderPlayerForm();
    renderCoachForm();
    renderPlayerMovement();
    if (!team) {
      seasons = [];
      seasonMembers = [];
      renderSeasonControls();
    }
  }

  function populateRecovery() {
    archivedTeamSelect?.replaceChildren(option('', '— No archived teams —'));
    teams
      .filter((team) => team.active === false)
      .forEach((team) =>
        archivedTeamSelect?.appendChild(option(team.id, teamLabel(team) || team.id)),
      );

    archivedMemberSelect?.replaceChildren(
      option('', '— No archived members —'),
    );
    const activePlayerIds = new Set(
      teams.flatMap((team) => (team.roster || []))
        .filter((member) => member.role === 'player' && member.active !== false)
        .map((member) => member.playerId),
    );
    teams.forEach((team) => {
      (team.roster || [])
        .filter((member) => member.active === false
          && !(member.role === 'player' && activePlayerIds.has(member.playerId)))
        .forEach((member) =>
          archivedMemberSelect?.appendChild(
            option(
              `${team.id}\u0000${member.playerId}`,
              `${team.name} — ${member.role === 'coach' ? 'Coach ' : ''}${member.name}`,
            ),
          ),
        );
    });

    archivedSituationSelect?.replaceChildren(
      option('', '— No archived situations —'),
    );
    archivedSituations.forEach((situation) =>
      archivedSituationSelect?.appendChild(
        option(
          situation.key,
          window._diqSituationDisplayLabel?.(situation) || situation.title || 'Situation',
        ),
      ),
    );
  }

  function renderProposalDetails() {
    const proposal = proposals.find(
      (item) => item.id === proposalSelect?.value,
    );
    if (proposalDetails) {
      proposalDetails.textContent = proposal
        ? `${proposal.submitterName} submitted a ${proposal.submissionType} for ${proposal.situationKey} on ${new Date(proposal.createdAt).toLocaleString()}. Base revision: ${proposal.baseRevision ?? 'new situation'}.${proposal.rationale ? ` Reason: ${proposal.rationale}` : ''}`
        : 'Select a proposal to review its details.';
    }
    let summary = document.getElementById('adminProposalSummary');
    if (!summary && proposalDetails) { summary=document.createElement('div');summary.id='adminProposalSummary';summary.className='situation-summary';proposalDetails.after(summary); }
    if(summary){summary.hidden=!proposal;if(proposal)window._diqLibraryCards?.renderLibraryCardContent(summary,window._diqLibraryCards.libraryCardModel(proposal.situation),{summary:true});else summary.replaceChildren();}
    if (proposalNotes) proposalNotes.value = '';
    setEnabled(
      [byId('adminProposalApproveBtn'), byId('adminProposalRejectBtn'), proposalPreview],
      Boolean(proposal),
    );
    renderProposalComparison(proposal || null);
  }

  function renderProposals() {
    const previousSelection = proposalSelect?.value || '';
    proposalSelect?.replaceChildren();
    if (!proposals.length) {
      proposalSelect?.appendChild(option('', '— No pending proposals —'));
    }
    proposals.forEach((proposal) =>
      proposalSelect?.appendChild(
        option(
          proposal.id,
          `${proposal.submissionType === 'create' ? 'New' : 'Update'}: ${window._diqLibraryCards?.qualifiedSituationLabel(proposal.situation) || proposal.situation.title} — ${proposal.submitterName}`,
        ),
      ),
    );
    if (proposalSelect && proposals.length) {
      proposalSelect.value = proposals.some((proposal) => proposal.id === previousSelection)
        ? previousSelection
        : proposals[0].id;
    }
    const outcomeReviewCount = publishedSituations.filter(
      (situation) => situation?.playOutcome?.reviewStatus === 'needs_review',
    ).length;
    situationsTab?.classList.toggle('has-pending', proposals.length > 0);
    situationsTab?.classList.toggle('has-review-items', outcomeReviewCount > 0);
    if (situationsTab) {
      situationsTab.dataset.pendingCount = String(proposals.length);
      situationsTab.dataset.outcomeReviewCount = String(outcomeReviewCount);
      situationsTab.title = [
        proposals.length
          ? `${proposals.length} pending ${proposals.length === 1 ? 'proposal' : 'proposals'}`
          : '',
        outcomeReviewCount
          ? `${outcomeReviewCount} ${outcomeReviewCount === 1 ? 'situation needs' : 'situations need'} outcome review`
          : '',
      ].filter(Boolean).join(' · ');
    }
    renderProposalDetails();
  }

  function renderOutcomeReviewQueue() {
    if (!outcomeReviewQueue || !outcomeReviewList || !outcomeReviewSummary) return;
    const records = publishedSituations.filter(
      (situation) => situation?.playOutcome?.reviewStatus === 'needs_review',
    );
    outcomeReviewQueue.classList.toggle('hidden', records.length === 0);
    outcomeReviewSummary.textContent = records.length
      ? `${records.length} converted ${records.length === 1 ? 'situation has' : 'situations have'} conservative outcomes that must be confirmed.`
      : '';
    outcomeReviewNext?.classList.toggle('hidden', records.length < 2);
    outcomeReviewList.replaceChildren();
    const openForReview = (situation) => {
      if (!situation) return;
      transferToBoard('training-outcomes',situation,situation,'');
    };
    records.forEach((situation) => {
      const item = document.createElement('div');
      item.className = 'outcome-review-item';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-ghost btn-small';
      const label = window._diqSituationDisplayLabel?.(situation)
        || situation.displayCode
        || situation.title
        || situation.key;
      button.textContent = `Review ${label}`;
      button.dataset.situationKey = situation.key;
      button.addEventListener('click', () => openForReview(situation));
      const reason = document.createElement('span');
      let outcomeIssues = [];
      try { outcomeIssues = window._diqValidateSituationOutcomes?.(clone(situation)) || []; } catch (_error) {}
      reason.textContent = outcomeIssues.length
        ? outcomeIssues.map((issue) => issue.message).join(' ')
        : Number(situation.batterAdvance || 0) === 0
          ? 'The legacy situation did not define explicit batter and runner advancement.'
          : 'The converted play and runner results have not been explicitly confirmed.';
      item.append(button, reason);
      outcomeReviewList.appendChild(item);
    });
    if (outcomeReviewNext) {
      outcomeReviewNext.onclick = () => {
        const currentKey = window._diqGetCurrentSituationSnapshot?.()?.key;
        const currentIndex = records.findIndex((situation) => situation.key === currentKey);
        openForReview(records[(currentIndex + 1 + records.length) % records.length]);
      };
    }
  }

  async function refreshPublicTeams() {
    if (typeof loadTeamsFromJson === 'function') await loadTeamsFromJson();
    if (typeof refreshTeamsUIAll === 'function') refreshTeamsUIAll();
  }

  const directoryStatus = byId('adminDirectoryStatus');
  const directoryForm = byId('adminDirectoryForm');
  const peopleSearch = byId('adminPeopleSearch');
  let directory = { organizations: [], regions: [], teams: [], people: [], assignments: [] };
  let directoryScope = null;
  let directoryAccountId = '';
  const isPlatformAdmin = () => window.__DIQ_AUTH_USER__?.role === 'admin';
  const directsOrganization = id => window.__DIQ_AUTH_USER__?.directorScopes?.some(
    scope => scope.role === 'organization_director' && scope.organizationId === id);

  const peopleOrganization = byId('adminPeopleOrganization');
  const canManagePeople = () => isPlatformAdmin() || window.__DIQ_AUTH_USER__?.directorScopes?.some(
    scope => ['organization_director','regional_director'].includes(scope.role));
  const canDelegateDesigner = organizationId => isPlatformAdmin()
    || directory.designerOrganizationIds?.includes(organizationId);
  peopleOrganization?.addEventListener('change', () => {
    selectedPersonId = '';
    renderPeopleDirectory();
  });

  const directoryQueries = new Map();
  let unassignedTeamsOpen = false;
  let selectedPersonId = '';

  function directoryElement(tag, content, className = '') {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = content;
    return element;
  }

  function directoryButton(label, action, className = 'btn btn-ghost') {
    const button = directoryElement('button', label, className);
    button.type = 'button';
    button.addEventListener('click', action);
    return button;
  }

  function regionPath(id) {
    const region = directory.regions.find(item => item.id === id);
    if (!region) return 'Unassigned teams';
    const organization = directory.organizations.find(item => item.id === region.organizationId);
    return [organization?.name, region.name].filter(Boolean).join(' / ');
  }

  function openDirectoryPerson(person) {openPeoplePerson(person);}

  function browseDirectory(scope, teamId = '') {
    adminCard.querySelector('.org-context-switcher').open=false;
    if(!scope && !teamId)directoryLandingTab='organizations';
    directoryScope = scope;
    directoryStatus.textContent = '';
    teamSelect.value = teamId;
    teamSelect.dispatchEvent(new Event('change'));
    byId('adminDirectoryTitle').focus();
  }

  function directoryList(container, title, records, describe, open, empty, selectedId) {
    const section = directoryElement('section', '', 'admin-directory-group');
    if (title) section.append(directoryElement('h4', title));
    if (!records.length) section.append(directoryElement('p', empty, 'muted'));
    else {
      const list = directoryElement('ul', '', 'admin-directory-list');
      records.forEach(record => {
        const row = directoryElement('li', '');
        const button = directoryButton(record.name, () => open(record));
        if (record.id === selectedId) button.setAttribute('aria-current', 'true');
        const subtitle = describe(record);
        if (subtitle) button.append(directoryElement('small', subtitle));
        row.append(button);
        list.append(row);
      });
      section.append(list);
    }
    container.append(section);
  }

  const accessRoles = {
    coach: 'Coach',
    organization_director: 'Organization Director',
    regional_director: 'Regional Director',
  };

  function accessScope(assignment) {
    if (assignment.teamId) {
      const team = directory.teams.find(item => item.id === assignment.teamId);
      return team ? (team.regionId ? `${regionPath(team.regionId)} / ${team.name}` : `${team.name} · Unassigned`) : '';
    }
    if (assignment.regionId) return regionPath(assignment.regionId);
    return directory.organizations.find(item => item.id === assignment.organizationId)?.name || 'Platform';
  }

  function openTeamFromAccess(teamId) {
    browseDirectory(null, teamId);
    switchTab('teams');
  }

  async function removeCoachMembership(person, assignment) {
    if (!await requestConfirmation({
      title: 'Remove Coach assignment',
      message: `Remove ${person.name} from ${accessScope(assignment)}?`,
      confirmLabel: 'Remove assignment',
    })) return;
    try {
      await diqApiRequest('admin/workspace-directory', {
        method: 'POST',
        body: JSON.stringify({ action: 'remove_coach', userId: person.id, scopeId: assignment.teamId }),
      });
      await loadAdminData(selectedTeam()?.id || '');
      setStatus('Coach assignment removed.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function removeDirectorAppointment(person, assignment) {
    if (!await requestConfirmation({
      title: 'Remove director appointment',
      message: `Remove ${person.name} as ${accessRoles[assignment.role]} for ${accessScope(assignment)}?`,
      confirmLabel: 'Remove appointment',
    })) return;
    try {
      await diqApiRequest('admin/workspace-directory', {
        method: 'POST',
        body: JSON.stringify({ action: 'remove_staged_director', assignmentId: assignment.stagedDirectorId }),
      });
      await loadWorkspaceDirectory();
      setStatus('Director appointment removed.', 'success');
      byId('adminPersonTitle')?.focus();
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  function designerSwitch(label) {
    const pill = directoryElement('span', '', 'admin-designer-switch');
    const input = directoryElement('input', '');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.setAttribute('aria-label', label);
    const states = directoryElement('span', '', 'admin-designer-switch-states');
    states.setAttribute('aria-hidden', 'true');
    states.append(directoryElement('span', 'Off'), directoryElement('span', 'On'));
    pill.append(input, states);
    return { input, pill };
  }

  function renderDesignerSetting(person, assignment) {
    const setting = directoryElement('div', '', 'org-designer-permission');
    const label = directoryElement('label', '', 'admin-designer-setting');
    const { input, pill } = designerSwitch(`Situation Designer access for ${accessRoles[assignment.role]} · ${accessScope(assignment)}`);
    input.checked = Boolean(assignment.canDesign);
    const feedback = directoryElement('span', '', 'operation-status');
    feedback.setAttribute('role', 'status');
    label.append(directoryElement('strong', 'Situation Designer access'), pill, feedback);
    setting.append(label, directoryElement('p', 'Allows this staff member to create and edit situations. Changes save automatically.', 'muted'));
    input.addEventListener('change', async () => {
      const canDesign = input.checked;
      feedback.textContent = 'Saving…';feedback.className = 'operation-status';
      input.disabled = true;
      try {
        await diqApiRequest('admin/workspace-directory', {
          method: 'POST',
          body: JSON.stringify({
            action: 'stage_access',
            userId: person.id,
            role: assignment.role,
            scopeId: assignment.teamId || assignment.regionId || assignment.organizationId,
            assignmentId: assignment.stagedDirectorId || undefined,
            canDesign,
          }),
        });
        assignment.canDesign = canDesign;
        feedback.textContent = 'Saved';feedback.className = 'operation-status is-success';
      } catch (error) {
        input.checked = Boolean(assignment.canDesign);
        feedback.textContent = error.message;feedback.className = 'operation-status is-error';
      } finally {
        const restoreFocus = document.activeElement === document.body;
        input.disabled = false;
        if (restoreFocus && input.isConnected) input.focus();
      }
    });
    return setting;
  }

  function accountCurrentMemberships(person) {
    return (directory.accountMemberships||[]).filter(item=>item.userId===person.id&&Boolean(item.active));
  }
  function accountState(person) {
    if(!Number(person.active))return 'Archived';
    return accountCurrentMemberships(person).length||directory.assignments.some(item=>item.userId===person.id)?'Assigned':'Unassigned';
  }
  function openAccountEdit(person,passwordOnly=false) {
    const current=accountCurrentMemberships(person)[0];const team=teams.find(item=>item.id===current?.teamId);
    const member=team?.roster?.find(item=>item.playerId===person.id&&item.active!==false);
    if(member){openRosterEdit(member,passwordOnly,team);return;}
    if(!isPlatformAdmin())return;
    const {dialog,content}=orgDialog(passwordOnly?'Reset password':'Edit details',`${person.name} · ${person.username}`);let input;
    const {form,status}=dialogForm(dialog,content,passwordOnly?'Reset password':'Save changes',async()=>{
      const value=passwordOnly?input.value:input.value.trim();if(!value){status.textContent='Enter a value.';return false;}
      const ok=await perform('Updating account…',()=>diqApiRequest(`admin/users/${encodeURIComponent(person.id)}/lifecycle`,{method:'POST',body:JSON.stringify({action:passwordOnly?'password':'details',revision:Number(person.revision),...(passwordOnly?{password:value}:{name:value})})}),passwordOnly?'Temporary password reset. The account must change it at next login.':'Account updated.',selectedTeam()?.id||'');
      if(!ok)status.textContent='Unable to update. Refresh People before retrying.';return ok;
    });const fields=directoryElement('div','','org-dialog-fields');form.prepend(fields);input=dialogField(fields,passwordOnly?'Temporary password':'Name',passwordOnly?'password':'text',passwordOnly?'':person.name);input.required=true;input.maxLength=passwordOnly?1024:100;if(passwordOnly){input.minLength=8;input.autocomplete='new-password';fields.append(directoryButton('Generate',()=>{input.value=generatePassword();input.type='text';}));}input.focus();
  }
  function openAccountLifecycle(person,restore=false) {
    if(!isPlatformAdmin())return;
    const {dialog,content}=orgDialog(restore?'Restore account':'Archive account',person.name);
    content.append(directoryElement('p',restore?'Restore sign-in access without reactivating an old team membership. Assign this account to a current team separately.':'Disable sign-in and end current team memberships. The account and historical training attempts remain. This can be reversed from People → Archived. Staff appointments and owned practices must be resolved first.','muted'));
    const {status}=dialogForm(dialog,content,restore?'Restore account':'Archive account',async()=>{
      const ok=await perform(restore?'Restoring account…':'Archiving account…',()=>diqApiRequest(`admin/users/${encodeURIComponent(person.id)}/lifecycle`,{method:'POST',body:JSON.stringify({action:restore?'restore':'archive',revision:Number(person.revision)})}),restore?'Account restored. Assign a current team from People if needed.':'Account archived. History was preserved.',selectedTeam()?.id||'');
      if(!ok)status.textContent='Unable to change this account. Check the workspace status and refresh People.';return ok;
    });
  }
  function openAccountAssignment(person) {
    if(!isPlatformAdmin()||accountState(person)==='Archived')return;
    if(person.role==='player'&&accountCurrentMemberships(person).length)return;
    const {dialog,content}=orgDialog('Assign to team',`${person.name} · Existing account`);let destination,number;
    const {form,status}=dialogForm(dialog,content,'Assign to team',async()=>{
      const target=teams.find(item=>item.id===destination.value);if(!target){status.textContent='Choose a team with an active season.';return false;}
      const ok=await perform('Assigning account…',()=>diqApiRequest(`admin/teams/${encodeURIComponent(target.id)}/members/existing`,{method:'POST',body:JSON.stringify({userId:person.id,number:person.role==='player'?number.value.trim():''})}),`${person.name} assigned to ${target.name}. Existing history was preserved.`,selectedTeam()?.id||'');
      if(!ok)status.textContent='Unable to assign this account. Check the workspace status.';return ok;
    });const fields=directoryElement('div','','org-dialog-fields');form.prepend(fields);const field=directoryElement('label','Team and active season','field');destination=document.createElement('select');destination.className='select';destination.required=true;destination.append(option('','Choose team'),...teams.filter(item=>item.active!==false&&item.activeSeasonId&&!accountCurrentMemberships(person).some(member=>member.teamId===item.id)).map(item=>option(item.id,teamLabel(item))));field.append(destination);fields.append(field);if(person.role==='player'){number=dialogField(fields,'Jersey number');number.required=true;number.maxLength=12;}destination.focus();
  }
  function openPeoplePerson(person) {
    const account=(directory.accounts||[]).find(item=>item.id===person.id)||person;
    const {dialog,content}=orgDialog(account.name,`${account.username||''} · ${account.role==='player'?'Player':'Staff'} · ${accountState(account)}`);
    const memberships=(directory.accountMemberships||[]).filter(item=>item.userId===account.id);
    const current=accountCurrentMemberships(account);content.append(directoryElement('p',account.role==='player'?'Players have one current team. Previous team and season records remain as history.':'Staff may have multiple team memberships and director appointments.','muted'));
    const actions=directoryElement('div','','org-person-actions');content.append(actions);
    const launch=fn=>()=>{dialog.close();fn();};
    if(isPlatformAdmin()||(account.role==='player'&&current.some(item=>teams.some(team=>team.id===item.teamId)))){actions.append(directoryButton('Edit details',launch(()=>openAccountEdit(account))),directoryButton('Reset password',launch(()=>openAccountEdit(account,true))));}
    if(accountState(account)==='Archived'){if(isPlatformAdmin())actions.append(directoryButton('Restore account',launch(()=>openAccountLifecycle(account,true)),'btn btn-brand'));}
    else if(account.role==='player'){
      const team=teams.find(item=>item.id===current[0]?.teamId),member=team?.roster?.find(item=>item.playerId===account.id&&item.active!==false);
      if(member){actions.append(directoryButton('View current team',()=>{dialog.close();openTeamFromAccess(team.id);}));actions.append(directoryButton('Transfer player',launch(()=>openPlayerTransfer(member,team))),directoryButton('Remove from team',launch(()=>void removeRosterMember(member,team))));}
      else if(isPlatformAdmin())actions.append(directoryButton('Assign to team',launch(()=>openAccountAssignment(account)),'btn btn-brand'));
    }
    if(account.role==='coach'&&Number(account.active))actions.append(directoryButton('Manage access',launch(()=>openStaffAccessDialog(account))));
    content.append(directoryElement('h4','Team memberships and history'));const history=directoryElement('div','','org-access-entries');
    for(const membership of memberships){const card=directoryElement('section','','org-access-entry');card.append(directoryElement('strong',membership.teamName),directoryElement('p',`${membership.role==='coach'?'Coach':'Player'} · ${membership.active?(membership.teamActive?'Current':'Assigned to archived team'):'Previous membership'}`,'muted'));history.append(card);}if(!memberships.length)history.append(directoryElement('p','No team memberships yet.','muted'));content.append(history);
    if(isPlatformAdmin()){const danger=directoryElement('div','','org-person-danger');if(Number(account.active))danger.append(directoryButton('Archive account',launch(()=>openAccountLifecycle(account)),'btn btn-danger'));danger.append(directoryButton('Delete account permanently',launch(()=>void openDataReview('account',{...account,userId:account.id})),'btn btn-danger'));content.append(danger);}
    content.append(directoryButton('Close',()=>dialog.close()));
  }
  function renderPeopleDirectory() {
    const view=document.querySelector('[data-admin-view="people"]');if(!view)return;let root=byId('orgPeopleHub');
    if(!root){const legacy=directoryElement('div');legacy.hidden=true;legacy.id='orgPeopleLegacy';legacy.append(...view.childNodes);view.append(legacy);root=directoryElement('div','','org-people-hub');root.id='orgPeopleHub';view.append(root);}
    const previous=root.querySelector('input')?.value||'';const typeValue=root.querySelector('[data-people-type]')?.value||'';const stateValue=root.querySelector('[data-people-state]')?.value||'';root.replaceChildren();
    const heading=directoryElement('div','','org-seasons-heading');heading.append(directoryElement('p','Find current, unassigned, and archived accounts. Create new players from a team roster.','muted'));
    if(isPlatformAdmin()||window.__DIQ_AUTH_USER__?.directorScopes?.some(scope=>scope.role==='organization_director'))heading.append(directoryButton('Add staff',()=>{const {dialog,content}=orgDialog('Add staff');content.append(renderStaffAccessForm(null,()=>dialog.close(),{onSaved:()=>dialog.close()}));},'btn btn-brand'));root.append(heading);
    const toolbar=directoryElement('div','','org-people-filters');const field=directoryElement('label','Search people','field');const search=document.createElement('input');search.type='search';search.className='input';search.placeholder='Name or username';search.value=previous;field.append(search);toolbar.append(field);
    function filter(label,attribute,values,value){const field=directoryElement('label',label,'field');const select=document.createElement('select');select.className='select';select.setAttribute(attribute,'');for(const [id,text] of values)select.append(option(id,text));select.value=value;field.append(select);toolbar.append(field);return select;}
    const type=filter('Account type','data-people-type',[['','Players and staff'],['player','Players'],['coach','Staff']],typeValue);const state=filter('Status','data-people-state',[['','All accounts'],['Assigned','Assigned'],['Unassigned','Unassigned'],['Archived','Archived']],stateValue);root.append(toolbar);
    const wrap=directoryElement('div','','admin-access-table-wrap');const table=document.createElement('table');table.className='org-people-table';table.setAttribute('aria-label','People');const head=table.createTHead().insertRow();for(const text of ['Name','Username','Type','Status','Current team / access','Actions']){const cell=document.createElement('th');cell.scope='col';cell.textContent=text;head.append(cell);}const body=table.createTBody();wrap.append(table);root.append(wrap);
    function draw(){body.replaceChildren();const query=search.value.toLowerCase();const accounts=directory.accounts||[];
      for(const person of accounts.filter(item=>(!type.value||item.role===type.value)&&(!state.value||accountState(item)===state.value)&&[item.name,item.username].join(' ').toLowerCase().includes(query))){
        const row=body.insertRow();row.className='org-people-row';row.addEventListener('click',event=>{if(!event.target.closest('button,a,input,select,[popover]'))openPeoplePerson(person);});row.insertCell().append(directoryButton(person.name,()=>openPeoplePerson(person),'org-record-title'));row.insertCell().textContent=person.username;row.insertCell().textContent=person.role==='player'?'Player':'Staff';row.insertCell().textContent=accountState(person);
        const current=accountCurrentMemberships(person);row.insertCell().textContent=current.map(item=>item.teamName).join(', ')||(directory.assignments.some(item=>item.userId===person.id)?'Director appointment':'—');row.insertCell().append(...directoryMenu([directoryButton('Manage person',()=>openPeoplePerson(person))],'Actions for '+person.name));
      }
      if(!body.rows.length){const cell=body.insertRow().insertCell();cell.colSpan=6;cell.textContent='No matching people.';}
    }
    for(const element of [search,type,state])element.addEventListener(element===search?'input':'change',draw);draw();
  }
  function renderStaffDirectoryDetails() {
    const list = byId('adminPeopleList');
    const details = byId('adminPersonAccess');
    const query = peopleSearch.value.trim().toLowerCase();
    const organizations = directory.organizations.filter(org => isPlatformAdmin() || directsOrganization(org.id));
    const previousOrganization = peopleOrganization.value;
    peopleOrganization.replaceChildren(
      ...(isPlatformAdmin() ? [option('', 'All organizations')] : []),
      ...organizations.map(org => option(org.id, org.name)),
    );
    if (organizations.some(org => org.id === previousOrganization)) peopleOrganization.value = previousOrganization;
    byId('adminPeopleOrganizationField').hidden = organizations.length < (isPlatformAdmin() ? 1 : 2);
    const organizationId = peopleOrganization.value;
    const assignmentsInView = directory.assignments.filter(item => !organizationId || item.staffOrganizationId === organizationId);
    const assignedStaff = new Set(assignmentsInView.map(item => item.userId));
    const matches = directory.people.filter(person => (!organizationId || assignedStaff.has(person.id))
      && [person.name, person.username].some(value => value?.toLowerCase().includes(query)));
    list.replaceChildren();
    const results = directoryElement('ul', '', 'admin-directory-list');
    matches.slice(0, 20).forEach(person => {
      const button = directoryButton(person.name, () => {
        selectedPersonId = person.id;
        renderPeopleDirectory();
        byId('adminPersonTitle')?.focus();
      });
      button.setAttribute('aria-pressed', String(selectedPersonId === person.id));
      button.append(directoryElement('small', person.username));
      const item = directoryElement('li', '');
      item.append(button);
      results.append(item);
    });
    if (matches.length) list.append(results);
    else list.append(directoryElement('p', 'No matching staff.'));
    if (matches.length > 20) list.append(directoryElement('p', `Showing 20 of ${matches.length} staff. Refine your search to see other matches.`, 'muted'));

    const person = matches.find(item => item.id === selectedPersonId);
    details.replaceChildren();
    setVisible(details, Boolean(person));
    if (!person) return;

    const heading = directoryElement('div', '', 'admin-section-heading');
    const identity = directoryElement('div', '');
    const title = directoryElement('h4', person.name);
    title.id = 'adminPersonTitle';
    title.tabIndex = -1;
    identity.append(title, directoryElement('p', person.username, 'muted'));
    heading.append(identity);
    details.append(heading);

    const assignments = assignmentsInView.filter(item => item.userId === person.id)
      .sort((a, b) => accessScope(a).localeCompare(accessScope(b)));
    const formMount = directoryElement('div', '', 'admin-access-form-mount');
    const openForm = () => {
      formMount.replaceChildren(renderStaffAccessForm(person, () => {
        formMount.replaceChildren();
        byId('adminPersonTitle')?.focus();
      }));
      formMount.querySelector('select:not(:disabled), input')?.focus();
    };
    if (person.role === 'coach') {
      heading.append(directoryButton('Add assignment', () => openForm(), 'btn btn-brand'));
    }
    if (person.legacyPublishing) details.append(directoryElement('p', 'This account previously had shared library publishing access.', 'muted'));
    if (person.role === 'coach' && assignments.some(item => item.role === 'coach' || item.stagedDirectorId)) {
      details.append(directoryElement('p', 'Designer access authorizes publishing in the assigned library.', 'muted'));
    }
    if (!assignments.length) details.append(directoryElement('p', 'No workspace assignments.'));
    else {
      const wrapper = directoryElement('div', '', 'admin-access-table-wrap');
      const table = directoryElement('table', '', 'admin-access-table');
      table.setAttribute('aria-label', 'Current workspace assignments');
      const header = table.createTHead().insertRow();
      for (const label of ['Applies to', 'Role', 'Designer', 'Actions']) {
        const column = directoryElement('th', label);
        column.scope = 'col';
        header.append(column);
      }
      const body = table.createTBody();
      for (const assignment of assignments) {
        const row = body.insertRow();
        row.insertCell().textContent = accessScope(assignment);
        const roleCell = row.insertCell();
        roleCell.textContent = accessRoles[assignment.role];
        const region = directory.regions.find(item => item.id === assignment.regionId);
        if (region && assignments.some(item => item.role === 'organization_director' && item.organizationId === region.organizationId)) {
          roleCell.append(directoryElement('small', 'Also covered by the organization appointment', 'muted admin-access-overlap'));
        }
        const designer = row.insertCell();
        const canManage = isPlatformAdmin() || (assignment.role !== 'organization_director'
          && directsOrganization(assignment.staffOrganizationId));
        if (canManage && canDelegateDesigner(assignment.staffOrganizationId)) designer.append(renderDesignerSetting(person, assignment));
        else designer.textContent = assignment.canDesign ? 'On' : 'Off';
        const actions = directoryElement('div', '', 'admin-actions');
        if (assignment.teamId) actions.append(directoryButton('View team', () => openTeamFromAccess(assignment.teamId)));
        if (assignment.teamId && canManage) {
          actions.append(directoryButton('Remove', () => void removeCoachMembership(person, assignment)));
        }
        if (assignment.stagedDirectorId && canManage) {
          actions.append(directoryButton('Remove', () => void removeDirectorAppointment(person, assignment)));
        }
        row.insertCell().append(actions);
      }
      wrapper.append(table);
      details.append(wrapper);
    }
    details.append(formMount);
  }

  function renderStaffAccessForm(person, cancel, config={}) {
    const creating = !person;
    const heading = creating ? 'Add staff' : 'Add assignment';
    const panel = directoryElement('section', '', 'admin-staff-form-panel');
    panel.append(directoryElement('h4', heading));
    const form = directoryElement('form', '', 'admin-record-grid admin-staff-form');
    const name = directoryElement('input', '', 'input');
    const password = directoryElement('input', '', 'input');
    if (creating) {
      name.required = true;
      name.maxLength = 100;
      password.type = 'password';
      password.required = true;
      password.minLength = 8;
      password.autocomplete = 'new-password';
      password.maxLength = 1024;
      const nameField = directoryElement('label', 'Full name', 'field');
      const passwordField = directoryElement('label', 'Temporary password', 'field');
      nameField.append(name);
      passwordField.append(password);
      form.append(nameField, passwordField);
      panel.append(directoryElement('p', 'We generate the username from the name. Staff change their temporary password at first sign-in.', 'muted'));
    }
    const role = directoryElement('select', '', 'select');
    role.required = true;
    role.append(option('', 'Choose role'), ...(isPlatformAdmin() ? ['organization_director', 'regional_director', 'coach'] : ['regional_director', 'coach']).map(key => option(key, accessRoles[key])));
    const roleField = directoryElement('label', 'Role', 'field');
    roleField.append(role);
    const scope = directoryElement('select', '', 'select');
    scope.required = true;
    const scopeField = directoryElement('label', '', 'field');
    const scopeLabel = directoryElement('span', 'Applies to');
    scopeField.append(scopeLabel, scope);
    const { input: design, pill } = designerSwitch('Situation Designer access');
    const designField = directoryElement('label', '', 'admin-designer-setting');
    designField.append(directoryElement('strong', 'Situation Designer access'), pill);
    const designHelp = directoryElement('span', 'Allows this staff member to create and edit situations. Applies when you save this assignment.', 'muted org-designer-help');
    designField.append(designHelp);
    const save = directoryElement('button', creating ? 'Create staff account' : 'Save assignment', 'btn btn-brand');
    const status = directoryElement('p', '', 'operation-status');
    status.setAttribute('role', 'status');
    const actions = directoryElement('div', '', 'admin-actions');
    actions.append(save, directoryButton('Cancel', cancel));

    let overlapReviewed=false;
    const overlap = directoryElement('p', '', 'muted admin-access-overlap');
    overlap.setAttribute('aria-live', 'polite');
    function updateOverlap() {
      overlapReviewed=false;
      if (role.value === 'coach') { overlap.textContent = ''; return; }
      const region = directory.regions.find(item => item.id === scope.value);
      const organizationId = role.value === 'regional_director' ? region?.organizationId : scope.value;
      const otherAssignments = directory.assignments.filter(item => item.userId === person?.id);
      const coversSameOrganization = organizationId && (role.value === 'regional_director'
        ? otherAssignments.some(item => item.role === 'organization_director' && item.organizationId === organizationId)
        : otherAssignments.some(item => item.regionId && directory.regions.some(region =>
            region.id === item.regionId && region.organizationId === organizationId)));
      overlap.textContent = coversSameOrganization
        ? 'This director appointment overlaps an existing appointment in the same organization. Both appointments can be kept.'
        : '';
    }

    function targetOrganization() {
      if (role.value === 'organization_director') return scope.value;
      const regionId = role.value === 'coach'
        ? directory.teams.find(team => team.id === scope.value)?.regionId : scope.value;
      return directory.regions.find(region => region.id === regionId)?.organizationId;
    }

    function updateDesigner() {
      const existing = directory.assignments.find(item => item.userId === person?.id && item.role === role.value
        && (item.teamId || item.regionId || item.organizationId) === scope.value);
      design.disabled = !scope.value || !canDelegateDesigner(targetOrganization());
      design.checked = existing ? Boolean(existing.canDesign)
        : !design.disabled && role.value !== 'coach';
      save.disabled = !scope.value || Boolean(existing?.canDesign && design.disabled);
    }

    function updateScopes() {
      const fits = id => (config.fixedRole || !peopleOrganization.value || peopleOrganization.value === id)
        && (isPlatformAdmin() || directsOrganization(id));
      const regions = directory.regions.filter(item => fits(item.organizationId));
      const options = role.value === 'organization_director'
        ? directory.organizations.filter(item => fits(item.id)).map(item => option(item.id, item.name))
        : role.value === 'regional_director' ? regions.map(item => option(item.id, regionPath(item.id)))
          : role.value === 'coach' ? directory.teams
            .filter(team => regions.some(region => region.id === team.regionId)
              || (isPlatformAdmin() && (config.fixedRole || !peopleOrganization.value) && !team.regionId))
            .map(team => option(team.id, accessScope({ teamId: team.id }))) : [];
      const scopeType = role.value === 'organization_director' ? 'Organization' : role.value === 'coach' ? 'Team' : 'Region';
      scopeLabel.textContent = role.value ? scopeType : 'Applies to';
      scope.replaceChildren(option('', role.value ? `Choose ${scopeType.toLowerCase()}` : 'Choose role first'), ...options);
      scope.disabled = !options.length;
      updateDesigner();
      status.textContent = '';
    }
    if(config.fixedRole){role.value=config.fixedRole;roleField.hidden=true;}
    updateScopes();
    if(config.scopeId){scope.value=config.scopeId;scopeField.hidden=true;updateDesigner();updateOverlap();}
    role.addEventListener('change', () => {
      updateScopes();
      updateOverlap();
    });
    scope.addEventListener('change', () => {
      updateDesigner();
      status.textContent = '';
      updateOverlap();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!scope.value || save.disabled) return;
      const choice = { role: role.value, scopeId: scope.value, canDesign: design.checked };
      if(config.onSaved&&overlap.textContent&&!overlapReviewed){overlapReviewed=true;status.textContent=overlap.textContent+' Select Save assignment again to keep both appointments.';return;}
      if (!config.onSaved && overlap.textContent && !await requestConfirmation({
        title: 'Keep both director appointments?',
        message: overlap.textContent,
        confirmLabel: 'Add appointment',
      })) return;
      const payload = creating ? { action: 'create_staff', name: name.value, password: password.value, ...choice }
        : { action: 'stage_access', userId: person.id, ...choice };
      save.disabled = true;
      try {
        const result = await diqApiRequest('admin/workspace-directory', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (creating) {
          password.value = '';
          cancel();
          selectedPersonId = result.userId;
          peopleSearch.value = result.username;
        }
        if(config.fixedRole==='coach')await loadAdminData(selectedTeam()?.id || '');
        else await loadWorkspaceDirectory();
        config.onSaved?.();
        setStatus(creating ? `Staff account created. Username is ${result.username}.` : 'Workspace access saved.', 'success');
        byId('adminPersonTitle')?.focus();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        save.disabled = !scope.value;
      }
    });
    form.append(roleField, scopeField, overlap, designField, actions);
    panel.append(form, status);
    return panel;
  }

  const addStaff = byId('adminAddStaff');
  const staffCreate = byId('adminStaffCreate');
  const peopleLayout = byId('adminPeopleLayout');
  addStaff?.addEventListener('click', () => {
    staffCreate.replaceChildren(renderStaffAccessForm(null, () => {
      staffCreate.replaceChildren();
      setVisible(staffCreate, false);
      setVisible(peopleLayout, true);
      addStaff.focus();
    }));
    setVisible(staffCreate, true);
    setVisible(peopleLayout, false);
    staffCreate.querySelector('input').focus();
  });

  function showDirectoryForm(action, scope) {
    directoryStatus.textContent = '';
    directoryForm.replaceChildren();
    directoryForm.dataset.action = action;
    const field = directoryElement('label', '', 'field');
    const submit = directoryElement('button', '', 'btn btn-brand');
    submit.type = 'submit';

    if (['create_organization', 'create_region', 'rename_organization', 'rename_region'].includes(action)) {
      const organization = action.endsWith('_organization');
      const renaming = action.startsWith('rename_');
      const input = directoryElement('input', '', 'input');
      input.name = 'name';
      input.required = true;
      input.maxLength = 120;
      field.append(directoryElement('span', organization ? 'Organization name' : 'Region name'), input);
      if (renaming) input.value = scope.name;
      submit.textContent = renaming ? 'Save name' : organization ? 'Create organization' : 'Create region';
    } else {
      const adding = action === 'add_team';
      const select = directoryElement('select', '', 'select');
      select.name = adding ? 'teamId' : 'regionId';
      select.required = adding;
      if (adding) {
        select.append(option('', 'Choose team'), ...directory.teams.filter(team => !team.regionId)
          .map(team => option(team.id, team.name)));
      } else {
        const currentRegion = directory.regions.find(region => region.id === scope.regionId);
        const destinations = isPlatformAdmin() ? directory.regions
          : directory.regions.filter(region => region.organizationId === currentRegion?.organizationId);
        if (isPlatformAdmin()) select.append(option('', 'Unassigned teams'));
        select.append(...destinations.map(region => option(region.id, regionPath(region.id))));
        select.value = scope.regionId || '';
      }
      field.append(directoryElement('span', adding ? 'Existing team' : 'Destination region'), select);
      submit.textContent = adding ? 'Add team' : 'Review move';
    }
    directoryForm.append(field, submit, directoryButton('Cancel', () => renderWorkspaceDirectory()));
    setVisible(directoryForm, true);
    field.querySelector('input, select')?.focus();
  }

  function appendDirectoryManagement(actions, kind, record) {
    const remove = directoryButton(`Delete ${kind}`, async () => {
      if (!await requestConfirmation({
        title: `Delete ${kind}`,
        message: `Permanently delete ${record.name}?`,
        confirmLabel: `Delete ${kind}`,
      })) return;
      remove.disabled = true;
      try {
        await diqApiRequest('admin/workspace-directory', {
          method: 'POST',
          body: JSON.stringify({ action: `delete_${kind}`, id: record.id }),
        });
        if (directoryScope?.[`${kind}Id`] === record.id) {
          directoryScope = kind === 'region' ? { organizationId: record.organizationId } : null;
        }
        await loadWorkspaceDirectory();
        directoryStatus.textContent = kind === 'region' ? 'Region deleted.' : 'Organization deleted.';
      } catch (error) {
        directoryStatus.textContent = error.message;
      } finally {
        remove.disabled = false;
      }
    }, 'btn btn-danger');
    actions.append(directoryButton(`Rename ${kind}`, () => showDirectoryForm(`rename_${kind}`, record)), remove);
  }

  function renderSearchableDirectory(items, { key, label, records, describe, open, empty, selectedId }) {
    const list = directoryElement('div', '', 'admin-searchable-directory');
    const field = directoryElement('label', `Search ${label}`, 'field admin-directory-search');
    const search = directoryElement('input', '', 'input');
    search.type = 'search';
    search.value = directoryQueries.get(key) || '';
    field.append(search);
    const results = directoryElement('div', '', 'admin-directory-results');
    const sorted = [...records].sort((a, b) => a.name.localeCompare(b.name));

    function filterRecords() {
      directoryQueries.set(key, search.value);
      const query = search.value.trim().toLowerCase();
      const matches = sorted.filter(record => record.name.toLowerCase().includes(query));
      results.replaceChildren();
      directoryList(results, '', matches, describe, open, query ? `No matching ${label}.` : empty, selectedId);
    }

    search.addEventListener('input', filterRecords);
    filterRecords();
    list.append(field, results);
    items.append(list);
  }

  function directoryMenu(actions,label) {
    const menu=document.createElement('div');menu.className='org-action-menu';menu.id='org-menu-'+crypto.randomUUID();menu.setAttribute('popover','auto');
    menu.append(...actions);
    const trigger=directoryButton('•••',()=>{
      if(menu.matches(':popover-open')){menu.hidePopover();return;}
      menu.showPopover();const bounds=trigger.getBoundingClientRect();
      menu.style.left=Math.max(12,Math.min(innerWidth-232,bounds.right-220))+'px';
      menu.style.top=Math.max(12,bounds.bottom+menu.offsetHeight+8>innerHeight?bounds.top-menu.offsetHeight-6:bounds.bottom+6)+'px';
    },'btn org-menu-trigger');
    trigger.setAttribute('aria-label',label);trigger.setAttribute('aria-haspopup','true');trigger.setAttribute('popovertarget',menu.id);
    // Position explicitly; avoid also toggling through the native default action.
    trigger.addEventListener('click',event=>event.preventDefault());
    menu.addEventListener('click',event=>{if(event.target.closest('button'))menu.hidePopover();});
    return [trigger,menu];
  }
  function openTeamRename() {
    const team=selectedTeam();if(!team)return;
    const dialog=document.createElement('dialog');dialog.className='org-rename-dialog';
    const heading=directoryElement('h3','Rename team');heading.id='orgRenameTitle';dialog.setAttribute('aria-labelledby',heading.id);
    const form=document.createElement('form');
    const field=directoryElement('label','','field');field.append(directoryElement('span','Team name'));
    const input=document.createElement('input');input.className='input';input.name='name';input.required=true;input.maxLength=100;input.value=team.name;field.append(input);
    const status=directoryElement('p','','operation-status');status.setAttribute('role','status');
    const controls=directoryElement('div','','admin-actions');
    const cancel=directoryButton('Cancel',()=>dialog.close());
    const save=directoryElement('button','Save','btn btn-brand');save.type='submit';controls.append(cancel,save);
    form.append(field,status,controls);dialog.append(heading,form);document.body.append(dialog);
    dialog.addEventListener('close',()=>{dialog.remove();byId('adminDirectoryActions').querySelector('button')?.focus();});
    form.addEventListener('submit',async event=>{
      event.preventDefault();const name=input.value.trim();
      if(!name){input.setCustomValidity('Enter a team name.');input.reportValidity();return;}
      save.disabled=true;cancel.disabled=true;input.disabled=true;
      const saved=await perform('Saving team…',()=>diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}`,{
        method:'PUT',headers:{'If-Match':String(team.revision)},body:JSON.stringify({name}),
      }),'Team saved.',team.id);
      if(saved)dialog.close();
      else {status.textContent='Unable to save the team name. Close this dialog and refresh the team before trying again.';save.disabled=false;cancel.disabled=false;input.disabled=false;}
    });
    input.addEventListener('input',()=>input.setCustomValidity(''));
    dialog.showModal();input.focus();input.select();
  }
  function openScopedDirectorForm(region,organization) {
    const fixedRole=region?'regional_director':'organization_director';
    const scopeId=region?.id||organization?.id;
    if(!scopeId || !(isPlatformAdmin() || (region&&directsOrganization(organization?.id))))return;
    const {dialog,content}=orgDialog('Add director',region?regionPath(region.id):organization.name);
    const field=directoryElement('label','Staff account','field');const select=document.createElement('select');select.className='select';
    select.append(option('','Choose staff account'),...directory.people.filter(person=>person.role==='coach').sort((a,b)=>a.name.localeCompare(b.name)).map(person=>option(person.id,`${person.name} · ${person.username}`)),option('__new','Create a new staff account'));
    field.append(select);content.append(field);const mount=directoryElement('div');content.append(mount);
    content.append(directoryButton('Close',()=>dialog.close()));
    select.addEventListener('change',()=>{
      mount.replaceChildren();if(!select.value)return;
      const person=select.value==='__new'?null:directory.people.find(item=>item.id===select.value);
      mount.append(renderStaffAccessForm(person,()=>dialog.close(),{fixedRole,scopeId,onSaved:()=>dialog.close()}));
      mount.querySelector('input:not([type="checkbox"]):not(:disabled),button[type="submit"]')?.focus();
    });select.focus();
  }
  function renderStaffTable(container,{title,key,entries,region,organization,additional=false}) {
    const section=directoryElement('section','','org-staff-section');
    const heading=directoryElement('div','','org-staff-heading');const count=directoryElement('h4',`${title} (${entries.length})`);heading.append(count);
    if(!additional&&(isPlatformAdmin() || (region&&directsOrganization(organization?.id))))heading.append(directoryButton('Add director',()=>openScopedDirectorForm(region,organization),'btn btn-brand'));
    section.append(heading);
    const field=directoryElement('label',additional?'Search additional staff':'Search director appointments','field org-staff-search');
    const search=document.createElement('input');search.type='search';search.className='input';search.placeholder='Name, username, role, or scope';search.value=directoryQueries.get(key)||'';field.append(search);section.append(field);
    const wrapper=directoryElement('div','','admin-access-table-wrap');
    const table=document.createElement('table');table.className='org-staff-table';table.setAttribute('aria-label',title);
    const header=table.createTHead().insertRow();
    for(const label of ['Name','Role','Access source','Actions']){const cell=document.createElement('th');cell.scope='col';cell.textContent=label;header.append(cell);}
    const results=table.createTBody();wrapper.append(table);section.append(wrapper);container.append(section);
    function draw(){
      const query=search.value.trim().toLowerCase();directoryQueries.set(key,search.value);results.replaceChildren();
      const matches=entries.filter(({person,assignment})=>[person.name,person.username,accessRoles[assignment.role],accessScope(assignment)].join(' ').toLowerCase().includes(query));
      for(const {person,assignment} of matches){
        const row=results.insertRow();row.className='org-staff-row';
        const identity=row.insertCell();
        row.addEventListener('click',event=>{if(!event.target.closest('button,a,input,select,[popover]'))openStaffAccessDialog(person);});
        const open=directoryButton('',()=>openStaffAccessDialog(person),'org-staff-name');
        open.textContent=person.name;identity.append(open);
        if(person.username&&person.username!==person.name)identity.append(directoryElement('small',person.username,'org-staff-username'));
        row.insertCell().textContent=accessRoles[assignment.role]||assignment.role;
        const inherited=additional || Boolean(region&&assignment.organizationId);
        row.insertCell().textContent=`${inherited?'Inherited from':'Assigned to'} ${accessScope(assignment)}`;
        const choices=[directoryButton('View access',()=>openStaffAccessDialog(person))];
        if(!inherited&&assignment.stagedDirectorId&&(isPlatformAdmin()||(assignment.role!=='organization_director'&&directsOrganization(assignment.staffOrganizationId||organization?.id)))){
          choices.push(directoryButton('Remove appointment',()=>void removeDirectorAppointment(person,assignment),'btn btn-danger'));
        }
        row.insertCell().append(...directoryMenu(choices,`Actions for ${person.name} ${accessRoles[assignment.role]||''}`));
      }
      if(!matches.length){const cell=results.insertRow().insertCell();cell.colSpan=4;cell.textContent=query?'No matching staff.':additional?'No additional staff access.':'No director appointments.';}
    }
    search.addEventListener('input',draw);draw();
  }
  function renderDirectoryTable(items,{key,label,records,open,empty,kind,canManage=false}) {
    const wrapper=directoryElement('div','','org-directory-table');
    const field=directoryElement('label',`Search ${label}`,'field admin-directory-search');
    const search=directoryElement('input','','input');search.type='search';search.value=directoryQueries.get(key)||'';field.append(search);
    const count=directoryElement('p','','org-result-count');
    const scroll=directoryElement('div','','admin-access-table-wrap');
    const table=document.createElement('table');table.className='org-hierarchy-table';table.setAttribute('aria-label',label[0].toUpperCase()+label.slice(1));
    const headings=kind==='organization'?['Organization','Regions','Teams','Actions']:kind==='region'?['Region','Teams','Actions']:['Team','Season','Actions'];
    const head=table.createTHead().insertRow();for(const text of headings){const th=document.createElement('th');th.scope='col';th.textContent=text;head.append(th);}
    const body=table.createTBody();scroll.append(table);
    function filter(){
      directoryQueries.set(key,search.value);const query=search.value.trim().toLowerCase();
      const matches=[...records].sort((a,b)=>a.name.localeCompare(b.name)).filter(item=>item.name.toLowerCase().includes(query));
      count.textContent=`${matches.length} ${matches.length===1?label.replace(/s$/,''):label}`;body.replaceChildren();
      for(const record of matches){
        const row=body.insertRow();row.className='org-browse-row';
        row.addEventListener('click',event=>{if(!event.target.closest('button,a,input,select,[popover]'))open(record);});
        const title=directoryButton(record.name,()=>open(record),'org-record-title');row.insertCell().append(title);
        if(kind==='organization'){
          const regions=directory.regions.filter(item=>item.organizationId===record.id);row.insertCell().textContent=String(regions.length);
          row.insertCell().textContent=String(directory.teams.filter(item=>regions.some(region=>region.id===item.regionId)).length);
        }else if(kind==='region')row.insertCell().textContent=String(directory.teams.filter(item=>item.regionId===record.id).length);
        else row.insertCell().textContent=teams.find(item=>item.id===record.id)?.activeSeasonName || 'No active season';
        const cell=row.insertCell();
        if(canManage){const controls=directoryElement('div');controls.append(directoryButton('Open',()=>open(record)));appendDirectoryManagement(controls,kind,record);cell.append(...directoryMenu([...controls.children],'Actions for '+record.name));}
        else cell.append(directoryButton('Open',()=>open(record)));
      }
      if(!matches.length){const cell=body.insertRow().insertCell();cell.colSpan=headings.length;cell.textContent=query?`No matching ${label}.`:empty;}
    }
    search.addEventListener('input',filter);filter();wrapper.append(field,count,scroll);items.append(wrapper);
  }
  function renderLandingTabs(items,platformAdmin){
    if(!platformAdmin)return;
    const nav=directoryElement('nav','','org-directory-tabs');nav.setAttribute('aria-label','Organization lists');
    for(const [value,label] of [['organizations','Organizations'],['unassigned',`Unassigned teams (${directory.teams.filter(item=>!item.regionId).length})`]]){
      const button=directoryButton(label,()=>{browseDirectory(null);directoryLandingTab=value;renderWorkspaceDirectory();});button.setAttribute('aria-pressed',String(directoryLandingTab===value));nav.append(button);
    }
    items.append(nav);
  }

  function renderWorkspaceDirectory() {
    const team = directory.teams.find(item => item.id === selectedTeam()?.id);
    const region = directory.regions.find(item => item.id === (team ? team.regionId : directoryScope?.regionId));
    const organization = directory.organizations.find(item => item.id === (region?.organizationId || (!team && directoryScope?.organizationId)));
    const path = byId('adminDirectoryPath');
    const actions = byId('adminDirectoryActions');
    const directoryHeading=byId('adminDirectoryTitle').closest('.admin-section-heading');
    let headingControls=byId('orgDirectoryHeadingControls');
    if(!headingControls){headingControls=directoryElement('div','','org-heading-controls');headingControls.id='orgDirectoryHeadingControls';directoryHeading.append(headingControls);headingControls.append(path,actions);}
    const items = byId('adminDirectoryItems');
    const platformAdmin = isPlatformAdmin();
    const organizationDirector = organization && directsOrganization(organization.id);
    const managedOrganizations = directory.organizations.filter(item => platformAdmin || directsOrganization(item.id));
    const standaloneRegions = directory.regions.filter(item => !directsOrganization(item.organizationId));
    const overview = platformAdmin || managedOrganizations.length ? 'Organizations' : 'Regions';
    const organizationList = byId('adminOrganizationList');
    byId('adminWorkspaceDirectory').querySelector('.admin-organization-layout').classList.toggle('has-detail', Boolean(team || region || organization || creatingTeam));
    organizationList.replaceChildren();
    if (platformAdmin || managedOrganizations.length) {
      renderSearchableDirectory(organizationList, {
        key: 'organizations', label: 'organizations', records: managedOrganizations,
        describe: item => {
          const count = directory.regions.filter(region => region.organizationId === item.id).length;
          return `${count} ${count === 1 ? 'region' : 'regions'}`;
        },
        open: item => browseDirectory({ organizationId: item.id }), empty: 'No organizations yet.',
        selectedId: organization?.id,
      });
    }
    if (!platformAdmin && standaloneRegions.length) renderSearchableDirectory(organizationList, {
      key: 'directed-regions', label: 'regions', records: standaloneRegions,
      describe: item => directory.organizations.find(org => org.id === item.organizationId)?.name || '',
      open: item => browseDirectory({ regionId: item.id }), empty: 'No regions assigned.',
      selectedId: region?.id,
    });
    const additionalStaff = byId('adminAdditionalStaff');
    additionalStaff.replaceChildren();
    path.replaceChildren();
    actions.replaceChildren();
    orgHeaderActions.replaceChildren();
    const unassigned = items.querySelector('.admin-unassigned-teams');
    if (unassigned) unassignedTeamsOpen = unassigned.open;
    items.replaceChildren();
    setVisible(directoryForm, false);
    const title = byId('adminDirectoryTitle');
    title.textContent = team?.name || region?.name || organization?.name || overview;
    byId('orgContextLabel').textContent=organization?.name || region?.name || overview;

    if (team && region) {
      path.append(directoryButton(`← Back to ${region.name}`,()=>browseDirectory({regionId:region.id})));
    } else if (region && organization && (platformAdmin || organizationDirector)) {
      path.append(directoryButton(`← Back to ${organization.name}`,()=>browseDirectory({organizationId:organization.id})));
    } else if (team) {
      path.append(directoryButton('← Back to unassigned teams',()=>{
        browseDirectory(null);directoryLandingTab='unassigned';renderWorkspaceDirectory();
      }));
    } else if (region || organization) {
      path.append(directoryButton(`← Back to all ${overview.toLowerCase()}`,()=>browseDirectory(null)));
    }
    let teamLocation=byId('orgTeamLocation');
    if(!teamLocation){teamLocation=directoryElement('p','','org-team-location');teamLocation.id='orgTeamLocation';title.before(teamLocation);}
    teamLocation.textContent=team?[organization?.name,region?.name].filter(Boolean).join(' · '):'';
    teamLocation.hidden=!teamLocation.textContent;
    const landing=!team && !region && !organization;
    if(!landing)directoryLandingTab=team && !region?'unassigned':'organizations';
    let navigation=byId('orgDirectoryNavigation');
    if(!navigation){navigation=directoryElement('div','','org-directory-navigation');navigation.id='orgDirectoryNavigation';directoryHeading.before(navigation);}
    navigation.replaceChildren();renderLandingTabs(navigation,platformAdmin);
    path.hidden=landing;
    byId('adminDirectoryTitle').closest('.admin-section-heading').classList.toggle('org-landing-heading',landing);
    if (landing) {
      if(platformAdmin && directoryLandingTab==='unassigned') {
        actions.append(newTeamButton);
        renderDirectoryTable(items,{key:'unassigned-teams',label:'teams',kind:'team',records:directory.teams.filter(item=>!item.regionId),open:item=>browseDirectory(null,item.id),empty:'All teams belong to a region. No unassigned teams.'});
      }else{
        if(platformAdmin)actions.append(directoryButton('+ New organization',()=>showDirectoryForm('create_organization'),'btn btn-brand'));
        if(platformAdmin || managedOrganizations.length)renderDirectoryTable(items,{key:'landing-organizations',label:'organizations',kind:'organization',records:managedOrganizations,open:item=>browseDirectory({organizationId:item.id}),empty:'No organizations yet.',canManage:platformAdmin});
        if(!platformAdmin && standaloneRegions.length)renderDirectoryTable(items,{key:'landing-regions',label:'regions',kind:'region',records:standaloneRegions,open:item=>browseDirectory({regionId:item.id}),empty:'No regions assigned.'});
      }
    } else if (team) {
      actions.append(directoryButton('Rename team',openTeamRename));
      if (platformAdmin || organizationDirector) actions.append(directoryButton('Move team', () => showDirectoryForm('move_team', team)));
      const archive=directoryButton('Archive team',()=>{actions.querySelector('button')?.focus();byId('adminTeamRemoveBtn').click();},'btn btn-danger');
      archive.disabled=byId('adminTeamRemoveBtn').disabled;actions.append(archive);
      if (!region) items.append(directoryElement('p', 'Unassigned team', 'muted'));
      const staff = directory.assignments.filter(item => (
        (region && item.regionId === region.id)
        || (organization && item.organizationId === organization.id)));
      renderStaffTable(additionalStaff,{title:'Additional staff access',key:`team-staff:${team.id}`,region,organization,additional:true,entries:staff.flatMap(assignment=>{
        const person=directory.people.find(item=>item.id===assignment.userId);return person?[{person,assignment}]:[];
      })});
    } else if (region) {
      const add = directoryButton('Add existing team', () => showDirectoryForm('add_team'));
      add.disabled = !directory.teams.some(item => !item.regionId);
      if (platformAdmin) actions.append(add);
      if (platformAdmin || organizationDirector) appendDirectoryManagement(actions, 'region', region);
      renderDirectoryTable(items,{key:`region:${region.id}`,label:'teams',kind:'team',records:directory.teams.filter(item=>item.regionId===region.id),open:item=>browseDirectory(null,item.id),empty:'No teams in this region.'});
    } else {
      actions.append(directoryButton('+ New region',()=>showDirectoryForm('create_region'),'btn btn-brand'));
      if(platformAdmin)appendDirectoryManagement(actions,'organization',organization);
      renderDirectoryTable(items,{key:`organization:${organization.id}`,label:'regions',kind:'region',records:directory.regions.filter(item=>item.organizationId===organization.id),open:item=>browseDirectory({regionId:item.id}),empty:'No regions in this organization.',canManage:platformAdmin || organizationDirector});
    }

    if (!team && (region || organization)) {
      const directors=directory.assignments.filter(item=>item.role!=='coach'&&(region?item.regionId===region.id||item.organizationId===organization?.id:item.organizationId===organization.id));
      renderStaffTable(items,{title:'Director appointments',key:`directors:${region?.id||organization.id}`,region,organization,entries:directors.flatMap(assignment=>{
        const person=directory.people.find(item=>item.id===assignment.userId);return person?[{person,assignment}]:[];
      })});
    }
    const allowCreation = !team && (Boolean(region) || (platformAdmin && landing && directoryLandingTab==='unassigned'));
    setVisible(newTeamButton, allowCreation && !creatingTeam);
    newTeamButton.classList.toggle('btn-brand', allowCreation);
    newTeamButton.classList.toggle('btn-ghost', !allowCreation);
    newTeamButton.textContent = region ? '+ New team' : '+ New unassigned team';
    if (team || region || organization) actions.append(newTeamButton);
    const hasSelectedTeam = Boolean(selectedTeam()) && !creatingTeam;
    setVisible(byId('adminTeamContext'), creatingTeam);
    setVisible(teamContextSummary, hasSelectedTeam);
    setVisible(byId('adminTeamsResetBtn'), hasSelectedTeam);
    setVisible(byId('adminTeamRecords'), hasSelectedTeam);
    byId('adminTeamUpdateBtn').textContent='Save';
    byId('adminTeamUpdateBtn').classList.add('btn-brand');
    const visibleActions=[...actions.children].filter(button=>!button.classList.contains('hidden'));
    const primary=visibleActions.filter(button=>button.classList.contains('btn-brand'));
    const secondary=visibleActions.filter(button=>!button.classList.contains('btn-brand'));
    if(team){if(isPlatformAdmin()&&!team.activeSeasonId)visibleActions.push(directoryButton('Delete team permanently',()=>void openDataReview('team'),'btn btn-danger'));actions.replaceChildren(...directoryMenu(visibleActions,'Team actions'));}
    else {
      orgHeaderActions.append(...primary);
      if(visibleActions.length>2)orgHeaderActions.append(...directoryMenu(secondary,'Organization actions'));
      else orgHeaderActions.append(...secondary);
    }
    orgHeaderActions.hidden=activeTab!=='teams';

  }

  async function loadWorkspaceDirectory() {
    try {
      directory = await diqApiRequest('admin/workspace-directory', { cache: 'no-store' });
      const accountId = window.__DIQ_AUTH_USER__?.id;
      if (directoryAccountId !== accountId) {
        directoryAccountId = accountId;
        const scopes = window.__DIQ_AUTH_USER__?.directorScopes || [];
        if (!isPlatformAdmin() && scopes.length === 1) {
          const scope = scopes[0];
          directoryScope = scope.organizationId ? { organizationId: scope.organizationId } : { regionId: scope.regionId };
        }
      }
      renderWorkspaceDirectory();
      renderRosterBrowser();
      renderPeopleDirectory();
    } catch (error) {
      directoryStatus.textContent = error.message;
      byId('adminPeopleList').textContent = error.message;
    }
  }

  peopleSearch?.addEventListener('input', renderPeopleDirectory);
  directoryForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const action = directoryForm.dataset.action;
    const fields = Object.fromEntries(new FormData(directoryForm));
    const submit = directoryForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      let payload = { action, ...fields };
      if (action === 'create_region') payload.organizationId = directoryScope.organizationId;
      if (action === 'rename_organization') payload.id = directoryScope.organizationId;
      if (action === 'rename_region') payload.id = directoryScope.regionId;
      if (action === 'add_team' || action === 'move_team') {
        const teamId = action === 'add_team' ? fields.teamId : selectedTeam()?.id;
        const team = directory.teams.find(item => item.id === teamId);
        const regionId = (action === 'add_team' ? directoryScope.regionId : fields.regionId) || null;
        if (!team || team.regionId === regionId) {
          directoryStatus.textContent = 'Choose a different destination.';
          return;
        }
        const directorIds = id => {
          const region = directory.regions.find(item => item.id === id);
          if (!region) return new Set();
          return new Set(directory.assignments.filter(item =>
            item.regionId === region.id || item.organizationId === region.organizationId).map(item => item.userId));
        };
        const previous = directorIds(team.regionId);
        const next = directorIds(regionId);
        const added = directory.people.filter(person => next.has(person.id) && !previous.has(person.id));
        const removed = directory.people.filter(person => previous.has(person.id) && !next.has(person.id));
        const impact = [
          added.length ? `Director access added for ${added.map(item => item.name).join(', ')}.` : '',
          removed.length ? `Director access removed for ${removed.map(item => item.name).join(', ')}.` : '',
        ].filter(Boolean).join(' ');
        if (!await requestConfirmation({
          title: 'Change team region',
          message: `Move ${team.name} from ${regionPath(team.regionId)} to ${regionPath(regionId)}? ${impact}`.trim(),
          confirmLabel: 'Confirm team move',
        })) return;
        payload = { action: 'place_team', teamId, regionId, previousRegionId: team.regionId };
      }
      const result = await diqApiRequest('admin/workspace-directory', { method: 'POST', body: JSON.stringify(payload) });
      if (action === 'create_organization') directoryScope = { organizationId: result.id };
      if (action === 'create_region') directoryScope = { regionId: result.id };
      if (payload.action === 'place_team') await loadAdminData(payload.teamId);
      else await loadWorkspaceDirectory();
      const messages = {
        place_team: 'Team region saved.',
        create_region: 'Region added.',
        create_organization: 'Organization added.',
        rename_region: 'Region renamed.',
        rename_organization: 'Organization renamed.',
      };
      directoryStatus.textContent = messages[payload.action];
    } catch (error) {
      directoryStatus.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  function renderRecoverySections() {
    const view=document.querySelector('[data-admin-view="recovery"]');if(!view)return;
    byId('adminRestoreMemberBtn').closest('section').hidden=true;
    const team=byId('adminRestoreTeamBtn').closest('section'),situation=byId('adminRestoreSituationBtn').closest('section');
    let tabs=byId('orgRecoveryTabs');if(tabs)return;
    tabs=directoryElement('nav','','org-directory-tabs');tabs.id='orgRecoveryTabs';tabs.setAttribute('aria-label','Recovery categories');team.parentElement.before(tabs);
    const choose=value=>{team.hidden=value!=='teams';situation.hidden=value!=='situations';tabs.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.recovery===value)));};
    for(const [value,label] of [['teams','Teams'],['situations','Situations']]){const button=directoryButton(label,()=>choose(value));button.dataset.recovery=value;tabs.append(button);}choose('teams');
  }
  async function loadAdminData(preferredTeamId = '') {
    setStatus('Loading the latest database records…', 'pending');
    const platformAdmin = isPlatformAdmin();
    const [teamResult, situationResult, proposalResult, unassignedResult] = await Promise.all([
      diqApiRequest('admin/teams?includeArchived=true', { cache: 'no-store' }),
      platformAdmin ? diqApiRequest('admin/situations', { cache: 'no-store' }) : null,
      platformAdmin ? diqApiRequest('situation-submissions?status=pending', { cache: 'no-store' }) : null,
      platformAdmin ? diqApiRequest('admin/players/unassigned?includeCoaches=true', { cache: 'no-store' }) : null,
    ]);
    teams = Array.isArray(teamResult?.teams) ? teamResult.teams : [];
    publishedSituations = (situationResult?.situations || []).filter(
      (item) => item.active !== false,
    );
    archivedSituations = (situationResult?.situations || []).filter(
      (item) => item.active === false,
    );
    proposals = Array.isArray(proposalResult?.submissions)
      ? proposalResult.submissions
      : [];
    unassignedPlayers = Array.isArray(unassignedResult?.players)
      ? unassignedResult.players
      : [];
    creatingTeam = false;
    renderTeamSelect(preferredTeamId);
    seasons = [];
    seasonMembers = [];
    renderSelectedTeam();
    await loadSeasonData(selectedTeam()?.id || '');
    await loadWorkspaceDirectory();
    if (platformAdmin) {
      populateRecovery();
      renderRecoverySections();
      // Unassigned and archived accounts are managed from People.
      renderProposals();
      renderOutcomeReviewQueue();
    }
    setStatus('Up to date', 'idle');
  }

  async function perform(label, action, successMessage, preferredTeamId = '') {
    if (operationInProgress) {
      setStatus('Another database operation is already in progress.', 'pending');
      return false;
    }
    operationInProgress = true;
    adminCard.setAttribute('aria-busy', 'true');
    adminWorkspace?.setAttribute('aria-busy', 'true');
    try {
      setStatus(label, 'pending');
      await action();
      await refreshPublicTeams();
      await loadAdminData(
        typeof preferredTeamId === 'function' ? preferredTeamId() : preferredTeamId,
      );
      setStatus(successMessage, 'success');
      return true;
    } catch (error) {
      console.error(error);
      setStatus(error?.message || 'The database operation failed.', 'error');
      return false;
    } finally {
      operationInProgress = false;
      adminCard.removeAttribute('aria-busy');
      adminWorkspace?.removeAttribute('aria-busy');
    }
  }

  async function createMember(role) {
    const team = selectedTeam();
    if (!team) return setStatus('Select a team first.', 'error');
    const name = String(
      role === 'coach' ? coachName?.value || '' : playerName?.value || '',
    ).trim();
    const number =
      role === 'coach' ? '' : String(playerNumber?.value || '').trim();
    const password = String(
      role === 'coach' ? coachPassword?.value || '' : playerPassword?.value || '',
    );
    if (!validateMemberFields(role, { requirePassword: true })) {
      return setStatus('Correct the highlighted account fields.', 'error');
    }
    let id = '';
    const ok = await perform(
      `Creating ${role} account…`,
      async () => {
        const result = await diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}/members`, {
          method: 'POST',
          body: JSON.stringify({ name, number, role, password }),
        });
        id = result?.record?.playerId || '';
      },
      `${role === 'coach' ? 'Coach' : 'Player'} account created. The temporary password must be changed at first login.`,
      team.id,
    );
    if (ok) {
      renderMemberSelect(role, id);
      const select = role === 'coach' ? coachSelect : playerSelect;
      if (select) select.value = id;
      role === 'coach' ? renderCoachForm() : renderPlayerForm();
    }
  }

  async function updateMember(role) {
    const team = selectedTeam();
    const member = selectedMember(role);
    if (!team || !member) {
      return setStatus(`Select a ${role} to update.`, 'error');
    }
    const name = String(
      role === 'coach' ? coachName?.value || '' : playerName?.value || '',
    ).trim();
    const number =
      role === 'coach' ? '' : String(playerNumber?.value || '').trim();
    const password = String(
      role === 'coach' ? coachPassword?.value || '' : playerPassword?.value || '',
    );
    if (!validateMemberFields(role, { requirePassword: byId('adminMemberEditorTitle')?.textContent === 'Reset password' })) {
      return setStatus('Correct the highlighted account fields.', 'error');
    }
    const body = { name, number, role };
    if (password) body.password = password;
    await perform(
      `Saving ${role} account…`,
      () =>
        diqApiRequest(
          `admin/teams/${encodeURIComponent(team.id)}/members/${encodeURIComponent(member.playerId)}`,
          {
            method: 'PUT',
            headers: { 'If-Match': String(member.revision) },
            body: JSON.stringify(body),
          },
        ),
      password
        ? `${role === 'coach' ? 'Coach' : 'Player'} password reset. The temporary password must be changed at next login.`
        : `${role === 'coach' ? 'Coach' : 'Player'} account saved.`,
      team.id,
    );
  }

  function removeTeamMembership(team, member) {
    return diqApiRequest(
      `admin/teams/${encodeURIComponent(team.id)}/members/${encodeURIComponent(member.playerId)}`,
      { method: 'DELETE', headers: { 'If-Match': String(member.revision) } },
    );
  }

  async function removeSelectedRosterMembers() {
    const team = selectedTeam();
    const members = team?.roster.filter(member => member.active !== false && selectedRosterIds.has(member.playerId));
    if (!members?.length || operationInProgress) return;
    const confirmed = await requestConfirmation({
      title: 'Remove selected members',
      message: `Remove ${members.length} selected ${members.length === 1 ? 'member' : 'members'} from ${team.name}? This removes only these team memberships. Accounts, other memberships, and historical training attempts and results remain. No account deletion is needed.`,
      confirmLabel: 'Remove from team',
    });
    if (!confirmed) return;

    const failures = [];
    let removed = 0;
    const refreshed = await perform('Removing selected members…', async () => {
      for (const member of members) {
        try {
          await removeTeamMembership(team, member);
          removed += 1;
        } catch (error) {
          failures.push(`${member.name} (${error.message})`);
        }
      }
    }, '', team.id);
    if (!refreshed) return;
    const summary = `Removed ${removed} of ${members.length} selected members from ${team.name}.`;
    setStatus(failures.length ? `${summary} Could not remove ${failures.join(', ')}.` : summary,
      failures.length ? 'error' : 'success');
  }

  async function removeMember(role) {
    const team = selectedTeam();
    const member = selectedMember(role);
    if (!team || !member) return;
    const confirmed = await requestConfirmation({
      title: `Remove ${role} from team`,
      message: `Remove ${member.name} from ${team.name}? New practice will stop immediately and active sessions will be signed out. Historical results will be preserved.`,
      confirmLabel: `Remove ${role}`,
    });
    if (!confirmed) return;
    await perform(
      `Removing ${role} from team…`,
      () => removeTeamMembership(team, member),
      `${role === 'coach' ? 'Coach' : 'Player'} removed from the team. Historical results were preserved.`,
      team.id,
    );
  }

  function switchTeamView(viewName) {
    if(viewName==='data')viewName='roster';
    activeTeamView = viewName;
    document.querySelectorAll('[data-admin-team-tab]').forEach((button) => {
      const selected = button.dataset.adminTeamTab === viewName;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-admin-team-view]').forEach((view) =>
      view.classList.toggle('hidden', view.dataset.adminTeamView !== viewName),
    );
  }

  function switchTab(tab) {
    activeTab = tab;
    orgHeaderActions.hidden=tab!=='teams';
    const headings={teams:['Organizations','Manage organizations, regions, teams, and their members.'],people:['People','Manage player and staff accounts, current memberships, and account history.'],recovery:['Recovery','Restore archived teams and situations. Manage accounts from People.']};
    if(adminCard.dataset.workspace==='org' && headings[tab]){
      adminCard.querySelector('.workspace-heading-title').textContent=headings[tab][0];
      adminCard.querySelector('.workspace-heading-context').textContent=headings[tab][1];
    }

    adminCard.querySelectorAll('[data-admin-tab]').forEach((button) => {
      const selected = button.dataset.adminTab === tab;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    adminViews.forEach((view) =>
      view.classList.toggle('hidden', view.dataset.adminView !== tab),
    );
    const usesMainWorkspace = tab !== 'situations';
    adminWorkspace?.classList.toggle('hidden', !usesMainWorkspace);
    fieldCard?.classList.toggle('hidden', usesMainWorkspace);
    if (tab === 'teams') switchTeamView(activeTeamView);
    if (tab === 'situations') window._diqSituationEditorOpened?.('admin');
    else window._diqSituationEditorClosed?.('admin');
    // Closing the editor restores the field; the destination tab owns final visibility.
    if(usesMainWorkspace)fieldCard?.classList.add('hidden');
  }

  adminCard.querySelectorAll('[data-admin-tab]').forEach((button) =>
    button.addEventListener('click', () => switchTab(button.dataset.adminTab)),
  );
  document.querySelectorAll('[data-admin-team-tab]').forEach((button) =>
    button.addEventListener('click', () => switchTeamView(button.dataset.adminTeamTab)),
  );
  teamSelect?.addEventListener('change', () => {
    creatingTeam = false;
    seasons = [];
    seasonMembers = [];
    renderSelectedTeam();
    renderWorkspaceDirectory();
    void loadSeasonData(selectedTeam()?.id || '').catch((error) =>
      setStatus(error?.message || 'Unable to load season data.', 'error'),
    );
  });
  seasonSelect?.addEventListener('change', () => renderSeasonControls(seasonSelect.value));
  cleanupSeasonSelect?.addEventListener('change', () => {
    setEnabled([byId('adminCleanupExportBtn')], Boolean(selectedCleanupSeason()));
    renderSeasonPlayerSelect();
  });
  seasonPlayerSelect?.addEventListener('change', renderSeasonPlayerSelect);
  deletePlayerSelect?.addEventListener('change', () =>
    setEnabled([byId('adminPlayerDeleteBtn')], Boolean(selectedDeletionPlayer())),
  );
  if(playerSelect) new MutationObserver(renderRosterBrowser).observe(playerSelect,{childList:true});
  playerSelect?.addEventListener('change', renderPlayerForm);
  coachSelect?.addEventListener('change', renderCoachForm);
  unassignedPlayerSelect?.addEventListener('change', renderPlayerMovement);
  existingPlayerNumber?.addEventListener('input', renderPlayerMovement);
  transferTeamSelect?.addEventListener('change', renderPlayerMovement);
  transferPlayerNumber?.addEventListener('input', renderPlayerMovement);
  advanceDestinationSelect?.addEventListener('change', renderAdvanceRoster);
  [advanceTeamName, advanceSeasonName, advanceSeasonStart, advanceSeasonEnd]
    .forEach((input) => input?.addEventListener('input', updateAdvanceRosterButton));
  [teamName, initialSeasonName, playerName, playerNumber, playerPassword, coachName, coachPassword]
    .forEach((input) => input?.addEventListener('input', () => clearFieldError(input)));
  proposalSelect?.addEventListener('change', renderProposalDetails);
  byId('adminGenPassBtn')?.addEventListener('click', () => {
    if (playerPassword) playerPassword.value = generatePassword();
  });
  byId('adminCoachGenPassBtn')?.addEventListener('click', () => {
    if (coachPassword) coachPassword.value = generatePassword();
  });

  byId('adminTeamsResetBtn')?.addEventListener('click', () => {
    void loadAdminData(teamSelect?.value || '').catch((error) =>
      setStatus(error?.message || 'Unable to refresh team data.', 'error'),
    );
  });

  byId('adminNewTeamBtn')?.addEventListener('click', () => {
    creatingTeam = true;
    if (teamSelect) teamSelect.value = '';
    renderSelectedTeam();
    renderWorkspaceDirectory();
    void loadSeasonData('');
    teamName?.focus();
  });

  byId('adminTeamCancelCreateBtn')?.addEventListener('click', () => {
    creatingTeam = false;
    if (teamSelect) teamSelect.value = '';
    renderSelectedTeam();
    renderWorkspaceDirectory();
    void loadSeasonData('');
    byId('adminNewTeamBtn')?.focus();
  });

  byId('adminTeamAddBtn')?.addEventListener('click', () => {
    const name = String(teamName?.value || '').trim();
    if (!validateTeamFields()) {
      return setStatus('Correct the highlighted team fields.', 'error');
    }
    let id = '';
    void perform(
      'Creating team…',
      async () => {
        const result = await diqApiRequest('admin/teams', {
          method: 'POST',
          body: JSON.stringify({
            name,
            seasonName: String(initialSeasonName?.value || '').trim(),
            regionId: directoryScope?.regionId,
          }),
        });
        id = result?.record?.id || '';
      },
      'Team created.',
      () => id,
    );
  });

  byId('adminTeamUpdateBtn')?.addEventListener('click', () => {
    const team = selectedTeam();
    if (!team) return setStatus('Select a team to update.', 'error');
    if (!validateTeamFields()) {
      return setStatus('Correct the highlighted team fields.', 'error');
    }
    void perform(
      'Saving team…',
      () =>
        diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}`, {
          method: 'PUT',
          headers: { 'If-Match': String(team.revision) },
          body: JSON.stringify({
            name: String(teamName?.value || '').trim(),
          }),
        }),
      'Team saved.',
      team.id,
    );
  });

  byId('adminTeamRemoveBtn')?.addEventListener('click', async () => {
    const team = selectedTeam();
    if (!team) return;
    const confirmed = await requestConfirmation({
      title: 'Archive team',
      message: `Archive ${team.name}? Its accounts will no longer be available for normal use, but historical results will be preserved.`,
      confirmLabel: 'Archive team',
    });
    if (!confirmed) return;
    void perform(
      'Archiving team…',
      () =>
        diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}`, {
          method: 'DELETE',
          headers: { 'If-Match': String(team.revision) },
        }),
      'Team archived.',
    );
  });

  byId('adminSeasonAddBtn')?.addEventListener('click', () => {
    const team = selectedTeam();
    const name = String(seasonName?.value || '').trim();
    clearFieldError(seasonName);
    if (!team) return setStatus('Select a team first.', 'error');
    if (!name) {
      setFieldError(seasonName, 'Enter a season name.');
      focusFirstInvalid();
      return setStatus('Enter a season name.', 'error');
    }
    void perform(
      'Creating season…',
      () => diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}/seasons`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          startsOn: seasonStart?.value || null,
          endsOn: seasonEnd?.value || null,
        }),
      }),
      'Season created. Current roster members were carried into it.',
      team.id,
    );
  });

  function exportSeasonData(season) {
    const team = selectedTeam();
    if (!team || !season) return setStatus('Select a season to export.', 'error');
    window.location.assign(diqApiUrl(
      `admin/teams/${encodeURIComponent(team.id)}/seasons/${encodeURIComponent(season.id)}/export`,
    ));
    setStatus(`Preparing the ${season.name} export…`, 'pending');
  }

  byId('adminSeasonExportBtn')?.addEventListener('click', () =>
    exportSeasonData(selectedSeason()),
  );
  byId('adminCleanupExportBtn')?.addEventListener('click', () =>
    exportSeasonData(selectedCleanupSeason()),
  );

  function renderCleanupPreview(preview) {
    if (!seasonCleanupPreview) return;
    const items = [
      ['Roster records', preview.memberships],
      ['Practices', preview.assignments],
      ['Recipients', preview.recipients],
      ['Progress records', preview.progressRecords],
      ['Results', preview.attempts],
    ];
    seasonCleanupPreview.replaceChildren(...items.map(([label, count]) => {
      const item = document.createElement('div');
      const labelElement = document.createElement('span');
      const countElement = document.createElement('strong');
      labelElement.textContent = label;
      countElement.textContent = String(Number(count || 0));
      item.append(labelElement, countElement);
      return item;
    }));
    seasonCleanupPreview.classList.remove('hidden');
    const season = selectedCleanupSeason();
    const player = selectedSeasonPlayer();
    cleanupPreviewKey = season && player ? `${season.id}:${player.userId}` : '';
    setEnabled([byId('adminPlayerClearSeasonBtn')], Boolean(cleanupPreviewKey));
  }

  byId('adminSeasonPreviewBtn')?.addEventListener('click', async () => {
    const team = selectedTeam();
    const season = selectedCleanupSeason();
    const player = selectedSeasonPlayer();
    if (!team || !season || !player) {
      return setStatus('Select a historical season and player first.', 'error');
    }
    try {
      clearCleanupPreview();
      setStatus('Calculating the records that would be deleted…', 'pending');
      const playerFilter = `?playerId=${encodeURIComponent(player.userId)}`;
      const result = await diqApiRequest(
        `admin/teams/${encodeURIComponent(team.id)}/seasons/${encodeURIComponent(season.id)}/cleanup${playerFilter}`,
        { cache: 'no-store' },
      );
      renderCleanupPreview(result.preview || {});
      setStatus(
        `${player.name}'s deletion preview is ready. No records were changed.`,
        'success',
      );
    } catch (error) {
      setStatus(error?.message || 'Unable to preview season cleanup.', 'error');
    }
  });

  async function closeSeason() {
    const team = selectedTeam();
    const season = selectedSeason();
    if (!team || !season) return;
    const confirmed = await requestConfirmation({
      title: 'Close season',
      message: `Close ${seasonLabel(team, season)}? Players will stop receiving this season's practice and unfinished attempts will be marked abandoned.`,
      confirmLabel: 'Close season',
    });
    if (!confirmed) return;
    await perform(
      'Closing season…',
      () => diqApiRequest(
        `admin/teams/${encodeURIComponent(team.id)}/seasons/${encodeURIComponent(season.id)}`,
        { method: 'PATCH', body: JSON.stringify({ action: 'close' }) },
      ),
      'Season closed.',
      team.id,
    );
  }

  byId('adminSeasonCloseBtn')?.addEventListener('click', () => void closeSeason());
  byId('adminSeasonDeleteBtn')?.addEventListener('click', async () => {
    const team = selectedTeam();
    const season = selectedSeason();
    if (!team || !season || season.status === 'active') return;
    const confirmed = await requestConfirmation({
      title: 'Delete closed season',
      message: `Permanently delete ${seasonLabel(team, season)} and its roster snapshots, practices, progress, and results? Export it first if this history may be needed.`,
      confirmLabel: 'Delete season',
      requiredText: season.name,
    });
    if (!confirmed) return;
    await perform(
      'Deleting season…',
      () => diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}/seasons/${encodeURIComponent(season.id)}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: season.name }),
      }),
      'Closed season permanently deleted.',
      team.id,
    );
  });

  byId('adminAddExistingPlayerBtn')?.addEventListener('click', async () => {
    const team = selectedTeam();
    const player = unassignedPlayers.find((item) => item.userId === unassignedPlayerSelect?.value);
    const number = String(existingPlayerNumber?.value || '').trim();
    if (!team || !player || !number) {
      return setStatus('Select an unassigned player and enter their team number.', 'error');
    }
    const confirmed = await requestConfirmation({
      title: 'Add existing player',
      message: `Add ${player.name} to ${teamLabel(team)} as #${number}? Their existing password and historical results will be preserved.`,
      confirmLabel: 'Add player',
    });
    if (!confirmed) return;
    await perform(
      'Adding existing player…',
      () => diqApiRequest(
        `admin/teams/${encodeURIComponent(team.id)}/members/existing`,
        { method: 'POST', body: JSON.stringify({ userId: player.userId, number }) },
      ),
      `${player.name} was added to ${team.name}.`,
      team.id,
    );
  });

  byId('adminTransferPlayerBtn')?.addEventListener('click', async () => {
    const player = selectedMember('player');
    const destination = teams.find((item) => item.id === transferTeamSelect?.value);
    const number = String(transferPlayerNumber?.value || '').trim();
    if (!player || !destination || !number) {
      return setStatus('Select a player, destination team, and new player number.', 'error');
    }
    const source = selectedTeam();
    const confirmed = await requestConfirmation({
      title: 'Transfer player',
      message: `Move ${player.name} from ${teamLabel(source)} to ${teamLabel(destination)} as #${number}? Current practice will stop, active sessions will be signed out, and historical results will remain with ${teamLabel(source)}.`,
      confirmLabel: 'Transfer player',
    });
    if (!confirmed) return;
    await perform(
      'Transferring player…',
      () => diqApiRequest(
        `admin/players/${encodeURIComponent(player.playerId)}/transfer`,
        { method: 'POST', body: JSON.stringify({ destinationTeamId: destination.id, number }) },
      ),
      `${player.name} was transferred to ${teamLabel(destination)}.`,
      destination.id,
    );
  });

  byId('adminAdvanceRosterBtn')?.addEventListener('click', async () => {
    const source = selectedTeam();
    if (!source) return setStatus('Select a source team.', 'error');
    const members = [...(advanceRosterList?.querySelectorAll('input[type="checkbox"]:checked') || [])]
      .map((checkbox) => {
        const userId = checkbox.dataset.advanceUserId;
        const numberInput = advanceRosterList?.querySelector(`[data-advance-number-for="${CSS.escape(userId)}"]`);
        return { userId, number: numberInput?.value || '' };
      });
    if (!members.length) return setStatus('Select at least one player or coach to advance.', 'error');
    const destinationId = advanceDestinationSelect?.value;
    const destination = teams.find((item) => item.id === destinationId);
    const destinationLabel = destination ? teamLabel(destination) : String(advanceTeamName?.value || '').trim();
    if (!destinationLabel) return setStatus('Enter the destination team name.', 'error');
    const confirmed = await requestConfirmation({
      title: 'Advance roster',
      message: `Move ${members.length} selected account${members.length === 1 ? '' : 's'} from ${source.name} to ${destinationLabel}? Existing results remain with their original season and everyone moved will be signed out.`,
      confirmLabel: 'Advance roster',
    });
    if (!confirmed) return;
    let createdTeamId = destination?.id || '';
    await perform(
      'Advancing roster…',
      async () => {
        const result = await diqApiRequest(
          `admin/teams/${encodeURIComponent(source.id)}/advance`,
          {
            method: 'POST',
            body: JSON.stringify({
              destinationTeamId: destination?.id || undefined,
              destinationTeamName: destination ? undefined : destinationLabel,
              seasonName: destination ? undefined : String(advanceSeasonName?.value || '').trim(),
              startsOn: destination ? undefined : advanceSeasonStart?.value || null,
              endsOn: destination ? undefined : advanceSeasonEnd?.value || null,
              members,
            }),
          },
        );
        createdTeamId = result?.team?.id || createdTeamId;
      },
      `${members.length} account${members.length === 1 ? '' : 's'} advanced to ${destinationLabel}.`,
      () => createdTeamId,
    );
  });

  byId('adminPlayerAddBtn')?.addEventListener('click', () =>
    void createMember('player'),
  );
  byId('adminPlayerUpdateBtn')?.addEventListener('click', () =>
    void updateMember('player'),
  );
  byId('adminPlayerRemoveBtn')?.addEventListener('click', () =>
    void removeMember('player'),
  );
  byId('adminCoachAddBtn')?.addEventListener('click', () =>
    void createMember('coach'),
  );
  byId('adminCoachUpdateBtn')?.addEventListener('click', () =>
    void updateMember('coach'),
  );
  byId('adminCoachRemoveBtn')?.addEventListener('click', () =>
    void removeMember('coach'),
  );

  byId('adminPlayerClearSeasonBtn')?.addEventListener('click', async () => {
    const team = selectedTeam();
    const season = selectedCleanupSeason();
    const player = selectedSeasonPlayer();
    if (!team || !season || !player || cleanupPreviewKey !== `${season.id}:${player.userId}`) {
      return setStatus('Preview this player’s deletion impact before continuing.', 'error');
    }
    const confirmed = await requestConfirmation({
      title: 'Delete player season records',
      message: `Permanently delete ${player.name}'s practice progress and results from ${season.name}? Export the season first if these records may be needed. The player account will be retained.`,
      confirmLabel: 'Delete records',
    });
    if (!confirmed) return;
    await perform(
      'Deleting player season records…',
      () => diqApiRequest(
        `admin/teams/${encodeURIComponent(team.id)}/seasons/${encodeURIComponent(season.id)}/cleanup`,
        {
          method: 'POST',
          body: JSON.stringify({
            playerId: player.userId,
            confirmation: 'CLEAR SEASON RECORDS',
          }),
        },
      ),
      `${player.name}'s ${season.name} records were deleted. The account was retained.`,
      team.id,
    );
  });

  byId('adminPlayerDeleteBtn')?.addEventListener('click', async () => {
    const player = selectedDeletionPlayer();
    if (!player) return;
    const confirmed = await requestConfirmation({
      title: 'Delete player permanently',
      message: `Permanently delete ${player.name}? This removes the account, personal information, sessions, assignments, progress, and every saved result across all teams and seasons. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
    });
    if (!confirmed) return;
    await perform(
      'Permanently deleting player…',
      () => diqApiRequest(`admin/users/${encodeURIComponent(player.userId)}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: 'DELETE PLAYER PERMANENTLY' }),
      }),
      'Player account and identifying records were permanently deleted.',
      selectedTeam()?.id || '',
    );
  });

  byId('adminTeamDeleteBtn')?.addEventListener('click', async () => {
    const team = selectedTeam();
    if (!team || team.activeSeasonId) return setStatus('Close the active season before deleting this team.', 'error');
    const deletePlayers = Boolean(byId('adminDeleteTeamPlayers')?.checked);
    try {
      const result = await diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}/deletion-preview`, { cache: 'no-store' });
      const preview = result?.preview || {};
      const playerWarning = deletePlayers
        ? ` It will also permanently delete ${Number(preview.players || 0)} assigned player account(s) and all of their records.`
        : ' Assigned player accounts will become unassigned. Their records outside this team remain, but this team’s results are deleted with the team.';
      const confirmed = await requestConfirmation({
        title: 'Delete team permanently',
        message: `Delete ${teamLabel(team)}? This removes ${Number(preview.seasons || 0)} season(s), ${Number(preview.assignments || 0)} practice assignment(s), and ${Number(preview.attempts || 0)} result(s).${playerWarning}`,
        confirmLabel: 'Delete team',
        requiredText: team.name,
      });
      if (!confirmed) return;
      await perform(
        'Deleting team…',
        () => diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}/permanent`, {
          method: 'DELETE',
          body: JSON.stringify({ confirmation: team.name, deletePlayers }),
        }),
        'Team permanently deleted.',
      );
    } catch (error) {
      setStatus(error?.message || 'Unable to delete the team.', 'error');
    }
  });

  function setAdvanceRosterSelection(selected) {
    advanceRosterList?.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach((checkbox) => {
      checkbox.checked = selected;
    });
    updateAdvanceRosterButton();
  }
  byId('adminAdvanceSelectAllBtn')?.addEventListener('click', () => setAdvanceRosterSelection(true));
  byId('adminAdvanceClearAllBtn')?.addEventListener('click', () => setAdvanceRosterSelection(false));

  byId('adminRestoreTeamBtn')?.addEventListener('click', () => {
    const id = archivedTeamSelect?.value;
    const team = teams.find((item) => item.id === id);
    if (!team) return setStatus('Select an archived team.', 'error');
    void perform(
      'Restoring team…',
      () =>
        diqApiRequest(`admin/teams/${encodeURIComponent(id)}/restore`, {
          method: 'POST',
          headers: { 'If-Match': String(team.revision) },
        }),
      'Team restored.',
      id,
    );
  });

  byId('adminRestoreMemberBtn')?.addEventListener('click', () => {
    const [teamId, userId] = String(archivedMemberSelect?.value || '').split(
      '\u0000',
    );
    const member = teams
      .find((item) => item.id === teamId)
      ?.roster?.find((item) => item.playerId === userId);
    if (!member) return setStatus('Select an archived account.', 'error');
    void perform(
      'Restoring account…',
      () =>
        diqApiRequest(
          `admin/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}/restore`,
          {
            method: 'POST',
            headers: { 'If-Match': String(member.revision) },
          },
        ),
      'Account restored.',
      teamId,
    );
  });

  byId('adminDeleteSituationBtn')?.addEventListener('click',()=>{const key=archivedSituationSelect?.value;if(key)void window._diqDeleteSituationPermanently?.(key).then(ok=>{if(ok)return loadAdminData();});else setStatus('Select an archived situation.','error');});

  byId('adminRestoreSituationBtn')?.addEventListener('click', () => {
    const key = archivedSituationSelect?.value;
    const situation = archivedSituations.find((item) => item.key === key);
    if (!situation) return setStatus('Select an archived situation.', 'error');
    void perform(
      'Restoring situation…',
      () =>
        diqApiRequest(`admin/situations/${encodeURIComponent(key)}/restore`, {
          method: 'POST',
          headers: { 'If-Match': String(situation.revision) },
        }),
      'Situation restored.',
    ).then(async (ok) => {
      if (ok && typeof loadSituationsFromDatabase === 'function') {
        await loadSituationsFromDatabase();
        loadStarts();
        loadHits();
        populateSituations(key);
        setSituation(key);
      }
    });
  });

  async function reviewProposal(decision) {
    const proposal = proposals.find(
      (item) => item.id === proposalSelect?.value,
    );
    if (!proposal) return;
    const notes = String(proposalNotes?.value || '').trim();
    if (decision === 'reject' && !notes) {
      return setStatus('Add a review note before rejecting.', 'error');
    }
    const acceptedFields = Array.from(
      proposalDiffList?.querySelectorAll('input[data-proposal-field]:checked') || [],
    ).map((input) => input.dataset.proposalField);
    if (decision === 'approve' && proposal.submissionType === 'update' && !acceptedFields.length) {
      return setStatus('Select at least one proposed change to publish.', 'error');
    }
    const ok = await perform(
      decision === 'approve' ? 'Publishing proposal…' : 'Rejecting proposal…',
      () =>
        diqApiRequest(
          `admin/situation-submissions/${encodeURIComponent(proposal.id)}`,
          {
            method: 'PUT',
            body: JSON.stringify({ decision, notes, acceptedFields }),
          },
        ),
      decision === 'approve'
        ? 'Proposal approved and published.'
        : 'Proposal rejected.',
      teamSelect?.value || '',
    );
    if (ok && decision === 'approve' && typeof loadSituationsFromDatabase === 'function') {
      await loadSituationsFromDatabase();
      loadStarts();
      loadHits();
      populateSituations(proposal.situationKey);
      setSituation(proposal.situationKey);
    }
  }
  byId('adminProposalApproveBtn')?.addEventListener('click', () =>
    void reviewProposal('approve'),
  );
  byId('adminProposalRejectBtn')?.addEventListener('click', () =>
    void reviewProposal('reject'),
  );

  const csvFile = byId('adminTeamsCsvFile');
  const csvDropzone = byId('adminCsvDropzone');
  const csvFileName = byId('adminCsvFileName');
  const csvPreviewPanel = byId('adminCsvPreview');
  const csvSummary = byId('adminCsvSummary');
  const csvIssues = byId('adminCsvIssues');
  const csvOperations = byId('adminCsvOperations');
  const csvCommit = byId('adminCsvCommitBtn');
  const csvReviewConfirm = byId('adminCsvReviewConfirm');
  const csvReviewConfirmLabel = byId('adminCsvReviewConfirmLabel');
  const csvArchiveConfirm = byId('adminCsvArchiveConfirm');
  const csvArchiveConfirmLabel = byId('adminCsvArchiveConfirmLabel');
  let csvSource = '';
  let csvPreview = null;

  let csvTeamId = '';
  let csvRequest = 0;

  function clearCsvPreview() {
    csvRequest += 1;
    csvTeamId = '';
    csvSource = '';
    csvPreview = null;
    if (csvFile) csvFile.value = '';
    if (csvFileName) csvFileName.textContent = 'or choose a file up to 512 KB';
    csvPreviewPanel?.classList.add('hidden');
    csvReviewConfirmLabel?.classList.add('hidden');
    csvArchiveConfirmLabel?.classList.add('hidden');
    if (csvReviewConfirm) csvReviewConfirm.checked = false;
    if (csvArchiveConfirm) csvArchiveConfirm.checked = false;
    if (csvSummary) csvSummary.replaceChildren();
    if (csvIssues) csvIssues.replaceChildren();
    if (csvOperations) csvOperations.replaceChildren();
  }

  function updateCsvCommitState() {
    if (!csvCommit) return;
    const hasArchives = Number(csvPreview?.summary?.archives || 0) > 0;
    csvCommit.disabled = !csvPreview?.valid
      || Number(csvPreview?.summary?.changes || 0) < 1
      || !csvReviewConfirm?.checked
      || (hasArchives && !csvArchiveConfirm?.checked);
  }

  function renderCsvPreview(preview) {
    csvPreview = preview;
    csvPreviewPanel?.classList.remove('hidden');
    const summaryItems = [
      ['Changes', preview.summary.changes],
      ['Create', preview.summary.creates],
      ['Update', preview.summary.updates],
      ['Restore', preview.summary.restores],
      ['Archive', preview.summary.archives],
      ['Unchanged', preview.summary.unchanged],
    ];
    if (csvSummary) {
      csvSummary.innerHTML = summaryItems.map(([label, value]) =>
        `<div><span>${label}</span><strong>${Number(value || 0)}</strong></div>`).join('');
    }
    if (csvIssues) {
      const issues = Array.isArray(preview.issues) ? preview.issues : [];
      csvIssues.innerHTML = issues.length
        ? `<div class="admin-csv-issues"><strong>File review</strong>${issues.map((issue) =>
          `<div class="is-${issue.severity}"><span>Row ${issue.row}</span><p>${escapeHtml(issue.message)}</p></div>`).join('')}</div>`
        : '<div class="admin-csv-ready">No validation problems found.</div>';
    }
    if (csvOperations) {
      const operations = Array.isArray(preview.operations) ? preview.operations : [];
      csvOperations.innerHTML = operations.length
        ? `<div class="admin-csv-table-wrap"><table class="admin-csv-table"><caption class="sr-only">Changes in the selected CSV import preview</caption><thead><tr><th scope="col">Row</th><th scope="col">Change</th><th scope="col">Record</th><th scope="col">Database ID</th></tr></thead><tbody>${operations.map((operation) =>
          `<tr><td>${operation.row}</td><td><span class="admin-csv-action is-${operation.action}">${operation.action}</span></td><td>${escapeHtml(operation.label)}</td><td><code>${escapeHtml(operation.userId || operation.teamId)}</code></td></tr>`).join('')}</tbody></table></div>`
        : '';
    }
    const hasArchives = Number(preview.summary.archives || 0) > 0;
    const hasChanges = preview.valid && Number(preview.summary.changes || 0) > 0;
    csvReviewConfirmLabel?.classList.toggle('hidden', !hasChanges);
    csvArchiveConfirmLabel?.classList.toggle('hidden', !hasArchives);
    if (csvReviewConfirm) csvReviewConfirm.checked = false;
    if (csvArchiveConfirm) csvArchiveConfirm.checked = false;
    updateCsvCommitState();
    setStatus(
      preview.valid
        ? `${preview.summary.changes} database change${preview.summary.changes === 1 ? '' : 's'} ready for review.`
        : `CSV preview found ${preview.summary.errors} error${preview.summary.errors === 1 ? '' : 's'}.`,
      preview.valid ? 'success' : 'error',
    );
  }

  async function previewCsvFile(file) {
    const team = selectedTeam();
    if (!file || !team) return;
    const request = ++csvRequest;
    csvTeamId = '';
    csvPreview = null;
    csvPreviewPanel?.classList.add('hidden');
    if (csvCommit) csvCommit.disabled = true;
    if (file.size > 512 * 1024) {
      setStatus('The CSV file must be 512 KB or smaller.', 'error');
      return;
    }
    try {
      setStatus('Validating the CSV without changing the database…', 'pending');
      const csv = await file.text();
      if (request !== csvRequest || selectedTeam()?.id !== team.id) return;
      if (csvFileName) csvFileName.textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
      const preview = await diqApiRequest('admin/team-import', {
        method: 'POST',
        body: JSON.stringify({ mode: 'preview', csv, teamId: team.id }),
      });
      if (request !== csvRequest || selectedTeam()?.id !== team.id) return;
      csvSource = csv;
      csvTeamId = team.id;
      renderCsvPreview(preview);
    } catch (error) {
      if (request !== csvRequest || selectedTeam()?.id !== team.id) return;
      setStatus(error?.message || 'Unable to preview this CSV.', 'error');
      csvPreviewPanel?.classList.add('hidden');
    }
  }

  byId('adminTeamsCsvChooseBtn')?.addEventListener('click', () => csvFile?.click());
  csvFile?.addEventListener('change', () => void previewCsvFile(csvFile.files?.[0]));
  teamSelect?.addEventListener('change', () => {
    clearCsvPreview();
  });
  csvDropzone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    csvDropzone.classList.add('is-dragging');
  });
  csvDropzone?.addEventListener('dragleave', () => csvDropzone.classList.remove('is-dragging'));
  csvDropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    csvDropzone.classList.remove('is-dragging');
    void previewCsvFile(event.dataTransfer?.files?.[0]);
  });
  csvReviewConfirm?.addEventListener('change', updateCsvCommitState);
  csvArchiveConfirm?.addEventListener('change', updateCsvCommitState);
  byId('adminCsvCancelBtn')?.addEventListener('click', clearCsvPreview);
  csvCommit?.addEventListener('click', async () => {
    if (!csvPreview?.valid || !csvSource || csvTeamId !== selectedTeam()?.id) return;
    try {
      csvCommit.disabled = true;
      setStatus('Applying the reviewed CSV changes…', 'pending');
      const result = await diqApiRequest('admin/team-import', {
        method: 'POST',
        body: JSON.stringify({ mode: 'commit', csv: csvSource, teamId: csvTeamId, fingerprint: csvPreview.fingerprint }),
      });
      const preferredTeam = teamSelect?.value || '';
      clearCsvPreview();
      await refreshPublicTeams();
      await loadAdminData(preferredTeam);
      setStatus(`CSV import complete: ${result.summary.changes} database change${result.summary.changes === 1 ? '' : 's'} applied.`, 'success');
    } catch (error) {
      setStatus(error?.message || 'CSV import failed.', 'error');
      updateCsvCommitState();
    }
  });
  async function downloadRosterCsv(download) {
    const team = selectedTeam();
    if (!team) return setStatus('Select a team first.', 'error');
    try {
      const query = new URLSearchParams({ teamId: team.id, download });
      const response = await fetch(diqApiUrl(`admin/team-import?${query}`), { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Roster download failed (${response.status}).`);
      downloadText(`diamond-defense-${slugifyLoose(team.name)}-roster-${download}.csv`, await response.text(), 'text/csv;charset=utf-8');
    } catch (error) {
      setStatus(error?.message || 'Unable to download the roster CSV.', 'error');
    }
  }
  byId('adminTeamsCsvTemplateBtn')?.addEventListener('click', () => void downloadRosterCsv('template'));
  byId('adminTeamsCsvSelectedBtn')?.addEventListener('click', () => void downloadRosterCsv('export'));

  // One situation editor is physically shared by the coach and admin panels.
  const POSITION_IDS = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  const FIELD_WIDTH = 3200;
  const FIELD_HEIGHT = 2133;
  const EDITABLE_FIELDS = [
    ['title', 'Situation name'], ['ballLocation', 'Ball location'], ['audience', 'Staff label'], ['suggestedDivisions', 'Suggested divisions'], ['desc', 'Coaching context'], ['category', 'Hit outcome'],
    ['difficulty', 'Difficulty'], ['primaryCategory', 'Primary teaching category'],
    ['relatedCategories', 'Related teaching categories'], ['outs', 'Outs'],
    ['runnersOn', 'Runners'], ['starts', 'Starting alignment'],
    ['targets', 'Targets, tolerances, and notes'], ['hit', 'Ball landing spot'],
    ['hitType', 'Ball type'], ['playOutcome', 'Play outcome'],
    ['runnerOutcomes', 'Runner outcomes'],
    ['playSeq', 'Play sequence'], ['playSeq2', 'Secondary play sequence'], ['boardAnimation', 'Instructional movement'], ['seqNote', 'Sequence coaching note'],
  ];
  const OUTCOME_ATOMIC_FIELDS = ['runnersOn', 'batterAdvance', 'playOutcome', 'runnerOutcomes'];
  const situationEditor = byId('situationBuilderSubsec');
  const coachEditorMount = byId('coachSituationEditorMount');
  const adminEditorMount = byId('adminSituationEditorMount');
  const submitSituation = byId('submitSituationBtn');
  const publishSituation = byId('publishSituationBtn');
  const archiveSituation = byId('deleteSituationBtn');
  const previewSituation = byId('previewSituationBtn');
  const previewSequence = byId('previewSequenceBtn');
  const resetSelectedPosition = byId('resetSelectedPositionBtn');
  const editorTitle = byId('situationBuilderTitle');
  const workflowStatus = byId('situationWorkflowStatus');
  const workflowRole = byId('situationWorkflowRole');
  const workflowHeading = byId('situationWorkflowHeading');
  const workflowCopy = byId('situationWorkflowCopy');
  const dirtyBadge = byId('situationDirtyBadge');
  const validationPanel = byId('situationValidationPanel');
  const validationSummary = byId('situationValidationSummary');
  const validationIssues = byId('situationValidationIssues');
  const positionCompleteness = byId('positionCompleteness');
  const reviewSummary = byId('situationReviewSummary');
  const coachSummary = byId('coachProposalSummary');
  const coachChangeSummary = byId('coachProposalChangeSummary');
  const coachRationale = byId('coachProposalRationale');
  const coachHistory = byId('coachProposalHistory');
  let editorRole = null;
  let editorDirty = false;
  let editorBaseline = null;
  let playerPreviewActive = false;
  let proposalPreviewState = null;

  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const sameValue = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  const currentSnapshot = () => window._diqGetCurrentSituationSnapshot?.() || null;

  function changedFields(snapshot, baseline = editorBaseline) {
    if (!snapshot) return [];
    if (!baseline) return EDITABLE_FIELDS.map(([field]) => field);
    return EDITABLE_FIELDS
      .filter(([field]) => !sameValue(snapshot[field], baseline[field]))
      .map(([field]) => field);
  }

  function geometryChangeSummary(field, before = {}, after = {}) {
    const noun = field === 'targets' ? 'target positions' : 'starting positions';
    const changes = POSITION_IDS.flatMap((position) => {
      const previous = before?.[position];
      const next = after?.[position];
      if (!previous && !next) return [];
      if (!previous) return [`${position} added`];
      if (!next) return [`${position} removed`];
      const details = [];
      if (Number(previous.x) !== Number(next.x) || Number(previous.y) !== Number(next.y)) {
        details.push('moved');
      }
      if (field === 'targets' && Number(previous.tol || 0) !== Number(next.tol || 0)) {
        details.push('tolerance changed');
      }
      if (field === 'targets'
        && String(previous.notes || previous.note || '') !== String(next.notes || next.note || '')) {
        details.push('note changed');
      }
      return details.length ? [`${position} ${details.join(', ')}`] : [];
    });
    if (!changes.length) return `No ${noun} changed`;
    return `${changes.length} of ${POSITION_IDS.length} ${noun} changed: ${changes.join('; ')}`;
  }

  function teachingCategoryNames(value) {
    const labels = new Map(
      (window.DIQ_TEACHING_CATEGORIES || []).map((category) => [category.id, category.label]),
    );
    return Array.isArray(value) && value.length
      ? value.map((category) => labels.get(category) || category).join(', ')
      : 'None';
  }

  function teachingCategoryName(value) {
    const category = (window.DIQ_TEACHING_CATEGORIES || [])
      .find((item) => item.id === value);
    return category?.label || value || '—';
  }

  function ballLocationLabel(value) {
    if (!Number.isFinite(value?.x) || !Number.isFinite(value?.y)) return 'Not set';
    const horizontal = value.x < FIELD_WIDTH * 0.4
      ? 'left side'
      : value.x > FIELD_WIDTH * 0.6 ? 'right side' : 'center';
    const depth = value.y < FIELD_HEIGHT * 0.34
      ? 'deep outfield'
      : value.y < FIELD_HEIGHT * 0.62 ? 'shallow outfield' : 'infield';
    return `${depth}, ${horizontal} (${Math.round(value.x)}, ${Math.round(value.y)})`;
  }

  function ballLocationChangeSummary(before, after) {
    if (!Number.isFinite(before?.x) || !Number.isFinite(before?.y)) {
      return `Set to ${ballLocationLabel(after)}`;
    }
    const dx = Math.round(Number(after?.x) - Number(before.x));
    const dy = Math.round(Number(after?.y) - Number(before.y));
    const directions = [
      dx ? `${Math.abs(dx)} toward ${dx > 0 ? 'right field' : 'left field'}` : '',
      dy ? `${Math.abs(dy)} toward ${dy > 0 ? 'home plate' : 'the outfield'}` : '',
    ].filter(Boolean);
    return directions.length
      ? `Moved ${directions.join(' and ')}; now ${ballLocationLabel(after)}`
      : `Unchanged at ${ballLocationLabel(after)}`;
  }

  function sequenceChangeSummary(before = [], after = []) {
    const previous = Array.isArray(before) ? before : [];
    const next = Array.isArray(after) ? after : [];
    const changes = [];
    for (let index = 0; index < Math.max(previous.length, next.length); index += 1) {
      if (previous[index] === next[index]) continue;
      if (previous[index] == null) changes.push(`step ${index + 1} added ${next[index]}`);
      else if (next[index] == null) changes.push(`step ${index + 1} removed ${previous[index]}`);
      else changes.push(`step ${index + 1} changed from ${previous[index]} to ${next[index]}`);
    }
    return changes.length
      ? `${changes.length} sequence ${changes.length === 1 ? 'step' : 'steps'} changed: ${changes.join('; ')}`
      : 'No sequence steps changed';
  }

  function formatDiffValue(field, value) {
    if (value == null || value === '') return '—';
    if (field === 'runnersOn') {
      const bases = [value.first && '1B', value.second && '2B', value.third && '3B'].filter(Boolean);
      return bases.join(', ') || 'None';
    }
    if (field === 'playSeq') return Array.isArray(value) && value.length ? `${value.join(' → ')} (${value.length} steps)` : 'Disabled';
    if (field === 'primaryCategory') return teachingCategoryName(value);
    if (field === 'relatedCategories') return teachingCategoryNames(value);
    if (field === 'playOutcome') {
      if (!value) return 'Not configured';
      const label = String(value.result || 'other').replaceAll('_', ' ');
      const batter = String(value.batterResult || 'out').replaceAll('_', ' ');
      const review = value.reviewStatus === 'needs_review' ? '; needs outcome review' : '';
      return `${label}; batter ${batter}; ${Number(value.outsRecorded || 0)} out(s)${review}`;
    }
    if (field === 'runnerOutcomes') {
      return Array.isArray(value) && value.length
        ? value.map((runner) => `${runner.startingBase} → ${runner.result}${runner.outType ? ` (${runner.outType} out${runner.outOrder ? ` #${runner.outOrder}` : ''})` : ''}${runner.taggedUp ? ' (tag up)' : ''}`).join('; ')
        : 'No starting runners';
    }
    if (field === 'starts' || field === 'targets') {
      return `${Object.keys(value || {}).length} positions configured`;
    }
    if (field === 'hit') return ballLocationLabel(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function selectedProposalFields(expandOutcomes = false) {
    const fields = Array.from(
      proposalDiffList?.querySelectorAll('input[data-proposal-field]:checked') || [],
    ).map((input) => input.dataset.proposalField);
    if (expandOutcomes && fields.some((field) => OUTCOME_ATOMIC_FIELDS.includes(field))) {
      OUTCOME_ATOMIC_FIELDS.forEach((field) => {
        if (!fields.includes(field)) fields.push(field);
      });
    }
    return fields;
  }

  function selectedProposalSnapshot(proposal, published) {
    if (!proposal) return null;
    if (proposal.submissionType === 'create' || !published) return clone(proposal.situation);
    const snapshot = clone(published);
    selectedProposalFields(true).forEach((field) => {
      snapshot[field] = clone(proposal.situation?.[field]);
    });
    return snapshot;
  }

  function updateProposalSelectionActions(proposal) {
    const published = publishedSituations.find((item) => item.key === proposal?.situationKey) || null;
    const conflict = proposal?.submissionType === 'update'
      && (!published || Number(published.revision) !== Number(proposal.baseRevision));
    const hasSelection = proposal?.submissionType === 'create' || selectedProposalFields().length > 0;
    setEnabled([byId('adminProposalApproveBtn')], Boolean(proposal) && !conflict && hasSelection);
    setEnabled([proposalPreview], Boolean(proposal) && !conflict && hasSelection);
  }

  function renderProposalComparison(proposal) {
    if (!proposalComparison || !proposalDiffList) return;
    proposalDiffList.replaceChildren();
    proposalConflict?.classList.add('hidden');
    if (!proposal) {
      proposalComparison.classList.add('hidden');
      return;
    }
    proposalComparison.classList.remove('hidden');
    const published = publishedSituations.find((item) => item.key === proposal.situationKey) || null;
    const conflict = proposal.submissionType === 'update'
      && (!published || Number(published.revision) !== Number(proposal.baseRevision));
    if (proposalConflict) {
      proposalConflict.classList.toggle('hidden', !conflict);
      proposalConflict.className = `operation-status${conflict ? ' is-error' : ' hidden'}`;
      proposalConflict.textContent = conflict
        ? 'The published situation changed after this proposal was submitted. Approval is blocked until the coach submits a fresh revision.'
        : '';
    }
    const changes = proposal.submissionType === 'create'
      ? EDITABLE_FIELDS
      : EDITABLE_FIELDS.filter(([field]) => !sameValue(published?.[field], proposal.situation?.[field]));
    if (!changes.length) {
      const empty = document.createElement('div');
      empty.className = 'proposal-diff-empty';
      empty.textContent = 'This proposal does not differ from the published situation.';
      proposalDiffList.appendChild(empty);
    }
    changes.forEach(([field, label]) => {
      const row = document.createElement('div');
      row.className = 'proposal-diff-row';
      const choose = document.createElement('input');
      choose.type = 'checkbox';
      choose.checked = true;
      choose.disabled = proposal.submissionType === 'create' || conflict;
      choose.dataset.proposalField = field;
      if (OUTCOME_ATOMIC_FIELDS.includes(field)) {
        choose.addEventListener('change', () => {
          proposalDiffList.querySelectorAll(OUTCOME_ATOMIC_FIELDS.map((name) => `input[data-proposal-field="${name}"]`).join(', '))
            .forEach((input) => { if (!input.disabled) input.checked = choose.checked; });
        });
      }
      choose.addEventListener('change', () => updateProposalSelectionActions(proposal));
      const title = document.createElement('label');
      title.textContent = label;
      const current = document.createElement('div');
      current.className = 'proposal-diff-value';
      const proposed = document.createElement('div');
      proposed.className = 'proposal-diff-value is-proposed';
      if (field === 'starts' || field === 'targets') {
        const publishedCount = Object.keys(published?.[field] || {}).length;
        current.textContent = published
          ? `Published: ${publishedCount} ${field === 'targets' ? 'targets' : 'starting positions'} form the comparison baseline`
          : 'Published: —';
        proposed.textContent = `Proposed: ${geometryChangeSummary(field, published?.[field], proposal.situation?.[field])}`;
      } else if (field === 'hit') {
        current.textContent = `Published: ${formatDiffValue(field, published?.[field])}`;
        proposed.textContent = `Proposed: ${ballLocationChangeSummary(published?.[field], proposal.situation?.[field])}`;
      } else if (field === 'playSeq') {
        current.textContent = `Published: ${formatDiffValue(field, published?.[field])}`;
        proposed.textContent = `Proposed: ${sequenceChangeSummary(published?.[field], proposal.situation?.[field])}`;
      } else {
        current.textContent = `Published: ${formatDiffValue(field, published?.[field])}`;
        proposed.textContent = `Proposed: ${formatDiffValue(field, proposal.situation?.[field])}`;
      }
      row.append(choose, title, current, proposed);
      proposalDiffList.appendChild(row);
    });
    updateProposalSelectionActions(proposal);
  }

  function validateSituation(snapshot) {
    const issues = [];
    const add = (message, section, severity = 'error') => issues.push({ message, section, severity });
    try { window._diqNormalizeAudience?.(snapshot?.audience); } catch(error) { add(error.message,'sbDetailsSection'); }
    if (!String(snapshot?.title || '').trim()) add('Add a situation name.', 'situationReviewSection');
    if (!String(snapshot?.category || '').trim()) add('Choose a hit outcome.', 'sbDetailsSection');
    const teachingCategoryIds = new Set((window.DIQ_TEACHING_CATEGORIES || []).map(category=>category.id));
    if (!teachingCategoryIds.has(String(snapshot?.primaryCategory || ''))) {
      add('Choose a primary teaching category.', 'sbDetailsSection');
    }
    if ((snapshot?.relatedCategories || []).some(category=>!teachingCategoryIds.has(String(category)) || category === snapshot.primaryCategory)) {
      add('Choose valid, distinct related teaching categories.', 'sbDetailsSection');
    }
    if (!['foundational', 'intermediate', 'advanced'].includes(String(snapshot?.difficulty || ''))) {
      add('Choose a valid difficulty.', 'sbDetailsSection');
    }
    issues.push(...window._diqSituationAuthoring.situationPlayIssues(snapshot));
    POSITION_IDS.forEach(id=>{
      if(!String(snapshot?.targets?.[id]?.notes||snapshot?.targets?.[id]?.note||'').trim())add(`${id}: add a coaching note.`, 'sbTargetsSubsec','warning');
    });
    for (let i = 0; i < POSITION_IDS.length; i += 1) {
      for (let j = i + 1; j < POSITION_IDS.length; j += 1) {
        const left = snapshot?.targets?.[POSITION_IDS[i]];
        const right = snapshot?.targets?.[POSITION_IDS[j]];
        if (!left || !right) continue;
        if (Math.hypot(left.x - right.x, left.y - right.y) < 35) {
          add(`${POSITION_IDS[i]} and ${POSITION_IDS[j]} targets overlap. Confirm that is intentional.`, 'sbTargetsSubsec', 'warning');
        }
      }
    }
    const outcomeIssues = window._diqValidateSituationOutcomes?.(snapshot) || [];
    outcomeIssues.forEach((issue) => add(issue.message, issue.section || 'sbBallHitSubsec', issue.severity || 'error'));
    if (snapshot?.playOutcome?.reviewStatus === 'needs_review' && outcomeIssues.length === 0) {
      add('Confirm the converted play and runner outcomes before publishing.', 'sbBallHitSubsec');
    }
    return issues;
  }

  const startingOutsRow = byId('outsSelSituation')?.closest('.row');
  if(startingOutsRow) byId('sbRunnersSubsec')?.querySelector(':scope > .diq-body')?.prepend(startingOutsRow);
  const resetStartsControl=byId('resetStartsBtn');
  if(resetStartsControl) byId('sbRunnersSubsec')?.querySelector(':scope > .diq-body')?.appendChild(resetStartsControl);
  const editorSectionGroups = {
    sbDetailsSection:['sbDetailsSection'],
    sbRunnersSubsec:['sbRunnersSubsec'],
    sbBallHitSubsec:['sbBallHitSubsec','sbRunnerOutcomesSubsec'],
    sbTargetsSubsec:['sbTargetsSubsec','seqSubsec'],
    situationReviewSection:['situationReviewSection'],
  };
  function focusEditorSection(sectionId) {
    const group = Object.keys(editorSectionGroups).find(key=>editorSectionGroups[key].includes(sectionId)) || 'sbDetailsSection';
    Object.values(editorSectionGroups).flat().forEach(id=>{
      const section = byId(id);
      if(!section) return;
      section.classList.toggle('editor-section-hidden', !editorSectionGroups[group].includes(id));
      section.classList.remove('diq-collapsed');
      section.querySelector(':scope > .diq-body')?.removeAttribute('hidden');
    });
    document.querySelectorAll('[data-editor-step]').forEach(button=>{
      button.classList.toggle('is-current',button.dataset.editorStep===group);
      button.setAttribute('aria-current',button.dataset.editorStep===group ? 'step' : 'false');
    });
    const labels={sbDetailsSection:'Situation details · Set the teaching focus and player context.',sbRunnersSubsec:'Starting positions · Set outs and runners, then drag the blue fielders to their starting positions.',sbBallHitSubsec:'Ball location · Drag the ball marker and choose where the batter and runners finish.',sbTargetsSubsec:'Defensive targets · Drag a target ring. Select a position to edit its allowed distance and coaching note.',situationReviewSection:'Review · Choose a name and check completeness before previewing or submitting.'};
    const help=byId('situationEditingMode');help.textContent=labels[group];const section=byId(group);(section.querySelector(':scope > .diq-body')||section).prepend(help);
    document.body.dataset.situationEditSection=group;
    if(group==='situationReviewSection'){if(/^New Situation(?: \d+)?$/i.test(currentSituation?.title||'')){byId('useSuggestedName')?.click();}renderEditorState(currentSnapshot(),true);}
  }

  function addSituationTransfer(library) {
    const panel = document.createElement('section');
    panel.className = 'situation-transfer';
    panel.setAttribute('aria-label', 'Import situations');
    const body = document.createElement('div'); body.className = 'situation-transfer-body'; panel.append(body); library.append(panel);
    const note = document.createElement('p'); note.textContent = 'Move published situations between local, preview, and production.'; body.append(note);
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const output = document.createElement('div'); output.className = 'situation-transfer-rows';
    function button(label, action) { const element = document.createElement('button'); element.type = 'button'; element.className = 'btn btn-ghost'; element.textContent = label; element.onclick = action; return element; }
    const controls = document.createElement('div'); controls.className = 'situation-transfer-controls';
    const upload = document.createElement('input'); upload.type = 'file'; upload.accept = '.json,application/json'; upload.setAttribute('aria-label', 'Situation export file');
    let busy = false;
    let refreshSelection = () => {};
    const guidance = document.createElement('ol'); guidance.className = 'situation-import-steps';
    function stage(number) { guidance.replaceChildren(); ['Choose file', 'Review changes', 'Publish selection'].forEach((label, index) => { const step = document.createElement('li'); step.textContent = label; if (index + 1 === number) step.setAttribute('aria-current', 'step'); guidance.append(step); }); }
    stage(1);
    function selectionActions(selections, action, label) {
      const items = document.createElement('div'); items.className = 'situation-transfer-items'; items.append(...output.childNodes);
      const toolbar = document.createElement('div'); toolbar.className = 'situation-transfer-controls';
      const count = document.createElement('strong'); count.setAttribute('role', 'status');
      refreshSelection = () => {
        const selected = selections.filter(({check}) => check.checked && !check.disabled).length;
        count.textContent = `${selected} of ${selections.filter(({check}) => !check.disabled).length} selected`;
        action.disabled = busy || selected === 0; action.textContent = selected ? `${label} (${selected})` : label;
        selections.forEach(({check}) => check.closest('.situation-transfer-choice').classList.toggle('is-selected', check.checked));
      };
      toolbar.append(button('Select all', () => { selections.forEach(({check}) => { if (!check.disabled) check.checked = true; }); refreshSelection(); }), button('Clear selection', () => { selections.forEach(({check}) => check.checked = false); refreshSelection(); }));
      const footer = document.createElement('div'); footer.className = 'situation-transfer-footer'; action.className = 'btn btn-brand'; footer.append(count, action);
      items.addEventListener('change', refreshSelection); output.append(toolbar, items, footer); refreshSelection();
    }
    function lock(value) { busy = value; controls.querySelectorAll('button,input').forEach(element => element.disabled = value); if (!value) reviewButton.disabled = !upload.files?.length; }
    function selection(label, disabled = false) { const row = document.createElement('label'); row.className = 'situation-transfer-choice'; const check = document.createElement('input'); check.type = 'checkbox'; check.disabled = disabled; const text = document.createElement('span'); text.textContent = label; row.append(check, text); output.append(row); return check; }
    const reviewButton = button('Review import', async () => {
      if (busy) return;
      const file = upload.files?.[0];
      if (!file) { status.textContent = 'Choose a situation export file first.'; return; }
      if (file.size > 5_000_000) { status.textContent = 'Choose a file smaller than 5 MB.'; return; }
      if (editorDirty) { status.textContent = 'Publish or discard your local situation draft before importing.'; return; }
      refreshSelection = () => {}; lock(true); output.replaceChildren(); status.textContent = 'Reviewing situations…';
      try {
        const review = await diqApiRequest('admin/situations/transfer', { method: 'POST', body: await file.text() });
        status.textContent = `From ${review.source} → ${review.destination}. Choose new or changed situations to publish. Unchanged and conflicting situations cannot be selected.`;
        stage(2);
        const selections = review.rows.map(item => {
          const check = selection(`${item.title} (${item.key}) — ${item.status}${item.error ? ': ' + item.error : ''}`, !['new', 'changed'].includes(item.status));
          if (item.status === 'conflict') {
            const detail = document.createElement('div');
            detail.className = 'situation-transfer-conflict';
            const describe = record => {
              const bases = ['first', 'second', 'third'].filter(base => record.runnersOn?.[base]);
              const runners = !record.runnersOn ? 'Runners unspecified' : bases.length ? `Runners: ${bases.join(', ')}` : 'Bases empty';
              const outs = record.outs == null ? 'Outs unspecified' : `${record.outs} ${record.outs === 1 ? 'out' : 'outs'}`;
              return `${record.source}: ${record.title} (${record.key}) · Staff label: ${record.staffLabel || 'None'} · ${runners} · ${outs}`;
            };
            for (const record of [item.incoming, ...(item.conflicts || [])].filter(Boolean)) {
              const text = document.createElement('p'); text.textContent = describe(record); detail.append(text);
            }
            const help = document.createElement('p');
            help.textContent = 'Resolve the conflict in the source library, then export and review the file again. Names and staff labels must be distinct; different starting runners or outs alone do not resolve a duplicate name.';
            detail.append(help); check.closest('label').after(detail);
          }
          if (item.changes?.length) {
            const detail = document.createElement('details'); const heading = document.createElement('summary'); heading.textContent = `Review ${item.changes.length} changed fields`; detail.append(heading);
            for (const change of item.changes) { const text = document.createElement('pre'); text.textContent = `${change.field}\nCurrent: ${JSON.stringify(change.before, null, 2)}\nIncoming: ${JSON.stringify(change.after, null, 2)}`; detail.append(text); }
            check.closest('label').after(detail);
          }
          return { item, check };
        });
        const publish = button('Publish selected situations', async () => {
          if (busy) return;
          const selected = selections.filter(({ check }) => check.checked && !check.disabled);
          if (!selected.length) { status.textContent = 'Select new or changed situations to publish.'; return; }
          lock(true); publish.disabled = true;
          const confirmed = await requestConfirmation({ title: 'Publish imported situations?', message: `Publish ${selected.length} situations to ${review.destination}? Existing situations get new revisions; new situations receive local display codes. Each situation is published separately. If one fails, earlier successful changes remain published.`, confirmLabel: 'Publish situations' });
          if (!confirmed) { lock(false); publish.disabled = false; return; }
          stage(3);
          let count = 0;
          try {
            for (const { item, check } of selected) {
              await diqApiRequest(item.status === 'new' ? 'situations' : `situations/${encodeURIComponent(item.key)}`, { method: item.status === 'new' ? 'POST' : 'PUT', headers: item.revision ? { 'If-Match': String(item.revision) } : {}, body: JSON.stringify(item.situation) });
              count++; check.checked = false; check.disabled = true; check.nextElementSibling.textContent += ' — Published';
            }
            status.textContent = `Published ${count} situations. Refreshing the Situation Library…`;
            await reloadPublishedSituation(currentSituation?.key);
            library.querySelector('input[type=search]')?.dispatchEvent(new Event('input'));
            status.textContent = `Published ${count} situations to ${review.destination}.`;
          } catch (error) { status.textContent = `${count} situations published before stopping: ${error.message} Review the file again to check the current state before retrying.`; }
          finally { lock(false); refreshSelection(); publish.disabled = true; refreshSelection = () => {}; }
        });
        selectionActions(selections, publish, 'Publish selected');
      } catch (error) { status.textContent = error.message; } finally { lock(false); refreshSelection(); }
    });
    upload.addEventListener('change', () => { output.replaceChildren(); status.textContent = 'File selected. Review it before publishing.'; });
    const fileLabel = document.createElement('label'); fileLabel.className = 'situation-transfer-file'; fileLabel.append('Situation JSON file', upload);
    upload.addEventListener('change', () => { reviewButton.disabled = !upload.files?.length; refreshSelection = () => {}; stage(1); });
    controls.append(fileLabel, reviewButton); body.append(guidance, controls, status, output);
    reviewButton.disabled = true;
    return panel;
  }

  function openTeamPlaybook(library) {
    library.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = 'Team Situation Library';
    const guidance = document.createElement('p');
    guidance.textContent = 'Manage inherited situations and difficulty in Design.';
    const link = document.createElement('a');
    link.className = 'btn btn-ghost';
    link.textContent = 'Open Team Situation Library';
    const teamId = window._diqStaffTeamId?.();
    link.href = teamId ? '/workspace/design?' + new URLSearchParams({type:'team',id:teamId}) : '/workspace/design';
    library.append(heading,guidance,link);
  }

  function assignmentBlockerLabel(item){
    return `${item.title} — ${item.teamName || 'Unknown team'} — ${item.closedAt ? 'closed' : item.status} (${item.id})`;
  }
  async function permanentlyDeleteSituation(key){
    try{
      const preview=await diqApiRequest(`admin/situations/${encodeURIComponent(key)}/permanent`,{cache:'no-store'});
      if(preview.counts.blockingAssignments){await requestConfirmation({title:'Situation is used by assignments',message:`${preview.counts.blockingAssignments} assignments still reference this situation: ${(preview.blockingAssignments || []).map(assignmentBlockerLabel).join("; ")}. Closed, completed, and draft assignments must also be archived before deleting their situations.`,confirmLabel:'OK'});return;}
      if(!await requestConfirmation({title:'Permanently delete situation?',message:`Delete “${preview.title}”? This permanently removes ${preview.counts.attempts} saved attempts, ${preview.counts.revisions} revisions, ${preview.counts.proposals} proposals, and selections in ${preview.counts.teamPlaybooks} team Situation Libraries. It also removes this situation and its progress from ${preview.counts.inactiveAssignments || 0} canceled or archived assignments, which will no longer include it if restored. This cannot be undone. Export a copy first if needed.`,confirmLabel:'Delete permanently',requiredText:preview.title}))return;
      await diqApiRequest(`admin/situations/${encodeURIComponent(key)}/permanent`,{method:'DELETE',headers:{'If-Match':String(preview.revision)},body:JSON.stringify({confirmation:preview.title})});
      await loadSituationsFromDatabase();
      if(currentSituation?.key===key){if(SITUATIONS.length)setSituation(SITUATIONS[0].key);else clearCurrentSituation();}
      if(document.body.classList.contains('situation-library-open'))showSituationLibrary();
      return true;
    }catch(error){setWorkflowStatus(error.message,'error');if(typeof toast==='function')toast(error.message);}
  }
  window._diqDeleteSituationPermanently=permanentlyDeleteSituation;

  window._diqOpenCoachTeamPlaybook=()=>openTeamPlaybook(byId('coachTeamPlaybook'));

  function showSituationLibrary(){
    document.body.classList.add('situation-library-open');
    document.body.classList.remove('situation-editing-open');
    if(editorRole==='admin') {
      adminWorkspace.appendChild(adminEditorMount.closest('[data-admin-view]'));
      adminWorkspace.classList.remove('hidden');
      fieldCard?.classList.add('hidden');
    }
    let library=byId('situationLibrary');
    if(!library){library=document.createElement('section');library.id='situationLibrary';}
    situationEditor.parentElement.prepend(library); library.replaceChildren();
    const isAdmin=editorRole==='admin';
    if(!isAdmin){const heading=document.createElement('h2');heading.textContent=window.__DIQ_AUTH_USER__?.canPublishSituations?'Situations':'Situation proposals';library.append(heading);}
    function button(label, action){const item=document.createElement('button');item.type='button';item.className='btn btn-ghost';item.textContent=label;item.onclick=action;return item;}
    const toolbar=document.createElement('div');toolbar.className='situation-library-toolbar';library.append(toolbar);
    const tabs=document.createElement('div');tabs.className='situation-library-tabs';toolbar.append(tabs);
    let mode='library', bundle=null, loading=false, order=null, draggedKey=null;
    const selected=new Set();
    const create=button('New situation',async()=>{if(editorDirty && !await requestConfirmation({title:'Discard local changes?',message:'Starting a new situation replaces your unsubmitted changes.',confirmLabel:'Discard and create'}))return;transferToBoard('training-new',makeSituationDraft(),null,'');});create.className='btn btn-brand situation-library-create';toolbar.append(create);
    if(editorDirty) toolbar.append(button('Continue local draft',()=>transferToBoard('training',currentSnapshot(),editorBaseline,coachRationale?.value)));
    const search=document.createElement('input');search.type='search';search.placeholder='Search situations';search.setAttribute('aria-label','Search situations');library.append(search);
    const status=document.createElement('p');status.setAttribute('role','status');library.append(status);
    const exportActions=document.createElement('div');exportActions.className='situation-transfer-controls';library.append(exportActions);
    const list=document.createElement('div');list.className='situation-library-list';library.append(list);
    const footer=document.createElement('div');footer.className='situation-transfer-footer';library.append(footer);
    const count=document.createElement('strong');count.setAttribute('role','status');
    const download=button('Download selected',()=>{
      const situations=bundle.situations.filter(item=>selected.has(item.key));
      if(!situations.length)return;
      const url=URL.createObjectURL(new Blob([JSON.stringify({...bundle,situations},null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='diamond-defence-situations.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      status.textContent=`Exported ${situations.length} situations from ${bundle.source}.`;
    });download.className='btn btn-brand';footer.append(count,download);
    const deleteSelected=button('Delete selected',async()=>{
      if(!selected.size || loading)return;
      if(editorDirty){status.textContent='Publish or discard your local draft before deleting situations.';return;}
      library.querySelector('[data-resolve-deletion]')?.remove();
      const keys=[...selected];
      loading=true;updateCount();
      let deleted=0;
      try{
        const previews=[];
        for(const key of keys)previews.push(await diqApiRequest(`admin/situations/${encodeURIComponent(key)}/permanent`,{cache:'no-store'}));
        const blocked=previews.filter(item=>item.counts.blockingAssignments);
        if(blocked.length){
          const assignments=[...new Map(blocked.flatMap(item=>item.blockingAssignments||[]).map(item=>[item.id,item])).values()];
          status.textContent=`Nothing deleted. Blocking assignments: ${assignments.map(assignmentBlockerLabel).join('; ') || blocked.map(item=>item.title).join('; ')}. Closed, completed, and draft assignments also need to be archived.`;
          if(assignments.length){
            const archive=button('Archive blocking assignments',async()=>{
              if(!await requestConfirmation({title:'Archive blocking assignments?',message:`Archive these ${assignments.length} assignments: ${assignments.map(assignmentBlockerLabel).join('; ')}. They will be removed from player queues; existing results remain. No situations are deleted by this action. You must review and confirm situation deletion again afterward.`,confirmLabel:'Archive assignments'}))return;
              archive.disabled=true;loading=true;updateCount();let archived=0;
              try{
                for(const assignment of assignments){await diqApiRequest(`practice/assignments/${encodeURIComponent(assignment.id)}`,{method:'PATCH',body:JSON.stringify({action:'archive'})});archived++;}
                status.textContent=`Archived ${archived} assignments. Choose Delete selected again to review and confirm situation deletion.`;archive.remove();
              }catch(error){status.textContent=`Archived ${archived} assignments. ${error.message} Review deletion again for current blockers.`;archive.remove();}
              finally{loading=false;updateCount();}
            });archive.dataset.resolveDeletion='true';status.after(archive);
          }
          return;
        }
        const total=field=>previews.reduce((sum,item)=>sum+Number(item.counts[field]||0),0);
        const confirmed=await requestConfirmation({title:`Delete ${previews.length} situations permanently?`,message:`${previews.map(item=>`${item.title} (${item.key})`).join('; ')}. This removes ${total('attempts')} saved attempts, ${total('revisions')} revisions, ${total('proposals')} proposals, ${total('teamPlaybooks')} team Situation Library selections, and ${total('inactiveAssignments')} references and associated progress in canceled or archived assignments. Restoring assignments will not restore these situations. Deletions happen one at a time; if one fails, earlier deletions remain. This cannot be undone. Export a copy first if needed. Type DELETE to confirm.`,confirmLabel:'Delete permanently',requiredText:'DELETE'});
        if(!confirmed)return;
        for(const item of previews){
          await diqApiRequest(`admin/situations/${encodeURIComponent(item.key)}/permanent`,{method:'DELETE',headers:{'If-Match':String(item.revision)},body:JSON.stringify({confirmation:item.title})});
          deleted++;selected.delete(item.key);
        }
        status.textContent=`Permanently deleted ${deleted} situations.`;
      }catch(error){status.textContent=`${deleted} situations deleted. ${error.message} Review the remaining selection before retrying.`;}
      finally{
        if(deleted){
          try{
            await loadSituationsFromDatabase();bundle=null;
            if(!SITUATIONS.some(item=>item.key===currentSituation?.key)){if(SITUATIONS.length)setSituation(SITUATIONS[0].key);else clearCurrentSituation();}
          }catch(error){status.textContent+=` Could not refresh the library: ${error.message}. Reload before continuing.`;}
        }
        loading=false;draw();
      }
    });deleteSelected.className='btn btn-danger';footer.append(deleteSelected);
    const importHost=document.createElement('div');library.append(importHost);
    if(isAdmin)addSituationTransfer(importHost);
    const records=()=>mode==='reorder'?(order?.situations||[]):mode==='export'?(bundle?.situations||[]):(Array.isArray(SITUATIONS)?SITUATIONS:[]);
    const matches=()=>records().filter(item=>`${item.title} ${item.desc||''} ${item.displayCode||''} ${window._diqAudienceLabel?.(item)||''}`.toLowerCase().includes(search.value.toLowerCase()));
    const updateCount=()=>{count.textContent=`${selected.size} selected · ${matches().length} matching`;download.disabled=loading||!selected.size;deleteSelected.disabled=loading||!selected.size;deleteSelected.textContent=selected.size?`Delete selected (${selected.size})`:'Delete selected';library.querySelectorAll('button,input').forEach(control=>{if(control!==download&&control!==deleteSelected)control.disabled=loading;});download.textContent=selected.size?`Download selected (${selected.size})`:'Download selected';};
    function draw(){
      list.replaceChildren();
      for(const item of matches()){
        const row=document.createElement(['export','delete'].includes(mode)?'label':'div');row.className='situation-library-row';
        const title=document.createElement('strong');title.textContent=situationDisplayLabel(item);
        const staff=document.createElement('small');staff.className='situation-staff-meta';staff.textContent=[window._diqAudienceLabel?.(item)].filter(Boolean).join(' · ');title.append(staff);
        if(['export','delete'].includes(mode)){
          const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(item.key);row.classList.toggle('is-selected',check.checked);
          check.onchange=()=>{if(check.checked)selected.add(item.key);else selected.delete(item.key);row.classList.toggle('is-selected',check.checked);updateCount();};row.append(check,title);
        }else if(mode==='reorder'){
          row.draggable=true;row.append(title);
          const controls=document.createElement('div');controls.className='situation-reorder-controls';
          const index=order.situations.findIndex(record=>record.key===item.key);
          for(const [delta,label] of [[-1,'Move up'],[1,'Move down']]){const move=button(label,()=>{const target=index+delta;[order.situations[index],order.situations[target]]=[order.situations[target],order.situations[index]];draw();const movedRow=list.children[target];const sameDirection=movedRow?.querySelectorAll('button')[delta===-1?0:1];(sameDirection?.disabled?movedRow?.querySelector('button:not(:disabled)'):sameDirection)?.focus();status.textContent=`${item.title} moved to position ${target+1} of ${order.situations.length}. Save order to apply.`;});move.disabled=index+delta<0||index+delta>=order.situations.length;move.setAttribute('aria-label',`${label}: ${item.title}`);controls.append(move);}row.append(controls);
          row.ondragstart=event=>{draggedKey=item.key;event.dataTransfer.setData('text/plain',item.key);};row.ondragover=event=>event.preventDefault();
          row.ondrop=event=>{event.preventDefault();const from=order.situations.findIndex(record=>record.key===draggedKey);const to=order.situations.findIndex(record=>record.key===item.key);if(from<0||from===to)return;const [moved]=order.situations.splice(from,1);order.situations.splice(to,0,moved);draw();};
        }else{
          const edit=button(isAdmin||window.__DIQ_AUTH_USER__?.canPublishSituations?'Edit situation':'Propose changes',async()=>{if(editorDirty && !await requestConfirmation({title:'Discard local changes?',message:'Opening another situation replaces your unsubmitted changes.',confirmLabel:'Discard and open'}))return;transferToBoard('training',item,item);});const variation=button('Create variation',async()=>{
          if(editorDirty && !await requestConfirmation({title:'Replace local changes?',message:'Creating a variation replaces your unsubmitted draft.',confirmLabel:'Create variation'}))return;
          transferToBoard('training',makeSituationDraft(item),null);
        });row.append(title,edit,variation);if(isAdmin){const remove=button('Delete permanently',()=>permanentlyDeleteSituation(item.key));remove.className='btn btn-danger';row.append(remove);}
        }list.append(row);
      }
      if(!list.children.length)list.textContent=loading?'Loading published situations…':'No situations match this search.';
      updateCount();
    }
    exportActions.append(button('Select matching situations',()=>{matches().forEach(item=>selected.add(item.key));draw();}),button('Select all situations',()=>{records().forEach(item=>selected.add(item.key));draw();}),button('Clear selection',()=>{selected.clear();draw();}));
    const orderActions=document.createElement('div');orderActions.className='situation-transfer-controls';library.insertBefore(orderActions,search);
    const saveOrder=button('Save order',async()=>{
      if(!order)return;saveOrder.disabled=true;
      try{await diqApiRequest('admin/situations/order',{method:'PUT',body:JSON.stringify({keys:order.situations.map(item=>item.key),revision:order.revision})});await loadSituationsFromDatabase();await switchMode('library');status.textContent='Library order saved. Existing practice sequences are unchanged.';}
      catch(error){status.textContent=error.message;}finally{saveOrder.disabled=false;}
    });saveOrder.className='btn btn-brand';orderActions.append(saveOrder,button('Cancel',()=>switchMode('library')));
    async function switchMode(value){
      if(loading)return;
      library.querySelector('[data-resolve-deletion]')?.remove();
      if(mode!==value)selected.clear();
      mode=value;document.body.dataset.situationLibraryTab=value;
      tabs.querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.mode===value)));
      search.hidden=!['library','export','delete'].includes(value);list.hidden=!['library','export','delete','reorder'].includes(value);orderActions.hidden=value!=='reorder'; exportActions.hidden=footer.hidden=!['export','delete'].includes(value);download.hidden=value!=='export';deleteSelected.hidden=value!=='delete';importHost.hidden=value!=='import';status.textContent='';
      if(value==='delete')status.textContent='Select situations to delete permanently. Selections remain selected when you change the search; Clear selection removes all selections.';
      if(value==='reorder'){
        search.value='';order=null;loading=true;saveOrder.disabled=true;draw();
        try{order=await diqApiRequest('admin/situations/order',{cache:'no-store'});if(mode==='reorder')status.textContent='Drag situations or use Move up / Move down, then save the shared library order.';}
        catch(error){status.textContent=error.message;}finally{loading=false;saveOrder.disabled=!order;}
      }
      if(value==='export'&&!bundle){
        loading=true;draw();
        try{bundle=await diqApiRequest('admin/situations/transfer',{cache:'no-store'});}
        catch(error){if(mode==='export')status.textContent=error.message;}
        finally{loading=false;}
      }
      if(mode==='export'&&bundle)status.textContent=`Select published situations to download. Source: ${bundle.source}`;
      draw();
    }
    if(isAdmin)for(const [value,label] of [['library','Library'],['proposals','Proposals to review'],['export','Export'],['import','Import'],['reorder','Reorder'],['delete','Delete situations']]){const item=button(label,()=>switchMode(value));item.dataset.mode=value;tabs.append(item);}
    search.addEventListener('input',draw);void switchMode('library');
    if(!isAdmin&&coachHistory){const title=document.createElement('h3');title.textContent='Submitted proposals';library.append(title,coachHistory);coachHistory.classList.remove('hidden');}
  }
  function refreshPublicationUsage(){
    if(window.__DIQ_AUTH_USER__?.canPublishSituations || editorRole==='admin'){
      let usage=byId('situationPublicationUsage');if(!usage){usage=document.createElement('p');usage.id='situationPublicationUsage';publishSituation?.before(usage);}
      const key=currentSnapshot()?.key;usage.textContent='Publishing changes the shared library. Use Create variation for a team-specific approach.';
      if(key)diqApiRequest(`situations/${encodeURIComponent(key)}/usage`,{cache:'no-store'}).then(result=>{if(currentSnapshot()?.key===key)usage.textContent=`Team Situation Libraries using this situation: ${(result.teams||[]).map(team=>team.name).join(', ')||'None'}. Use Create variation for a team-specific approach.`;}).catch(error=>{usage.textContent=`Could not load affected teams: ${error.message}`;});
    }else byId('situationPublicationUsage')?.remove();
  }
  function openSituationEditorPane(){
    refreshPublicationUsage();
    if(editorRole==='admin'){const view=adminEditorMount.closest('[data-admin-view]');adminCard.appendChild(view);view.classList.remove('hidden');adminCard.classList.remove('hidden');adminUnlocked=true;if(adminStatus)adminStatus.textContent='unlocked';adminWorkspace.classList.add('hidden');fieldCard?.classList.remove('hidden');}
    document.body.classList.remove('situation-library-open');
    document.body.classList.add('situation-editing-open');
    focusEditorSection('sbDetailsSection');
  }
  byId('situationLibraryBack')?.addEventListener('click',showSituationLibrary);

  function renderPositionCompleteness(snapshot) {
    if (!positionCompleteness) return;
    positionCompleteness.replaceChildren();
    const selected = window._diqGetSelectedEditorPosition?.();
    POSITION_IDS.forEach((id) => {
      const start = snapshot?.starts?.[id];
      const target = snapshot?.targets?.[id];
      const checks = [
        ['start', Number.isFinite(start?.x) && Number.isFinite(start?.y)],
        ['target', Number.isFinite(target?.x) && Number.isFinite(target?.y)],
        ['tolerance', Number(target?.tol) >= 5],
        ['note', Boolean(String(target?.notes || target?.note || '').trim())],
      ];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `position-check${selected === id ? ' is-selected' : ''}`;
      const name = document.createElement('strong');
      name.textContent = id;
      const summary = document.createElement('span');
      summary.className = 'position-check-summary';
      summary.textContent = checks.every(([,complete])=>complete) ? '✓ Ready' : 'Needs details';
      button.setAttribute('aria-pressed',String(selected===id));
      button.title = checks.filter(([,complete])=>!complete).map(([label])=>`Missing ${label}`).join(', ') || 'All position details are set';
      button.append(name, summary);
      button.addEventListener('click', () => {
        const select = byId('tolTargetSel');
        if (select) {
          select.value = id;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          renderPositionCompleteness(currentSnapshot());
        }
      });
      positionCompleteness.appendChild(button);
    });
  }

  function renderChangeSummary(snapshot) {
    const fields = changedFields(snapshot);
    const labels = new Map(EDITABLE_FIELDS);
    [reviewSummary, coachChangeSummary].forEach((container) => {
      if (!container) return;
      container.replaceChildren();
      if (!fields.length) {
        container.textContent = 'No changes from the published version.';
        container.classList.add('muted');
        return;
      }
      container.classList.remove('muted');
      fields.forEach((field) => {
        const chip = document.createElement('span');
        chip.className = 'change-chip';
        chip.textContent = labels.get(field) || field;
        container.appendChild(chip);
      });
    });
  }

  const divisionTags=byId('situationDivisionTags');
  for(let age=9;age<=18;age++){
    const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.value=String(age);
    check.onchange=()=>{if(!currentSituation)return;currentSituation.suggestedDivisions=Array.from(divisionTags.querySelectorAll('input:checked')).map(input=>Number(input.value));queueCurrentSituationDatabaseSync();};label.append(check,`${age}U`);divisionTags.append(label);
  }
  const audienceInputs = {staffVariant:'situationStaffVariant'};
  const locationSelect = byId('situationBallLocation');
  for (const location of window._diqBallLocations || []) locationSelect?.append(new Option(location, location));
  async function createSituationVariation(source){
    if(editorDirty && !await requestConfirmation({title:'Replace local changes?',message:'Creating a variation replaces your unsubmitted draft.',confirmLabel:'Create variation'}))return;
    window._diqCreateSituationVariation(clone(source));
    openSituationEditorPane();
    focusEditorSection('situationReviewSection');
    setWorkflowStatus('Variation created as a new draft. Its public tag is assigned automatically when published. Player context is optional; keep it spoiler-free.');
  }
  function similarSituations(snapshot){
    return (Array.isArray(SITUATIONS)?SITUATIONS:[]).filter(item=>item.key!==snapshot.key && item.active!==false && Number(item.revision)>0 &&
      item.hitType===snapshot.hitType && Number(item.outs)===Number(snapshot.outs) &&
      ['first','second','third'].every(base=>Boolean(item.runnersOn?.[base])===Boolean(snapshot.runnersOn?.[base])) &&
      (item.ballLocation && snapshot.ballLocation ? item.ballLocation===snapshot.ballLocation :
        Number.isFinite(item.hit?.x) && item.hit.x===snapshot.hit?.x && item.hit.y===snapshot.hit?.y));
  }
  function renderCreationReview(snapshot){
    const preview=byId('situationCardPreview');preview.replaceChildren();
    const card=document.createElement('div');card.className='editor-preview-card';
    card.setAttribute('aria-label',`${snapshot.title}. ${playbookRunnerLabel(snapshot)}, ${snapshot.outs} outs`);
    const title=document.createElement('strong');title.textContent=playbookCardTitle(snapshot);
    card.append(title,playbookCardMetadata(snapshot));
    if(snapshot.desc){
      const context=document.createElement('span');
      context.className='playbook-card-description';
      context.textContent=snapshot.desc;
      card.append(context);
    }
    card.append(playbookStateGraphic(snapshot));
    preview.append(card);
    const list=byId('situationSimilarList');list.replaceChildren();
    const intentional=Boolean(snapshot.variationSourceKey);
    const matches=intentional ? SITUATIONS.filter(item=>item.key!==snapshot.key && Number(item.revision)>0 && (item.key===snapshot.variationSourceKey || item.variationSourceKey===snapshot.variationSourceKey)) : similarSituations(snapshot);
    const panel=byId('situationSimilarPanel');panel.hidden=!matches.length;
    if(panel.dataset.situationKey!==snapshot.key){panel.open=!intentional;panel.dataset.situationKey=snapshot.key;}
    panel.querySelector('summary').textContent=intentional?'Related variations':'Similar situations';
    panel.querySelector('p').textContent=intentional?'This draft is already linked to its source. A public variation tag is assigned when published.':'These situations share the same ball type, location, runners, and outs. Review them before creating another situation.';
    matches.forEach(item=>{
      const row=document.createElement('div');row.className='similar-situation-row';
      const name=document.createElement('span');name.textContent=[situationDisplayLabel(item),window._diqAudienceLabel?.(item)].filter(Boolean).join(' · ');
      const edit=document.createElement('button');edit.type='button';edit.className='btn btn-ghost';edit.textContent=editorRole==='coach'?'Propose changes':'Edit existing';
      edit.onclick=async()=>{if(editorDirty && !await requestConfirmation({title:'Replace local changes?',message:'Opening this situation replaces your unsubmitted draft.',confirmLabel:'Open existing'}))return;setSituation(item.key,clone(item));openSituationEditorPane();};
      const variation=document.createElement('button');variation.type='button';variation.className='btn btn-ghost';variation.textContent='Create variation';variation.onclick=()=>createSituationVariation(item);
      row.append(name,edit);if(!intentional)row.append(variation);list.append(row);
    });
  }
  function renderSituationIdentity(snapshot) {
    if (!snapshot) return;
    divisionTags.querySelectorAll('input').forEach(input=>input.checked=(snapshot.suggestedDivisions||[]).includes(Number(input.value)));
    const audience = snapshot.audience || {};
    for(const [field,id] of Object.entries(audienceInputs)){const input=byId(id);if(input && document.activeElement!==input)input.value=audience[field]??'';}
    if(document.activeElement!==locationSelect)locationSelect.value=snapshot.ballLocation||'';
    const categorySummary=byId('situationRelatedSummary');categorySummary.replaceChildren();
    document.querySelectorAll('#situationRelatedCategories button[aria-pressed="true"]').forEach(button=>{const chip=document.createElement('span');chip.textContent=button.textContent;categorySummary.append(chip);});
    byId('suggestedSituationName').textContent=`Suggested: ${window._diqSuggestSituationName?.(snapshot)||''}`;
    byId('situationAudiencePreview').textContent=`Player name: ${playbookCardTitle(snapshot)} | Staff label: ${window._diqAudienceLabel?.(snapshot)||'Standard'}`;
  }
  for(const [field,id] of Object.entries(audienceInputs)) byId(id)?.addEventListener('change',()=>{
    if(!currentSituation)return;
    currentSituation.audience={...(currentSituation.audience||{})};
    const value=byId(id).value;
    if(value==='')delete currentSituation.audience[field];
    else currentSituation.audience[field]=value;
    queueCurrentSituationDatabaseSync();
  });
  locationSelect?.addEventListener('change',()=>{if(currentSituation){currentSituation.ballLocation=locationSelect.value;queueCurrentSituationDatabaseSync();}});
  byId('useSuggestedName')?.addEventListener('click',()=>{if(currentSituation){byId('newTitleInput').value=window._diqSuggestSituationName(currentSituation);byId('newTitleInput').dispatchEvent(new Event('input',{bubbles:true}));}});

  function renderEditorState(snapshot = currentSnapshot(), showValidation = false) {
    renderSituationIdentity(snapshot);
    if(snapshot)renderCreationReview(snapshot);
    const issues = validateSituation(snapshot);
    const errors = issues.filter((issue) => issue.severity === 'error');
    renderPositionCompleteness(snapshot);
    renderChangeSummary(snapshot);
    if (dirtyBadge) {
      dirtyBadge.textContent = editorDirty ? 'Unpublished changes' : 'Saved';
      dirtyBadge.className = `dirty-state-badge ${editorDirty ? 'is-dirty' : 'is-clean'}`;
    }
    byId('saveSituationBtn')?.classList.toggle('hidden', !editorDirty);
    byId('situationEditorName').textContent=snapshot?.title||'New situation';
    const rationaleReady = editorRole !== 'coach' || Boolean(String(coachRationale?.value || '').trim());
    if (submitSituation) submitSituation.disabled = !editorDirty || errors.length > 0 || !rationaleReady;
    if (publishSituation) publishSituation.disabled = !editorDirty || errors.length > 0;
    if (validationPanel) validationPanel.classList.toggle('hidden', !showValidation && issues.length === 0);
    if (validationSummary) {
      validationSummary.textContent = errors.length
        ? `${errors.length} required item${errors.length === 1 ? '' : 's'} must be fixed before continuing.`
        : issues.length
          ? `${issues.length} warning${issues.length === 1 ? '' : 's'} to review.`
          : 'This situation is complete and ready.';
    }
    if (validationIssues) {
      validationIssues.replaceChildren();
      issues.forEach((issue) => {
        const row = document.createElement('div');
        row.className = `validation-issue is-${issue.severity}`;
        const text = document.createElement('span');
        text.textContent = issue.message;
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'btn btn-ghost btn-small';
        jump.textContent = 'Fix';
        jump.addEventListener('click', () => focusEditorSection(issue.section));
        row.append(text, jump);
        validationIssues.appendChild(row);
      });
    }
    return { issues, errors };
  }

  function setWorkflowStatus(message = '', state = '') {
    if (!workflowStatus) return;
    workflowStatus.textContent = message;
    workflowStatus.hidden = !message;
    workflowStatus.className = `operation-status${state ? ` is-${state}` : ''}`;
  }

  function markEditorClean(snapshot = currentSnapshot()) {
    editorDirty = false;
    editorBaseline = clone(window._diqGetPublishedSituationSnapshot?.(snapshot?.key) || snapshot);
    renderEditorState(snapshot);
  }

  async function reloadPublishedSituation(preferredKey = '') {
    if (typeof loadSituationsFromDatabase !== 'function') return;
    await loadSituationsFromDatabase();
    loadStarts();
    loadHits();
    const key = (SITUATIONS || []).some((item) => item.key === preferredKey)
      ? preferredKey : SITUATIONS?.[0]?.key;
    if (key) {
      populateSituations(key);
      setSituation(key);
      markEditorClean(currentSnapshot());
    }
  }

  async function loadCoachProposalHistory() {
    if (!coachHistory || editorRole !== 'coach') return;
    try {
      const result = await diqApiRequest('situation-submissions', { cache: 'no-store' });
      const records = Array.isArray(result?.submissions) ? result.submissions.filter(item=>item.submittedBy===window.__DIQ_AUTH_USER__?.id) : [];
      coachHistory.replaceChildren();
      if (!records.length) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'You have not submitted any situation proposals yet.';
        coachHistory.appendChild(empty);
        return;
      }
      const filter=document.createElement('select');filter.setAttribute('aria-label','Proposal status');
      [['all','All proposals'],['pending','Submitted'],['reviewed','Reviewed']].forEach(([value,label])=>filter.appendChild(new Option(label,value)));
      coachHistory.appendChild(filter);
      filter.onchange=()=>coachHistory.querySelectorAll('.proposal-history-row').forEach(row=>{row.hidden=filter.value==='pending'?row.dataset.status!=='pending':filter.value==='reviewed'?row.dataset.status==='pending':false;});
      records.forEach((record) => {
        const row = document.createElement('div');
        row.className = 'proposal-history-row';
        row.dataset.status = record.status;
        const text = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = record.situation.title;
        const status = document.createElement('span');
        status.className = `proposal-status is-${record.status}`;
        status.textContent = record.status;
        const detail = document.createElement('span');
        detail.className = 'muted';
        detail.textContent = `${record.submissionType === 'create' ? 'New situation' : `Revision ${record.baseRevision}`} · ${new Date(record.createdAt).toLocaleDateString()}${record.reviewNotes ? ` · ${record.reviewNotes}` : ''}`;
        text.append(title, status, detail);
        row.appendChild(text);
        if (record.status === 'pending') {
          const withdraw = document.createElement('button');
          withdraw.type = 'button';
          withdraw.className = 'btn btn-ghost btn-small';
          withdraw.textContent = 'Withdraw';
          withdraw.addEventListener('click', async () => {
            try {
              setWorkflowStatus('Withdrawing proposal…', 'pending');
              await diqApiRequest(`situation-submissions/${encodeURIComponent(record.id)}`, { method: 'DELETE' });
              setWorkflowStatus('Proposal withdrawn.', 'success');
              await loadCoachProposalHistory();
            } catch (error) {
              setWorkflowStatus(error?.message || 'Unable to withdraw proposal.', 'error');
            }
          });
          row.appendChild(withdraw);
        }
        coachHistory.appendChild(row);
      });
    } catch (error) {
      setWorkflowStatus(error?.message || 'Unable to load proposals.', 'error');
    }
  }

  function ensureReadyToSave() {
    const snapshot = window._diqSituationAuthoring.syncSituationAnimation(currentSnapshot());
    if (!snapshot) {
      setWorkflowStatus('Select a situation first.', 'error');
      return null;
    }
    const { errors } = renderEditorState(snapshot, true);
    if (errors.length) {
      setWorkflowStatus('Fix the required situation details before continuing.', 'error');
      focusEditorSection(errors[0].section);
      return null;
    }
    return snapshot;
  }

  async function submitCurrentSituation() {
    const snapshot = ensureReadyToSave();
    if (!snapshot) return;
    const rationale = String(coachRationale?.value || '').trim();
    if (!rationale) {
      setWorkflowStatus('Add a short reason for the proposal.', 'error');
      coachRationale?.focus();
      return;
    }
    try {
      setWorkflowStatus('Submitting proposal for administrator review…', 'pending');
      await diqApiRequest('situation-submissions', {
        method: 'POST',
        body: JSON.stringify({ situation: snapshot, rationale }),
      });
      if (coachRationale) coachRationale.value = '';
      markEditorClean(snapshot);
      setWorkflowStatus('Proposal submitted. Players still use the published version.', 'success');
      await loadCoachProposalHistory();
      await reloadPublishedSituation(snapshot.key);
    } catch (error) {
      setWorkflowStatus(error?.message || 'Unable to submit the proposal.', 'error');
    }
  }

  async function confirmSharedPublication(snapshot){
    const usage=await diqApiRequest(`situations/${encodeURIComponent(snapshot.key)}/usage`,{cache:'no-store'});
    return requestConfirmation({title:'Publish to the shared library?',message:`${snapshot.title}. Team Situation Libraries using this situation: ${(usage.teams||[]).map(team=>team.name).join(', ') || 'None'}. Changes affect the shared published situation. For a team-specific approach, cancel and choose Create variation in the library.`,confirmLabel:'Publish situation'});
  }
  async function publishCurrentSituation() {
    const snapshot = ensureReadyToSave();
    if (!snapshot) return;
    const revision = Number(snapshot.revision);
    const creating = !Number.isInteger(revision) || revision < 1;
    try {
      if(window.__DIQ_AUTH_USER__?.role==='coach'&&!await confirmSharedPublication(snapshot))return;
      setWorkflowStatus(creating ? 'Publishing new situation…' : 'Publishing situation changes…', 'pending');
      const result = await diqApiRequest(
        creating ? 'situations' : `situations/${encodeURIComponent(snapshot.key)}`,
        {
          method: creating ? 'POST' : 'PUT',
          headers: creating ? {} : { 'If-Match': String(revision) },
          body: JSON.stringify(snapshot),
        },
      );
      markEditorClean(snapshot);
      setWorkflowStatus('Situation published.', 'success');
      await reloadPublishedSituation(result?.record?.key || snapshot.key);
      if(window.__DIQ_AUTH_USER__?.role==='admin')await loadAdminData(teamSelect?.value || '');
    } catch (error) {
      setWorkflowStatus(error?.message || 'Unable to publish the situation.', 'error');
    }
  }

  window._diqConfirmConvertedSituationOutcomes = async (snapshot) => {
    const confirmed = clone(snapshot);
    if (!confirmed?.playOutcome || confirmed.playOutcome.reviewStatus !== 'ready') return false;
    const errors = validateSituation(confirmed).filter((issue) => issue.severity === 'error');
    if (errors.length) {
      setWorkflowStatus('Correct the listed outcome details before confirming this conversion.', 'error');
      renderEditorState(confirmed, true);
      focusEditorSection(errors[0].section);
      return false;
    }
    const revision = Number(confirmed.revision);
    if (!Number.isInteger(revision) || revision < 1) {
      setWorkflowStatus('Only a published converted situation can be confirmed.', 'error');
      return false;
    }
    try {
      setWorkflowStatus('Saving the confirmed outcomes…', 'pending');
      const result = await diqApiRequest(`situations/${encodeURIComponent(confirmed.key)}`, {
        method: 'PUT',
        headers: { 'If-Match': String(revision) },
        body: JSON.stringify(confirmed),
      });
      await reloadPublishedSituation(result?.record?.key || confirmed.key);
      await loadAdminData(teamSelect?.value || '');
      setWorkflowStatus('Converted outcomes confirmed and removed from the review queue.', 'success');
      return true;
    } catch (error) {
      setWorkflowStatus(error?.message || 'Unable to confirm the converted outcomes.', 'error');
      return false;
    }
  };

  function setPlayerPreview(active, onReturn = () => setPlayerPreview(false)) {
    playerPreviewActive = Boolean(active);
    document.body.classList.toggle('situation-player-preview', playerPreviewActive);
    window._diqRefreshPlayerPresentation?.();
    document.querySelector('.situation-preview-bar')?.remove();
    if (playerPreviewActive) {
      const bar = document.createElement('div');
      bar.className = 'situation-preview-bar';
      const label = document.createElement('strong');
      label.textContent = 'Player preview — unpublished changes';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'btn btn-brand btn-small';
      close.textContent = 'Return to editor';
      close.addEventListener('click', onReturn);
      bar.append(label, close);
      document.body.appendChild(bar);
      window._diqSetEditorMode?.(null);
    } else if (editorRole) {
      const baseline = clone(editorBaseline);
      const dirty = editorDirty;
      window._diqSetEditorMode?.(editorRole);
      if (editorRole === 'coach') window._diqSetCoachWorkspaceMode?.('proposals');
      editorBaseline = baseline;
      editorDirty = dirty;
      renderEditorState(currentSnapshot());
      openSituationEditorPane();
    }
  }

  function proposalPreviewBar() {
    document.querySelector('.situation-preview-bar')?.remove();
    if (!proposalPreviewState) return;
    const bar = document.createElement('div');
    bar.className = 'situation-preview-bar proposal-preview-bar';
    const label = document.createElement('strong');
    label.textContent = `Proposal field review — ${proposalPreviewState.displayLabel}`;
    const versionControls = document.createElement('div');
    versionControls.className = 'proposal-preview-versions';
    const published = document.createElement('button');
    published.type = 'button';
    published.className = 'btn btn-ghost btn-small';
    published.textContent = proposalPreviewState.published ? 'Published version' : 'No published version';
    published.disabled = !proposalPreviewState.published;
    published.setAttribute('aria-pressed', String(proposalPreviewState.mode === 'published'));
    published.addEventListener('click', () => showProposalFieldPreview('published'));
    const proposed = document.createElement('button');
    proposed.type = 'button';
    proposed.className = 'btn btn-ghost btn-small';
    proposed.textContent = proposalPreviewState.submissionType === 'create'
      ? 'Proposed version'
      : 'Selected changes';
    proposed.setAttribute('aria-pressed', String(proposalPreviewState.mode === 'proposed'));
    proposed.addEventListener('click', () => showProposalFieldPreview('proposed'));
    versionControls.append(published, proposed);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-brand btn-small';
    close.textContent = 'Return to proposal review';
    close.addEventListener('click', () => closeProposalFieldPreview());
    bar.append(label, versionControls, close);
    document.body.appendChild(bar);
  }

  function showProposalFieldPreview(mode = 'proposed') {
    const selected = proposals.find((item) => item.id === proposalSelect?.value);
    if (!proposalPreviewState) {
      if (!selected) return;
      const published = clone(publishedSituations.find((item) => item.key === selected.situationKey) || null);
      const selectedSnapshot = selectedProposalSnapshot(selected, published);
      if (!selectedSnapshot) return;
      const proposalTitle = selected.situation?.title || selected.situation?.desc || 'Untitled situation';
      proposalPreviewState = {
        proposalId:selected.id,
        submissionType:selected.submissionType,
        displayLabel:window._diqSituationDisplayLabel?.({
          ...selected.situation,
          desc:proposalTitle,
          title:proposalTitle,
        }) || [selected.situation?.displayCode, proposalTitle].filter(Boolean).join(' · '),
        proposed:selectedSnapshot,
        published,
        returnSnapshot:clone(currentSnapshot()),
        returnBaseline:clone(editorBaseline),
        returnDirty:editorDirty,
        mode:'proposed',
      };
    }
    const nextMode = mode === 'published' && proposalPreviewState.published
      ? 'published'
      : 'proposed';
    const snapshot = nextMode === 'published'
      ? proposalPreviewState.published
      : proposalPreviewState.proposed;
    if (!snapshot) return;
    proposalPreviewState.mode = nextMode;
    window._diqSetEditorMode?.(null);
    if (snapshot.hit && typeof setHitSaved === 'function') setHitSaved(snapshot.key, snapshot.hit);
    setSituation(snapshot.key, clone(snapshot));
    document.body.classList.remove('situation-library-open');
    document.body.classList.add('situation-player-preview', 'proposal-field-preview');
    adminWorkspace?.classList.add('hidden');
    fieldCard?.classList.remove('hidden');
    proposalPreviewBar();
  }

  function closeProposalFieldPreview(restoreEditor = true) {
    if (!proposalPreviewState) return;
    const state = proposalPreviewState;
    const snapshot = state.returnSnapshot;
    document.body.classList.remove('situation-player-preview', 'proposal-field-preview');
    document.querySelector('.situation-preview-bar')?.remove();
    if (!restoreEditor) {
      proposalPreviewState = null;
      return;
    }
    if (snapshot?.hit && typeof setHitSaved === 'function') setHitSaved(snapshot.key, snapshot.hit);
    if (snapshot?.key) setSituation(snapshot.key, clone(snapshot));
    proposalPreviewState = null;
    window._diqSetEditorMode?.('admin');
    editorBaseline = clone(state.returnBaseline);
    editorDirty = state.returnDirty;
    renderEditorState(currentSnapshot());
    renderProposalDetails();
    showSituationLibrary();
  }

  submitSituation?.addEventListener('click', () => void submitCurrentSituation());
  publishSituation?.addEventListener('click', () => void publishCurrentSituation());
  previewSituation?.addEventListener('click', () => setPlayerPreview(true));
  proposalPreview?.addEventListener('click', () => showProposalFieldPreview('proposed'));
  previewSequence?.addEventListener('click', () => {
    if (!window._diqPreviewSequence?.()) setWorkflowStatus('Add at least two positions to preview the sequence.', 'error');
  });
  resetSelectedPosition?.addEventListener('click', async () => {
    const id = window._diqGetSelectedEditorPosition?.() || 'selected position';
    const confirmed = await requestConfirmation({
      title: `Reset ${id}?`,
      message: `This replaces the current ${id} start, target, tolerance, and note with the published values.`,
      actionLabel: 'Reset position',
    });
    if (confirmed && window._diqResetSelectedPosition?.()) {
      setWorkflowStatus(`${id} reset to the published values.`, 'success');
      renderEditorState(currentSnapshot());
    }
  });
  byId('adminProposalSelectAllBtn')?.addEventListener('click', () => {
    proposalDiffList?.querySelectorAll('input[data-proposal-field]:not(:disabled)').forEach((input) => { input.checked = true; });
    updateProposalSelectionActions(proposals.find((item) => item.id === proposalSelect?.value));
  });
  byId('adminProposalClearAllBtn')?.addEventListener('click', () => {
    proposalDiffList?.querySelectorAll('input[data-proposal-field]:not(:disabled)').forEach((input) => { input.checked = false; });
    updateProposalSelectionActions(proposals.find((item) => item.id === proposalSelect?.value));
  });
  document.querySelectorAll('[data-editor-step]').forEach((button) => {
    button.addEventListener('click', () => focusEditorSection(button.dataset.editorStep));
  });
  coachRationale?.addEventListener('input', () => renderEditorState(currentSnapshot()));
  byId('tolTargetSel')?.addEventListener('change', () => renderPositionCompleteness(currentSnapshot()));
  byId('saveSituationBtn')?.addEventListener('click', () => setTimeout(() => markEditorClean(currentSnapshot()), 0));

  let authoringTransfer = false;
  function transferToBoard(destination,snapshot=currentSnapshot(),baseline=editorBaseline,rationale=destination==='training'?'':coachRationale?.value||''){
    try {
      const draft=window._diqSituationAuthoring.syncSituationAnimation(snapshot);
      window._diqSituationAuthoring.writeHandoff(sessionStorage,window.__DIQ_AUTH_USER__?.id,destination,draft,baseline,rationale);
      authoringTransfer=true;
      window.location.assign('/coach-board');
    } catch(error) { setWorkflowStatus(error.message,'error'); }
  }
  byId('editInCoachBoardBtn')?.addEventListener('click',()=>transferToBoard('training',currentSnapshot(),editorBaseline,coachRationale?.value));
  byId('presentSituationBtn')?.addEventListener('click',()=>transferToBoard('present'));
  window.addEventListener('beforeunload',event=>{
    if(editorRole&&editorDirty&&!authoringTransfer){event.preventDefault();event.returnValue='';}
  });
  window._diqRestoreAuthoringDraft = () => {
    const user=window.__DIQ_AUTH_USER__;
    if(!user||!['coach','admin'].includes(user.role))return;
    const authoring=window._diqSituationAuthoring;
    const preview=authoring.readHandoff(sessionStorage,user.id,'player-preview');
    if(preview){
      const snapshot=clone(preview.situation);
      if(snapshot.hit) setHitSaved(snapshot.key,snapshot.hit);
      setPlayerPreview(true,()=>{
        authoring.writeHandoff(sessionStorage,user.id,'training-review',preview.situation,preview.baseline,preview.rationale);
        window.location.assign('/coach-board');
      });
      setSituation(snapshot.key,snapshot);
      return;
    }
    const transfer=window._diqSituationAuthoring.readHandoff(sessionStorage,user.id,'details');
    if(!transfer)return;
    transferToBoard('training',transfer.situation,transfer.baseline,transfer.rationale);
  };

  window._diqMarkSituationDirty = (snapshot, role) => {
    if (!editorRole || role !== editorRole) return;
    editorDirty = true;
    setWorkflowStatus();
    renderEditorState(snapshot);
  };

  window._diqSituationChanged = (snapshot) => {
    if (proposalPreviewState) return;
    if (!editorRole || !snapshot) return;
    editorBaseline = clone(window._diqGetPublishedSituationSnapshot?.(snapshot.key) || snapshot);
    editorDirty = false;
    renderEditorState(snapshot);
  };

  window._diqSituationEditorOpened = (role) => {
    if (!situationEditor || (role !== 'coach' && role !== 'admin')) return;
    editorRole = role;
    situationEditor.classList.remove('diq-collapsed');
    situationEditor.querySelector(':scope > .diq-body')?.removeAttribute('hidden');
    const mount = role === 'admin' ? adminEditorMount : coachEditorMount;
    if (mount && situationEditor.parentElement !== mount) mount.appendChild(situationEditor);
    editorTitle.textContent = 'Edit situation';
    if (workflowRole) workflowRole.textContent = role === 'coach' ? (window.__DIQ_AUTH_USER__?.canPublishSituations?'Situation publisher':'Coach draft') : 'Administrator';
    if (workflowHeading) workflowHeading.textContent = role === 'coach' && !window.__DIQ_AUTH_USER__?.canPublishSituations ? 'Propose changes' : 'Edit situation';
    if (workflowCopy) workflowCopy.textContent = role === 'coach' && !window.__DIQ_AUTH_USER__?.canPublishSituations
      ? 'Players continue using the published version until an administrator approves this proposal.'
      : 'Changes become available to players only after you publish them.';
    submitSituation?.classList.toggle('hidden', role !== 'coach');
    publishSituation?.classList.toggle('hidden', role !== 'admin' && !window.__DIQ_AUTH_USER__?.canPublishSituations);
    archiveSituation?.classList.toggle('hidden', role !== 'admin');
    coachHistory?.classList.toggle('hidden', role !== 'coach');
    coachSummary?.classList.toggle('hidden', role !== 'coach');
    refreshPublicationUsage();
    editorBaseline = clone(window._diqGetPublishedSituationSnapshot?.(currentSnapshot()?.key) || currentSnapshot());
    editorDirty = false;
    setWorkflowStatus();
    window._diqSetEditorMode?.(role);
    renderEditorState(currentSnapshot());
    showSituationLibrary();
    if (role === 'coach') void loadCoachProposalHistory();
  };

  window._diqSituationEditorClosed = (role) => {
    if (editorRole !== role) return;
    const key = currentSnapshot()?.key || '';
    if (playerPreviewActive) setPlayerPreview(false);
    if (proposalPreviewState) closeProposalFieldPreview(false);
    document.body.classList.remove('situation-library-open','situation-editing-open');
    editorRole = null;
    editorDirty = false;
    editorBaseline = null;
    if (coachEditorMount && situationEditor?.parentElement !== coachEditorMount) coachEditorMount.appendChild(situationEditor);
    window._diqSetEditorMode?.(null);
    void reloadPublishedSituation(key);
  };

  window._diqAdminPanelOpened = async (entry = 'org') => {
    const platformAdmin = isPlatformAdmin();
    const currentAccountId = window.__DIQ_AUTH_USER__?.id;
    if (directoryAccountId !== currentAccountId) {
      directoryScope = null;
      teamSelect.value = '';
      activeTab = 'teams';
      selectedPersonId = '';
      peopleOrganization.value = '';
      peopleSearch.value = '';
      setVisible(byId('adminTeamContext'), false);
      setVisible(byId('adminTeamRecords'), false);
      byId('adminOrganizationList').replaceChildren();
      byId('adminDirectoryItems').replaceChildren();
      byId('adminDirectoryPath').replaceChildren();
      byId('adminDirectoryActions').replaceChildren();
      byId('adminDirectoryTitle').textContent = 'Organizations';
    }
    const globalTools = platformAdmin && entry === 'global-tools';
    adminCard.querySelector('.tools-panel-header strong').textContent = globalTools ? 'Design' : 'Organization';
    adminCard.querySelector('.tools-panel-header .muted').textContent = globalTools
      ? 'Global library tools' : 'Manage your organizations, regions, and teams';
    setVisible(adminCard.querySelector('.admin-tabs'), !globalTools);
    setVisible(byId('globalToolsBackLink'), globalTools);
    setVisible(byId('adminCardCloseBtn'), !globalTools);
    adminCard.querySelectorAll('[data-admin-tab]').forEach(button => {
      setVisible(button, platformAdmin || button.dataset.adminTab === 'teams'
        || (button.dataset.adminTab === 'people' && canManagePeople()));
    });
    document.querySelectorAll('[data-platform-roster-action], [data-admin-team-tab="data"], #adminAdvanceRosterPanel')
      .forEach(element => setVisible(element, platformAdmin));
    if (!platformAdmin && activeTeamView === 'data') activeTeamView = 'roster';
    switchTab(globalTools ? 'situations' : activeTab === 'situations' ? 'teams' : activeTab);
    try {
      await loadAdminData(teamSelect?.value || '');
    } catch (error) {
      setStatus(error?.message || 'Unable to load administrator data.', 'error');
    }
  };
  window._diqAdminPanelClosed = () => {
    if (confirmationResolver) closeConfirmation(false);
    adminWorkspace?.classList.add('hidden');
    fieldCard?.classList.remove('hidden');
    window._diqSituationEditorClosed?.('admin');
  };
})();
