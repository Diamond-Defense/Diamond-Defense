<script lang="ts">
  import { onMount, tick } from 'svelte';
  import AppNavigation from '$lib/components/AppNavigation.svelte';
  import PlayLibrary from '$lib/components/PlayLibrary.svelte';
  import { importBoardFile } from '$lib/plays/board-transfer.js';
  import { pushState, replaceState } from '$app/navigation';
  import type { Situation } from '$lib/domain/models';
  import DesignWorkspace from '../../routes/design/DesignWorkspace.svelte';
  import { asset } from '$app/paths';
  import { canAccessWorkspace, workspaceLabels } from '$lib/ui/navigation';
  import Feedback from '$lib/components/ui/Feedback.svelte';
  import softFieldImage from '$lib/assets/diamond-defense-soft-field.png';
  import legacyDocument from '../../../index.html?raw';
  import { loadLegacyRuntime } from '$lib/legacy/loadRuntime';

  const brandLogo = asset('/diamond-defence-classic.png');

  const body = legacyDocument.match(/<body>([\s\S]*)<\/body>/i)?.[1] ?? '';
  const markup = body.replaceAll('data-diamond-defense-logo', `data-diamond-defense-logo src="${brandLogo}"`).replace(
    'id="fieldImg"',
    `id="fieldImg" src="${softFieldImage}"`,
  );

  let playbookOpen=$state(false);
  let playbookCatalog=$state<Situation[] | null>(null);
  let playbookCurrentKey=$state('');
  let playbookLoading=$state(false),playbookError=$state('');
  let playbookScope=$state('default');
  async function selectPlaybookItem(item:{id:string}){return window._diqChoosePlaybookSituation?.(item.id) === true;}
  function closeSharedPlaybook(){window._diqClosePlaybookBrowser?.();}
  let boardLibraryOpen = $state(false);
  let boardLibraryTrigger: HTMLElement | null = null;
  function openBoardLibrary(trigger?: HTMLElement) {
    if (!['coach','admin'].includes(account?.role || '')) return;
    window._diqClosePlaybookBrowser?.();
    window._diqCloseAccountMenu?.();
    boardLibraryTrigger = trigger || document.getElementById('coachBoardLink');
    boardLibraryOpen = true;
  }
  async function closeBoardLibrary() {
    boardLibraryOpen = false;
    const url = new URL(window.location.href);
    if (url.searchParams.has('boardLibrary')) {
      url.searchParams.delete('boardLibrary');
      replaceState(url,{});
    }
    await tick();
    boardLibraryTrigger?.focus();
    boardLibraryTrigger = null;
  }
  async function boardLibraryAction(item: {type:string;id:string} | null, action:string, name?:string) {
    const url = new URL('/coach-board',window.location.origin);
    url.searchParams.set('edit','1');
    if (item) {
      url.searchParams.set('libraryType',item.type);
      url.searchParams.set('libraryId',item.id);
      url.searchParams.set('libraryAction',action);
      if (name) url.searchParams.set('copyName',name);
    }
    window.location.assign(url);
    return false;
  }
  function importLibraryBoard(text:string) {
    const board = importBoardFile(text);
    sessionStorage.setItem('diq-library-import',JSON.stringify({userId:account?.id,createdAt:Date.now(),board}));
    window.location.assign('/coach-board?edit=1&import=1');
    return false;
  }

  let sharedHeaderReady=$state(false);
  let sharedHeaderHost=$state<HTMLDivElement>();
  let runtimeError = $state('');
  let active = $state<StaffWorkspace>('field');
  let account = $state<WorkspaceAccount | null>(null);
  let designUrl = $state<URL | null>(null);
  let pendingEntry: URL | null = null;
  let switching = 0;
  let restoringPracticeLocation = false;
  let restoringTrainingLocation = false;

  let testing = $state<Situation | null>(null);
  let restoreField: (() => void) | undefined;
  let playTestTrigger: HTMLElement | null = null;

  function playTest(snapshot: Situation) {
    if (!window._diqPlayTestSituation) throw new Error('The field is still loading.');
    playTestTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.remove('design-workspace-open');
    document.body.classList.add('situation-player-preview');
    try {
      restoreField = window._diqPlayTestSituation(snapshot);
      testing = snapshot;
    } catch (error) {
      closePlayTest();
      throw error;
    }
  }

  function closePlayTest() {
    if (testing || document.body.classList.contains('situation-player-preview') && active === 'design') {
      document.body.classList.remove('situation-player-preview');
      if (active === 'design') document.body.classList.add('design-workspace-open');
    }
    testing = null;
    restoreField?.();
    restoreField = undefined;
    const trigger = playTestTrigger;
    playTestTrigger = null;
    requestAnimationFrame(() => trigger?.isConnected && trigger.focus());
  }

  function workspaceAt(url: URL): StaffWorkspace {
    const destination = /^\/workspace\/(org|training|design)\/?$/.exec(url.pathname)?.[1]
      || url.searchParams.get('workspace');
    if (destination === 'global-tools') return 'design';
    return destination === 'org' || destination === 'training' || destination === 'design' ? destination : 'field';
  }

  const allowed = canAccessWorkspace;

  function workspaceUrl(workspace: StaffWorkspace, entry?: URL) {
    const url = new URL(workspace === 'field' ? '/' : '/workspace/' + workspace, window.location.origin);
    if (workspace === 'training' && entry) url.search = entry.search;
    if (workspace === 'design') {
      url.search = (entry || designUrl)?.search || '';
      if (url.searchParams.get('workspace') === 'global-tools') {
        url.searchParams.set('type','global');
        url.searchParams.set('view','manage');
      }
      url.searchParams.delete('workspace');
    }
    return url;
  }

  function syncDesignLocation(url: URL) {
    if (active !== 'design') return;
    // The mounted Design view owns its filters and selection. Only the bookmark changes here.
    designUrl = url;
    if (window.location.href !== url.href) replaceState(url, {});
  }

  function navigate(workspace: StaffWorkspace, historyMode: 'push' | 'replace' | 'pop' = 'push', entry?: URL) {
    if (!allowed(workspace, account)) return;
    const url = workspaceUrl(workspace, entry);
    if (workspace === active && (!entry || workspace !== 'design' || designUrl?.href === url.href)) {
      if (workspace === 'training' && entry) {
        restoringTrainingLocation = true;
        try { window._diqRestoreTrainingLocation?.(); }
        finally { restoringTrainingLocation = false; }
      }
      return;
    }
    if (testing) closePlayTest();
    const ticket = ++switching;
    pendingEntry = null;
    const previous = active;
    active = workspace;
    if (workspace === 'design') designUrl = url;
    const updateHistory = () => {
      if (window.location.href === url.href) return;
      if (historyMode === 'push') pushState(url,{});
      else replaceState(url,{});
    };

    window._diqCloseAccountMenu?.();
    window._diqCloseAccountSecurity?.();
    window._diqClosePlaybookBrowser?.();
    if (previous === 'training' && workspace !== 'training') window._diqSetEditorMode?.(null);
    if (previous === 'org' && workspace !== 'org') window._diqSetAdminMode?.(false);
    document.body.classList.toggle('design-workspace-open', workspace === 'design');
    if (workspace === 'org') window._diqSetAdminMode?.(true);
    if (workspace === 'training') void window._diqOpenTrainingFromHeader?.(() => active === 'training' && ticket === switching);
    updateHistory();
    window._diqUpdateWorkspaceNavigation?.();
  }

  function restoreLocation(initial = false) {
    const entry = new URL(window.location.href);
    let workspace = workspaceAt(entry);
    if (initial && workspace === 'field' && !entry.search && account?.directorScopes?.length && !account.coachedTeamIds?.length) {
      workspace = 'org';
    }
    if (!allowed(workspace,account)) {
      if (!account) {
        pendingEntry = entry;
        window._diqOpenAuthModal?.('player');
      } else if (account.mustChangePassword) {
        pendingEntry = entry;
      }
      if (active !== 'field') navigate('field','replace');
      return;
    }
    const practiceView = entry.searchParams.get('practice');
    if (workspace === 'field' && account?.role === 'player' && (practiceView === 'pending' || practiceView === 'completed')) {
      restoringPracticeLocation = true;
      try { window._diqOpenPracticeWorkspace?.('player',practiceView); }
      finally { restoringPracticeLocation = false; }
      return;
    }
    if (!initial && workspace === 'field' && document.querySelector('#playerPracticeView:not(.hidden)')
      && document.querySelector('#practiceWorkspace:not(.hidden)')) {
      restoringPracticeLocation = true;
      try { document.getElementById('practiceWorkspaceClose')?.click(); }
      finally { restoringPracticeLocation = false; }
    }
    navigate(workspace,initial ? 'replace' : 'pop',entry);
  }

  onMount(() => {
    let disposed = false;
    let ready = false;
    const updatePlaybook=(event:Event)=>{
      const detail=(event as CustomEvent<{situations:Situation[];currentKey:string;teamId?:string;loading?:boolean;error?:string}>).detail;
      playbookCatalog=detail.situations.slice();playbookCurrentKey=detail.currentKey;
      playbookScope=detail.teamId||'default';playbookLoading=!!detail.loading;playbookError=detail.error||'';
    };
    const openPlaybook=(event:Event)=>{boardLibraryOpen=false;updatePlaybook(event);playbookOpen=true;};
    const closePlaybook=()=>{playbookOpen=false;};
    window.addEventListener('diq:playbook-open',openPlaybook);
    window.addEventListener('diq:playbook-update',updatePlaybook);
    window.addEventListener('diq:playbook-close',closePlaybook);
    window._diqNavigateWorkspace = workspace => navigate(workspace);
    window._diqTrainingLocationChanged = query => {
      if (!ready || restoringTrainingLocation || active !== 'training') return;
      const url = new URL('/workspace/training',window.location.origin);
      url.search = query;
      if (url.href !== window.location.href) pushState(url,{});
    };
    window._diqPracticeLocationChanged = view => {
      if (!ready || restoringPracticeLocation || account?.role !== 'player') return;
      const url = new URL('/',window.location.origin);
      if (view) url.searchParams.set('practice',view);
      if (url.href !== window.location.href) pushState(url,{});
    };
    window._diqWorkspaceClosed = workspace => {
      if (active === workspace) {
        ++switching;
        active = 'field';
        pushState('/',{});
        window._diqUpdateWorkspaceNavigation?.();
      }
    };
    window._diqStaffSessionChanged = user => {
      if(account?.id!==user?.id){window._diqClosePlaybookBrowser?.();playbookCatalog=null;playbookOpen=false;}
      account = user ?? null;
      if (!['coach','admin'].includes(account?.role || '')) boardLibraryOpen = false;
      if (!ready) return;

      if (!allowed(active,account)) navigate('field','replace');
      if (pendingEntry && allowed(workspaceAt(pendingEntry),account)) {
        navigate(workspaceAt(pendingEntry),'replace',pendingEntry);
      }
      if (account?.role === 'player' && new URL(window.location.href).searchParams.has('practice')) restoreLocation();
    };
    const onPop = () => { if (ready) restoreLocation(); };
    const onHeaderClick = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const boardButton = event.target.closest<HTMLElement>('#coachBoardLink');
      if (boardButton && ['coach','admin'].includes(account?.role || '')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openBoardLibrary(boardButton);
        return;
      }
      const playbook = event.target.closest('#playbookBrowserToggle');
      let teamId: string | null | undefined;
      if (active === 'training' && playbook) teamId = window._diqStaffTeamId?.();
      if (active === 'design' && event.target.closest('#playbookBrowserToggle,#randomSitBtn,#playbookToggle')) {
        if (playbook && designUrl?.searchParams.get('type') === 'team') teamId = designUrl.searchParams.get('id');
        navigate('field');
      }
      if (teamId && playbook) {
        event.stopPropagation();
        void window._diqOpenPlaybookBrowser?.(teamId);
      }
    };
    window.addEventListener('popstate',onPop);
    document.addEventListener('click',onHeaderClick,true);
    let sharedHeaderObserver:ResizeObserver|undefined;
    void loadLegacyRuntime().then(async () => {
      if (disposed) return;
      account = window.__DIQ_AUTH_USER__ ?? null;
      sharedHeaderReady=true;
      await tick();
      if(disposed)return;
      const header=document.getElementById('appHeader');
      if(header&&sharedHeaderHost){
        header.prepend(sharedHeaderHost);
        header.classList.add('has-shared-navigation');
        const menu=document.getElementById('accountMenu');
        const accountActions=sharedHeaderHost.querySelector('.account-actions');
        if(menu&&accountActions)accountActions.append(menu);
        const practice=document.getElementById('practiceToggle');
        if(practice&&accountActions)accountActions.prepend(practice);
        sharedHeaderObserver=new ResizeObserver(()=>document.documentElement.style.setProperty('--app-header-height',`${Math.ceil(header.getBoundingClientRect().height)}px`));
        sharedHeaderObserver.observe(header);
      }
      ready = true;


      restoreLocation(true);
      if (new URL(window.location.href).searchParams.get('boardLibrary') === '1') openBoardLibrary();
    }).catch(error => {
      if (disposed) return;
      runtimeError = error instanceof Error ? error.message : String(error);
      console.error(error);
    });
    return () => {
      disposed = true;
      sharedHeaderObserver?.disconnect();
      window.removeEventListener('diq:playbook-open',openPlaybook);
      window.removeEventListener('diq:playbook-update',updatePlaybook);
      window.removeEventListener('diq:playbook-close',closePlaybook);
      window.removeEventListener('popstate',onPop);
      document.removeEventListener('click',onHeaderClick,true);
      delete window._diqNavigateWorkspace;
      delete window._diqTrainingLocationChanged;
      delete window._diqPracticeLocationChanged;
      delete window._diqWorkspaceClosed;
      delete window._diqStaffSessionChanged;
      if (testing) closePlayTest();
      document.body.classList.remove('design-workspace-open');
    };
  });
