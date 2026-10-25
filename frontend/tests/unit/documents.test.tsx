import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "@/app/App";
import { router } from "@/app/routes";
import { setToken } from "@/lib/session";

import { family, FAMILY_ID, me, meta, mockFetch } from "./helpers";

afterEach(async () => {
  await act(() => router.navigate("/"));
});

function setup(uploadsEnabled: boolean | undefined) {
  setToken("tok");
  const m = meta();
  return mockFetch([
    { path: /\/meta$/, body: uploadsEnabled === undefined ? m : { ...m, uploads_enabled: uploadsEnabled } },
    { path: /\/me$/, body: me() },
    { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
    { path: /\/documents$/, body: [] },
  ]);
}

describe("documents storage", () => {
  it("explains that files cannot be attached while storage is not connected", async () => {
    await act(() => router.navigate("/home/documents"));
    setup(false);
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Добавить документ" }));
    expect(await screen.findByText(/Прикреплять файлы пока нельзя/)).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("offers the file picker when uploads are enabled (or the server is older)", async () => {
    await act(() => router.navigate("/home/documents"));
    setup(undefined);
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Добавить документ" }));
    expect(await screen.findByText(/PDF, JPEG, PNG/)).toBeInTheDocument();
    expect(screen.queryByText(/Прикреплять файлы пока нельзя/)).toBeNull();
  });
});

describe("link to a document", () => {
  const doc = {
    id: "d1", title: "Страховка авто", category: "insurance", document_date: null, expires_on: "2026-11-01", remind_days_before: 7, notes: null,
    visibility: "family", created_by: "u1", archived_at: null, has_file: true, original_filename: "polisa.pdf", size_bytes: 13, mime_type: "application/pdf",
    created_at: "2026-10-25T10:00:00Z", updated_at: "2026-10-25T10:00:00Z",
  };

  it("an expiry reminder's link opens the document's card; closing returns to the list", async () => {
    await act(() => router.navigate("/home/documents/d1"));
    setToken("tok");
    mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, body: me() },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
      { path: /\/documents$/, body: [doc] },
      { path: /\/documents\/d1$/, body: doc },
    ]);
    render(<App />);
    const card = await screen.findByRole("dialog");
    expect(card).toHaveTextContent("Страховка авто");
    expect(card).toHaveTextContent("polisa.pdf");
    await userEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(router.state.location.pathname).toBe("/home/documents");
  });

  it("a link to a missing document says so and shows the list", async () => {
    await act(() => router.navigate("/home/documents/gone"));
    setToken("tok");
    mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, body: me() },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
      { path: /\/documents$/, body: [] },
      { path: /\/documents\/gone$/, status: 404, body: { error: { code: "not_found", message: "Не найдено" } } },
    ]);
    render(<App />);
    expect(await screen.findByText("Документ не найден или к нему нет доступа")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
