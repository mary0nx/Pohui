/**
 * Runtime checks for the responses the app cannot start without. TypeScript types are erased
 * at runtime, so a wrong or foreign response (e.g. a static host's index.html, an old backend)
 * would otherwise surface later as "undefined is not an object".
 */
import { z } from "zod";

import type { Me, Meta, TokenOut } from "@/types/api";

import { apiBaseUrl, ApiError, INVALID_RESPONSE } from "./client";

const MetaSchema = z.object({
  env: z.string(),
  dev_auth: z.boolean(),
  ai_available: z.boolean(),
  bot_username: z.string().nullable(),
  storage: z.string(),
  max_upload_mb: z.number(),
  // Older servers do not send it; they had no ephemeral-disk check, so uploads were allowed.
  uploads_enabled: z.boolean().default(true),
});

const MeSchema = z.object({
  user: z.object({ id: z.string(), telegram_id: z.number(), first_name: z.string() }),
  families: z.array(z.object({ family_id: z.string(), name: z.string(), role: z.string() })),
  active_family_id: z.string().nullable(),
  auth_method: z.string(),
});

const TokenOutSchema = z.object({
  token: z.string().min(1),
  expires_at: z.string(),
  start_param: z.string().nullable().optional(),
  me: MeSchema,
});

function check<T>(schema: z.ZodType, data: unknown, endpoint: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = result.error.issues
      .slice(0, 3)
      .map((i) => i.path.join(".") || "(весь ответ)")
      .join(", ");
    throw new ApiError(
      200,
      INVALID_RESPONSE,
      `Ответ ${endpoint} от ${apiBaseUrl()} не соответствует ожидаемому формату (поля: ${fields}). Проверьте, что frontend и backend одной версии.`,
    );
  }
  // Return the original object: validation only, no silent stripping of extra fields.
  return data as T;
}

export const parseMeta = (data: unknown): Meta => check<Meta>(MetaSchema, data, "/meta");
export const parseMe = (data: unknown): Me => check<Me>(MeSchema, data, "/me");
export const parseTokenOut = (data: unknown, endpoint: string): TokenOut => check<TokenOut>(TokenOutSchema, data, endpoint);