</script>

<svelte:head>
  <title>{active === 'field' ? 'Diamond Defence' : `${workspaceLabels[active]} | Diamond Defence`}</title>
  <meta
    name="description"
    content="Diamond Defence is a baseball situation simulator and interactive baseball situation trainer for players and coaches."
  />
</svelte:head>

{#if runtimeError}
  <Feedback message={runtimeError} tone="error" class="runtime-error" />
{/if}

{@html markup}
{#if sharedHeaderReady}
  <div bind:this={sharedHeaderHost} class="shared-navigation-host">
    <AppNavigation user={account} {active} onboard={()=>openBoardLibrary()} onworkspace={workspace=>navigate(workspace)} onguide={()=>document.getElementById('playbookToggle')?.click()} onaccount={()=>document.getElementById('playerBtn')?.click()} />
  </div>
{/if}
{#if boardLibraryOpen}<PlayLibrary stateKey={`${account?.id}:management`} onclose={closeBoardLibrary} onaction={boardLibraryAction} onimport={importLibraryBoard} />{/if}
{#if playbookCatalog}
 {#key `${account?.id}:${playbookScope}`}
  <PlayLibrary mode="playbook" stateKey={`${account?.id}:playbook:${playbookScope}`} open={playbookOpen}
   catalog={playbookCatalog} sourceLoading={playbookLoading} sourceError={playbookError} onretry={()=>window._diqOpenPlaybookBrowser?.(playbookScope==='default'?undefined:playbookScope)} currentKey={playbookCurrentKey} allowCreate={['coach','admin'].includes(account?.role||'')}
   onclose={closeSharedPlaybook} onaction={selectPlaybookItem} />
 {/key}
{/if}
{#if active === 'design' && designUrl && account}
  <div hidden={Boolean(testing)}>
    <DesignWorkspace entryUrl={designUrl} isAdmin={account.role === 'admin'} onPlayTest={playTest}
      onField={() => navigate('field')} onLocationChange={syncDesignLocation} />
  </div>
  {#if testing}
    <div class="situation-preview-bar">
      <strong>Player preview · {testing.title}</strong>
      <button class="btn btn-ghost" onclick={closePlayTest}>Back to review</button>
    </div>
  {/if}
{/if}

<style>
  :global(.runtime-error) { margin: var(--space-4); }
</style>
