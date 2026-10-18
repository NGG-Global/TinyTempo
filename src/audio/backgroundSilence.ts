/** The parts of an AudioContext this needs. */
export interface SuspendableContext {
  readonly state: AudioContextState | 'interrupted';
  suspend(): Promise<void>;
  resume(): Promise<void>;
  addEventListener?(type: 'statechange', listener: () => void): void;
  removeEventListener?(type: 'statechange', listener: () => void): void;
}

/** The parts of a document this needs. */
export interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange' | 'pointerdown', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'visibilitychange' | 'pointerdown', listener: () => void): void;
}

/** What the engine and the scenes can ask of the silence, and what feeds it. */
export interface BackgroundSilence {
  /**
   * True while the game is off screen by either account: the page says it is hidden, or
   * the app's own activity is paused. A scene that finds the context suspended reads this
   * to tell the silence from a route that dropped the context on its own.
   */
  readonly hidden: boolean;
  /**
   * The activity's own word (`audio/appLifecycle.ts`). An Android WebView under Capacitor
   * is never paused with its activity, so `document.hidden` stays false behind Home, a
   * call and a full-screen ad, and the page alone would never know the game had gone.
   */
  setAppActive(active: boolean): void;
  /** Stops following the page, the activity and the context. */
  release(): void;
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
 * Two signals say the game is off screen, and either is enough: the page's visibility,
 * which is all a browser has, and the activity's pause and resume, which is what Android
 * actually reports — Capacitor leaves the WebView running through `onPause`, so the page
 * went on believing it was visible behind the launcher and behind every rewarded ad, and
 * played on. **While it is off screen the context stays suspended**: a scene that answers a
 * `statechange` by resuming (the level's `recover`) used to win that race on the very event
 * this suspend fired, so a context that comes back to `running` while hidden is put back.
 *
 * Only a context this suspended is resumed. A context the platform suspended for its own
 * reasons stays the scenes' business (`AudioEngine.unlock`, `recover`). A resume the
 * platform refuses without a fresh gesture is retried on the next touch rather than left
 * silent until a level starts.
 */
export function silenceInBackground(context: SuspendableContext, page: VisibilitySource | undefined): BackgroundSilence {
  let appActive = true;
  let suspendedByUs = false;
  let released = false;
  const hidden = (): boolean => (page?.hidden ?? false) || !appActive;
  const retryOnTouch = (): void => {
    if (hidden() || context.state === 'running') return;
    void context.resume().catch(() => { /* still refused */ });
  };
  const follow = (): void => {
    if (released) return;
    if (hidden()) {
      if (context.state !== 'running') return;
      suspendedByUs = true;
      void context.suspend().catch(() => { suspendedByUs = false; });
      return;
    }
    if (!suspendedByUs) return;
    suspendedByUs = false;
    void context.resume().then(
      () => { if (context.state !== 'running') page?.addEventListener('pointerdown', retryOnTouch, { once: true }); },
      () => { page?.addEventListener('pointerdown', retryOnTouch, { once: true }); },
    );
  };
  // Resumed by someone else while off screen: the same `follow` suspends it again.
  const holdWhileHidden = (): void => { if (hidden() && context.state === 'running') follow(); };
  page?.addEventListener('visibilitychange', follow);
  context.addEventListener?.('statechange', holdWhileHidden);
  return {
    get hidden() { return hidden(); },
    setAppActive(active) {
      if (active === appActive) return;
      appActive = active;
      follow();
    },
    release() {
      released = true;
      page?.removeEventListener('visibilitychange', follow);
      page?.removeEventListener('pointerdown', retryOnTouch);
      context.removeEventListener?.('statechange', holdWhileHidden);
    },
  };
}
