import type { LocalNotificationsPlugin } from '@capacitor/local-notifications';
import { REMINDER, type NotifyPermission, type ReminderNotice } from './reminder';

/**
 * The local-notifications plugin, behind three calls that always resolve. Loaded only on a
 * native build (`sync.ts` gates it), so a browser downloads none of it.
 *
 * Two of the plugin's defaults are wrong for a reminder, and both are overridden here:
 *
 * - **Exact alarms.** `isExactNotification` defaults to true, and on Android 12 and up that
 *   opens the system's "Alarms & reminders" screen on `schedule()` to ask for a permission a
 *   six o'clock nudge does not need. Every reminder is scheduled inexact, and the manifest
 *   removes `SCHEDULE_EXACT_ALARM`, so neither the screen nor the permission ever appears.
 * - **Asking on schedule.** Since 8.3.0 `schedule()` requests the notification permission
 *   itself when it has not been granted. The game asks only when the player chooses to turn
 *   the reminder on, so `schedule` is called only after `checkPermissions` says granted.
 */
let plugin: Promise<LocalNotificationsPlugin | null> | null = null;
let channelMade = false;

function load(): Promise<LocalNotificationsPlugin | null> {
  plugin ??= import('@capacitor/local-notifications').then(module => module.LocalNotifications).catch(() => null);
  return plugin;
}

/** `prompt-with-rationale` is still a question Android will put to the player: a prompt. */
function asPermission(state: unknown): NotifyPermission {
  return state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';
}

export async function notifyPermission(): Promise<NotifyPermission> {
  try {
    const notifications = await load();
    return notifications === null ? 'denied' : asPermission((await notifications.checkPermissions()).display);
  } catch {
    return 'denied';
  }
}

/** Android's own prompt, where it will still show one. Never called but by the player's tap. */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  try {
    const notifications = await load();
    return notifications === null ? 'denied' : asPermission((await notifications.requestPermissions()).display);
  } catch {
    return 'denied';
  }
}

/** Cancel every reminder this feature owns, scheduled or not. */
export async function cancelReminders(): Promise<void> {
  try {
    const notifications = await load();
    await notifications?.cancel({ notifications: REMINDER.ids.map(id => ({ id })) });
  } catch {
    // Nothing scheduled, or no plugin: nothing to cancel.
  }
}

/**
 * Replace the scheduled reminders with these. Only call with the permission granted: the
 * plugin would otherwise put Android's prompt in front of a player who did not ask for it.
 * False when the plugin refused.
 */
export async function scheduleReminders(notices: readonly ReminderNotice[]): Promise<boolean> {
  try {
    const notifications = await load();
    if (notifications === null) return false;
    await notifications.cancel({ notifications: REMINDER.ids.map(id => ({ id })) });
    if (notices.length === 0) return true;
    if (!channelMade) {
      // Importance 3 is Android's default: a sound and the shade, never a heads-up banner.
      await notifications.createChannel({ id: REMINDER.channel.id, name: REMINDER.channel.name, description: REMINDER.channel.description, importance: 3 });
      channelMade = true;
    }
    await notifications.schedule({
      notifications: notices.map(notice => ({
        id: notice.id,
        title: notice.title,
        body: notice.body,
        schedule: { at: new Date(notice.at), allowWhileIdle: false },
        channelId: REMINDER.channel.id,
        smallIcon: REMINDER.smallIcon,
        iconColor: REMINDER.iconColor,
        autoCancel: true,
        isExactNotification: false,
      })),
    });
    return true;
  } catch {
    return false;
  }
}
