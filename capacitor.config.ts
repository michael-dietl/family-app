import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'mobi.dietl.app',
  appName: 'dietl.mobi',
  webDir: 'dist',
  android: { 
    // WICHTIG: verhindert Edge‑to‑Edge 
    backgroundColor: '#FFFFFFFF' 
  }  
};

export default config;
