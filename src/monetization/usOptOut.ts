/**
 * A US-state privacy opt-out, carried from Google's consent message to Unity Ads.
 *
 * Unity Ads bids for the rewarded ad through AdMob mediation, and Google's adapter passes it
 * two of the player's answers by itself: the GDPR choice (from UMP's IAB TCF record) and the
 * age tags. It passes nothing from a **US-state** message. UMP records that answer as an IAB
 * Global Privacy Platform (GPP) string, which the Mobile Ads SDK reads for Google's own demand
 * and the adapter does not, and Google's mediation guide leaves each partner's US signal to
 * the publisher. So the game reads the string back and tells Unity of an opt-out itself, through
 * `UnityAdsPrivacyPlugin.java`, before anything is requested. See docs/UNITY_MEDIATION.md.
 *
 * **Only ever an opt-out, never a grant.** Unity keeps the value on the device, and its docs
 * say its privacy value wins over the GDPR one when both are set — so a "yes" sent from a US
 * record would outlive a move to Europe and override a GDPR refusal there. A "no" can only
 * restrict. Nothing is sent when there is no record, a record says nothing, or it cannot be
 * read: absence is not a choice, and it is never turned into one. The cost is that a player
 * who opts out and later opts back in stays opted out for Unity on that device.
 *
 * Pure apart from the client, and the client is the only thing that touches native code.
 */

/**
 * The opt-out fields of each section AdMob accepts in a GPP string (US National, California,
 * Virginia, Colorado, Connecticut, Florida), as bit offsets into the section's core segment,
 * for the section versions whose layout is known. Every one is Int(2): 1 is "Opted Out".
 * From the IAB's section specifications: each core segment opens with a 6-bit version and its
 * notice fields, so the opt-outs sit at fixed offsets. A version not listed is not guessed at.
 */
const OPT_OUT_FIELDS: Readonly<Record<number, { readonly versions: readonly number[]; readonly offsets: readonly number[] }>> = {
  // usnat: SaleOptOut, SharingOptOut, TargetedAdvertisingOptOut, after six notices. Version 2
  // only added states and widened fields that come after these.
  7: { versions: [1, 2], offsets: [18, 20, 22] },
  // usca: SaleOptOut, SharingOptOut, after three notices.
  8: { versions: [1], offsets: [12, 14] },
  // usva, usco, usct, usfl: SaleOptOut, TargetedAdvertisingOptOut, after three notices.
  9: { versions: [1], offsets: [12, 14] },
  10: { versions: [1], offsets: [12, 14] },
  12: { versions: [1], offsets: [12, 14] },
  13: { versions: [1], offsets: [12, 14] },
};

const OPTED_OUT = 1;
const HEADER_TYPE = 3;
const HEADER_VERSION = 1;
/** Far longer than any section id needs; stops a malformed string reading forever. */
const MAX_FIBONACCI_BITS = 32;

/** GPP's base64 is the URL-safe alphabet; the standard one's two symbols are read too. */
function bitsOf(segment: string): string | null {
  let bits = '';
  for (const char of segment) {
    const code = char.charCodeAt(0);
    let value: number;
    if (code >= 65 && code <= 90) value = code - 65;
    else if (code >= 97 && code <= 122) value = code - 71;
    else if (code >= 48 && code <= 57) value = code + 4;
    else if (char === '-' || char === '+') value = 62;
    else if (char === '_' || char === '/') value = 63;
    else return null;
    bits += value.toString(2).padStart(6, '0');
  }
  return bits;
}

function intAt(bits: string, start: number, length: number): number | null {
  if (start + length > bits.length) return null;
  return Number.parseInt(bits.slice(start, start + length), 2);
}

/**
 * The header's section ids, in the order their sections follow it: Type(6) = 3, Version(6) = 1,
 * then a Range(Fibonacci) — a 12-bit count, and per item a group flag and a Fibonacci-coded
 * offset from the last id seen, plus a length for a group.
 */
function sectionIds(header: string): number[] | null {
  const bits = bitsOf(header);
  if (bits === null || intAt(bits, 0, 6) !== HEADER_TYPE || intAt(bits, 6, 6) !== HEADER_VERSION) return null;
  const count = intAt(bits, 12, 12);
  if (count === null) return null;
  let at = 24;
  let last = 0;
  const ids: number[] = [];
  const fibonacci = (): number | null => {
    let value = 0;
    let previous = '0';
    let a = 1;
    let b = 2;
    for (let read = 0; read < MAX_FIBONACCI_BITS && at < bits.length; read += 1) {
      const bit = bits[at++];
      if (bit === '1' && previous === '1') return value;
      if (bit === '1') value += a;
      previous = bit ?? '0';
      [a, b] = [b, a + b];
    }
    return null;
  };
  for (let item = 0; item < count; item += 1) {
    if (at >= bits.length) return null;
    const group = bits[at++] === '1';
    const offset = fibonacci();
    if (offset === null) return null;
    const start = last + offset;
    const length = group ? fibonacci() : 0;
    if (length === null) return null;
    for (let id = start; id <= start + length; id += 1) ids.push(id);
    last = start + length;
  }
  return ids;
}

/**
 * True only when a section AdMob accepts records an opt-out of sale, sharing or targeted
 * advertising. A string that cannot be read whole, a header that does not match its sections,
 * and a section version whose layout is not known all read as no opt-out on record — which is
 * what they are, not a grant.
 */
export function gppRecordsOptOut(gpp: unknown): boolean {
  if (typeof gpp !== 'string' || gpp.length === 0) return false;
  const [header = '', ...sections] = gpp.split('~');
  const ids = sectionIds(header);
  if (ids === null || ids.length !== sections.length) return false;
  return ids.some((id, index) => {
    const fields = OPT_OUT_FIELDS[id];
    if (!fields) return false;
    const core = bitsOf((sections[index] ?? '').split('.')[0] ?? '');
    if (core === null) return false;
    const version = intAt(core, 0, 6);
    if (version === null || !fields.versions.includes(version)) return false;
    return fields.offsets.some(offset => intAt(core, offset, 2) === OPTED_OUT);
  });
}

export interface PartnerPrivacyClient {
  /** UMP's GPP string (`IABGPP_HDR_GppString`), or null when it has written none. */
  readGppString(): Promise<string | null>;
  /** Tells Unity Ads the player opted out. There is deliberately no way to say the opposite. */
  forwardOptOut(): Promise<void>;
}

export interface PartnerPrivacy {
  /**
   * Passes on an opt-out UMP has recorded. False only when there is one and it could not be
   * passed on, which is the one answer that must stop ads being requested.
   */
  sync(): Promise<boolean>;
}

export function createPartnerPrivacy(
  client: PartnerPrivacyClient,
  report: (error: unknown) => void = () => { /* silent in tests */ },
): PartnerPrivacy {
  return {
    async sync() {
      let gpp: string | null;
      try {
        gpp = await client.readGppString();
      } catch (error) {
        // Nothing could be read, so nothing is on record to pass on; the Mobile Ads SDK still
        // reads the string for Google's own demand. Reported, because a plugin that never
        // answers would leave every US opt-out unforwarded without a sound.
        report(error);
        return true;
      }
      if (!gppRecordsOptOut(gpp)) return true;
      try {
        await client.forwardOptOut();
        return true;
      } catch (error) {
        report(error);
        return false;
      }
    },
  };
}
