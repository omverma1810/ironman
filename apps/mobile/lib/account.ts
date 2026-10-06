import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { formatMoneyMinor } from "./format";
import type { MyReferral, NotificationChannel, NotificationPref } from "./types";

export const PUBLIC_SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? "https://ironmanindia.co";

/** The customer's referral code and what it has earned. A customer with no
 * order yet has no code, and the API answers 404: that is "nothing to show". */
export function useMyReferral() {
  return useQuery({
    queryKey: ["my-referral"],
    queryFn: () => api.get<MyReferral>("/growth/my-referral"),
    retry: false,
  });
}

export function referralMessage(referral: MyReferral): string {
  const gets = referral.referee_reward_minor > 0 ? ` and get ${formatMoneyMinor(referral.referee_reward_minor)} off` : "";
  return (
    `I use IronMan for ironing, with pickup and delivery at my door. ` +
    `Book with my code ${referral.code}${gets}: ${PUBLIC_SITE_URL}/book?ref=${referral.code}`
  );
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: ["notification-prefs"],
    queryFn: () => api.get<NotificationPref[]>("/notifications/preferences"),
    retry: false,
  });
}

export function useSetNotificationPref() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pref: { channel: NotificationChannel; opted_in: boolean }) =>
      api.patch<NotificationPref[]>("/notifications/preferences", pref),
    // Flip the switch at once; put it back if the server says no.
    onMutate: async (pref) => {
      await queryClient.cancelQueries({ queryKey: ["notification-prefs"] });
      const before = queryClient.getQueryData<NotificationPref[]>(["notification-prefs"]);
      queryClient.setQueryData<NotificationPref[]>(["notification-prefs"], (rows) =>
        rows?.map((row) => (row.channel === pref.channel ? { ...row, opted_in: pref.opted_in } : row))
      );
      return { before };
    },
    onError: (_err, _pref, context) => {
      if (context?.before) queryClient.setQueryData(["notification-prefs"], context.before);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notification-prefs"] }),
  });
}

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  WHATSAPP: "WhatsApp",
  SMS: "Text messages",
  EMAIL: "Email",
  PUSH: "App notifications",
};
