import { describe, expect, it } from 'vitest';
import { LAYOUT } from '../src/config/design';
import { relativeLuminance } from '../src/ui/colour';
import { LIGHT } from '../src/ui/light';
import { VERDICT_REACH, verdictLine } from '../src/ui/trackMetrics';
import {
  cardOutline, falloff, FRAME_CARD, PANEL_CARD, roomBelowCard, SHELF, shelfColour, shelfFor, type StageCard,
} from '../src/vignettes/staging';

/** HouseholdVignette.layout's stage placement, for a frame of the given logical size. */
function stageOn(width: number, height: number) {
  const ui = Math.min(width / 720, height / 1150);
  const top = 320 * ui, bottom = height - 410 * ui;
  return { ui, bottom: height, y: (top + bottom) / 2, scale: Math.min(width / 800, (bottom - top) / 520) };
}

/** The three frames `docs/VISUAL_AUDIT.md` captures, as logical sizes under EXPAND. */
const FRAMES = {
  phone: stageOn(720, 851 * 720 / 393),
  short: stageOn(720, 667 * 720 / 375),
  // 768x1024 anchors the height: 1280 tall, and 960 wide.
  tablet: stageOn(960, 1280),
};

describe('the shelf under a household card', () => {
  it('fits the room it is given, front face first, and gives up only when there is none', () => {
    const full = shelfFor(FRAME_CARD, 500)!;
    expect(full.topHeight).toBe(SHELF.top);
    expect(full.frontHeight).toBe(SHELF.front);
    for (const room of [60, 40, 30, 22, 16, 12, 8, 4, 3]) {
      const shelf = shelfFor(FRAME_CARD, room);
      if (!shelf) { expect(room).toBeLessThan(SHELF.minTop); continue; }
      const below = shelf.topY + shelf.topHeight + shelf.frontHeight + shelf.shadow.dy - (FRAME_CARD.y + FRAME_CARD.height);
      expect(below).toBeLessThanOrEqual(room + 1e-9);
      expect(shelf.frontHeight).toBeLessThanOrEqual(SHELF.front);
    }
    expect(shelfFor(FRAME_CARD, 0)).toBeNull();
    expect(shelfFor(FRAME_CARD, Number.NaN)).toBeNull();
  });

  it('runs past the card at both ends and starts just above its foot, so the card sits on it', () => {
    const shelf = shelfFor(PANEL_CARD, 500)!;
    expect(shelf.x).toBeLessThan(PANEL_CARD.x);
    expect(shelf.x + shelf.width).toBeGreaterThan(PANEL_CARD.x + PANEL_CARD.width);
    expect(shelf.topY).toBeLessThan(PANEL_CARD.y + PANEL_CARD.height);
    expect(shelf.topY + shelf.topHeight).toBeGreaterThan(PANEL_CARD.y + PANEL_CARD.height);
  });

  it('stays clear of the verdict pill on the 16:9 frame, where the room is tightest on a phone', () => {
    const f = FRAMES.short;
    for (const card of [FRAME_CARD, PANEL_CARD, { x: -352, y: -250, width: 704, height: 500, radius: 24 }]) {
      const room = roomBelowCard(card, f.y, f.scale, f.bottom, f.ui);
      const shelf = shelfFor(card, room);
      expect(shelf).not.toBeNull();
      const lowest = f.y + f.scale * (shelf!.topY + shelf!.topHeight + shelf!.frontHeight + shelf!.shadow.dy);
      const pillTop = verdictLine(f.bottom - LAYOUT.trackOffsetFromBottom * f.ui, f.ui) - VERDICT_REACH * f.ui;
      expect(lowest).toBeLessThanOrEqual(pillTop + 1e-6);
    }
  });

  it('keeps a full shelf on a tall phone, and a lip or nothing on a 4:3 tablet rather than crossing the verdict', () => {
    const phone = FRAMES.phone;
    const tall = shelfFor(FRAME_CARD, roomBelowCard(FRAME_CARD, phone.y, phone.scale, phone.bottom, phone.ui))!;
    expect(tall.frontHeight).toBe(SHELF.front);
    const tablet = FRAMES.tablet;
    const room = roomBelowCard(FRAME_CARD, tablet.y, tablet.scale, tablet.bottom, tablet.ui);
    const lip = shelfFor(FRAME_CARD, room);
    if (lip) expect(lip.topY + lip.topHeight + lip.frontHeight + lip.shadow.dy - (FRAME_CARD.y + FRAME_CARD.height)).toBeLessThanOrEqual(room + 1e-9);
  });

  it('takes its timber from the act: darker than a light paper, lighter than a dark one', () => {
    const light = 0xe9e4db, dark = 0x3f4468;
    expect(relativeLuminance(shelfColour(light, 0xf1cf93))).toBeLessThan(relativeLuminance(light));
    expect(relativeLuminance(shelfColour(dark, 0xf2a65a))).toBeGreaterThan(relativeLuminance(dark));
  });
});

describe('the light across a card', () => {
  const card: StageCard = FRAME_CARD;
  const right = card.x + card.width, bottom = card.y + card.height;

  it('leaves the half facing the light alone and is darkest in the corner furthest from it', () => {
    expect(LIGHT.x).toBeLessThan(0);
    expect(LIGHT.y).toBeLessThan(0);
    expect(falloff(card, card.x, card.y, 0.2)).toBe(0);
    expect(falloff(card, card.x + card.width / 2, card.y + card.height / 2, 0.2)).toBe(0);
    expect(falloff(card, right, bottom, 0.2)).toBeCloseTo(0.2);
    expect(falloff(card, right, bottom, 0.2)).toBeGreaterThan(falloff(card, right, card.y, 0.2));
    expect(falloff(card, right, bottom, 0.2)).toBeGreaterThan(falloff(card, card.x, bottom, 0.2));
  });

  it('is linear, so a fan from the centre carries it exactly', () => {
    const cx = card.x + card.width / 2, cy = card.y + card.height / 2;
    const at = (t: number) => falloff(card, cx + (right - cx) * t, cy + (bottom - cy) * t, 1);
    expect(at(0.5)).toBeCloseTo(at(1) / 2);
    expect(at(0.75)).toBeCloseTo(at(1) * 0.75);
  });

  it('traces the card as a closed ring inside its own bounds', () => {
    const ring = cardOutline(card, 2, 6);
    expect(ring.length).toBe(4 * 7 * 2);
    for (let i = 0; i < ring.length; i += 2) {
      expect(ring[i]!).toBeGreaterThanOrEqual(card.x + 2 - 1e-9);
      expect(ring[i]!).toBeLessThanOrEqual(right - 2 + 1e-9);
      expect(ring[i + 1]!).toBeGreaterThanOrEqual(card.y + 2 - 1e-9);
      expect(ring[i + 1]!).toBeLessThanOrEqual(bottom - 2 + 1e-9);
    }
  });
});
