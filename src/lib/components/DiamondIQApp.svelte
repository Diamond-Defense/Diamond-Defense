<script lang="ts">
  import { onMount } from 'svelte';
  import { pushState, replaceState } from '$app/navigation';
  import type { Situation } from '$lib/domain/models';
  import DesignWorkspace from '../../routes/design/DesignWorkspace.svelte';
  import brandLogo from '$lib/assets/diamond-defence-classic.png';
  import softFieldImage from '$lib/assets/diamond-defense-soft-field.png';
  import legacyDocument from '../../../index.html?raw';
  import { loadLegacyRuntime } from '$lib/legacy/loadRuntime';

  const body = legacyDocument.match(/<body>([\s\S]*)<\/body>/i)?.[1] ?? '';
  const markup = body.replaceAll('data-diamond-defense-logo', `data-diamond-defense-logo src="${brandLogo}"`).replace(
    'id="fieldImg"',
    `id="fieldImg" src="${softFieldImage}"`,
  );

  let runtimeError = $state('');
  let active = $state<StaffWorkspace>('field');
  let account = $state<WorkspaceAccount | null>(null);
  let designUrl = $state<URL | null>(null);
  let pendingEntry: URL | null = null;
  let switching = 0;

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

  function allowed(workspace: StaffWorkspace, user: WorkspaceAccount | null) {
    if (workspace === 'field') return true;
    if (!user || user.mustChangePassword || user.role === 'player') return false;
    if (workspace === 'org') return user.role === 'admin' || Boolean(user.directorScopes?.length);
    if (workspace === 'training') return user.role === 'admin' ||
      Boolean(user.directorScopes?.length || user.coachedTeamIds?.length || user.teamId);
    return true;
  }

  function workspaceUrl(workspace: StaffWorkspace, entry?: URL) {
    const url = new URL(workspace === 'field' ? '/' : '/workspace/' + workspace, window.location.origin);
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
    if (workspace === active && (!entry || workspace !== 'design' || designUrl?.href === url.href)) return;
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
    navigate(workspace,initial ? 'replace' : 'pop',entry);
  }

  onMount(() => {
    let disposed = false;
    let ready = false;
    window._diqNavigateWorkspace = workspace => navigate(workspace);
    window._diqWorkspaceClosed = workspace => {
      if (active === workspace) {
        ++switching;
        active = 'field';
        pushState('/',{});
        window._diqUpdateWorkspaceNavigation?.();
      }
    };
    window._diqStaffSessionChanged = user => {
      account = user ?? null;
      if (!ready) return;
      if (!allowed(active,account)) navigate('field','replace');
      if (pendingEntry && allowed(workspaceAt(pendingEntry),account)) {
        navigate(workspaceAt(pendingEntry),'replace',pendingEntry);
      }
    };
    const onPop = () => { if (ready) restoreLocation(); };
    const onHeaderClick = (event: Event) => {
      if (!(event.target instanceof Element)) return;
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
    void loadLegacyRuntime().then(() => {
      if (disposed) return;
      account = window.__DIQ_AUTH_USER__ ?? null;
      ready = true;
      restoreLocation(true);
    }).catch(error => {
      if (disposed) return;
      runtimeError = error instanceof Error ? error.message : String(error);
      console.error(error);
    });
    return () => {
      disposed = true;
      window.removeEventListener('popstate',onPop);
      document.removeEventListener('click',onHeaderClick,true);
      delete window._diqNavigateWorkspace;
      delete window._diqWorkspaceClosed;
      delete window._diqStaffSessionChanged;
      if (testing) closePlayTest();
      document.body.classList.remove('design-workspace-open');
    };
  });
</script>

<svelte:head>
  <title>{active === 'field' ? 'Diamond Defence' : `${{org:'Org',training:'Training',design:'Design'}[active]} workspace | Diamond Defence`}</title>
  <meta
    name="description"
    content="Diamond Defence is a baseball situation simulator and interactive playbook trainer for players and coaches."
  />
</svelte:head>

{#if runtimeError}
  <div class="runtime-error" role="alert">{runtimeError}</div>
{/if}

{@html markup}
{#if active === 'design' && designUrl && account}
  <div hidden={Boolean(testing)}>
    <DesignWorkspace entryUrl={designUrl} isAdmin={account.role === 'admin'} onPlayTest={playTest}
      onField={() => navigate('field')} onLocationChange={syncDesignLocation} />
  </div>
  {#if testing}
    <div class="situation-preview-bar">
      <strong>Play-test · {testing.title}</strong>
      <button class="btn btn-ghost" onclick={closePlayTest}>Back to review</button>
    </div>
  {/if}
{/if}

<style>
  .runtime-error {
    margin: 1rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--error);
    border-radius: 0.5rem;
    background: var(--error-muted);
    color: var(--error);
    font-weight: 700;
  }
</style>
