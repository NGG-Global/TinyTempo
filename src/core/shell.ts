/**
 * Controls the DOM overlays declared in `index.html`.
 *
 * These live outside the canvas on purpose. The boot panel has to be visible
 * before the bundle has parsed, and the orientation prompt has to work even if
 * the renderer failed to start — neither can be a Phaser scene.
 */

const BOOT_OVERLAY_ID = 'boot-overlay';
const BOOT_ERROR_ID = 'boot-error';
const BOOT_CONTACT_ID = 'boot-contact';
const ORIENTATION_OVERLAY_ID = 'orientation-overlay';
const GAME_ROOT_ID = 'game-root';

function element(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** The element Phaser mounts its canvas into. */
export function getGameRootId(): string {
  return GAME_ROOT_ID;
}

/** Hides the boot panel. Call once the first scene is actually rendering. */
export function hideBootOverlay(): void {
  element(BOOT_OVERLAY_ID)?.setAttribute('hidden', '');
}

/**
 * Leaves the boot panel up and replaces the spinner with an error message.
 *
 * Used when the game cannot start at all — most often a WebGL context that the
 * device refused to create. A visible reason beats an indefinite spinner.
 */
export function showBootError(message: string, address = ''): void {
  const overlay = element(BOOT_OVERLAY_ID);
  const target = element(BOOT_ERROR_ID);

  if (overlay === null || target === null) {
    return;
  }

  overlay.removeAttribute('hidden');
  overlay.querySelector('.spinner')?.remove();

  const title = overlay.querySelector('.overlay__title');
  if (title !== null) {
    title.textContent = 'Unable to start';
    title.removeAttribute('hidden');
  }

  target.textContent = message;
  target.removeAttribute('hidden');

  /*
   * The address, here and nowhere else reachable. This player cannot open Settings, so
   * the in-app support screen does not exist for them — and a boot failure is the single
   * report most worth receiving, because it is the one the player cannot work around and
   * the one no amount of crash reporting explains on its own.
   *
   * Built from a parameter rather than imported: `core/shell.ts` is reached from the
   * catch block in `main.ts` on a device broken enough that an extra module might be why.
   */
  const contact = element(BOOT_CONTACT_ID);
  if (contact === null || address === '') return;
  contact.textContent = `Please tell us: ${address}`;
  contact.removeAttribute('hidden');
}

/** Shows or hides the "rotate your device" prompt. */
export function setOrientationPromptVisible(visible: boolean): void {
  const overlay = element(ORIENTATION_OVERLAY_ID);

  if (overlay === null) {
    return;
  }

  if (visible) {
    overlay.removeAttribute('hidden');
  } else {
    overlay.setAttribute('hidden', '');
  }
}

/**
 * Whether the primary pointer is coarse — a finger or stylus rather than a
 * mouse.
 *
 * This gates the orientation prompt. A landscape *desktop* window is a normal
 * development setup and must not be nagged; a landscape *handset* is holding
 * a portrait-designed game sideways and should be.
 */
export function isTouchPrimary(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Whether the display is large enough that Android stops honouring the portrait lock.
 *
 * For an app targeting API 36, Android ignores an activity's `screenOrientation` on any
 * display whose smallest side is 600dp or more, so a tablet can be held in landscape and
 * the app has no say in it. 600 CSS pixels is the same measurement from this side of the
 * WebView: both take the *shorter* edge, and a CSS pixel is the dp Android is counting.
 *
 * Game units are not this. The scaling model makes them a function of the design box and
 * the aspect ratio, so `viewport` cannot answer a question about the physical device.
 */
const TABLET_MIN_SIDE_PX = 600;

export function isTabletSized(): boolean {
  return Math.min(window.innerWidth, window.innerHeight) >= TABLET_MIN_SIDE_PX;
}

/**
 * Whether the game should be asking to be turned back to portrait.
 *
 * The one place that is decided, because three scenes act on it: Boot raises the prompt,
 * and Play and Tutorial hold the level behind the same question. A tablet fails it. Since
 * Android stopped honouring the lock on a large display, landscape there is a position the
 * player chose and the platform allows — so the prompt would be asking for something they
 * cannot do, and the two `blocked()` checks would stop the game outright rather than let
 * it run wide. Phones are unaffected: the platform still enforces portrait below 600dp, so
 * this never fires on a handset in a native build.
 */
export function wrongOrientation(isLandscape: boolean): boolean {
  return isLandscape && isTouchPrimary() && !isTabletSized();
}

const CODE_OVERLAY_ID = 'code-overlay';
const CODE_INPUT_ID = 'code-input';
const CODE_CONFIRM_ID = 'code-confirm';
const CODE_CANCEL_ID = 'code-cancel';

/**
 * Asks for a save code and resolves with what was typed, or null if it was dismissed.
 *
 * This is the one place the game takes typed text, and the one reason it is DOM. An
 * `<input>` is what opens the system keyboard in an Android WebView, and it brings the
 * platform's own paste, selection and cursor behaviour with it — a keypad drawn on the
 * canvas would reimplement all of that and lose paste, which is how a code actually
 * arrives. The overlay covers the canvas while it is up, so the scene underneath cannot
 * be tapped through it.
 *
 * Resolves with null rather than rejecting when the markup is missing, so a caller never
 * has to guard against the shell having changed under it.
 */
export function askForSaveCode(): Promise<string | null> {
  const overlay = element(CODE_OVERLAY_ID);
  const input = element(CODE_INPUT_ID);
  const confirm = element(CODE_CONFIRM_ID);
  const cancel = element(CODE_CANCEL_ID);
  if (overlay === null || !(input instanceof HTMLInputElement) || confirm === null || cancel === null) {
    return Promise.resolve(null);
  }

  return new Promise<string | null>(resolve => {
    let done = false;
    const finish = (value: string | null): void => {
      if (done) return;
      done = true;
      confirm.removeEventListener('click', onConfirm);
      cancel.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      input.blur();
      input.value = '';
      overlay.setAttribute('hidden', '');
      resolve(value);
    };
    const onConfirm = (): void => { finish(input.value.trim() === '' ? null : input.value); };
    const onCancel = (): void => { finish(null); };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Enter') { event.preventDefault(); onConfirm(); }
      else if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
    };

    confirm.addEventListener('click', onConfirm);
    cancel.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
    input.value = '';
    overlay.removeAttribute('hidden');
    // Synchronous, because Android only opens the keyboard for a focus that is still
    // inside the task the player's tap started. Deferring this to a frame loses it.
    try { input.focus(); } catch { /* a field that will not take focus can still be typed into */ }
  });
}
