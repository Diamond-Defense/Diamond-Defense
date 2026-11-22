/** Keep the existing chooser lifecycle and rich card renderer, with modal keyboard
 * containment and focus restoration for Close, selection, and Escape alike. */
export function installPlaybookAccessibility() {
  const overlay = document.getElementById('playbookBrowserOverlay');
  if (!overlay) return () => {};
  let wasOpen = false;
  let trigger: HTMLElement | null = null;
  const inert = new Map<HTMLElement,boolean>();
  const isOpen = () => !overlay.classList.contains('hidden');
  function update() {
    const open = isOpen();
    if (open === wasOpen) return;
    wasOpen = open;
    if (open) {
      trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      for (const element of document.querySelectorAll<HTMLElement>('#appHeader,#workspaceSituationToolbar,#appWorkspace,#designWorkspace')) {
        inert.set(element,element.inert); element.inert = true;
      }
    } else {
      for (const [element, value] of inert) element.inert = value;
      inert.clear();
      if (trigger?.isConnected && !trigger.closest('[inert]')) trigger.focus();
    }
  }
  function onKey(event: KeyboardEvent) {
    if (!isOpen() || event.key !== 'Tab') return;
    const focusable = Array.from(overlay!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,a[href]'))
      .filter(element => element.getClientRects().length && !element.closest('[hidden],.hidden'));
    const first = focusable[0], last = focusable.at(-1);
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !overlay!.contains(active))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (active === last || !overlay!.contains(active))) { event.preventDefault(); first.focus(); }
  }
  const observer = new MutationObserver(update);
  observer.observe(overlay,{attributes:true,attributeFilter:['class']});
  document.addEventListener('keydown',onKey);
  return () => {
    observer.disconnect(); document.removeEventListener('keydown',onKey);
    for (const [element, value] of inert) element.inert = value;
  };
}
