// Cloudflare Pages Function — proxies /oauth/* requests to the API Worker.
//
// GET /oauth/authorize is NOT proxied: it's the SPA consent page served by Pages (index.html).
// Proxying it would loop — the Worker validates params then 302s back to this same path,
// which re-enters this proxy, which calls the Worker again, forever.
// The SPA's OAuthConsent component validates via GET /api/oauth/authorize/info,
// and the Worker re-validates everything at POST /api/oauth/authorize/decision.
interface Env { API_URL: string; }
export const onRequest: PagesFunction<Env> = async ({ request, env, params, next }) => {
  const path = ((params.path as string[]) ?? []).join("/");

  if (path === "authorize") {
    return next();
  }

  const url = new URL(request.url);
  const targetUrl = `${env.API_URL}/oauth/${path}${url.search}`;
  return fetch(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body ?? undefined,
    redirect: "manual",
  });
};
