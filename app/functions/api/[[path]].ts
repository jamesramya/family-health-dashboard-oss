// Cloudflare Pages Function — proxies /api/* requests to the API Worker.
// Keeps everything same-domain so auth cookies work without SameSite=None.
//
// Required Pages environment variable:
//   API_URL = https://family-health-dashboard-api-staging.<subdomain>.workers.dev
//             (set in Cloudflare Pages project → Settings → Environment Variables)

interface Env {
  API_URL: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const path = ((params.path as string[]) ?? []).join("/");
  const url = new URL(request.url);
  const targetUrl = `${env.API_URL}/api/${path}${url.search}`;

  const workerRes = await fetch(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body ?? undefined,
    redirect: "follow",
  });

  // Cloudflare's Headers object deduplicates Set-Cookie when proxying; rebuild
  // the response so both access_token and refresh_token cookies reach the browser.
  const cookies = (workerRes.headers as unknown as { getAll(name: string): string[] }).getAll("Set-Cookie");
  const res = new Response(workerRes.body, {
    status: workerRes.status,
    statusText: workerRes.statusText,
    headers: workerRes.headers,
  });
  res.headers.delete("Set-Cookie");
  for (const c of cookies) res.headers.append("Set-Cookie", c);
  return res;
};
