import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Unity Ads is three versions that move together: Google's adapter, the Unity Ads SDK it wraps,
 * and the Mobile Ads SDK it was built against — and Google warns that a mismatch "might lead
 * to build issues". None of them is a build error until it is, so the pair is pinned against
 * the combination Google's adapter changelog names (developers.google.com/admob/android/mediation/unity).
 * Moving one means adding the new row from that changelog here, not editing a number.
 */
const TESTED_BY_GOOGLE = [
  { adapter: '4.20.1.0', unityAds: '4.20.1', mobileAds: '25.4.0' },
] as const;

function pinned(name: string): string {
  const variables = readFileSync('android/variables.gradle', 'utf8');
  const value = new RegExp(`^\\s*${name}\\s*=\\s*'([^']*)'`, 'm').exec(variables)?.[1];
  expect(value, `${name} in android/variables.gradle`).toBeDefined();
  return value!;
}

describe('Unity Ads mediation dependencies', () => {
  it('pin a combination Google tested, exactly', () => {
    const declared = {
      adapter: pinned('unityMediationAdapterVersion'),
      unityAds: pinned('unityAdsVersion'),
      mobileAds: pinned('playServicesAdsVersion'),
    };
    for (const version of Object.values(declared)) expect(version).toMatch(/^\d+(\.\d+)+$/);
    expect(TESTED_BY_GOOGLE).toContainEqual(declared);
  });

  it('are declared once each, from those pins, with no second mediation platform', () => {
    const declarations = readFileSync('android/app/build.gradle', 'utf8')
      .split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
    expect(declarations.match(/com\.unity3d\.ads:unity-ads:/g)).toEqual(['com.unity3d.ads:unity-ads:']);
    expect(declarations).toContain('"com.unity3d.ads:unity-ads:$unityAdsVersion"');
    expect(declarations.match(/com\.google\.ads\.mediation:/g)).toEqual(['com.google.ads.mediation:']);
    expect(declarations).toContain('"com.google.ads.mediation:unity:$unityMediationAdapterVersion"');
    expect(declarations).not.toMatch(/com\.unity3d\.mediation|com\.ironsource/);
  });
});

/**
 * `legal/app-ads.txt` is published at the site's root by the Pages workflow, and a buyer that
 * cannot parse a line ignores it — which for the Google line would leave the app's own inventory
 * unauthorised. The format is the IAB's: a record is `domain, account id, DIRECT|RESELLER` with an
 * optional certification authority id, a variable is `NAME=value`, and `#` starts a comment.
 */
describe('app-ads.txt', () => {
  const lines = readFileSync('legal/app-ads.txt', 'utf8').split('\n').map(line => line.replace(/#.*$/, '').trim()).filter(Boolean);
  const records = lines.filter(line => !/^[A-Za-z]+=/.test(line));

  it('is records and variables in the IAB format, nothing else', () => {
    for (const line of records) {
      expect(line).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}\s*,\s*[^,\s]+\s*,\s*(DIRECT|RESELLER)(\s*,\s*[^,\s]+)?$/i);
    }
    for (const line of lines.filter(line => /^[A-Za-z]+=/.test(line))) {
      expect(line).toMatch(/^(CONTACT|SUBDOMAIN|INVENTORYPARTNERDOMAIN|OWNERDOMAIN|MANAGERDOMAIN)=\S+$/i);
    }
  });

  it('keeps the AdMob account authorised, and lists no seller twice', () => {
    expect(records).toContain('google.com, pub-6818267616933452, DIRECT, f08c47fec0942fa0');
    const keys = records.map(line => line.split(',').slice(0, 3).map(part => part.trim().toLowerCase()).join(','));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('carries no placeholder standing in for a seller id nobody has supplied', () => {
    expect(lines.join('\n')).not.toMatch(/x{4,}|todo|placeholder|your[-_ ]?(id|domain)|<|>/i);
  });
});
