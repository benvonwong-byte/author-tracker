// Serves authors.dearcrisis.com from the GitHub Pages site. GitHub Actions still
// builds and publishes everything; this only forwards requests, because the
// Cloudflare login this project has can attach a domain to a Worker but cannot
// edit DNS records. See HANDOFF.md for how to replace it with a plain CNAME.
const ORIGIN = "https://benvonwong-byte.github.io/author-tracker";

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const url = new URL(request.url);
    if (url.protocol === "http:") {
      url.protocol = "https:";
      return Response.redirect(url.href, 301);
    }
    const upstream = await fetch(ORIGIN + url.pathname + url.search, {
      method: request.method,
      headers: { Accept: request.headers.get("Accept") ?? "*/*" },
      // Five minutes for a good answer. A failure is never cached.
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 300, "300-599": 0 } },
    });
    return new Response(upstream.body, upstream);
  },
};
