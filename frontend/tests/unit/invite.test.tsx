import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "@/app/App";
import { inviteCode } from "@/app/session";
import { setToken } from "@/lib/session";

import { dashboard, family, FAMILY_ID, me, meta, mockFetch } from "./helpers";

const pending = { id: "inv-1", family_name: "Family", inviter_name: "Alex", expires_at: "2026-10-28T15:14:00Z", already_member: false };

describe("joining a partner's family", () => {
  it("finds the code in a pasted link or text", () => {
    expect(inviteCode("https://t.me/pohui_family_bot/app?startapp=inv_AbC-123_xyz456")).toBe("inv_AbC-123_xyz456");
    expect(inviteCode("Присоединяйся: https://t.me/pohui_family_bot?start=inv_AbC-123_xyz456 ")).toBe("inv_AbC-123_xyz456");
    expect(inviteCode("inv_short")).toBeNull();
    expect(inviteCode("https://t.me/pohui_family_bot")).toBeNull();
  });

  it("offers the invitation remembered by the bot even when the app opens without it", async () => {
    setToken("tok");
    let current: Record<string, unknown> = { ...me(false), families: [{ family_id: "own", name: "Наша семья транжиры", role: "owner", currency: "PLN", timezone: "Europe/Warsaw" }], active_family_id: "own", pending_invitation: pending };
    const m = mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, handler: () => current },
      {
        method: "POST",
        path: /\/invitations\/pending\/accept$/,
        handler: () => {
          current = { ...me(), pending_invitation: null };
          return family;
        },
      },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
      { path: /\/dashboard$/, body: dashboard() },
      { path: /\/tasks$/, body: [] },
    ]);
    render(<App />);
    expect(await screen.findByText("Alex приглашает вас")).toBeInTheDocument();
    expect(screen.getByText("«Family»")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Присоединиться" }));
    await waitFor(() => expect(m.calls.some((c) => c.method === "POST" && c.url.pathname.endsWith("/invitations/pending/accept"))).toBe(true));
    expect(await screen.findByText(/Добр/)).toBeInTheDocument();
  });

  it("“Не сейчас” forgets the remembered invitation on the server", async () => {
    setToken("tok");
    let current: Record<string, unknown> = { ...me(), pending_invitation: pending };
    const m = mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, handler: () => current },
      {
        method: "POST",
        path: /\/invitations\/pending\/dismiss$/,
        status: 204,
        handler: () => {
          current = { ...me(), pending_invitation: null };
          return null;
        },
      },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
      { path: /\/dashboard$/, body: dashboard() },
      { path: /\/tasks$/, body: [] },
    ]);
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Не сейчас" }));
    expect(await screen.findByText(/Добр/)).toBeInTheDocument();
    expect(m.calls.some((c) => c.url.pathname.endsWith("/invitations/pending/dismiss"))).toBe(true);
  });

  it("a pasted link on the “create family” screen opens the invitation instead", async () => {
    setToken("tok");
    const m = mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, body: me(false) },
      { method: "POST", path: /\/invitations\/preview$/, body: { family_name: "Family", inviter_name: "Alex", expires_at: "2026-10-28T15:14:00Z", already_member: false } },
    ]);
    render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Ссылка или код приглашения"), "просто текст");
    await user.click(screen.getByRole("button", { name: "Присоединиться по приглашению" }));
    expect(screen.getByText(/нет кода приглашения/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Ссылка или код приглашения"));
    await user.type(screen.getByLabelText("Ссылка или код приглашения"), "https://t.me/pohui_family_bot/app?startapp=inv_AbC-123_xyz456");
    await user.click(screen.getByRole("button", { name: "Присоединиться по приглашению" }));
    expect(await screen.findByText("«Family»")).toBeInTheDocument();
    expect(m.calls.find((c) => c.url.pathname.endsWith("/invitations/preview"))!.body).toEqual({ token: "inv_AbC-123_xyz456" });
  });
});
