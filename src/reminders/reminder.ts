/**
 * The daily reminder, as pure rules: when it fires, what it says, and whether this device
 * wants it. No native code and no Phaser, so all of it is tested under node; `native.ts`
 * hands the result to the notification plugin and `sync.ts` decides when to.
 *
 * **One reminder an evening, about the day's objectives, and only while they are open.** It
 * fires at `REMINDER.hour` local time on a day whose three objectives are not yet stamped
 * (`game/objectives.ts`); finishing them cancels that day's. At most `REMINDER.ahead` are ever
 * scheduled, counted from the last time the game was open, so a player who stops playing gets
 * three and then silence rather than a nightly nag. Nothing is sent from a server: these are
 * local notifications, scheduled on the device, carrying nothing about the player.
 *
 * The copy never mentions a streak or a loss, because there is none: a missed day costs
 * nothing (`docs/OBJECTIVES.md`).
 */
export const REMINDER = Object.freeze({
  /** Local hour and minute the reminder fires at. */
  hour: 18,
  minute: 0,
  /** Most reminders scheduled ahead of the last time the game was open. */
  ahead: 3,
  /** The notification ids this feature owns, one per scheduled day. Nothing else uses them. */
  ids: Object.freeze([7101, 7102, 7103]),
  /** The Android notification channel, as the player sees it in the system's settings. */
  channel: Object.freeze({ id: 'daily-reminder', name: 'Daily reminder', description: "A reminder in the evening when today's objectives are still open." }),
  /** The status-bar icon, a white glyph on transparency (`res/drawable`). */
  smallIcon: 'ic_stat_tiny_tempo',
  iconColor: '#CF5134',
});

export const REMINDER_KEY = 'tiny-tempo.reminders.v1';

/** What is stored: whether the player turned the reminder on. Off until they do. */
export interface ReminderSettings {
  readonly enabled: boolean;
}

export interface ReminderNotice {
  readonly id: number;
  /** Epoch milliseconds. */
  readonly at: number;
  readonly title: string;
  readonly body: string;
}

/** A few lines, rotated by day, so the same words do not arrive every evening. */
export const REMINDER_LINES: readonly { readonly title: string; readonly body: string }[] = Object.freeze([
  { title: "Today's objectives are waiting", body: 'Three short goals, and a stamp for finishing them.' },
  { title: 'Time for a few beats', body: "Your three objectives for today are still open." },
  { title: "Today's stamp is still yours to earn", body: 'Finish the three daily objectives to collect it.' },
]);

/**
 * When the next reminders fire, as epoch milliseconds: today's evening if today's objectives
 * are still open and the evening has not passed, then the evenings after it, `REMINDER.ahead`
 * in all. Built from local calendar fields, so a change to or from summer time still lands at
 * six on the clock.
 */
export function reminderTimes(now: number, todayDone: boolean): readonly number[] {
  const today = new Date(now);
  const out: number[] = [];
  for (let day = 0; out.length < REMINDER.ahead && day <= REMINDER.ahead; day++) {
    const at = new Date(today.getFullYear(), today.getMonth(), today.getDate() + day, REMINDER.hour, REMINDER.minute, 0, 0).getTime();
    if (day === 0 && (todayDone || at <= now)) continue;
    out.push(at);
  }
  return out;
}

/** The words for a reminder at `at`: chosen by its local date, the same on every sync. */
export function reminderLine(at: number): { readonly title: string; readonly body: string } {
  const date = new Date(at);
  const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return REMINDER_LINES[((dayNumber % REMINDER_LINES.length) + REMINDER_LINES.length) % REMINDER_LINES.length]!;
}

/** The notices to schedule now: one per reminder time, on the feature's own ids. */
export function reminderNotices(now: number, todayDone: boolean): readonly ReminderNotice[] {
  return reminderTimes(now, todayDone).map((at, i) => ({ id: REMINDER.ids[i]!, at, ...reminderLine(at) }));
}

/** A stored setting, or the default (off) for nothing, damage or a value no build wrote. */
export function parseReminderSettings(raw: string | null): ReminderSettings {
  if (!raw) return { enabled: false };
  try {
    const data: unknown = JSON.parse(raw);
    const enabled = typeof data === 'object' && data !== null ? (data as { enabled?: unknown }).enabled : undefined;
    return { enabled: enabled === true };
  } catch {
    return { enabled: false };
  }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function loadReminderSettings(storage: Storage | null = safeStorage()): ReminderSettings {
  try { return parseReminderSettings(storage?.getItem(REMINDER_KEY) ?? null); } catch { return { enabled: false }; }
}

/** False means nothing was written. */
export function saveReminderSettings(settings: ReminderSettings, storage: Storage | null = safeStorage()): boolean {
  try {
    storage?.setItem(REMINDER_KEY, JSON.stringify({ version: 1, enabled: settings.enabled }));
    return storage !== null;
  } catch {
    return false;
  }
}

/** What Android says about showing notifications, in the three answers the game acts on. */
export type NotifyPermission = 'granted' | 'denied' | 'prompt';

/**
 * What Settings' switch shows and says. `blocked` is a player who turned the reminder on
 * while Android refuses notifications for the game — denied twice, or switched off in the
 * system's settings — which only the system's settings can undo.
 */
export type ReminderState = 'off' | 'on' | 'blocked';

export function reminderState(settings: ReminderSettings, permission: NotifyPermission): ReminderState {
  if (!settings.enabled) return 'off';
  return permission === 'granted' ? 'on' : 'blocked';
}

/**
 * Whether the one-time offer may open: a native build, a first day of objectives stamped,
 * the offer never closed before (the `hintReminder` teach flag, through the screen hint), and
 * the reminder not already on from Settings.
 */
export function offerWanted(facts: {
  readonly available: boolean; readonly stamps: number; readonly offered: boolean; readonly enabled: boolean;
}): boolean {
  return facts.available && facts.stamps >= 1 && !facts.offered && !facts.enabled;
}
