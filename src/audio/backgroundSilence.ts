/** The parts of an AudioContext this needs. */
export interface SuspendableContext {
  readonly state: AudioContextState | 'interrupted';
  suspend(): Promise<void>;
  resume(): Promise<void>;
}

/** The parts of a document this needs. */
export interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange' | 'pointerdown', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'visibilitychange' | 'pointerdown', listener: () => void): void;
}

/**
 * Every sound stops while the game is off screen, and comes back where it was.
 *
 * The level, the lesson and Endless each pause themselves when the page is hidden, but the
 * title theme and the road's loop had nothing to stop them: the app went to the background
 * — Home, a call, the notification shade into another app — and the music played on behind
 * whatever the player had gone to. Suspending the one AudioContext silences all of it at
 * once and freezes its clock, so a source resumes on the sample it stopped at rather than
 * jumping ahead; the scenes' own pause handling runs exactly as before on top of it.
 *
 * Only a context this suspended is resumed. A context the platform suspended for its own
 * reasons stays the scenes' business (`AudioEngine.unlock`, `recover`). A resume the
 * platform refuses without a fresh gesture is retried on the next touch rather than left
 * silent until a level starts.
 *
 * Returns the function that stops listening.
 */
export function silenceInBackground(context: SuspendableContext, page: VisibilitySource | undefined): () => void {
  if (!page) return () => { /* no document: nothing to follow */ };
  let suspendedByUs = false;
  const retryOnTouch = (): void => { if (context.state !== 'running') void context.resume().catch(() => { /* still refused */ }); };
  const follow = (): void => {
    if (page.hidden) {
      if (context.state !== 'running') return;
      suspendedByUs = true;
      void context.suspend().catch(() => { suspendedByUs = false; });
      return;
    }
    if (!suspendedByUs) return;
    suspendedByUs = false;
    void context.resume().then(
      () => { if (context.state !== 'running') page.addEventListener('pointerdown', retryOnTouch, { once: true }); },
      () => { page.addEventListener('pointerdown', retryOnTouch, { once: true }); },
    );
  };
  page.addEventListener('visibilitychange', follow);
  return () => {
    page.removeEventListener('visibilitychange', follow);
    page.removeEventListener('pointerdown', retryOnTouch);
  };
}
