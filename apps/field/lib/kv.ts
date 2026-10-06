/**
 * Bulk storage for the day's jobs and the queue of what the rider has done
 * offline. AsyncStorage rather than the keychain (lib/storage.ts): the
 * keychain holds small secrets, and this is neither small nor secret.
 *
 * Everything here is JSON, read whole and written whole. The queue is a few
 * dozen small records at most, so there is no database to keep honest.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type KeyValue = {
  get: <T>(key: string, fallback: T) => Promise<T>;
  set: (key: string, value: unknown) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export const kv: KeyValue = {
  async get(key, fallback) {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw == null ? fallback : (JSON.parse(raw) as typeof fallback);
    } catch {
      return fallback;
    }
  },
  async set(key, value) {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  async remove(key) {
    await AsyncStorage.removeItem(key);
  },
};
