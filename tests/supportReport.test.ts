import { describe, expect, it } from 'vitest';
import {
  DEVICE_LIMIT, REPORT_LIMIT, describeDevice, supportMailto, supportReport, type SupportFacts,
} from '../src/game/supportReport';

const facts = (over: Partial<SupportFacts> = {}): SupportFacts => ({
  version: '0.1.0',
  packageId: 'com.tinytempo.app',
  platform: 'Android app',
  device: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
  level: 23,
  area: 'Sand',
  cleared: 22,
  audio: 'output clock · device reports 42 ms · offset 0 ms',
  premium: false,
  hearts: '5/5',
  crashReports: true,
  usageData: false,
  saveCode: '04BG1-NQZ0S-E4WS0',
  ...over,
});

describe('the block a player sends', () => {
  it('answers the questions a reply would otherwise have to ask', () => {
    const report = supportReport(facts());
    for (const expected of [
      'App: 0.1.0 (com.tinytempo.app)',
      'Progress: level 23 (Sand), 22 cleared',
      'Audio: output clock · device reports 42 ms · offset 0 ms',
      'Premium: no',
      'Hearts: 5/5',
      'Reporting: crash reports on, usage data off',
      'Save code: 04BG1-NQZ0S-E4WS0',
    ]) {
      expect(report).toContain(expected);
    }
  });

  it('says so plainly when there is no device string, rather than leaving a gap', () => {
    // An empty field reads as a bug in the report; "not reported" reads as a fact.
    expect(supportReport(facts({ device: '', platform: 'Browser' })))
      .toContain('Running on: Browser — not reported');
  });

  it('reduces a user-agent to the part anyone reads', () => {
    expect(supportReport(facts())).toContain('Running on: Android app — Android 14 · Pixel 7 · Chrome 120');
  });

  it('stays inside the ceiling even with absurd input', () => {
    const report = supportReport(facts({ saveCode: 'A'.repeat(9000), area: 'B'.repeat(9000) }));
    expect(report.length).toBeLessThanOrEqual(REPORT_LIMIT);
  });

  it('reports premium and unlimited hearts together, which is the billing ticket', () => {
    const report = supportReport(facts({ premium: true, hearts: 'unlimited' }));
    expect(report).toContain('Premium: yes');
    expect(report).toContain('Hearts: unlimited');
  });

  it('carries nothing that identifies the player', () => {
    // The privacy policy says a support email carries what the player chose to send and
    // nothing about who they are. This is the assertion behind that sentence.
    const report = supportReport(facts());
    expect(report).not.toMatch(/@|password|token|email|http/i);
  });
});

describe('the mailto it produces', () => {
  it('carries the subject and the whole report', () => {
    const report = supportReport(facts());
    const url = supportMailto('help@example.com', 'Tiny Tempo 0.1.0 — help', report);
    expect(url.startsWith('mailto:help@example.com?')).toBe(true);
    expect(url).toContain(`subject=${encodeURIComponent('Tiny Tempo 0.1.0 — help')}`);
    expect(decodeURIComponent(url.split('&body=')[1] ?? '')).toBe(report);
  });

  it('encodes the newlines and the em dash rather than emitting a broken link', () => {
    const url = supportMailto('help@example.com', 'a — b', 'one\ntwo');
    expect(url).not.toContain('\n');
    expect(url).toContain('%0A');
    expect(url).not.toContain('—');
  });

  it('survives an address that should never have had a space in it', () => {
    const url = supportMailto('help me@example.com', 's', 'b');
    expect(url).not.toMatch(/mailto:[^?]*\s/);
  });
});

describe('reducing a user-agent', () => {
  it('pulls the version, the model and the build out of an Android WebView', () => {
    // The real shape: the game ships inside a WebView, and "wv" is how one is recognised.
    expect(describeDevice(
      'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 '
      + '(KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36',
    )).toBe('Android 14 · Pixel 7 · WebView · Chrome 120');
  });

  it('handles Chrome on Android, which is the other way the game gets played', () => {
    expect(describeDevice(
      'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) '
      + 'Chrome/119.0.0.0 Mobile Safari/537.36',
    )).toBe('Android 13 · SM-A536B · Chrome 119');
  });

  it('drops the build number, which nobody has ever needed', () => {
    expect(describeDevice('Mozilla/5.0 (Linux; Android 12; moto g(30) Build/S0RCS32.41-10-9-3)'))
      .toBe('Android 12 · moto g(30)');
  });

  it('says so when there is nothing to describe', () => {
    expect(describeDevice('')).toBe('not reported');
    expect(describeDevice('   ')).toBe('not reported');
  });

  it('falls back to a truncated agent rather than a blank when it cannot parse one', () => {
    const odd = `Some/1.0 ${'x'.repeat(400)}`;
    const described = describeDevice(odd);
    expect(described).toHaveLength(DEVICE_LIMIT);
    expect(described).toBe(odd.slice(0, DEVICE_LIMIT));
  });

  it('keeps a desktop agent short enough to read', () => {
    expect(describeDevice(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) '
      + 'Chrome/120.0.0.0 Safari/537.36',
    )).toBe('Chrome 120');
  });
});
