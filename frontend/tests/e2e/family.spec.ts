import { expect, test, type Browser, type Page } from "@playwright/test";

async function loginAs(browser: Browser, telegramId: string, name: string, path = "/"): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.getByText("Режим разработки.")).toBeVisible();
  await page.getByLabel("Telegram ID").fill(telegramId);
  await page.getByLabel("Имя").fill(name);
  await page.getByRole("button", { name: "Войти как тестовый пользователь" }).click();
  return page;
}

test("two partners share a family while private data stays private", async ({ browser }) => {
  // 1. A creates a family.
  const a = await loginAs(browser, "2001", "Анна");
  await expect(a.getByText("Создайте семейное пространство")).toBeVisible();
  await a.getByLabel("Название").fill("E2E семья");
  await a.getByRole("button", { name: "Создать" }).click();
  await expect(a.getByText(/^Бюджет · /)).toBeVisible();

  // Invitation.
  await a.goto("/profile");
  await a.getByRole("button", { name: "Пригласить участника" }).click();
  const code = (await a.locator(".font-mono").innerText()).trim();
  expect(code).toMatch(/^inv_/);

  // 2. B joins by invitation.
  const b = await loginAs(browser, "2002", "Павел", `/?invite=${code}`);
  await expect(b.getByText("«E2E семья»")).toBeVisible();
  await b.getByRole("button", { name: "Присоединиться" }).click();
  await expect(b.getByText(/^Бюджет · /)).toBeVisible();

  // 3. A records a shared expense; 4. B sees it.
  await a.goto("/");
  await a.getByRole("button", { name: "Расход" }).click();
  await a.getByLabel(/Сумма/).fill("64,20");
  await a.getByLabel("Описание").fill("Lidl");
  await a.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(a.getByText("Операция добавлена")).toBeVisible();
  await b.goto("/finance/transactions");
  await expect(b.getByText("Lidl")).toBeVisible();
  await expect(b.getByText("−64,20 PLN")).toBeVisible();

  // 5. A writes a private note; 6. B cannot see it.
  await a.goto("/home/life");
  await a.getByRole("button", { name: "Заметки" }).click();
  await a.getByRole("button", { name: "Добавить" }).click();
  await a.getByLabel("Название").fill("Секретный сюрприз");
  await a.getByRole("button", { name: "Сохранить" }).click();
  await expect(a.getByText("Секретный сюрприз")).toBeVisible();
  await b.goto("/home/life");
  await b.getByRole("button", { name: "Заметки" }).click();
  await expect(b.getByText("Пока пусто")).toBeVisible();
  await expect(b.getByText("Секретный сюрприз")).toHaveCount(0);

  // 7. A adds a shopping item; 8. B sees it (shared list syncs by polling).
  await a.goto("/home/shopping");
  await a.getByText("Продукты").first().click();
  await a.getByLabel("Новый товар").fill("кофе 2 шт");
  await a.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(a.getByText("Кофе")).toBeVisible();
  await b.goto("/home/shopping");
  await b.getByText("Продукты").first().click();
  await expect(b.getByText("Кофе")).toBeVisible();
  await b.getByRole("checkbox", { name: "Купить Кофе" }).click();
  await expect(a.getByText(/купил\(а\) Павел/)).toBeVisible({ timeout: 10_000 });

  // 9. A creates an event; B sees it in the calendar.
  await a.goto("/calendar?new=1");
  await a.getByLabel("Название").fill("Ужин у родителей");
  await a.getByRole("button", { name: "Сохранить" }).click();
  await expect(a.getByRole("heading", { name: "Ужин у родителей" })).toBeVisible();
  await b.goto("/calendar");
  await expect(b.getByText("Ужин у родителей")).toBeVisible();

  // No horizontal scrolling on a phone-sized screen.
  for (const page of [a, b]) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  }
});

test("another family cannot open shared data by URL", async ({ browser }) => {
  const eve = await loginAs(browser, "2666", "Ева");
  await eve.getByLabel("Название").fill("Чужие");
  await eve.getByRole("button", { name: "Создать" }).click();
  await expect(eve.getByText(/^Бюджет · /)).toBeVisible();
  const status = await eve.evaluate(async () => {
    const token = sessionStorage.getItem("familyos.session");
    const r = await fetch("/api/v1/families/00000000-0000-0000-0000-000000000000/dashboard", { headers: { Authorization: `Bearer ${token}` } });
    return r.status;
  });
  expect(status).toBe(404);
});
