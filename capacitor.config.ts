import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tinytempo.app',
  appName: 'Tiny Tempo',
  webDir: 'dist',
  // Match the shell paper colour so the WebView never flashes white before index.html paints.
  backgroundColor: '#eee8d8',
};

export default config;
