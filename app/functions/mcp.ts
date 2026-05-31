// Cloudflare Pages Function — proxies /mcp requests to the API Worker.
// Forwards the Authorization header so Bearer token auth works unchanged.

interface Env {
  API_URL: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const targetUrl = `${env.API_URL}/mcp${url.search}`;

  return fetch(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body ?? undefined,
    redirect: "follow",
  });
};
