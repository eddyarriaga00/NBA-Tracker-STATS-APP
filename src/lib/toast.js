// Tiny global banner system: toast({ title, body, href }).
export function toast(t) {
  window.dispatchEvent(new CustomEvent('toast', { detail: { id: Math.random().toString(36).slice(2), ...t } }));
}
