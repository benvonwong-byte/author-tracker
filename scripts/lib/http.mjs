// One polite HTTP client for every fetcher. It says who it is. A site that
// answers 403 gets listed for checking by hand, not retried in disguise.

export const UA = "Mozilla/5.0 (compatible; authors.dearcrisis.com-calendar; +https://dearcrisis.com)";

export async function get(url, { accept = "*/*", timeout = 25000, headers = {} } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: accept, ...headers },
    signal: AbortSignal.timeout(timeout),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
