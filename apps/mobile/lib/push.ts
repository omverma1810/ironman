/**
 * Push notifications in the app (docs/08 batch 8.4): ask at a good moment,
 * register this phone with the API, take the customer to the order when they
 * tap a message. All of it is native-only: the web build has no push, and an
 * emulator can't receive one, so those quietly do nothing.
 *
 * Real delivery also needs the app's push credentials uploaded to Expo (an
 * Apple key and a Firebase key), which only the owner's accounts can do; see
 * docs/14.
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";
import { deleteItem, getItem, setItem } from "./storage";

const TOKEN_KEY = "ironman.pushToken";

export type PushState =
  /** Registered with the API: messages will arrive. */
  | "on"
  /** The customer hasn't been asked yet. */
  | "ask"
  /** The customer said no; only the phone's settings can change it. */
  | "denied"
  /** This build or device can't receive push (web, emulator, no project id). */
  | "unavailable";

/** The Expo project this build belongs to (set when the app is first built with EAS). */
export function expoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export function canReceivePush(): boolean {
  return Platform.OS !== "web" && Device.isDevice && !!expoProjectId();
}

/** Where tapping a message should go. */
export function routeForNotification(data: unknown): string {
  const orderId = (data as { orderId?: unknown } | null)?.orderId;
  return typeof orderId === "string" && /^[0-9a-fA-F-]{16,}$/.test(orderId) ? `/orders/${orderId}` : "/";
}

/** Called once at start-up: show messages that arrive while the app is open, and
 * give Android the channel its messages are filed under. */
export function configureNotifications(): void {
  if (Platform.OS === "web") return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync("orders", {
      name: "Order updates",
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => undefined);
  }
}

export async function pushState(): Promise<PushState> {
  if (!canReceivePush()) return "unavailable";
  const permission = await Notifications.getPermissionsAsync();
  if (permission.granted) return (await getItem(TOKEN_KEY)) ? "on" : "ask";
  return permission.canAskAgain ? "ask" : "denied";
}

/**
 * Registers this phone. With `askIfNeeded` it shows the system permission
 * prompt (once the customer has chosen to turn notifications on); without,
 * it only refreshes a registration the customer already allowed. Safe to call
 * on every sign-in: the API treats the same token as the same device.
 */
export async function registerForPush({ askIfNeeded }: { askIfNeeded: boolean }): Promise<PushState> {
  if (!canReceivePush()) return "unavailable";
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && askIfNeeded && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) return permission.canAskAgain ? "ask" : "denied";

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: expoProjectId() });
  await api.post("/notifications/devices", {
    token,
    platform: Platform.OS === "ios" ? "ios" : "android",
    app_version: Constants.expoConfig?.version ?? "",
  });
  await setItem(TOKEN_KEY, token);
  return "on";
}

/** Signing out: this phone shouldn't get the next customer's messages. Best effort. */
export async function unregisterPush(): Promise<void> {
  const token = await getItem(TOKEN_KEY);
  if (!token) return;
  try {
    await api.delete("/notifications/devices", { body: { token } });
  } catch {
    // Offline at sign-out: the token moves to whoever signs in next, or the push service retires it.
  }
  await deleteItem(TOKEN_KEY);
}
