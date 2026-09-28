/**
 * The one place the reduced-motion preference is read. Eleven scenes and vignettes
 * each queried `matchMedia` at construction and never again, so a player toggling the
 * setting mid-session saw nothing change until a scene restarted. This follows the
 * live value and keeps the existing classification: the action a player is asked to
 * hit always plays; only secondary motion — shake, sympathetic flex, idle sway,
 * scene travel — is removed.
 */
const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;

let reduced = query?.matches ?? false;
query?.addEventListener?.('change', event => { reduced = event.matches; });

let preview: boolean | null = null;
/** DEV panel only; no preference is saved and production ignores it. */
export function previewReducedMotion(value: boolean | null): void { if (import.meta.env.DEV) preview = value; }
export function reducedMotion(): boolean { return (import.meta.env.DEV ? preview : null) ?? reduced; }
