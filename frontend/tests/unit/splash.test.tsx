import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Splash } from "@/features/onboarding/Gate";

describe("start-up screen", () => {
  it("shows the loading status and the family illustration as decoration", () => {
    const { container } = render(<Splash />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Загружаем ваше семейное пространство…",
    );
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("decoding", "async");
    expect(img.getAttribute("src")).toMatch(/family-splash/);
  });
});
