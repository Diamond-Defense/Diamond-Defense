// Database-backed administrator workspace.
(() => {
  const byId = (id) => document.getElementById(id);
  const adminCard = byId('adminCard');
  if (!adminCard) return;
  const adminWorkspace = byId('adminWorkspace');
  const fieldCard = document.querySelector('.field-card');
  const adminViews = Array.from(document.querySelectorAll('[data-admin-view]'));
  const mainWorkspaceViews = adminViews.filter(
    (view) => view.dataset.adminView === 'teams' || view.dataset.adminView === 'recovery',
  );
  mainWorkspaceViews.forEach((view) => adminWorkspace?.appendChild(view));

  const statusEl = byId('adminOperationStatus');
  const teamSelect = byId('adminTeamSelect');
  const teamName = byId('adminTeamName');
  const teamEmail = byId('adminTeamEmail');
  const playerSelect = byId('adminRosterSelect');
  const playerName = byId('adminPlayerName');
  const playerNumber = byId('adminPlayerNumber');
  const playerPassword = byId('adminPlayerPass');
  const playerPreview = byId('adminPlayerIdPreview');
  const coachSelect = byId('adminCoachSelect');
  const coachName = byId('adminCoachName');
  const coachPassword = byId('adminCoachPass');
  const coachPreview = byId('adminCoachIdPreview');
  const archivedTeamSelect = byId('adminArchivedTeamSelect');
  const archivedMemberSelect = byId('adminArchivedMemberSelect');
  const archivedSituationSelect = byId('adminArchivedSituationSelect');
  const proposalSelect = byId('adminProposalSelect');
  const proposalDetails = byId('adminProposalDetails');
  const proposalNotes = byId('adminProposalNotes');

  let teams = [];
  let archivedSituations = [];
  let proposals = [];
  let activeTab = 'teams';

  function setStatus(message = '', state = '') {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `operation-status${state ? ` is-${state}` : ''}`;
  }

  function option(value, text) {
    const item = document.createElement('option');
    item.value = value;
    item.textContent = text;
    return item;
  }

  function setEnabled(elements, enabled) {
    elements.forEach((element) => {
      if (element) element.disabled = !enabled;
    });
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

  function generatePassword() {
    return typeof genSimplePassword === 'function'
      ? genSimplePassword()
      : String(Math.floor(1000 + Math.random() * 9000));
  }

  function memberId(role, name, number = '') {
    const raw =
      role === 'coach'
        ? `${selectedTeam()?.id || 'team'}-coach-${name}`
        : `${selectedTeam()?.id || 'team'}-${name}-${number}`;
    return slugifyLoose(raw);
  }

  function renderTeamSelect(preferredId = '') {
    if (!teamSelect) return;
    const previous = preferredId || teamSelect.value;
    teamSelect.replaceChildren(option('', '— New team —'));
    teams
      .filter((team) => team.active !== false)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .forEach((team) => teamSelect.appendChild(option(team.id, team.name)));
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

  function updatePlayerPreview() {
    if (!playerPreview) return;
    const id =
      selectedMember('player')?.playerId ||
      memberId('player', playerName?.value || '', playerNumber?.value || '');
    playerPreview.textContent = selectedTeam() && id ? `Login ID: ${id}` : '';
  }

  function updateCoachPreview() {
    if (!coachPreview) return;
    const id =
      selectedMember('coach')?.playerId ||
      memberId('coach', coachName?.value || '');
    coachPreview.textContent =
      selectedTeam() && id ? `Coach account ID: ${id}` : '';
  }

  function renderPlayerForm() {
    const hasTeam = Boolean(selectedTeam());
    const member = selectedMember('player');
    setEnabled(
      [
        playerSelect,
        playerName,
        playerNumber,
        playerPassword,
        byId('adminGenPassBtn'),
        byId('adminPlayerAddBtn'),
      ],
      hasTeam,
    );
    setEnabled(
      [byId('adminPlayerUpdateBtn'), byId('adminPlayerRemoveBtn')],
      Boolean(member),
    );
    if (playerName) playerName.value = member?.name || '';
    if (playerNumber) playerNumber.value = member?.number || '';
    if (playerPassword) playerPassword.value = '';
    updatePlayerPreview();
  }

  function renderCoachForm() {
    const hasTeam = Boolean(selectedTeam());
    const member = selectedMember('coach');
    setEnabled(
      [
        coachSelect,
        coachName,
        coachPassword,
        byId('adminCoachGenPassBtn'),
        byId('adminCoachAddBtn'),
      ],
      hasTeam,
    );
    setEnabled(
      [byId('adminCoachUpdateBtn'), byId('adminCoachRemoveBtn')],
      Boolean(member),
    );
    if (coachName) coachName.value = member?.name || '';
    if (coachPassword) coachPassword.value = '';
    updateCoachPreview();
  }

  function renderSelectedTeam() {
    const team = selectedTeam();
    if (teamName) teamName.value = team?.name || '';
    if (teamEmail) teamEmail.value = team?.coachEmail || '';
    setEnabled(
      [byId('adminTeamUpdateBtn'), byId('adminTeamRemoveBtn')],
      Boolean(team),
    );
    renderMemberSelect('player');
    renderMemberSelect('coach');
    renderPlayerForm();
    renderCoachForm();
  }

  function populateRecovery() {
    archivedTeamSelect?.replaceChildren(option('', '— No archived teams —'));
    teams
      .filter((team) => team.active === false)
      .forEach((team) =>
        archivedTeamSelect?.appendChild(option(team.id, team.name || team.id)),
      );

    archivedMemberSelect?.replaceChildren(
      option('', '— No archived members —'),
    );
    teams.forEach((team) => {
      (team.roster || [])
        .filter((member) => member.active === false)
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
          `${situation.key} — ${situation.title || situation.key}`,
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
        ? `${proposal.submitterName} submitted a ${proposal.submissionType} for ${proposal.situationKey} on ${new Date(proposal.createdAt).toLocaleString()}. Base revision: ${proposal.baseRevision ?? 'new situation'}.`
        : 'Select a proposal to review its details.';
    }
    if (proposalNotes) proposalNotes.value = '';
    setEnabled(
      [byId('adminProposalApproveBtn'), byId('adminProposalRejectBtn')],
      Boolean(proposal),
    );
  }

  function renderProposals() {
    proposalSelect?.replaceChildren(option('', '— No pending proposals —'));
    proposals.forEach((proposal) =>
      proposalSelect?.appendChild(
        option(
          proposal.id,
          `${proposal.submissionType === 'create' ? 'New' : 'Update'}: ${proposal.situation.title} — ${proposal.submitterName}`,
        ),
      ),
    );
    renderProposalDetails();
  }

  async function refreshPublicTeams() {
    if (typeof loadTeamsFromJson === 'function') await loadTeamsFromJson();
    if (typeof refreshTeamsUIAll === 'function') refreshTeamsUIAll();
  }

  async function loadAdminData(preferredTeamId = '') {
    setStatus('Loading the latest database records…', 'pending');
    const [teamResult, situationResult, proposalResult] = await Promise.all([
      diqApiRequest('admin/teams?includeArchived=true', { cache: 'no-store' }),
      diqApiRequest('admin/situations', { cache: 'no-store' }),
      diqApiRequest('situation-submissions?status=pending', {
        cache: 'no-store',
      }),
    ]);
    teams = Array.isArray(teamResult?.teams) ? teamResult.teams : [];
    archivedSituations = (situationResult?.situations || []).filter(
      (item) => item.active === false,
    );
    proposals = Array.isArray(proposalResult?.submissions)
      ? proposalResult.submissions
      : [];
    renderTeamSelect(preferredTeamId);
    renderSelectedTeam();
    populateRecovery();
    renderProposals();
    setStatus('Database records are up to date.', 'success');
  }

  async function perform(label, action, successMessage, preferredTeamId = '') {
    try {
      setStatus(label, 'pending');
      await action();
      await refreshPublicTeams();
      await loadAdminData(preferredTeamId);
      setStatus(successMessage, 'success');
      return true;
    } catch (error) {
      console.error(error);
      setStatus(error?.message || 'The database operation failed.', 'error');
      return false;
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
    if (!name || (role === 'player' && !number) || password.length < 4) {
      return setStatus(
        `${role === 'coach' ? 'Coach' : 'Player'} name${role === 'player' ? ', number,' : ' and'} a password of at least 4 characters are required.`,
        'error',
      );
    }
    const id = memberId(role, name, number);
    const ok = await perform(
      `Creating ${role} account…`,
      () =>
        diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}/members`, {
          method: 'POST',
          body: JSON.stringify({ userId: id, name, number, role, password }),
        }),
      `${role === 'coach' ? 'Coach' : 'Player'} account created.`,
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
      `${role === 'coach' ? 'Coach' : 'Player'} account saved.`,
      team.id,
    );
  }

  async function archiveMember(role) {
    const team = selectedTeam();
    const member = selectedMember(role);
    if (!team || !member) return;
    if (!confirm(`Archive ${member.name}? Historical results will be preserved.`))
      return;
    await perform(
      `Archiving ${role} account…`,
      () =>
        diqApiRequest(
          `admin/teams/${encodeURIComponent(team.id)}/members/${encodeURIComponent(member.playerId)}`,
          {
            method: 'DELETE',
            headers: { 'If-Match': String(member.revision) },
          },
        ),
      `${role === 'coach' ? 'Coach' : 'Player'} account archived.`,
      team.id,
    );
  }

  function switchTab(tab) {
    activeTab = tab;
    adminCard.querySelectorAll('[data-admin-tab]').forEach((button) =>
      button.classList.toggle('is-active', button.dataset.adminTab === tab),
    );
    adminViews.forEach((view) =>
      view.classList.toggle('hidden', view.dataset.adminView !== tab),
    );
    const usesMainWorkspace = tab === 'teams' || tab === 'recovery';
    adminWorkspace?.classList.toggle('hidden', !usesMainWorkspace);
    fieldCard?.classList.toggle('hidden', usesMainWorkspace);
    if (tab === 'situations') window._diqSituationEditorOpened?.('admin');
    else window._diqSituationEditorClosed?.('admin');
  }

  adminCard.querySelectorAll('[data-admin-tab]').forEach((button) =>
    button.addEventListener('click', () => switchTab(button.dataset.adminTab)),
  );
  teamSelect?.addEventListener('change', renderSelectedTeam);
  playerSelect?.addEventListener('change', renderPlayerForm);
  coachSelect?.addEventListener('change', renderCoachForm);
  playerName?.addEventListener('input', updatePlayerPreview);
  playerNumber?.addEventListener('input', updatePlayerPreview);
  coachName?.addEventListener('input', updateCoachPreview);
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

  byId('adminTeamAddBtn')?.addEventListener('click', () => {
    const name = String(teamName?.value || '').trim();
    if (!name) return setStatus('Team name is required.', 'error');
    const id = slugifyLoose(name);
    void perform(
      'Creating team…',
      () =>
        diqApiRequest('admin/teams', {
          method: 'POST',
          body: JSON.stringify({
            id,
            name,
            coachEmail: String(teamEmail?.value || '').trim(),
          }),
        }),
      'Team created.',
      id,
    );
  });

  byId('adminTeamUpdateBtn')?.addEventListener('click', () => {
    const team = selectedTeam();
    if (!team) return setStatus('Select a team to update.', 'error');
    void perform(
      'Saving team…',
      () =>
        diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}`, {
          method: 'PUT',
          headers: { 'If-Match': String(team.revision) },
          body: JSON.stringify({
            name: String(teamName?.value || '').trim(),
            coachEmail: String(teamEmail?.value || '').trim(),
          }),
        }),
      'Team saved.',
      team.id,
    );
  });

  byId('adminTeamRemoveBtn')?.addEventListener('click', () => {
    const team = selectedTeam();
    if (!team || !confirm(`Archive ${team.name}? Historical results will be preserved.`))
      return;
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

  byId('adminPlayerAddBtn')?.addEventListener('click', () =>
    void createMember('player'),
  );
  byId('adminPlayerUpdateBtn')?.addEventListener('click', () =>
    void updateMember('player'),
  );
  byId('adminPlayerRemoveBtn')?.addEventListener('click', () =>
    void archiveMember('player'),
  );
  byId('adminCoachAddBtn')?.addEventListener('click', () =>
    void createMember('coach'),
  );
  byId('adminCoachUpdateBtn')?.addEventListener('click', () =>
    void updateMember('coach'),
  );
  byId('adminCoachRemoveBtn')?.addEventListener('click', () =>
    void archiveMember('coach'),
  );

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
      if (ok && typeof loadSituationsFromJson === 'function') {
        await loadSituationsFromJson();
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
    const ok = await perform(
      decision === 'approve' ? 'Publishing proposal…' : 'Rejecting proposal…',
      () =>
        diqApiRequest(
          `admin/situation-submissions/${encodeURIComponent(proposal.id)}`,
          {
            method: 'PUT',
            body: JSON.stringify({ decision, notes }),
          },
        ),
      decision === 'approve'
        ? 'Proposal approved and published.'
        : 'Proposal rejected.',
      teamSelect?.value || '',
    );
    if (ok && decision === 'approve' && typeof loadSituationsFromJson === 'function') {
      await loadSituationsFromJson();
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
  const csvArchiveConfirm = byId('adminCsvArchiveConfirm');
  const csvArchiveConfirmLabel = byId('adminCsvArchiveConfirmLabel');
  let csvSource = '';
  let csvPreview = null;

  function csvEscape(value) {
    const text = String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
  }

  function clearCsvPreview() {
    csvSource = '';
    csvPreview = null;
    if (csvFile) csvFile.value = '';
    if (csvFileName) csvFileName.textContent = 'or choose a file up to 512 KB';
    csvPreviewPanel?.classList.add('hidden');
    csvArchiveConfirmLabel?.classList.add('hidden');
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
        ? `<div class="admin-csv-table-wrap"><table class="admin-csv-table"><thead><tr><th>Row</th><th>Change</th><th>Record</th><th>Database ID</th></tr></thead><tbody>${operations.map((operation) =>
          `<tr><td>${operation.row}</td><td><span class="admin-csv-action is-${operation.action}">${operation.action}</span></td><td>${escapeHtml(operation.label)}</td><td><code>${escapeHtml(operation.userId || operation.teamId)}</code></td></tr>`).join('')}</tbody></table></div>`
        : '';
    }
    const hasArchives = Number(preview.summary.archives || 0) > 0;
    csvArchiveConfirmLabel?.classList.toggle('hidden', !hasArchives);
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
    if (!file) return;
    csvPreview = null;
    csvPreviewPanel?.classList.add('hidden');
    if (csvCommit) csvCommit.disabled = true;
    if (file.size > 512 * 1024) {
      setStatus('The CSV file must be 512 KB or smaller.', 'error');
      return;
    }
    try {
      setStatus('Validating the CSV without changing the database…', 'pending');
      csvSource = await file.text();
      if (csvFileName) csvFileName.textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
      const preview = await diqApiRequest('admin/team-import', {
        method: 'POST',
        body: JSON.stringify({ mode: 'preview', csv: csvSource }),
      });
      renderCsvPreview(preview);
    } catch (error) {
      setStatus(error?.message || 'Unable to preview this CSV.', 'error');
      csvPreviewPanel?.classList.add('hidden');
    }
  }

  byId('adminTeamsCsvChooseBtn')?.addEventListener('click', () => csvFile?.click());
  csvFile?.addEventListener('change', () => void previewCsvFile(csvFile.files?.[0]));
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
  csvArchiveConfirm?.addEventListener('change', updateCsvCommitState);
  byId('adminCsvCancelBtn')?.addEventListener('click', clearCsvPreview);
  csvCommit?.addEventListener('click', async () => {
    if (!csvPreview?.valid || !csvSource) return;
    try {
      csvCommit.disabled = true;
      setStatus('Applying the reviewed CSV changes…', 'pending');
      const result = await diqApiRequest('admin/team-import', {
        method: 'POST',
        body: JSON.stringify({ mode: 'commit', csv: csvSource, fingerprint: csvPreview.fingerprint }),
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
  byId('adminTeamsCsvTemplateBtn')?.addEventListener('click', async () => {
    try {
      const response = await fetch(diqApiUrl('admin/team-import'), { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Template download failed (${response.status}).`);
      downloadText('diamond-defense-team-import-template.csv', await response.text(), 'text/csv;charset=utf-8');
    } catch (error) {
      setStatus(error?.message || 'Unable to download the CSV template.', 'error');
    }
  });
  byId('adminTeamsCsvSelectedBtn')?.addEventListener('click', () => {
    const team = selectedTeam();
    if (!team) return setStatus('Select a team first.', 'error');
    const rows = [
      ['record_type', 'action', 'team_id', 'team_name', 'contact_email', 'user_id', 'role', 'name', 'number', 'password'],
      ['team', 'upsert', team.id, team.name, team.coachEmail || '', '', '', '', '', ''],
      ...(team.roster || []).filter((member) => member.active !== false).map((member) =>
        ['member', 'upsert', team.id, '', '', member.playerId, member.role, member.name, member.number || '', '']),
    ];
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
    downloadText(
      `diamond-defense-${slugifyLoose(team.name)}-import.csv`,
      csv,
      'text/csv;charset=utf-8',
    );
  });

  // One situation editor is physically shared by the coach and admin panels.
  const situationEditor = byId('situationBuilderSubsec');
  const coachEditorMount = byId('coachSituationEditorMount');
  const adminEditorMount = byId('adminSituationEditorMount');
  const submitSituation = byId('submitSituationBtn');
  const publishSituation = byId('publishSituationBtn');
  const archiveSituation = byId('deleteSituationBtn');
  const editorTitle = byId('situationBuilderTitle');
  const workflowStatus = byId('situationWorkflowStatus');
  const coachHistory = byId('coachProposalHistory');
  let editorRole = null;
  let editorDirty = false;

  function setWorkflowStatus(message = '', state = '') {
    if (!workflowStatus) return;
    workflowStatus.textContent = message;
    workflowStatus.className = `operation-status${state ? ` is-${state}` : ''}`;
  }

  async function reloadPublishedSituation(preferredKey = '') {
    if (typeof loadSituationsFromJson !== 'function') return;
    await loadSituationsFromJson();
    loadStarts();
    loadHits();
    const key =
      (SITUATIONS || []).some((item) => item.key === preferredKey)
        ? preferredKey
        : SITUATIONS?.[0]?.key;
    if (key) {
      populateSituations(key);
      setSituation(key);
    }
  }

  async function loadCoachProposalHistory() {
    if (!coachHistory || editorRole !== 'coach') return;
    try {
      const result = await diqApiRequest('situation-submissions', {
        cache: 'no-store',
      });
      const records = Array.isArray(result?.submissions)
        ? result.submissions
        : [];
      coachHistory.replaceChildren();
      if (!records.length) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'You have not submitted any situation proposals yet.';
        coachHistory.appendChild(empty);
        return;
      }
      records.slice(0, 8).forEach((record) => {
        const row = document.createElement('div');
        row.className = 'proposal-history-row';
        const text = document.createElement('span');
        text.textContent = `${record.situation.title} · ${record.status}${record.reviewNotes ? ` — ${record.reviewNotes}` : ''}`;
        row.appendChild(text);
        if (record.status === 'pending') {
          const withdraw = document.createElement('button');
          withdraw.type = 'button';
          withdraw.className = 'btn btn-ghost btn-small';
          withdraw.textContent = 'Withdraw';
          withdraw.addEventListener('click', async () => {
            try {
              setWorkflowStatus('Withdrawing proposal…', 'pending');
              await diqApiRequest(
                `situation-submissions/${encodeURIComponent(record.id)}`,
                { method: 'DELETE' },
              );
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

  async function submitCurrentSituation() {
    const snapshot = window._diqGetCurrentSituationSnapshot?.();
    if (!snapshot) return setWorkflowStatus('Select a situation first.', 'error');
    try {
      setWorkflowStatus('Submitting proposal for administrator review…', 'pending');
      await diqApiRequest('situation-submissions', {
        method: 'POST',
        body: JSON.stringify(snapshot),
      });
      editorDirty = false;
      setWorkflowStatus(
        'Proposal submitted. The published situation has not changed.',
        'success',
      );
      await loadCoachProposalHistory();
      await reloadPublishedSituation(snapshot.key);
    } catch (error) {
      setWorkflowStatus(error?.message || 'Unable to submit the proposal.', 'error');
    }
  }

  async function publishCurrentSituation() {
    const snapshot = window._diqGetCurrentSituationSnapshot?.();
    if (!snapshot) return setWorkflowStatus('Select a situation first.', 'error');
    const revision = Number(snapshot.revision);
    const creating = !Number.isInteger(revision) || revision < 1;
    try {
      setWorkflowStatus(
        creating ? 'Publishing new situation…' : 'Publishing situation changes…',
        'pending',
      );
      const result = await diqApiRequest(
        creating ? 'situations' : `situations/${encodeURIComponent(snapshot.key)}`,
        {
          method: creating ? 'POST' : 'PUT',
          headers: creating ? {} : { 'If-Match': String(revision) },
          body: JSON.stringify(snapshot),
        },
      );
      editorDirty = false;
      setWorkflowStatus('Situation published.', 'success');
      await reloadPublishedSituation(result?.record?.key || snapshot.key);
      await loadAdminData(teamSelect?.value || '');
    } catch (error) {
      setWorkflowStatus(error?.message || 'Unable to publish the situation.', 'error');
    }
  }

  submitSituation?.addEventListener('click', () => void submitCurrentSituation());
  publishSituation?.addEventListener('click', () => void publishCurrentSituation());

  window._diqMarkSituationDirty = (_snapshot, role) => {
    if (!editorRole || role !== editorRole) return;
    editorDirty = true;
    setWorkflowStatus(
      role === 'coach'
        ? 'Draft changes are local until you submit them for review.'
        : 'Changes are local until you publish them.',
      'pending',
    );
  };

  window._diqSituationEditorOpened = (role) => {
    if (!situationEditor || (role !== 'coach' && role !== 'admin')) return;
    editorRole = role;
    const mount = role === 'admin' ? adminEditorMount : coachEditorMount;
    if (mount && situationEditor.parentElement !== mount) mount.appendChild(situationEditor);
    if (editorTitle) {
      editorTitle.textContent =
        role === 'coach' ? 'Situation proposal' : 'Published situation editor';
    }
    submitSituation?.classList.toggle('hidden', role !== 'coach');
    publishSituation?.classList.toggle('hidden', role !== 'admin');
    archiveSituation?.classList.toggle('hidden', role !== 'admin');
    coachHistory?.classList.toggle('hidden', role !== 'coach');
    setWorkflowStatus(
      role === 'coach'
        ? 'Your edits create a proposal; players continue using the published version until an administrator approves it.'
        : 'Edits are not visible to players until you publish them.',
    );
    window._diqSetEditorMode?.(role);
    if (role === 'coach') void loadCoachProposalHistory();
  };

  window._diqSituationEditorClosed = (role) => {
    if (editorRole !== role) return;
    const key = window._diqGetCurrentSituationSnapshot?.()?.key || '';
    editorRole = null;
    editorDirty = false;
    if (coachEditorMount && situationEditor?.parentElement !== coachEditorMount) {
      coachEditorMount.appendChild(situationEditor);
    }
    window._diqSetEditorMode?.(null);
    void reloadPublishedSituation(key);
  };

  window._diqAdminPanelOpened = async () => {
    switchTab(activeTab);
    try {
      await loadAdminData(teamSelect?.value || '');
    } catch (error) {
      setStatus(error?.message || 'Unable to load administrator data.', 'error');
    }
  };
  window._diqAdminPanelClosed = () => {
    adminWorkspace?.classList.add('hidden');
    fieldCard?.classList.remove('hidden');
    window._diqSituationEditorClosed?.('admin');
  };
})();
