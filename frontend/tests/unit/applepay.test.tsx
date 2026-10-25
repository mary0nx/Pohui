import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "@/app/App";
import { router } from "@/app/routes";
import { setToken } from "@/lib/session";

import { family, FAMILY_ID, me, meta, mockFetch } from "./helpers";

afterEach(async () => {
  await act(() => router.navigate("/"));
});

describe("Apple Pay settings", () => {
  it("creates a key and shows the address and header for Shortcuts", async () => {
    await act(() => router.navigate("/profile/apple-pay"));
    setToken("tok");
    const hook = "https://api.familyos.test/api/v1/hooks/apple-pay";
    const m = mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, body: me() },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
      { path: /\/finance\/accounts$/, body: [{ id: "a1", name: "Общий", kind: "card", currency: "PLN", initial_balance: "0", balance: "0", visibility: "family", created_by: "u1", archived_at: null }] },
      { path: /\/integrations\/apple-pay$/, body: { connected: false, token_prefix: null, account_id: null, last_used_at: null, hook_url: hook } },
      {
        method: "POST",
        path: /\/integrations\/apple-pay$/,
        body: { connected: true, token: "fos_secret-key", token_prefix: "fos_secr", account_id: null, last_used_at: null, hook_url: hook, sent_to_chat: false },
      },
    ]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Получить ключ — показать здесь" }));
    expect(await screen.findByText(hook)).toBeInTheDocument();
    expect(screen.getByText("Bearer fos_secret-key")).toBeInTheDocument();
    await waitFor(() => expect(m.calls.some((c) => c.method === "POST")).toBe(true));
    expect(m.calls.find((c) => c.method === "POST")!.body).toEqual({ account_id: null, send_to_chat: false });
    expect(screen.getByText(/Триггер «Транзакция»/)).toBeInTheDocument();
  });
});
