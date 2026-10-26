import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";

export type CareTone = "tender" | "romantic" | "friendly" | "short";

export interface CareSettings {
  enabled: boolean;
  configured: boolean;
  recipient_name: string | null;
  default_name: string;
  gender: "f" | "m";
  city: string;
  country: string | null;
  timezone: string;
  send_time: string;
  leave_time: string;
  days: number[];
  tone: CareTone;
  weather_tips: boolean;
  signature: string | null;
  next_send_at: string | null;
  telegram: { bot_started: boolean; bot_blocked: boolean; bot_link: string | null };
  push_devices: number;
}

export interface CareWeather {
  emoji: string;
  condition: string;
  leave_temp: string;
  temp_max: string;
  temp_min: string;
  line: string;
  tips: string;
  source: string;
}

export interface CarePreview {
  day: string;
  title: string;
  body: string;
  weather: CareWeather | null;
}

export const useCare = () => useQuery({ queryKey: ["care"], queryFn: () => api<CareSettings>("/me/care") });

/** Today's message; the server caches the forecast for 30 minutes. */
export const useCarePreview = (enabled = true) =>
  useQuery({ queryKey: ["care", "preview"], queryFn: () => api<CarePreview>("/me/care/preview"), enabled, staleTime: 10 * 60_000, retry: 1 });
