import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

async function feedbackUrl(raw: string | undefined): Promise<string | null> {
  vi.resetModules();
  if (raw !== undefined) vi.stubEnv('VITE_FEEDBACK_URL', raw);
  const { SUPPORT } = await import('../src/config/support');
  return SUPPORT.feedbackUrl;
}

describe('where feedback goes', () => {
  it('takes a form address a build names, and only an https one', async () => {
    expect(await feedbackUrl('https://forms.gle/abc123')).toBe('https://forms.gle/abc123');
    expect(await feedbackUrl('  https://docs.google.com/forms/d/x/viewform  ')).toBe('https://docs.google.com/forms/d/x/viewform');
    for (const bad of ['http://forms.gle/abc', 'javascript:alert(1)', 'forms.gle/abc', '']) expect(await feedbackUrl(bad)).toBeNull();
  });

  it('falls back to a mail with the build in its subject when there is no form', async () => {
    const { SUPPORT } = await import('../src/config/support');
    expect(SUPPORT.feedbackSubject('0.1.17')).toBe('Tiny Tempo 0.1.17 — feedback');
    const settings = readFileSync('src/scenes/SettingsScene.ts', 'utf8');
    expect(settings).toContain("case 'feedback': sendFeedback(); return;");
    expect(settings).toContain("feedback: rowTitle('Feedback'),");
  });
});
