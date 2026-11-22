<script lang="ts">
  let { message = '', tone = 'info', class: className = '' }: {
    message?: string;
    tone?: 'info' | 'success' | 'warning' | 'error';
    class?: string;
  } = $props();
</script>

<!-- Keep the live region mounted so async updates are announced reliably. -->
<div class="dd-feedback {className}" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}
  aria-atomic="true" data-empty={!message}>
  {message}
</div>
