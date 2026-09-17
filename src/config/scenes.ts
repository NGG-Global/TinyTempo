/**
 * Scene keys.
 *
 * Phaser addresses scenes by string key, so they live in one place rather than
 * being retyped at each `scene.start` call site.
 */
export const SceneKey = {
  Boot: 'boot',
  Preload: 'preload',
  Menu: 'menu',
  Map: 'map',
  Play: 'play',
  Settings: 'settings',
  Calibrate: 'calibrate',
  Tutorial: 'tutorial',
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];
