import { afterEach, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { TapInput } from '../src/input/TapInput';

vi.mock('phaser', () => ({ default: { Input: { Events: {
  POINTER_DOWN: 'down', POINTER_UP: 'up', POINTER_UP_OUTSIDE: 'outside',
} } } }));
afterEach(() => vi.unstubAllGlobals());

it('uses one unified handler, preserves event timestamp and filters held/secondary pointers', () => {
  const native = new EventTarget();
  vi.stubGlobal('window', native);
  const handlers = new Map<string, (pointer: object) => void>();
  const input = {
    on: (name: string, fn: (pointer: object) => void, context: object) => handlers.set(name, fn.bind(context)),
    off: (name: string) => handlers.delete(name),
  };
  const receive = vi.fn();
  const adapter = new TapInput({ input } as unknown as Phaser.Scene, receive);
  const first = { id: 1, x: 10, y: 20, wasTouch: true, button: 0, event: { timeStamp: 123 } };
  handlers.get('down')!(first);
  handlers.get('down')!({ ...first, id: 2 });
  expect(receive).toHaveBeenCalledExactlyOnceWith({ x: 10, y: 20, timestamp: 123 });
  handlers.get('outside')!(first);
  handlers.get('down')!({ ...first, wasTouch: false, button: 2 });
  expect(receive).toHaveBeenCalledTimes(1);
  handlers.get('down')!({ ...first, wasTouch: false });
  expect(receive).toHaveBeenCalledTimes(2);
  native.dispatchEvent(new Event('pointercancel'));
  handlers.get('down')!(first);
  expect(receive).toHaveBeenCalledTimes(3);
  adapter.dispose(); adapter.dispose();
  expect(handlers.size).toBe(0);
});

it('takes a second finger on a rhythm screen, each finger tapping once on its way down', () => {
  const native = new EventTarget();
  vi.stubGlobal('window', native);
  const handlers = new Map<string, (pointer: object) => void>();
  const input = {
    on: (name: string, fn: (pointer: object) => void, context: object) => handlers.set(name, fn.bind(context)),
    off: (name: string) => handlers.delete(name),
  };
  const receive = vi.fn();
  const adapter = new TapInput({ input } as unknown as Phaser.Scene, receive, { pointers: 2 });
  const thumb = (id: number, timeStamp: number) => ({ id, x: id * 10, y: 20, wasTouch: true, button: 0, event: { timeStamp } });
  handlers.get('down')!(thumb(1, 100));
  // The other thumb lands while the first is still down: a tap of its own.
  handlers.get('down')!(thumb(2, 210));
  expect(receive.mock.calls.map(([tap]) => tap.timestamp)).toEqual([100, 210]);
  // A third finger, or a finger already down, does nothing until one lifts.
  handlers.get('down')!(thumb(3, 300));
  handlers.get('down')!(thumb(1, 320));
  expect(receive).toHaveBeenCalledTimes(2);
  handlers.get('up')!(thumb(1, 330));
  handlers.get('down')!(thumb(1, 340));
  expect(receive).toHaveBeenCalledTimes(3);
  adapter.dispose();
});
