import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  REMINDER, REMINDER_KEY, REMINDER_LINES, loadReminderSettings, offerWanted, parseReminderSettings, reminderLine, reminderNotices,
  reminderState, reminderTimes, saveReminderSettings,
} from '../src/reminders/reminder';
import { SCREEN_HINTS } from '../src/game/screenHints';

vi.mock('phaser', () => ({ default: {} }));

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute, 0, 0).getTime();
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function memory(initial: Record<string, string> = {}): Storage & { readonly data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    get length() { return Object.keys(data).length; },
    clear: () => { for (const key of Object.keys(data)) delete data[key]; },
    getItem: key => data[key] ?? null,
    key: i => Object.keys(data)[i] ?? null,
    removeItem: key => { delete data[key]; },
    setItem: (key, value) => { data[key] = String(value); },
  };
}

describe('when the reminder fires', () => {
  it('fires this evening while today\'s objectives are open, then the next two evenings, and no more', () => {
    expect(reminderTimes(at(21, 9), false)).toEqual([at(21, 18), at(22, 18), at(23, 18)]);
  });

  it('skips today once its objectives are stamped, or once the evening has passed', () => {
    expect(reminderTimes(at(21, 9), true)).toEqual([at(22, 18), at(23, 18), at(24, 18)]);
    expect(reminderTimes(at(21, 18, 30), false)).toEqual([at(22, 18), at(23, 18), at(24, 18)]);
    expect(reminderTimes(at(21, 18), false)[0]).toBe(at(22, 18));
  });

  it('is always six on the local clock, on the feature\'s own ids, never more than three ahead', () => {
    for (const now of [at(1, 0), at(15, 12), at(31, 23, 59)]) {
      for (const done of [false, true]) {
        const notices = reminderNotices(now, done);
        expect(notices).toHaveLength(REMINDER.ahead);
        expect(notices.map(n => n.id)).toEqual([...REMINDER.ids]);
        for (const notice of notices) {
          const date = new Date(notice.at);
          expect([date.getHours(), date.getMinutes()]).toEqual([REMINDER.hour, REMINDER.minute]);
          expect(notice.at).toBeGreaterThan(now);
        }
      }
    }
  });

  it('says the same words for the same evening, rotates them across days, and never mentions a streak', () => {
    expect(reminderLine(at(21, 18))).toEqual(reminderLine(at(21, 18)));
    const three = [21, 22, 23].map(day => reminderLine(at(day, 18)).title);
    expect(new Set(three).size).toBe(REMINDER_LINES.length);
    for (const line of REMINDER_LINES) {
      expect(`${line.title} ${line.body}`).not.toMatch(/streak|lose|lost|miss|don't break|hurry/i);
      expect(line.title.length).toBeLessThanOrEqual(40);
    }
  });
});

describe('the reminder setting', () => {
  it('is off until the player turns it on, and reads damage as off', () => {
    expect(parseReminderSettings(null)).toEqual({ enabled: false });
    for (const raw of ['', 'not json', '[]', 'null', '{"enabled":"true"}', '{"enabled":1}']) expect(parseReminderSettings(raw)).toEqual({ enabled: false });
    const storage = memory();
    expect(saveReminderSettings({ enabled: true }, storage)).toBe(true);
    expect(JSON.parse(storage.data[REMINDER_KEY]!)).toMatchObject({ enabled: true });
    expect(loadReminderSettings(storage)).toEqual({ enabled: true });
    expect(saveReminderSettings({ enabled: true }, null)).toBe(false);
  });

  it('shows on, off, or on but refused by Android', () => {
    expect(reminderState({ enabled: false }, 'granted')).toBe('off');
    expect(reminderState({ enabled: true }, 'granted')).toBe('on');
    expect(reminderState({ enabled: true }, 'denied')).toBe('blocked');
    expect(reminderState({ enabled: true }, 'prompt')).toBe('blocked');
  });

  it('offers itself once, on a device that can notify, after the first day\'s stamp', () => {
    const facts = { available: true, stamps: 1, offered: false, enabled: false };
    expect(offerWanted(facts)).toBe(true);
    expect(offerWanted({ ...facts, stamps: 0 })).toBe(false);
    expect(offerWanted({ ...facts, available: false })).toBe(false);
    expect(offerWanted({ ...facts, offered: true })).toBe(false);
    expect(offerWanted({ ...facts, enabled: true })).toBe(false);
  });

  it('asks a question with two answers, and a tap outside answers neither', () => {
    expect(SCREEN_HINTS.reminder).toMatchObject({ action: 'Remind me', secondary: 'Not now', outsideCloses: false });
    expect(SCREEN_HINTS.reminder.lines.join(' ')).toContain('6 pm');
  });
});

describe('the device side', () => {
  it('never schedules an exact alarm, and never schedules without the permission', () => {
    const native = read('src/reminders/native.ts');
    expect(native).toContain('isExactNotification: false');
    expect(native).not.toMatch(/isExactNotification:\s*true|isExactMandatory:\s*true/);
    const sync = read('src/reminders/sync.ts');
    const body = sync.slice(sync.indexOf('export function syncReminders('), sync.indexOf('export async function currentReminderState('));
    expect(body.indexOf("notifyPermission() !== 'granted'")).toBeGreaterThan(0);
    expect(body.indexOf("notifyPermission() !== 'granted'")).toBeLessThan(body.indexOf('scheduleReminders('));
    // Android's prompt is raised from the player's tap only.
    expect(sync.match(/requestNotifyPermission\(/g)).toHaveLength(1);
    expect(sync.slice(sync.indexOf('export async function turnRemindersOn('))).toContain('requestNotifyPermission(');
    expect(body).not.toContain('requestNotifyPermission');
  });

  it('removes the exact-alarm permission, ships its own status icon and is in the Gradle build', () => {
    expect(read('android/app/src/main/AndroidManifest.xml')).toMatch(/SCHEDULE_EXACT_ALARM"\s+tools:node="remove"/);
    expect(read(`android/app/src/main/res/drawable/${REMINDER.smallIcon}.xml`)).toContain('<vector');
    expect(read('android/capacitor.settings.gradle')).toContain(':capacitor-local-notifications');
    expect(read('capacitor.config.ts')).toContain(`smallIcon: '${REMINDER.smallIcon}'`);
  });

  it('cancels this evening\'s reminder when a level stamps the day', () => {
    const scene = read('src/scenes/PlayScene.ts');
    expect(scene).toContain('if (objectives?.allCompleted) void syncReminders();');
  });
});
