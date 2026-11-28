<script lang="ts">
  import {asset} from '$app/paths';
  import {canAccessWorkspace} from '$lib/ui/navigation';
  import {headerIcons} from '$lib/ui/navigation-icons.js';
  let {user,onboard,onnavigate=()=>{},active='board',onworkspace,onguide,onaccount}: {user:(WorkspaceAccount & {displayName?:string})|null;onboard:()=>void;onnavigate?:(event:MouseEvent)=>void;active?:string;onworkspace?:(workspace:StaffWorkspace)=>void;onguide?:()=>void;onaccount?:()=>void}=$props();
  function follow(event:MouseEvent,workspace:StaffWorkspace){if(onworkspace){event.preventDefault();onworkspace(workspace);}else onnavigate(event);}
  function utility(event:MouseEvent,action:(()=>void)|undefined){if(action){event.preventDefault();action();}else onnavigate(event);}
  const links=[{label:'Play',href:'/',icon:'play',workspace:'field'},{label:'Training',href:'/workspace/training',icon:'training',workspace:'training'},{label:'Design',href:'/workspace/design',icon:'design',workspace:'design'},{label:'Organization',href:'/workspace/org',icon:'organization',workspace:'org'}] as const;
  const initials=$derived((user?.displayName||'').split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase());
</script>
<header class="app-navigation">
  <a class="navigation-brand" href="/" data-sveltekit-reload onclick={event=>follow(event,'field')}><img src={asset('/diamond-defence-classic.png')} alt=""/><strong>Diamond Defence</strong></a>
  <nav aria-label="Application">
    {#if user&&['admin','coach'].includes(user.role)&&!user.mustChangePassword}<a href="/?boardLibrary=1" aria-current={active==='board'?'page':undefined} onclick={event=>{event.preventDefault();onboard();}}><svg viewBox="0 0 24 24" aria-hidden="true">{@html headerIcons.board}</svg>Coach Board</a>{/if}
    {#each links as link}{#if canAccessWorkspace(link.workspace,user)}<a href={link.href} data-sveltekit-reload aria-current={active===link.workspace?'page':undefined} onclick={event=>follow(event,link.workspace)}><svg viewBox="0 0 24 24" aria-hidden="true">{@html headerIcons[link.icon]}</svg>{link.label}</a>{/if}{/each}
  </nav>
  <div class="navigation-account account-actions">
    <a href="/?workspace=guide" data-sveltekit-reload onclick={event=>utility(event,onguide)}><svg viewBox="0 0 24 24" aria-hidden="true">{@html headerIcons.guide}</svg>Guide</a>
    <a id={onaccount?'sharedAccountTrigger':undefined} class="navigation-profile" href="/?workspace=account" aria-haspopup={onaccount?'menu':undefined} aria-controls={onaccount?'accountMenu':undefined} aria-expanded={onaccount?false:undefined} data-sveltekit-reload onclick={event=>utility(event,onaccount)}><span class="navigation-avatar" aria-hidden="true">{initials||'DD'}</span><span><strong>{user?.displayName||'Log in'}</strong>{#if user}<small>{user.role==='admin'?'Admin':user.role==='coach'?'Coach':'Player'}</small>{/if}</span><span aria-hidden="true">⌄</span></a>
  </div>
</header>
<style>
 .app-navigation{box-sizing:border-box;min-height:var(--workspace-header-height,64px);display:flex;align-items:center;gap:24px;padding:0 24px;background:var(--header-background);color:var(--header-text);border-bottom:1px solid var(--header-border)}
 a{display:inline-flex;align-items:center;gap:8px;min-height:44px;box-sizing:border-box;text-decoration:none;color:inherit;font-size:13px;font-weight:650;white-space:nowrap}
 a:hover{background:var(--header-control-hover)}a:focus-visible{outline:2px solid var(--header-text);outline-offset:2px}
 svg{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
 .navigation-brand{gap:12px;flex:none}.navigation-brand strong{font-size:17px}.navigation-brand img{display:block;width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff)}
 nav{display:flex;align-items:center;gap:24px;min-width:0}nav a{padding:8px 4px;font-size:14px}nav a:first-child:not(:last-child){margin-right:8px}nav a[aria-current=page]{box-shadow:inset 0 -3px var(--success)}
 .navigation-account{position:relative;margin-left:auto;display:flex;align-items:center;gap:24px}.navigation-profile{gap:10px;border:1px solid var(--border-emphasis);border-radius:10px;padding:4px 12px}.navigation-profile>span:nth-child(2){display:flex;flex-direction:column}.navigation-profile small{font-size:11px}
 .navigation-avatar{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--surface);color:var(--accent-text)}
 @media(max-width:1200px){.app-navigation{gap:12px;padding:0 12px}nav{gap:8px}nav a{font-size:13px;padding:8px 2px}nav a:first-child:not(:last-child){margin-right:4px}.navigation-brand strong{font-size:14px}.navigation-brand img{width:44px;height:44px}.navigation-account{gap:12px}}
 @media(max-width:950px){.navigation-brand strong{display:none}.navigation-profile>span:nth-child(2){display:none}.app-navigation{gap:10px}.navigation-account{gap:8px}}
 @media(max-width:700px){.app-navigation{flex-wrap:wrap;gap:4px 12px;padding:6px 12px}nav{order:3;width:100%;overflow-x:auto}.navigation-brand strong{display:block}.navigation-account{margin-left:auto}}
</style>
