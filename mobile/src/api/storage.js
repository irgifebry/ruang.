/**
 * The production `expo-secure-store` adapter for the API client, with a
 * browser fallback.
 *
 * `client.js` itself stays Expo-free: it takes a storage adapter with the
 * same API, so tests pass fakes. This module is the only one importing
 * `expo-secure-store` — the package has no web implementation, so in the
 * Expo web preview the same adapter reads and writes `localStorage` instead.
 * Without the fallback the session token and the onboarding flag cannot be
 * persisted in the browser, and every reload starts the carousel again.
 */
import { Platform } from 'react-native';
import SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';
const webStore = () => (typeof window !== 'undefined' ? window.localStorage : null);

export const secureStorage = {
  async getItem(key) {
    if (isWeb) return webStore()?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async setItem(key, value) {
    if (isWeb) {
      webStore()?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key) {
    if (isWeb) {
      webStore()?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
