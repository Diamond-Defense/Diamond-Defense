import { test, expect, request as requests } from '@playwright/test';

test('a pinned team revision moves through each required publication gate', async ({ page, baseURL }) => {
  const admin = await requests.newContext({ baseURL });
  const director = await requests.newContext({ baseURL });
  const unrelatedCoach = await requests.newContext({ baseURL });
  const playerSession = await requests.newContext({ baseURL });
  const origin = new URL(baseURL).origin;
  const headers = { Origin: origin };
  async function send(context, url, data, status) {
    const response = await context.post(url, {headers, data});
    if (status) expect(response.status(), await response.text()).toBe(status);
    else expect(response.ok(), await response.text()).toBe(true);
    return response.headers()['content-type']?.includes('application/json') ? response.json() : null;
  }
  const directory = '/api/admin/workspace-directory';
  const design = '/api/design';
  const suffix = crypto.randomUUID().slice(0, 8);
  try {
    await send(admin, '/api/auth/login', { username: 'admin', password: 'password' });
    const organization = await send(admin, directory, { action: 'create_organization', name: `Design Club ${suffix}` });
    const region = await send(admin, directory, { action: 'create_region', name: 'North', organizationId: organization.id });
    const team = (await send(admin, '/api/admin/teams', {
      name: `Design Team ${suffix}`, seasonName: 'Spring 2027', regionId: region.id,
    })).record;
    const secondTeam = (await send(admin, '/api/admin/teams', {
      name: `Receiving Team ${suffix}`, seasonName: 'Spring 2027', regionId: region.id,
    })).record;
    const siblingRegion = await send(admin,directory,{action:'create_region',name:'South',organizationId:organization.id});
    const siblingTeam = (await send(admin,'/api/admin/teams',{
      name:`Other Region Team ${suffix}`,seasonName:'Spring 2027',regionId:siblingRegion.id,
    })).record;
    const account = (await send(admin, `/api/admin/teams/${team.id}/members`, {
      name: `Design Coach ${suffix}`, role: 'coach', password: 'Temporary-4842',
    })).record;
    for (const [role, scopeId] of [['coach', team.id], ['regional_director', region.id], ['organization_director', organization.id]]) {
      await send(admin, directory, { action:'stage_access', userId:account.playerId, role, scopeId, canDesign:true });
    }
    await send(director, '/api/auth/login', { username: account.username, password: 'Temporary-4842' });
    expect((await director.put('/api/auth/password', { headers, data: {
      currentPassword:'Temporary-4842', newPassword:'Design-493821',
    } })).ok()).toBe(true);
    const seed = (await (await admin.get('/api/situations')).json()).find(item => item.playOutcome?.reviewStatus === 'ready');
    const local = { ...seed, key: `design-${suffix}`, title: `New drill ${suffix}`, revision: undefined };
    const teamRevision = (await send(director, design, {
      action:'publish', type:'team', id:team.id, situation:local,
    }, 201)).record;
    const player = (await send(admin, `/api/admin/teams/${team.id}/members`, {
      role: 'player', name: `Overview Player ${suffix}`, number: '42', password: 'Temporary-4842',
    }, 201)).record;
    await send(director, '/api/practice/assignments', {
      teamId: team.id, title: 'Practice overview', playerIds: [player.playerId],
      situations: [{ situationKey: teamRevision.key, repetitions: 1 }], publish: true,
    }, 201);
    await send(playerSession, '/api/auth/login', { username:player.username, password:'Temporary-4842' });
    expect((await playerSession.put('/api/auth/password', { headers, data:{
      currentPassword:'Temporary-4842',newPassword:'Design-Player-493821',
    } })).ok()).toBe(true);
    const playerCatalog = async () => (await playerSession.get('/api/situations')).json();
    const overview = await (await director.get(`/api/training/overview?region=${region.id}`)).json();
    expect(overview.teams.find(item => item.id === team.id)).toMatchObject({
      activeAssignments: 1, assigned: 1, completed: 0, overdue: 0,
    });
    expect(overview.teams.find(item => item.id === secondTeam.id)).toMatchObject({
      activeAssignments: 0, assigned: 0,
    });
    const sharedBefore = await (await page.request.get('/api/situations')).json();
    expect(sharedBefore.some(item => item.key === teamRevision.key)).toBe(false);
    await send(unrelatedCoach, '/api/auth/login', { username:'jamie.rivera', password:'password' });
    expect((await unrelatedCoach.get(`/api/play-library/situation/${teamRevision.key}`)).status()).toBe(404);
    expect((await unrelatedCoach.get(`/api/design?type=team&id=${team.id}`)).status()).toBe(403);
    await send(unrelatedCoach, '/api/situations', local, 403);
    await send(unrelatedCoach, '/api/situation-submissions', { situation:local, rationale:'Old route' }, 410);
    const link = item => ({ sourceKey:item.key, sourceRevision:item.revision });
    const submission = await send(director, design, { action:'submit', ...link(teamRevision) });
    const attempts = await Promise.all([
      send(director, design, { action:'approve', promotionId:submission.promotion.id }),
      send(director, design, { action:'approve', promotionId:submission.promotion.id }),
    ]);
    const regional = attempts.find(item => item.record).record;
    const repeat = await send(director, design, { action:'approve', ...link(teamRevision) });
    expect(repeat.promotion.destination_key).toBe(regional.key);
    const teamPlaybook = async id => (await (await director.get(`/api/teams/${id}/playbook?includeSituations=true`)).json()).situations;
    expect(await teamPlaybook(secondTeam.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({key:regional.key,revision:regional.revision}),
    ]));
    const inheritedPractice = (await send(director, '/api/practice/assignments', {
      teamId:team.id,title:'Regional snapshot',playerIds:[player.playerId],
      situations:[{situationKey:regional.key,repetitions:1}],publish:true,
    },201)).assignment;
    const update = (await send(director, design, { action:'publish', type:'team', id:team.id,
      revision:teamRevision.revision, situation:{ ...teamRevision, desc:'Revised team route' },
    })).record;
    await send(director, design, { action:'approve', ...link(update) }, 409);
    const updateQueue = await (await director.get(`/api/design?type=region&id=${region.id}`)).json();
    const review = updateQueue.incoming.find(item => item.source_key === teamRevision.key);
    expect(review.existing.key).toBe(regional.key);
    const revisedRegion = (await send(director, design, {
      action:'approve', promotionId:review.id, resolution:'adopt', destinationRevision:review.existing.revision,
    })).record;
    expect(revisedRegion.revision).toBeGreaterThan(regional.revision);
    const adopted = await (await director.get(`/api/teams/${secondTeam.id}/playbook?includeSituations=true`)).json();
    expect(adopted.situations.find(entry => entry.key === regional.key).revision).toBe(revisedRegion.revision);
    const regionalSnapshot = (await (await director.get(`/api/practice/assignments/${inheritedPractice.id}`)).json()).assignment;
    expect(regionalSnapshot.situations[0].situationRevision).toBe(regional.revision);

    const localAfterApproval = await (await director.get(`/api/design?type=team&id=${team.id}`)).json();
    expect(localAfterApproval.entries.some(entry => entry.key === teamRevision.key)).toBe(false);
    expect(localAfterApproval.inherited.filter(entry => entry.title === local.title)).toEqual([
      expect.objectContaining({key:regional.key,revision:revisedRegion.revision}),
    ]);
    const onward = await send(director, design, { action:'submit', ...link(revisedRegion) });
    const organizational = (await send(admin, design, { action:'approve', promotionId:onward.promotion.id })).record;
    await send(admin, design, { action:'approve', ...link(organizational) }, 400);
    const regionalListing = await (await director.get(`/api/design?type=region&id=${region.id}`)).json();
    expect(regionalListing.inherited).toEqual(expect.arrayContaining([
      expect.objectContaining({key:organizational.key,revision:organizational.revision}),
    ]));
    const proposal = await send(director, design, { action:'change_proposal', type:'region', id:region.id,
      ...link(organizational), situation:{...organizational,desc:'Clarify the cutoff assignment'} }, 201);
    await send(unrelatedCoach, design, { action:'review_change', proposalId:proposal.id, resolution:'approve' }, 403);
    await send(director, design, { action:'review_change', proposalId:proposal.id, resolution:'approve' });
    const organizationListing = await (await director.get(`/api/design?type=organization&id=${organization.id}`)).json();
    expect(organizationListing.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({key:organizational.key,revision:organizational.revision + 1,desc:'Clarify the cutoff assignment'}),
    ]));
    expect(organizationListing.changeReviews.find(item => item.id === proposal.id).status).toBe('approved');
    const latestOrg = organizationListing.entries.find(entry => entry.key === organizational.key);
    const variation = (await send(director, design, { action:'create_variation', type:'region', id:region.id,
      ...link(latestOrg), situation:{...latestOrg,title:`Cutoff variation ${suffix}`,difficulty:'advanced'} }, 201)).record;
    expect(variation.variationSourceKey).toBe(organizational.key);
    expect(await teamPlaybook(secondTeam.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({key:variation.key}), expect.objectContaining({key:latestOrg.key,revision:latestOrg.revision}),
    ]));
    const setHidden = (type,id,key,hidden) => send(director,design,{action:'inherited_visibility',type,id,keys:[key],hidden});
    const siblingPlaybook = async () => (await (await admin.get(`/api/teams/${siblingTeam.id}/playbook?includeSituations=true`)).json()).situations;
    expect((await siblingPlaybook()).some(entry => entry.key === latestOrg.key)).toBe(true);
    expect((await siblingPlaybook()).some(entry => entry.key === variation.key)).toBe(false);
    await setHidden('region',region.id,latestOrg.key,true);
    expect((await teamPlaybook(team.id)).some(entry => entry.key === latestOrg.key)).toBe(false);
    expect((await teamPlaybook(secondTeam.id)).some(entry => entry.key === latestOrg.key)).toBe(false);
    expect((await siblingPlaybook()).some(entry => entry.key === latestOrg.key)).toBe(true);
    await setHidden('team',team.id,latestOrg.key,false);
    expect((await teamPlaybook(team.id)).some(entry => entry.key === latestOrg.key)).toBe(false);
    await setHidden('region',region.id,latestOrg.key,false);
    await setHidden('team',team.id,variation.key,true);
    expect((await playerCatalog()).some(entry => entry.key === variation.key)).toBe(false);
    expect((await teamPlaybook(secondTeam.id)).some(entry => entry.key === variation.key)).toBe(true);
    await setHidden('team',team.id,variation.key,false);
    await setHidden('region',region.id,latestOrg.key,true);
    const globalRequest = await send(director, design, { action:'submit', ...link(latestOrg) });
    const global = (await send(admin, design, { action:'approve', promotionId:globalRequest.promotion.id })).record;
    expect((await teamPlaybook(team.id)).some(entry => entry.title === local.title)).toBe(false);
    await setHidden('region',region.id,global.key,false);
    expect((await teamPlaybook(team.id)).filter(entry => entry.title === local.title)).toEqual([
      expect.objectContaining({key:global.key,revision:global.revision}),
    ]);
    await send(page.request, '/api/auth/login', { username:account.username, password:'Design-493821' });
    await page.goto(`/design?type=organization&id=${organization.id}`);
    const inheritedTable = page.getByRole('table',{name:'Inherited situations'});
    const globalRow = inheritedTable.getByRole('row').filter({hasText:global.title}).filter({has:page.getByRole('cell',{name:'Global Library',exact:true})});
    // A locally owned version of this lineage replaces its inherited ancestor in Design.
    await expect(globalRow).toHaveCount(0);
    expect(await teamPlaybook(team.id)).toEqual(expect.arrayContaining([expect.objectContaining({key:global.key,revision:global.revision})]));
    expect(await playerCatalog()).toEqual(expect.arrayContaining([expect.objectContaining({key:global.key,revision:global.revision})]));
    const assignment = (await send(director, '/api/practice/assignments', {
      teamId:team.id,title:'Inherited practice',playerIds:[player.playerId],
      situations:[{situationKey:global.key,repetitions:1}],publish:true,
    },201)).assignment;
    // Its owned descendant hides this ancestor in Design, so exercise the visibility API directly.
    await setHidden('organization',organization.id,global.key,true);
    expect((await teamPlaybook(team.id)).some(entry => entry.key === global.key)).toBe(false);
    expect((await playerCatalog()).some(entry => entry.key === global.key)).toBe(false);
    const changedGlobal = (await send(admin,design, {
      action:'publish',type:'global',id:'',revision:global.revision,situation:{...global,desc:'Updated Global drill',difficulty:'advanced'},
    })).record;
    await page.goto(`/design?type=region&id=${region.id}`);
    await expect(globalRow).toHaveCount(0);
    const visibility = (type,id,hidden) => ({action:'global_visibility',type,id,hidden,keys:[global.key]});
    await send(unrelatedCoach,design,visibility('organization',organization.id,false),403);
    await send(director,design,visibility('region',region.id,true));
    await send(director,design,visibility('organization',organization.id,false));
    expect((await teamPlaybook(secondTeam.id)).some(entry => entry.key === global.key)).toBe(false);
    await send(director,design,visibility('region',region.id,false));
    await page.goto(`/design?type=team&id=${team.id}`);
    // A locally owned version of this lineage replaces its inherited ancestor in Design.
    await expect(globalRow).toHaveCount(0);
    await page.getByRole('button',{name:'Filters',exact:true}).click();
    await page.getByRole('combobox',{name:'Inherited difficulty'}).selectOption('foundational');
    await expect(globalRow).toHaveCount(0);
    // The inherited library is paginated; search for this fixture before inspecting its row.
    await page.getByRole('searchbox',{name:'Search situations',exact:true}).fill(variation.title);
    const regionalVariationRow = inheritedTable.getByRole('row').filter({hasText:variation.title});
    await expect(regionalVariationRow.getByText('Outside team difficulty')).toBeVisible();
    expect((await playerCatalog()).some(entry => entry.key === variation.key)).toBe(false);
    expect((await teamPlaybook(team.id)).some(entry => entry.key === global.key)).toBe(false);
    expect(await teamPlaybook(secondTeam.id)).toEqual(expect.arrayContaining([expect.objectContaining({key:global.key,revision:changedGlobal.revision})]));
    // Open the shared Situation Library for this team; Training no longer owns a Situation Library tab.
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-diq-runtime','loaded');
    await page.evaluate(()=>window.__DIQ_READY__);
    const selectedPlaybookResponse = page.waitForResponse(response =>
      new URL(response.url()).searchParams.get('teamId') === team.id &&
      new URL(response.url()).pathname === '/api/situations' && response.ok());
    await page.evaluate(teamId=>window._diqOpenPlaybookBrowser(teamId),team.id);
    await selectedPlaybookResponse;
    const filteredPlaybook = page.locator('#playbookBrowserOverlay');
    await expect(filteredPlaybook).toBeVisible();
    await expect(filteredPlaybook.locator('.library-card-difficulty[data-difficulty="foundational"]').first()).toBeVisible();
    await expect(filteredPlaybook.locator('.library-card-difficulty[data-difficulty="advanced"], .library-card-difficulty[data-difficulty="intermediate"]')).toHaveCount(0);
    await page.goto(`/workspace/design?type=team&id=${team.id}`);
    await page.getByRole('button',{name:'Filters',exact:true}).click();
    await expect(page.getByRole('combobox',{name:'Inherited difficulty'})).toHaveValue('foundational');
    await page.getByRole('combobox',{name:'Inherited difficulty'}).selectOption('all');
    // A locally owned version of this lineage replaces its inherited ancestor in Design.
    await expect(globalRow).toHaveCount(0);
    await page.getByRole('searchbox',{name:'Search situations',exact:true}).fill(variation.title);
    // The inherited variation remains visible and exposes the current action menu.
    await regionalVariationRow.getByRole('button',{name:'Actions for '+variation.title,exact:true}).click();
    await regionalVariationRow.getByRole('button',{name:'Hide from this library',exact:true}).click();
    await expect(regionalVariationRow.getByText('Hidden here',{exact:true})).toBeVisible();
    expect((await teamPlaybook(team.id)).some(entry=>entry.key===variation.key)).toBe(false);
    await regionalVariationRow.getByRole('button',{name:'Actions for '+variation.title,exact:true}).click();
    await regionalVariationRow.getByRole('button',{name:'Show in this library',exact:true}).click();
    await expect(regionalVariationRow.getByText('Inherited',{exact:true})).toBeVisible();
    expect((await teamPlaybook(team.id)).some(entry=>entry.key===variation.key)).toBe(true);
    // A locally owned version of this lineage replaces its inherited ancestor in Design.
    await expect(globalRow).toHaveCount(0);
    expect(await teamPlaybook(team.id)).toEqual(expect.arrayContaining([expect.objectContaining({key:global.key,revision:changedGlobal.revision})]));
    expect(await playerCatalog()).toEqual(expect.arrayContaining([expect.objectContaining({key:global.key,revision:changedGlobal.revision})]));
    const savedAssignment = (await (await director.get(`/api/practice/assignments/${assignment.id}`)).json()).assignment;
    expect(savedAssignment.situations[0].situationRevision).toBe(global.revision);

    const coachDrill = (await send(director,design,{
      action:'publish',type:'team',id:team.id,situation:{...local,key:`extra-${suffix}`,title:`Right-Center — New drill ${suffix}`},
    },201)).record;
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Design' })).toBeVisible();
    const teamTable = page.getByRole('table',{name:'Team Library'});
    await page.getByRole('searchbox',{name:'Search situations'}).fill(`right center new drill ${suffix}`);
    const coachRow = teamTable.getByRole('row').filter({hasText:coachDrill.title});
    await expect(coachRow).toBeVisible();
    await page.getByRole('button',{name:'Select matching (1)'}).click();
    await expect(coachRow.getByRole('checkbox')).toBeChecked();
    await page.getByRole('button',{name:'Submit selected for review (1)'}).click();
    await expect(page.getByRole('status')).toHaveText('Submitted 1 of 1 to the Regional Library for review.');
    await coachRow.getByRole('button',{name:'Actions for '+coachDrill.title,exact:true}).click();
    await expect(coachRow.getByText('In review',{exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('status')).toHaveText('Submitted 1 of 1 to the Regional Library for review.');
    const regionQueue = await (await director.get(`/api/design?type=region&id=${region.id}`)).json();
    expect(regionQueue.incoming).toEqual(expect.arrayContaining([expect.objectContaining({source_key:coachDrill.key})]));
    const queuedPromotion = regionQueue.incoming.find(item => item.source_key === coachDrill.key);
    await send(admin,design,{action:'withdraw_submission',promotionId:queuedPromotion.id},409);
    await page.getByRole('button',{name:'Submissions',exact:true}).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button',{name:'Withdraw',exact:true}).click();
    await expect(page.getByRole('status')).toHaveText('Submission withdrawn.');
    const withdrawn = await (await director.get(`/api/design?type=region&id=${region.id}`)).json();
    expect(withdrawn.incoming.some(item => item.source_key === coachDrill.key)).toBe(false);
    await page.getByRole('navigation',{name:'Design sections'}).getByRole('button',{name:'Situations',exact:true}).click();
    await page.getByRole('searchbox',{name:'Search situations',exact:true}).fill(coachDrill.title);
    await coachRow.getByRole('button',{name:'Actions for '+coachDrill.title,exact:true}).click();
    await coachRow.getByRole('button',{name:'Submit for review',exact:true}).click();
    await expect(page.getByRole('status')).toHaveText('Submitted 1 of 1 to the Regional Library for review.');
    await coachRow.getByRole('button',{name:'Actions for '+coachDrill.title,exact:true}).click();
    await expect(coachRow.getByText('In review',{exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    expect((await unrelatedCoach.get(`/api/situations?teamId=${team.id}`)).status()).toBe(403);
    // Design has no visible Situation Library button; open the shared browser with this team's scope.
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-diq-runtime','loaded');
    await page.evaluate(()=>window.__DIQ_READY__);
    await page.evaluate(teamId=>window._diqOpenPlaybookBrowser(teamId),team.id);
    const playbook = page.locator('#playbookBrowserOverlay');
    await expect(playbook).toBeVisible();
    await expect(playbook.locator('.playbook-situation-card').filter({hasText:coachDrill.title})).toBeVisible();
    await page.goto(`/design?type=team&id=${team.id}`);
    await expect(page.getByRole('button', { name: 'Coach Board' })).toBeVisible();

    await page.getByRole('link', { name: '+ New situation',exact:true }).click();
    await expect(page.getByRole('heading', { name: 'Training situation' })).toBeVisible();
    await expect(page.getByLabel('Situation name')).toHaveValue('New situation');

    await send(page.request, '/api/auth/login', {username:'admin',password:'password'});
    await page.goto(`/workspace/design?type=region&id=${region.id}&view=submissions`);
    await page.getByRole('button',{name:/^Incoming reviews/}).click();
    const queued = page.getByRole('table',{name:'Pending publication reviews'}).getByRole('row').filter({hasText:coachDrill.title});
    await expect(queued).toContainText(team.name);
    await queued.getByRole('button',{name:coachDrill.title,exact:true}).click();
    await page.getByRole('button',{name:'Play-test incoming revision'}).click();
    await expect(page.locator('.situation-preview-bar')).toContainText(coachDrill.title);
    await expect(page.locator('#descHud')).toContainText(coachDrill.title);
    await page.getByRole('button',{name:'Start Situation'}).click();
    await page.getByRole('button',{name:'Back to review'}).click();
    await expect(page.getByRole('button',{name:'Play-test incoming revision'})).toBeFocused();
    await page.getByRole('button',{name:'Approve and publish'}).click();
    await expect(page.getByRole('status')).toHaveText('Revision approved and published.');
    const regionalCatalog = await (await admin.get(`/api/design?type=region&id=${region.id}`)).json();
    const regionalDrill = regionalCatalog.entries.find(entry => entry.title === coachDrill.title);
    expect(regionalDrill).toBeTruthy();
    await send(unrelatedCoach,design,{action:'cherry_pick',type:'organization',id:organization.id,...link(regionalDrill)},403);

    await send(page.request, '/api/auth/login', {username:account.username,password:'Design-493821'});
    await page.goto(`/workspace/design?type=organization&id=${organization.id}`);
    await page.getByRole('button',{name:'Add from libraries',exact:true}).click();
    const candidates=page.getByRole('region',{name:'Add from libraries',exact:true});
    const candidateSearch = candidates.getByRole('searchbox',{name:'Search situations',exact:true});
    await candidateSearch.fill(suffix + ' no match');
    await expect(page.getByText('No eligible situations match these filters.')).toBeVisible();
    await candidateSearch.fill(coachDrill.title);
    // Publication replaces the team-owned candidate with its regional successor.
    const regionalSource = page.getByRole('table',{name:'Eligible situations'}).getByRole('row')
      .filter({has:page.getByRole('button',{name:coachDrill.title,exact:true})})
      .filter({has:page.getByRole('cell',{name:organization.name+' / '+region.name+' · Regional Library',exact:true})});
    await expect(regionalSource).toHaveCount(1);
    await regionalSource.getByRole('button',{name:'Add to library',exact:true}).click();
    await expect(page.getByRole('status')).toHaveText('Revision published to this library.');

    const organizationCatalog = await (await director.get(`/api/design?type=organization&id=${organization.id}`)).json();
    const organizationDrill = organizationCatalog.entries.find(entry=>entry.title===coachDrill.title);
    expect(organizationDrill).toBeTruthy();
    await send(page.request, '/api/auth/login', {username:'admin',password:'password'});
    await page.goto('/workspace/design?type=global&view=cherry-pick');
    await candidateSearch.fill(coachDrill.title);
    const organizationSource = page.getByRole('table',{name:'Eligible situations'}).getByRole('row')
      .filter({has:page.getByRole('button',{name:coachDrill.title,exact:true})})
      .filter({has:page.getByRole('cell',{name:organization.name+' · Organization Library',exact:true})});
    await expect(organizationSource).toHaveCount(1);
    await organizationSource.getByRole('button',{name:'Preview',exact:true}).click();
    await expect(page.locator('.situation-preview-bar')).toContainText(coachDrill.title);
    await page.getByRole('button',{name:'Back to review'}).click();
    await expect(candidateSearch).toHaveValue(coachDrill.title);
    await organizationSource.getByRole('button',{name:'Add to library',exact:true}).click();
    await expect(page.getByRole('status')).toHaveText('Revision published to this library.');
    const regionalHistory = await (await director.get(`/api/design?type=region&id=${region.id}`)).json();
    expect(regionalHistory.outgoing).toEqual(expect.arrayContaining([
      expect.objectContaining({source_key:regionalDrill.key,destination_scope:'organization',status:'approved'}),
    ]));
    const organizationHistory = await (await director.get(`/api/design?type=organization&id=${organization.id}`)).json();
    expect(organizationHistory.outgoing).toEqual(expect.arrayContaining([
      expect.objectContaining({source_key:organizationDrill.key,destination_scope:'global',status:'approved'}),
    ]));
    const updatedDrill = (await send(director,design,{
      action:'publish',type:'team',id:team.id,revision:coachDrill.revision,
      situation:{...coachDrill,desc:'Updated directly from the team'},
    })).record;
    await send(director,design,{action:'cherry_pick',type:'global',id:'',...link(updatedDrill)},403);
    await send(admin,design,{action:'cherry_pick',type:'global',id:'',...link(updatedDrill)},409);
    const globalQueue = await (await admin.get('/api/design?type=global')).json();
    const directReview = globalQueue.incoming.find(item => item.source_key === updatedDrill.key);
    expect(directReview).toMatchObject({stale:false,source_revision:updatedDrill.revision});
    const resolved = await send(admin,design,{
      action:'approve',promotionId:directReview.id,resolution:'adopt',destinationRevision:directReview.existing.revision,
    });
    expect(resolved.record.desc).toBe(updatedDrill.desc);
  } finally {
    await admin.dispose();
    await director.dispose();
    await unrelatedCoach.dispose();
    await playerSession.dispose();
  }
});

test('Global Library management runs inside Design', async ({ page, baseURL }) => {
  const headers = { Origin: new URL(baseURL).origin };
  expect((await page.request.post('/api/auth/login', {
    headers, data: { username:'admin', password:'password' },
  })).ok()).toBe(true);
  const source = (await (await page.request.get('/api/admin/situations')).json()).situations
    .find(item => item.active && item.playOutcome?.reviewStatus === 'ready');
  const key = `manage-${crypto.randomUUID()}`;
  const created = await page.request.post('/api/design', {headers, data:{
    action:'publish', type:'global', id:'', situation:{...source, key, title:key, revision:undefined},
  }});
  expect(created.status(), await created.text()).toBe(201);
  await page.goto('/?workspace=global-tools');
  await expect(page).toHaveURL(/\/workspace\/design\?type=global&view=manage/);
  const tools = page.getByRole('region', {name:'Manage Global Library'});
  const tabs = page.getByRole('navigation', {name:'Design sections'});
  const toolsTabs = page.getByRole('navigation', {name:'Global Library tools'});
  const [tabsBox, toolsTabsBox, toolsBox] = await Promise.all([tabs.boundingBox(),toolsTabs.boundingBox(),tools.boundingBox()]);
  expect(toolsTabsBox.x).toBeGreaterThanOrEqual(tabsBox.x+tabsBox.width-1);
  expect(toolsBox.width).toBeGreaterThan(page.viewportSize().width-300);
  await tools.getByRole('searchbox', {name:'Search situations'}).fill(key);
  await tools.getByRole('checkbox', {name:'Select '+key,exact:true}).check();
  const download = page.waitForEvent('download');
  await tools.getByRole('button', {name:'Export (1)',exact:true}).click();
  const bundle = await download;
  expect(bundle.suggestedFilename()).toBe('diamond-defence-situations.json');
  await toolsTabs.getByRole('button', {name:'Import',exact:true}).click();
  await tools.getByLabel('Situation JSON file').setInputFiles(await bundle.path());
  await tools.getByRole('button', {name:'Review',exact:true}).click();
  await expect(tools.getByRole('table',{name:'Import preview'}).getByRole('row').filter({hasText:key})).toContainText('Duplicate');
  await toolsTabs.getByRole('button', {name:'Reorder',exact:true}).click();
  await expect(tools.getByRole('button', {name:'Move up: ' + key})).toBeVisible();
  await toolsTabs.getByRole('button', {name:'Delete situations',exact:true}).click();
  await tools.getByRole('searchbox', {name:'Search situations'}).fill(key);
  await tools.getByRole('checkbox', {name:'Select '+key,exact:true}).check();
  await tools.getByRole('button', {name:'Review deletion (1)'}).click();
  await expect(tools.getByRole('region', {name:'Deletion impact'})).toBeVisible();
  await tools.getByLabel('Type DELETE to confirm').fill('DELETE');
  await tools.getByRole('button', {name:'Delete (1)',exact:true}).click();
  await expect(tools.getByRole('status')).toHaveText('Permanently deleted 1 situations.');
});

test('Platform Admin can import a scoped copy without changing the Global Library', async ({page, baseURL}) => {
  const headers = {Origin:new URL(baseURL).origin};
  const post = async (url,data) => {
    const response = await page.request.post(url,{headers,data});
    expect(response.ok(),await response.text()).toBe(true);
    return response.json();
  };
  await post('/api/auth/login',{username:'admin',password:'password'});
  const suffix = crypto.randomUUID();
  const directory = '/api/admin/workspace-directory';
  const org = await post(directory,{action:'create_organization',name:'Import Org ' + suffix});
  const region = await post(directory,{action:'create_region',name:'Import Region',organizationId:org.id});
  const path = '/api/admin/situations/transfer';
  const exported = await (await page.request.get(path)).json();
  const source = exported.situations.find(item => item.playOutcome?.reviewStatus === 'ready');
  const bundle = {...exported,situations:[source]};
  const scope = new URLSearchParams({type:'region',id:region.id});
  const scopedPath = path + '?' + scope;
  await page.goto('/workspace/design?' + scope);
  await page.getByRole('button',{name:'Import situations'}).click();
  const importer = page.getByRole('region',{name:'Import situations'});
  await importer.getByLabel('Situation JSON file').setInputFiles({
    name:'situations.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle)),
  });
  await importer.getByRole('button',{name:'Review',exact:true}).click();
  await expect(importer.getByRole('table',{name:'Import preview'})).toContainText(source.title);
  await expect(importer).toContainText(region.name);
  await importer.getByRole('button',{name:'Select eligible',exact:true}).click();
  page.once('dialog',dialog => dialog.accept());
  await importer.getByRole('button',{name:'Import (1)',exact:true}).click();
  await expect(importer.getByRole('status')).toHaveText('Published 1 situations.');
  const regionResult = await (await page.request.get('/api/design?' + scope)).json();
  const copy = regionResult.entries.find(item => item.title === source.title);
  expect(copy.key).not.toBe(source.key);
  const orgResult = await (await page.request.get('/api/design?type=organization&id=' + org.id)).json();
  expect(orgResult.entries).toHaveLength(0);
  const modified = {...bundle,situations:[{...source,desc:'Scoped edit'}]};
  const preview = await post(scopedPath,modified);
  expect(preview.rows[0]).toMatchObject({key:copy.key,status:'changed',revision:copy.revision});
  expect((await page.request.put(scopedPath,{headers:{...headers,'If-Match':String(copy.revision)},
    data:preview.rows[0].situation})).ok()).toBe(true);
  const global = await (await page.request.get(path)).json();
  expect(global.situations.find(item => item.key === source.key).desc).toBe(source.desc);
  const orgPath = path + '?type=organization&id=' + org.id;
  const orgPreview = await post(orgPath,bundle);
  expect((await page.request.put(orgPath,{headers,data:orgPreview.rows[0].situation})).status()).toBe(201);
  const inherited = await (await page.request.get('/api/design?' + scope)).json();
  expect(inherited.inherited).toEqual(expect.arrayContaining([expect.objectContaining({key:orgPreview.rows[0].key})]));
  const coach = await requests.newContext({baseURL});
  try {
    expect((await coach.post('/api/auth/login',{headers,data:{username:'jamie.rivera',password:'password'}})).ok()).toBe(true);
    expect((await coach.post(scopedPath,{headers,data:bundle})).status()).toBe(403);
    expect((await coach.put(scopedPath,{headers,data:source})).status()).toBe(403);
  } finally { await coach.dispose(); }
});

test('staff sidebars preserve the application shell and keep content within the viewport',async({page,baseURL})=>{
 expect((await page.request.post('/api/auth/login',{headers:{Origin:new URL(baseURL).origin},data:{username:'admin',password:'password'}})).ok()).toBe(true);
 await page.goto('/workspace/org');await expect(page.locator('#adminWorkspace')).toBeVisible();
 await page.locator('#appHeader').evaluate(el=>el.dataset.shellMarker='mounted');
 for(const [button,path,content,nav] of [
  ['Training','training','#coachCard','Training navigation'],
  ['Design','design','#designWorkspace','Design sections'],
  ['Organization','org','#adminWorkspace','Org sections']]){
   await page.locator('#appHeader').getByRole('button',{name:button,exact:true}).click();
   await expect(page).toHaveURL(new RegExp('/workspace/'+path));
   const sectionNav=page.getByRole('navigation',{name:nav,exact:true});
   await expect(page.locator(content)).toBeVisible();
   await expect(sectionNav).toBeAttached();
   if(!await sectionNav.isVisible())await page.getByRole('button',{name:'Sections',exact:true}).click();
   await expect(sectionNav).toBeVisible();
   await expect(page.locator('#appHeader')).toHaveAttribute('data-shell-marker','mounted');
   for(const width of [1040,1440,2560]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    await expect(page.locator(content)).toBeVisible();
   }
 }
});
