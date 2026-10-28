/** Whether a newer build of the app has been deployed than the one running now. */
export async function newVersionAvailable(): Promise<boolean> {
  const current = document
    .querySelector<HTMLScriptElement>(
      'script[type="module"][src*="/assets/index-"]',
    )
    ?.getAttribute("src");
  if (!current) return false; // dev server or tests: nothing to compare
  try {
    const html = await (await fetch("/", { cache: "no-store" })).text();
    const latest = html.match(/\/assets\/index-[\w-]+\.js/)?.[0];
    return Boolean(latest && !current.endsWith(latest));
  } catch {
    return false; // offline: keep the running version
  }
}
