import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CREDITS } from '../src/config/credits';

/**
 * A credit is printed twice: in Settings, from `config/credits.ts`, and in the footer of
 * every page of the website, which is published separately and cannot import it. These
 * keep the two saying the same thing, so a change to one cannot leave the other behind.
 */

const FOOTED_PAGES = ['legal/index.html', 'legal/privacy/index.html', 'legal/terms/index.html', 'legal/legal/index.html'];

function footerOf(path: string): string {
  const page = readFileSync(path, 'utf8');
  const footer = /<footer\b[\s\S]*?<\/footer>/.exec(page);
  expect(footer, `${path} has a footer`).not.toBeNull();
  return footer![0];
}

describe('the credits', () => {
  it('lead to a plain https page, without a share link\'s tracking', () => {
    for (const credit of Object.values(CREDITS)) {
      const url = new URL(credit.url);
      expect(url.protocol, credit.name).toBe('https:');
      expect(url.search, credit.name).toBe('');
    }
  });

  it('are in the footer of every page of the website, linked where Settings leads', () => {
    for (const path of FOOTED_PAGES) {
      const footer = footerOf(path);
      for (const credit of Object.values(CREDITS)) {
        expect(footer, `${path}: ${credit.name}`).toContain(`${credit.role} by <a href="${credit.url}"`);
        expect(footer, `${path}: ${credit.name}`).toContain(`>${credit.name}</a>`);
      }
    }
  });

  it('open in a new tab that holds no handle on the page', () => {
    for (const path of FOOTED_PAGES) {
      for (const credit of Object.values(CREDITS)) {
        const anchor = new RegExp(`<a href="${credit.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`).exec(footerOf(path));
        expect(anchor?.[0], path).toMatch(/rel="noopener"/);
      }
    }
  });

  it('name the composer in the home page\'s structured data', () => {
    const page = readFileSync('legal/index.html', 'utf8');
    const data = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(page);
    const game = JSON.parse(data![1]!) as { musicBy?: { name?: string; sameAs?: string } };
    expect(game.musicBy).toEqual({ '@type': 'Person', name: CREDITS.score.name, sameAs: CREDITS.score.url });
  });
});
