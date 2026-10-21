import { Capacitor } from '@capacitor/core';
import { breadcrumb } from '@/core/errors';
import { storedStamps } from '@/game/objectives';
import { track } from '@/monetization';
import {
  loadReminderSettings, reminderNotices, reminderState, saveReminderSettings, type NotifyPermission, type ReminderState,
} from './reminder';

/**
 * The daily reminder wired to the device: when to ask, and when to schedule again.
 *
 * **Native only.** A browser cannot hold a notification for a closed tab, so `available` is
 * false there and nothing below runs: no plugin is downloaded, no switch is shown.
 *
 * **Rescheduled whenever the game is opened, sent to the background, or a day's objectives
 * are stamped** — not by a repeating alarm. Each sync cancels the feature's own ids and
 * schedules the next `REMINDER.ahead` evenings from now, skipping today if its objectives are
 * done. A player who stops opening the game receives those three and then nothing, and one
 * who finished today's objectives is not told to do them.
 *
 * Every call resolves: a reminder is never worth an error in front of the player.
 */
export function remindersAvailable(): boolean {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

async function native(): Promise<typeof import('./native') | null> {
  if (!remindersAvailable()) return null;
  try { return await import('./native'); } catch { return null; }
}

let pending: Promise<void> = Promise.resolve();

/** Bring the scheduled reminders in line with the setting, the permission and today's stamp. Serialized. */
export function syncReminders(now: () => number = Date.now): Promise<void> {
  pending = pending.then(async () => {
    const plugin = await native();
    if (plugin === null) return;
    const settings = loadReminderSettings();
    if (!settings.enabled) { await plugin.cancelReminders(); return; }
    // Never schedule without the permission: the plugin would raise Android's prompt itself.
    if (await plugin.notifyPermission() !== 'granted') { await plugin.cancelReminders(); return; }
    const at = now();
    await plugin.scheduleReminders(reminderNotices(at, storedStamps(at).todayDone));
  }).catch(() => { /* the next sync tries again */ });
  return pending;
}

/** What Settings shows: off, on, or on but refused by Android. */
export async function currentReminderState(): Promise<ReminderState> {
  const plugin = await native();
  const permission: NotifyPermission = plugin === null ? 'denied' : await plugin.notifyPermission();
  return reminderState(loadReminderSettings(), permission);
}

/**
 * The player asked for the reminder — the offer's Remind me, or Settings' switch. Android's
 * prompt appears here and only here, from that tap. The setting is stored on either answer,
 * so a refusal shows in Settings as *blocked*, with the way to fix it, rather than as a switch
 * that will not stay on.
 */
export async function turnRemindersOn(source: 'offer' | 'settings'): Promise<ReminderState> {
  const plugin = await native();
  if (plugin === null) return 'off';
  saveReminderSettings({ enabled: true });
  let permission = await plugin.notifyPermission();
  if (permission !== 'granted') permission = await plugin.requestNotifyPermission();
  track('reminder_permission', { source, result: permission === 'granted' ? 'granted' : 'denied' });
  await syncReminders();
  return reminderState({ enabled: true }, permission);
}

/** The player turned it off: the setting, and every scheduled reminder, at once. */
export async function turnRemindersOff(): Promise<void> {
  saveReminderSettings({ enabled: false });
  track('reminder_disabled', { source: 'settings' });
  await syncReminders();
}

/**
 * Native-only: sync now, and again whenever the app goes to the background or comes back,
 * which is when a day can turn over or a stamp can have been earned elsewhere.
 */
export async function bootReminders(): Promise<void> {
  try {
    if (!remindersAvailable()) return;
    const { App } = await import('@capacitor/app');
    await App.addListener('appStateChange', () => { void syncReminders(); });
    await syncReminders();
    breadcrumb('reminders', { enabled: loadReminderSettings().enabled });
  } catch {
    // No lifecycle plugin: the next level's stamp or the next launch syncs instead.
  }
}
