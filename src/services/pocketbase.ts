import PocketBase from 'pocketbase';
import { Preferences } from '@capacitor/preferences';

class PocketBaseService {
  private pb: PocketBase | null = null;
  private url: string = '';

  async initialize() {
    const { value } = await Preferences.get({ key: 'pocketbase_url' });
    
    if (value) {
      this.url = value;
      this.pb = new PocketBase(value);
      
      // Restore auth token if available
      const { value: token } = await Preferences.get({ key: 'pocketbase_token' });
      if (token) {
        this.pb.authStore.save(token);
      }

      // Auto-refresh auth
      this.pb.authStore.onChange((token) => {
        if (token) {
          Preferences.set({ key: 'pocketbase_token', value: token });
        } else {
          Preferences.remove({ key: 'pocketbase_token' });
        }
      });
    }
  }

  getInstance(): PocketBase | null {
    return this.pb;
  }

  isConfigured(): boolean {
    return this.pb !== null;
  }

  isAuthenticated(): boolean {
    return this.pb?.authStore.isValid ?? false;
  }

  async reconnect() {
    await this.initialize();
  }

  getUrl(): string {
    return this.url;
  }
}

export const pocketbase = new PocketBaseService();
