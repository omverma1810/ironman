/**
 * Key-value storage for the session and small preferences. On a phone this is
 * the OS keychain / keystore (expo-secure-store); the web build has no such
 * thing, so it falls back to localStorage. The web build exists for
 * development and the end-to-end tests, never as a shipped product.
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

export async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Private mode or storage blocked: the app works for this run only.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // see setItem
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
