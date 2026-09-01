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
  const proposalConflict = byId('adminProposalConflict');
  const proposalComparison = byId('adminProposalComparison');
  const proposalDiffList = byId('adminProposalDiffList');
  const confirmDialog = byId('adminConfirmDialog');
  const confirmPanel = confirmDialog?.querySelector('.admin-confirm-panel');
  const confirmTitle = byId('adminConfirmTitle');
  const confirmMessage = byId('adminConfirmMessage');
  const confirmAction = byId('adminConfirmActionBtn');
  const confirmCancel = byId('adminConfirmCancelBtn');
  if (confirmDialog?.parentElement !== document.body) {
    document.body.appendChild(confirmDialog);
  }

  let teams = [];
  let archivedSituations = [];
  let publishedSituations = [];
  let proposals = [];
  let activeTab = 'teams';
  let operationInProgress = false;
  let confirmationResolver = null;

  function setStatus(message = '', state = '') {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `operation-status${state ? ` is-${state}` : ''}`;
  }

  function clearFieldError(input) {
    if (!input) return;
    input.removeAttribute('aria-invalid');
    input.closest('.field')?.querySelector('.field-error')?.remove();
  }

  function setFieldError(input, message) {
    if (!input) return false;
    clearFieldError(input);
    input.setAttribute('aria-invalid', 'true');
    const error = document.createElement('span');
    error.className = 'field-error';
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
    const email = String(teamEmail?.value || '').trim();
    clearFieldError(teamName);
    clearFieldError(teamEmail);
    let valid = true;
    if (!name) valid = setFieldError(teamName, 'Enter a team name.');
    else if (name.length > 100) {
      valid = setFieldError(teamName, 'Team names must be 100 characters or fewer.');
    }
    if (email && (teamEmail?.validity?.typeMismatch || email.length > 254)) {
      valid = setFieldError(teamEmail, 'Enter a valid contact email address.');
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
    resolve?.(confirmed);
  }

  function requestConfirmation({ title, message, confirmLabel = 'Confirm' }) {
    if (!confirmDialog) return Promise.resolve(window.confirm(message));
    if (confirmationResolver) closeConfirmation(false);
    if (confirmTitle) confirmTitle.textContent = title;
    if (confirmMessage) confirmMessage.textContent = message;
    if (confirmAction) confirmAction.textContent = confirmLabel;
    confirmDialog.classList.remove('hidden');
    window.setTimeout(() => confirmPanel?.focus(), 0);
    return new Promise((resolve) => {
      confirmationResolver = resolve;
    });
  }

  confirmAction?.addEventListener('click', () => closeConfirmation(true));
  confirmCancel?.addEventListener('click', () => closeConfirmation(false));
  confirmDialog?.querySelector('[data-admin-confirm-cancel]')?.addEventListener(
    'click',
    () => closeConfirmation(false),
  );
  confirmDialog?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeConfirmation(false);
  });
  window._diqConfirmAdminAction = requestConfirmation;

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

  function generatePassword() {
    return typeof genSimplePassword === 'function'
      ? genSimplePassword(12)
      : `${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}A7`;
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
    [teamName, teamEmail, playerName, playerNumber, playerPassword, coachName, coachPassword]
      .forEach(clearFieldError);
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
        ? `${proposal.submitterName} submitted a ${proposal.submissionType} for ${proposal.situationKey} on ${new Date(proposal.createdAt).toLocaleString()}. Base revision: ${proposal.baseRevision ?? 'new situation'}.${proposal.rationale ? ` Reason: ${proposal.rationale}` : ''}`
        : 'Select a proposal to review its details.';
    }
    if (proposalNotes) proposalNotes.value = '';
    setEnabled(
      [byId('adminProposalApproveBtn'), byId('adminProposalRejectBtn')],
      Boolean(proposal),
    );
    renderProposalComparison(proposal || null);
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
    publishedSituations = (situationResult?.situations || []).filter(
      (item) => item.active !== false,
    );
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
      await loadAdminData(preferredTeamId);
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
    const id = memberId(role, name, number);
    const ok = await perform(
      `Creating ${role} account…`,
      () =>
        diqApiRequest(`admin/teams/${encodeURIComponent(team.id)}/members`, {
          method: 'POST',
          body: JSON.stringify({ userId: id, name, number, role, password }),
        }),
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
    if (!validateMemberFields(role)) {
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

  async function archiveMember(role) {
    const team = selectedTeam();
    const member = selectedMember(role);
    if (!team || !member) return;
    const confirmed = await requestConfirmation({
      title: `Archive ${role}`,
      message: `Archive ${member.name}? The account will no longer be able to log in, but historical results will be preserved.`,
      confirmLabel: `Archive ${role}`,
    });
    if (!confirmed) return;
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
  [teamName, teamEmail, playerName, playerNumber, playerPassword, coachName, coachPassword]
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

  byId('adminTeamAddBtn')?.addEventListener('click', () => {
    const name = String(teamName?.value || '').trim();
    if (!validateTeamFields()) {
      return setStatus('Correct the highlighted team fields.', 'error');
    }
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
            coachEmail: String(teamEmail?.value || '').trim(),
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
  const csvReviewConfirm = byId('adminCsvReviewConfirm');
  const csvReviewConfirmLabel = byId('adminCsvReviewConfirmLabel');
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
        ? `<div class="admin-csv-table-wrap"><table class="admin-csv-table"><thead><tr><th>Row</th><th>Change</th><th>Record</th><th>Database ID</th></tr></thead><tbody>${operations.map((operation) =>
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
  csvReviewConfirm?.addEventListener('change', updateCsvCommitState);
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
  const POSITION_IDS = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  const FIELD_WIDTH = 3200;
  const FIELD_HEIGHT = 2133;
  const EDITABLE_FIELDS = [
    ['title', 'Title'], ['desc', 'Description'], ['outs', 'Outs'],
    ['runnersOn', 'Runners'], ['starts', 'Starting alignment'],
    ['targets', 'Targets, tolerances, and notes'], ['hit', 'Ball landing spot'],
    ['hitType', 'Hit type'], ['batterAdvance', 'Batter advance'],
    ['playSeq', 'Play sequence'], ['seqNote', 'Sequence coaching note'],
  ];
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

  function formatDiffValue(field, value) {
    if (value == null || value === '') return '—';
    if (field === 'runnersOn') {
      const bases = [value.first && '1B', value.second && '2B', value.third && '3B'].filter(Boolean);
      return bases.join(', ') || 'None';
    }
    if (field === 'playSeq') return Array.isArray(value) && value.length ? value.join(' → ') : 'Disabled';
    if (field === 'starts' || field === 'targets') {
      return `${Object.keys(value || {}).length} positions configured`;
    }
    if (field === 'hit') return Number.isFinite(value?.x) ? `${Math.round(value.x)}, ${Math.round(value.y)}` : 'Not set';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
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
      const title = document.createElement('label');
      title.textContent = label;
      const current = document.createElement('div');
      current.className = 'proposal-diff-value';
      current.textContent = `Published: ${formatDiffValue(field, published?.[field])}`;
      const proposed = document.createElement('div');
      proposed.className = 'proposal-diff-value is-proposed';
      proposed.textContent = `Proposed: ${formatDiffValue(field, proposal.situation?.[field])}`;
      row.append(choose, title, current, proposed);
      proposalDiffList.appendChild(row);
    });
    setEnabled([byId('adminProposalApproveBtn')], !conflict && changes.length > 0);
  }

  function validateSituation(snapshot) {
    const issues = [];
    const add = (message, section, severity = 'error') => issues.push({ message, section, severity });
    if (!String(snapshot?.title || '').trim()) add('Add a situation title.', 'sbDetailsSection');
    if (!String(snapshot?.desc || '').trim()) add('Add a player-facing description.', 'sbDetailsSection');
    POSITION_IDS.forEach((id) => {
      const start = snapshot?.starts?.[id];
      const target = snapshot?.targets?.[id];
      if (!Number.isFinite(start?.x) || !Number.isFinite(start?.y)) {
        add(`${id}: set a starting position.`, 'sbTargetsSubsec');
      } else if (start.x < 0 || start.x > FIELD_WIDTH || start.y < 0 || start.y > FIELD_HEIGHT) {
        add(`${id}: starting position is outside the field.`, 'sbTargetsSubsec');
      }
      if (!Number.isFinite(target?.x) || !Number.isFinite(target?.y)) {
        add(`${id}: set a target position.`, 'sbTargetsSubsec');
      } else if (target.x < 0 || target.x > FIELD_WIDTH || target.y < 0 || target.y > FIELD_HEIGHT) {
        add(`${id}: target is outside the field.`, 'sbTargetsSubsec');
      }
      if (!Number.isFinite(Number(target?.tol)) || Number(target?.tol) < 5) {
        add(`${id}: set a valid target tolerance.`, 'sbTargetsSubsec');
      }
      if (!String(target?.notes || target?.note || '').trim()) {
        add(`${id}: add a coaching note.`, 'sbTargetsSubsec');
      }
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
    if (!Number.isFinite(snapshot?.hit?.x) || !Number.isFinite(snapshot?.hit?.y)) {
      add('Set the ball landing spot.', 'sbBallHitSubsec');
    } else if (snapshot.hit.x < 0 || snapshot.hit.x > FIELD_WIDTH || snapshot.hit.y < 0 || snapshot.hit.y > FIELD_HEIGHT) {
      add('The ball landing spot is outside the field.', 'sbBallHitSubsec');
    }
    const sequence = Array.isArray(snapshot?.playSeq) ? snapshot.playSeq : [];
    if (sequence.length === 1) add('A play sequence needs at least two positions, or it should be empty.', 'seqSubsec');
    if (new Set(sequence).size !== sequence.length) add('Remove duplicate positions from the play sequence.', 'seqSubsec');
    if (sequence.some((id) => !POSITION_IDS.includes(id))) add('The play sequence contains an invalid position.', 'seqSubsec');
    return issues;
  }

  function focusEditorSection(sectionId) {
    const section = byId(sectionId);
    if (!section) return;
    section.classList.remove('diq-collapsed');
    section.querySelector(':scope > .diq-body')?.removeAttribute('hidden');
    document.querySelectorAll('[data-editor-step]').forEach((button) => {
      button.classList.toggle('is-current', button.dataset.editorStep === sectionId);
    });
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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
      summary.innerHTML = checks.map(([label, complete]) => `<span class="${complete ? 'is-complete' : 'is-missing'}">${complete ? '✓' : '○'} ${label}</span>`).join(' · ');
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

  function renderEditorState(snapshot = currentSnapshot(), showValidation = false) {
    const issues = validateSituation(snapshot);
    const errors = issues.filter((issue) => issue.severity === 'error');
    renderPositionCompleteness(snapshot);
    renderChangeSummary(snapshot);
    if (dirtyBadge) {
      dirtyBadge.textContent = editorDirty ? 'Unsaved changes' : 'No draft changes';
      dirtyBadge.className = `dirty-state-badge ${editorDirty ? 'is-dirty' : 'is-clean'}`;
    }
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
    workflowStatus.className = `operation-status${state ? ` is-${state}` : ''}`;
  }

  function markEditorClean(snapshot = currentSnapshot()) {
    editorDirty = false;
    editorBaseline = clone(window._diqGetPublishedSituationSnapshot?.(snapshot?.key) || snapshot);
    renderEditorState(snapshot);
  }

  async function reloadPublishedSituation(preferredKey = '') {
    if (typeof loadSituationsFromJson !== 'function') return;
    await loadSituationsFromJson();
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
      const records = Array.isArray(result?.submissions) ? result.submissions : [];
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
    const snapshot = currentSnapshot();
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

  async function publishCurrentSituation() {
    const snapshot = ensureReadyToSave();
    if (!snapshot) return;
    const revision = Number(snapshot.revision);
    const creating = !Number.isInteger(revision) || revision < 1;
    try {
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
      await loadAdminData(teamSelect?.value || '');
    } catch (error) {
      setWorkflowStatus(error?.message || 'Unable to publish the situation.', 'error');
    }
  }

  function setPlayerPreview(active) {
    playerPreviewActive = Boolean(active);
    document.body.classList.toggle('situation-player-preview', playerPreviewActive);
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
      close.addEventListener('click', () => setPlayerPreview(false));
      bar.append(label, close);
      document.body.appendChild(bar);
      window._diqSetEditorMode?.(null);
    } else if (editorRole) {
      window._diqSetEditorMode?.(editorRole);
    }
  }

  submitSituation?.addEventListener('click', () => void submitCurrentSituation());
  publishSituation?.addEventListener('click', () => void publishCurrentSituation());
  previewSituation?.addEventListener('click', () => setPlayerPreview(true));
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
  });
  byId('adminProposalClearAllBtn')?.addEventListener('click', () => {
    proposalDiffList?.querySelectorAll('input[data-proposal-field]:not(:disabled)').forEach((input) => { input.checked = false; });
  });
  document.querySelectorAll('[data-editor-step]').forEach((button) => {
    button.addEventListener('click', () => focusEditorSection(button.dataset.editorStep));
  });
  coachRationale?.addEventListener('input', () => renderEditorState(currentSnapshot()));
  byId('tolTargetSel')?.addEventListener('change', () => renderPositionCompleteness(currentSnapshot()));
  byId('sitSelect')?.addEventListener('change', () => setTimeout(() => {
    if (!editorRole) return;
    editorBaseline = clone(window._diqGetPublishedSituationSnapshot?.(currentSnapshot()?.key) || currentSnapshot());
    editorDirty = false;
    renderEditorState(currentSnapshot());
  }, 0));
  byId('saveSituationBtn')?.addEventListener('click', () => setTimeout(() => markEditorClean(currentSnapshot()), 0));

  window._diqMarkSituationDirty = (snapshot, role) => {
    if (!editorRole || role !== editorRole) return;
    editorDirty = true;
    setWorkflowStatus(
      role === 'coach' ? 'Draft changes are local until you submit them for review.' : 'Changes are local until you publish them.',
      'pending',
    );
    renderEditorState(snapshot);
  };

  window._diqSituationEditorOpened = (role) => {
    if (!situationEditor || (role !== 'coach' && role !== 'admin')) return;
    editorRole = role;
    situationEditor.classList.remove('diq-collapsed');
    situationEditor.querySelector(':scope > .diq-body')?.removeAttribute('hidden');
    const mount = role === 'admin' ? adminEditorMount : coachEditorMount;
    if (mount && situationEditor.parentElement !== mount) mount.appendChild(situationEditor);
    editorTitle.textContent = role === 'coach' ? 'Situation proposal' : 'Published situation editor';
    if (workflowRole) workflowRole.textContent = role === 'coach' ? 'Coach draft' : 'Administrator';
    if (workflowHeading) workflowHeading.textContent = role === 'coach' ? 'Draft proposal' : 'Published playbook editor';
    if (workflowCopy) workflowCopy.textContent = role === 'coach'
      ? 'Players continue using the published version until an administrator approves this proposal.'
      : 'Changes become available to players only after you publish them.';
    submitSituation?.classList.toggle('hidden', role !== 'coach');
    publishSituation?.classList.toggle('hidden', role !== 'admin');
    archiveSituation?.classList.toggle('hidden', role !== 'admin');
    coachHistory?.classList.toggle('hidden', role !== 'coach');
    coachSummary?.classList.toggle('hidden', role !== 'coach');
    editorBaseline = clone(window._diqGetPublishedSituationSnapshot?.(currentSnapshot()?.key) || currentSnapshot());
    editorDirty = false;
    setWorkflowStatus(role === 'coach'
      ? 'Build a draft, review it, and submit it for administrator approval.'
      : 'Edit the published playbook, validate it, and publish when ready.');
    window._diqSetEditorMode?.(role);
    renderEditorState(currentSnapshot());
    if (role === 'coach') void loadCoachProposalHistory();
  };

  window._diqSituationEditorClosed = (role) => {
    if (editorRole !== role) return;
    const key = currentSnapshot()?.key || '';
    if (playerPreviewActive) setPlayerPreview(false);
    editorRole = null;
    editorDirty = false;
    editorBaseline = null;
    if (coachEditorMount && situationEditor?.parentElement !== coachEditorMount) coachEditorMount.appendChild(situationEditor);
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
    if (confirmationResolver) closeConfirmation(false);
    adminWorkspace?.classList.add('hidden');
    fieldCard?.classList.remove('hidden');
    window._diqSituationEditorClosed?.('admin');
  };
})();
