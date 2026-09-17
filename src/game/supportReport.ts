/**
 * The details that turn "it broke" into something findable.
 *
 * A player cannot be expected to know their build number, their WebView version or how
 * many levels they had cleared, and a support thread that starts by asking for them has
 * already cost a round trip. So the game assembles them, and — this is the part that
 * matters — **shows the player exactly what it assembled** before anything is sent. A
 * support report that is gathered invisibly is indistinguishable from telemetry.
 *
 * Pure, so it can be read in a test rather than inferred from a screenshot. Nothing here
 * imports Phaser, storage or the monetization facade; the scene collects the facts and
 * this decides what they read like.
 */

export interface SupportFacts {
  readonly version: string;
  readonly packageId: string;
  /** "Android app" or "Browser" — which of the two very different runtimes this is. */
  readonly platform: string;
  /** The user-agent, or empty where there is none. Truncated; see `DEVICE_LIMIT`. */
  readonly device: string;
  readonly level: number;
  readonly area: string;
  readonly cleared: number;
  readonly premium: boolean;
  /** "5/5", or "unlimited" with premium held. */
  readonly hearts: string;
  readonly crashReports: boolean;
  readonly usageData: boolean;
  readonly saveCode: string;
}

/**
 * The platform block: everything inside the user-agent's first parenthesis,
 * "Linux; Android 14; Pixel 7 Build/…; wv".
 *
 * Matched by counting depth rather than with `\(([^)]*)\)`, because a model name can
 * contain brackets of its own — Motorola ships "moto g(30)" and "moto g(60)" — and a
 * non-greedy match ends at the model's own bracket, losing the rest of the block.
 */
function platformBlock(ua: string): string {
  const start = ua.indexOf('(');
  if (start < 0) return '';
  let depth = 0;
  for (let i = start; i < ua.length; i++) {
    if (ua[i] === '(') depth += 1;
    else if (ua[i] === ')' && --depth === 0) return ua.slice(start + 1, i);
  }
  // Unbalanced, which no real agent is; take what there is rather than nothing.
  return ua.slice(start + 1);
}

/** How much of a user-agent survives when it cannot be parsed into something shorter. */
export const DEVICE_LIMIT = 100;

/**
 * A user-agent, reduced to the part anyone reads.
 *
 * A WebView's is 160 characters of which about twenty matter: the Android version, the
 * model, and the Chrome build. The rest is a list of layout engines nobody has needed
 * since 2010, and sending it whole is both unreadable in a support thread and closer to a
 * fingerprint than to a fact. So this pulls out the three fields and drops the rest.
 *
 * Anything it cannot parse falls back to a truncated user-agent rather than to nothing —
 * a desktop browser is not the target platform, and a bad guess there is cheaper than a
 * blank line in a report about a device nobody can identify.
 */
export function describeDevice(ua: string): string {
  if (ua.trim() === '') return 'not reported';
  const segments = platformBlock(ua)
    .split(';').map(part => part.trim()).filter(part => part !== '');
  const android = segments.findIndex(part => part.startsWith('Android '));
  const chrome = /Chrome\/(\d+)/.exec(ua)?.[1];
  const bits: string[] = [];
  if (android >= 0) {
    bits.push(segments[android]!);
    // The model follows the version, and carries a build number no one has ever needed.
    const model = segments[android + 1]?.replace(/\s*Build\/.*$/, '');
    if (model !== undefined && model !== '' && model !== 'wv') bits.push(model);
    if (segments.includes('wv')) bits.push('WebView');
  }
  if (chrome !== undefined) bits.push(`Chrome ${chrome}`);
  return bits.length > 0 ? bits.join(' · ') : ua.slice(0, DEVICE_LIMIT);
}

/** Longest report produced, so a `mailto:` body cannot run into a client's URL limit. */
export const REPORT_LIMIT = 1500;

function line(label: string, value: string): string {
  return `${label}: ${value}`;
}

/**
 * The block a player sends. Plain text on purpose: it has to survive being pasted into
 * any mail client, forwarded, and read on a phone.
 */
export function supportReport(facts: SupportFacts): string {
  const device = describeDevice(facts.device);
  const reporting = [
    facts.crashReports ? 'crash reports on' : 'crash reports off',
    facts.usageData ? 'usage data on' : 'usage data off',
  ].join(', ');
  const body = [
    line('App', `${facts.version} (${facts.packageId})`),
    line('Running on', `${facts.platform} — ${device}`),
    line('Progress', `level ${facts.level} (${facts.area}), ${facts.cleared} cleared`),
    line('Premium', facts.premium ? 'yes' : 'no'),
    line('Hearts', facts.hearts),
    line('Reporting', reporting),
    // Last, and labelled, because it is the longest line and the one a player may want to
    // keep out. It is also the only thing that can restore a lost save, which is the
    // ticket this screen exists for more than any other.
    line('Save code', facts.saveCode),
  ].join('\n');
  return body.slice(0, REPORT_LIMIT);
}

/**
 * A `mailto:` with the report already in it.
 *
 * Everything is encoded, including the address: an address is not a URL component a
 * caller should have to think about, and a stray space would silently produce a link that
 * opens an empty mail window.
 */
export function supportMailto(address: string, subject: string, report: string): string {
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(report)}`;
  return `mailto:${encodeURIComponent(address).replace('%40', '@')}?${query}`;
}
