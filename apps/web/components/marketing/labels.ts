import type { GrowthChannelCode, SpendCategory } from "@/lib/api/types";

/** Channels a campaign can be run through — the paid/promotable ones. */
export const CAMPAIGN_CHANNELS: { value: GrowthChannelCode; label: string }[] = [
  { value: "FLYER", label: "Flyer" },
  { value: "INFLUENCER", label: "Influencer" },
  { value: "DIGITAL_AD", label: "Digital ad" },
  { value: "WATCHMAN", label: "Watchman" },
  { value: "CUSTOMER_REFERRAL", label: "Customer referral" },
  { value: "WHATSAPP", label: "WhatsApp" },
];

export const SPEND_CATEGORIES: { value: SpendCategory; label: string }[] = [
  { value: "PRINT", label: "Print & flyers" },
  { value: "INFLUENCER", label: "Influencer" },
  { value: "ADS", label: "Online ads" },
  { value: "INCENTIVE", label: "Incentives" },
  { value: "OTHER", label: "Other" },
];

/** The spend category a channel usually means, to pre-fill the form. */
export const DEFAULT_CATEGORY: Partial<Record<GrowthChannelCode, SpendCategory>> = {
  FLYER: "PRINT",
  INFLUENCER: "INFLUENCER",
  DIGITAL_AD: "ADS",
  WATCHMAN: "INCENTIVE",
  CUSTOMER_REFERRAL: "INCENTIVE",
};
