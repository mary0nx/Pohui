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
