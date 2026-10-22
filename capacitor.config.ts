import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tinytempo.app',
  appName: 'Tiny Tempo',
  webDir: 'dist',
  // Match the shell paper colour so the WebView never flashes white before index.html paints.
  backgroundColor: '#eee8d8',
  plugins: {
    // The daily reminder's defaults (docs/REMINDERS.md): the white eighth-note glyph in
    // res/drawable, tinted the game's coral. Each reminder also names them itself.
    LocalNotifications: {
      smallIcon: 'ic_stat_tiny_tempo',
      iconColor: '#CF5134',
    },
  },
};

export default config;
