import { describe, expect, it } from 'vitest';
import { createPartnerPrivacy, gppRecordsOptOut, type PartnerPrivacyClient } from '../src/monetization/usOptOut';

/**
 * Every string below was encoded by the IAB's reference implementation (`@iabgpp/cmpapi`
 * 3.2.0, `GppModel.setFieldValue` then `encode`), not by hand, so the decoder is checked
 * against the format as the IAB writes it rather than against this file's reading of the spec.
 * Field values: 1 is Opted Out, 2 is Did Not Opt Out; notices are 1, provided.
 */
const REFERENCE = {
  usnatSaleOptedOut: 'DBABLA~CFQaAAAAAABA.QA',
  usnatTargetingOptedOut: 'DBABLA~CFQpAAAAAABA.QA',
  usnatSharingOptedOut: 'DBABLA~CBAEAAAAAABA.QA',
  usnatDidNotOptOut: 'DBABLA~CFQqAAAAAABA.QA',
  usnatNothingRecorded: 'DBABLA~BAAAAAAAAQA.QA',
  uscaSharingOptedOut: 'DBABBg~BUkAAABA.QA',
  uscaDidNotOptOut: 'DBABBg~BUoAAABA.QA',
  usvaTargetingOptedOut: 'DBABRg~BBEAABA',
  uscoSaleOptedOut: 'DBABJg~BEQAAEA.QA',
  usctTargetingOptedOut: 'DBABVg~BBEAAAEA.QA',
  usflSaleOptedOut: 'DBABAw~BEQAAABA',
  usflDidNotOptOut: 'DBABAw~BFoAAABA',
  usutSaleOptedOut: 'DBABFg~BEEAAAQA',
  ustxSaleOptedOut: 'DBABEw~BEQAAAQA.QA',
  tcfThenUsnatSaleOptedOut: 'DBACMMA~CQsimMAQsimMAAAAAAENAAFgAMAAAAAAAAAAAAAAAAAA.IAAA.YAAAAAAAAAAA~CEAQAAAAAABA.QA',
  uspThenUscaSaleOptedOut: 'DBACTMA~1YYN~BQQAAABA.QA',
  usnatStaysThenUsvaOptsOut: 'DBACLMA~CEAgAAAAAABA.QA~BEQAABA',
} as const;

describe('reading a US-state opt-out from UMP\'s GPP string', () => {
  it('finds an opt-out of sale, sharing or targeted advertising in the US National section', () => {
    expect(gppRecordsOptOut(REFERENCE.usnatSaleOptedOut)).toBe(true);
    expect(gppRecordsOptOut(REFERENCE.usnatTargetingOptedOut)).toBe(true);
    expect(gppRecordsOptOut(REFERENCE.usnatSharingOptedOut)).toBe(true);
  });

  it('finds one in each state section AdMob accepts', () => {
    for (const gpp of [
      REFERENCE.uscaSharingOptedOut, REFERENCE.usvaTargetingOptedOut, REFERENCE.uscoSaleOptedOut,
      REFERENCE.usctTargetingOptedOut, REFERENCE.usflSaleOptedOut,
    ]) expect(gppRecordsOptOut(gpp), gpp).toBe(true);
  });

  it('finds it behind other sections, by the header\'s ids rather than by position', () => {
    expect(gppRecordsOptOut(REFERENCE.tcfThenUsnatSaleOptedOut)).toBe(true);
    expect(gppRecordsOptOut(REFERENCE.uspThenUscaSaleOptedOut)).toBe(true);
    expect(gppRecordsOptOut(REFERENCE.usnatStaysThenUsvaOptsOut)).toBe(true);
  });

  it('reads "did not opt out" and an empty record as no opt-out, never as anything more', () => {
    expect(gppRecordsOptOut(REFERENCE.usnatDidNotOptOut)).toBe(false);
    expect(gppRecordsOptOut(REFERENCE.usnatNothingRecorded)).toBe(false);
    expect(gppRecordsOptOut(REFERENCE.uscaDidNotOptOut)).toBe(false);
    expect(gppRecordsOptOut(REFERENCE.usflDidNotOptOut)).toBe(false);
  });

  it('reads only the sections AdMob accepts, in the versions whose layout is known', () => {
    // Utah and Texas are not sections AdMob takes, so UMP does not write them.
    expect(gppRecordsOptOut(REFERENCE.usutSaleOptedOut)).toBe(false);
    expect(gppRecordsOptOut(REFERENCE.ustxSaleOptedOut)).toBe(false);
    // The usnat sale opt-out above with its version raised from 2 to 3: a layout not yet
    // published is not guessed at.
    expect(gppRecordsOptOut('DBABLA~DFQaAAAAAABA.QA')).toBe(false);
  });

  it('treats anything it cannot read whole as nothing on record', () => {
    for (const gpp of [
      undefined, null, 42, '', 'DBABLA', 'DBABLA~', 'garbage~CFQaAAAAAABA.QA',
      // A header naming one section with two after it, and one naming two with one.
      'DBABLA~CFQaAAAAAABA.QA~CFQaAAAAAABA.QA', 'DBACLMA~CEAgAAAAAABA.QA',
      // A core segment cut short before its opt-outs, and one with a character outside base64.
      'DBABLA~CFQ', 'DBABLA~CFQ*AAAAAABA.QA',
    ]) expect(gppRecordsOptOut(gpp), String(gpp)).toBe(false);
  });
});

describe('passing the opt-out to Unity Ads', () => {
  function client(gpp: string | null | Error, forward: 'ok' | Error = 'ok'): PartnerPrivacyClient & { forwarded: number } {
    let forwarded = 0;
    return {
      get forwarded() { return forwarded; },
      async readGppString() { if (gpp instanceof Error) throw gpp; return gpp; },
      async forwardOptOut() { if (forward instanceof Error) throw forward; forwarded += 1; },
    };
  }

  it('forwards an opt-out on record, and nothing otherwise', async () => {
    const optedOut = client(REFERENCE.usnatSaleOptedOut);
    expect(await createPartnerPrivacy(optedOut).sync()).toBe(true);
    expect(optedOut.forwarded).toBe(1);
    for (const gpp of [null, REFERENCE.usnatDidNotOptOut, REFERENCE.usnatNothingRecorded]) {
      const quiet = client(gpp);
      expect(await createPartnerPrivacy(quiet).sync()).toBe(true);
      expect(quiet.forwarded).toBe(0);
    }
  });

  it('holds ads back only when an opt-out on record could not be passed on', async () => {
    const reported: unknown[] = [];
    const failing = createPartnerPrivacy(client(REFERENCE.usnatSaleOptedOut, new Error('no plugin')), e => reported.push(e));
    expect(await failing.sync()).toBe(false);
    expect(reported).toHaveLength(1);
  });

  it('reports a string it could not read, and has nothing to pass on', async () => {
    const reported: unknown[] = [];
    const unreadable = client(new Error('no plugin'));
    expect(await createPartnerPrivacy(unreadable, e => reported.push(e)).sync()).toBe(true);
    expect(unreadable.forwarded).toBe(0);
    expect(reported).toHaveLength(1);
  });
});
