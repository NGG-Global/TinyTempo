import { afterEach, describe, expect, it, vi } from 'vitest';
import { askToApplyUpdate } from '../src/core/shell';

vi.mock('phaser', () => ({ default: {} }));

function stubOverlay(): { overlay: { hidden: boolean; getAttribute: (name: string) => string | null; setAttribute: (name: string, value: string) => void; removeAttribute: (name: string) => void }; confirm: { listeners: Array<() => void> }; cancel: { listeners: Array<() => void> } } {
  const overlay = {
    hidden: true,
    getAttribute: (name: string) => (name === 'hidden' && overlay.hidden ? '' : null),
    setAttribute: (name: string, value: string) => {
      if (name === 'hidden') overlay.hidden = true;
      void value;
    },
    removeAttribute: (name: string) => {
      if (name === 'hidden') overlay.hidden = false;
    },
  };
  const button = (): { listeners: Array<() => void>; addEventListener: (type: string, fn: () => void) => void; removeEventListener: (type: string, fn: () => void) => void } => {
    const listeners: Array<() => void> = [];
    return {
      listeners,
      addEventListener: (_type, fn) => { listeners.push(fn); },
      removeEventListener: (_type, fn) => {
        const index = listeners.indexOf(fn);
        if (index >= 0) listeners.splice(index, 1);
      },
    };
  };
  const confirm = button();
  const cancel = button();
  vi.stubGlobal('document', {
    getElementById: (id: string) => {
      if (id === 'update-overlay') return overlay;
      if (id === 'update-confirm') return confirm;
      if (id === 'update-cancel') return cancel;
      return null;
    },
  });
  return { overlay, confirm, cancel };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('the update restart sheet', () => {
  it('resolves false when the markup is missing, so a caller never has to guard', async () => {
    vi.stubGlobal('document', { getElementById: () => null });
    await expect(askToApplyUpdate()).resolves.toBe(false);
  });

  it('shows the overlay and resolves true on Restart', async () => {
    const { overlay, confirm } = stubOverlay();
    const asked = askToApplyUpdate();
    expect(overlay.hidden).toBe(false);
    confirm.listeners[0]!();
    await expect(asked).resolves.toBe(true);
    expect(overlay.hidden).toBe(true);
  });

  it('treats Later as a real no, not a missing sheet', async () => {
    const { cancel } = stubOverlay();
    const asked = askToApplyUpdate();
    cancel.listeners[0]!();
    await expect(asked).resolves.toBe(false);
  });

  it('reuses one sheet if asked again while it is already up', async () => {
    const { confirm } = stubOverlay();
    const first = askToApplyUpdate();
    const second = askToApplyUpdate();
    expect(second).toBe(first);
    confirm.listeners[0]!();
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });
});
