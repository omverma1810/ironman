/**
 * What the app remembers about where this customer is served, so a returning
 * customer doesn't re-enter their pincode: the area (hub and cluster) that the
 * serviceability check returned. Stored on the device only.
 */
import { getItem, setItem } from "./storage";

const KEY = "ironman.servicearea";

export type ServiceArea = {
  pincode: string;
  hubId: string;
  hubName: string;
  clusterId: string | null;
};

export async function loadServiceArea(): Promise<ServiceArea | null> {
  const raw = await getItem(KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ServiceArea>;
    if (value.pincode && value.hubId) return value as ServiceArea;
  } catch {
    // fall through: a corrupt entry is the same as none
  }
  return null;
}

export async function saveServiceArea(area: ServiceArea): Promise<void> {
  await setItem(KEY, JSON.stringify(area));
}
