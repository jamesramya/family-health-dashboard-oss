// Cloudflare Pages Function — proxies /.well-known/* requests to the API Worker.
interface Env { API_URL: string; }
export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const name = ((params.name as string[]) ?? []).join("/");
  const url = new URL(request.url);
  const targetUrl = `${env.API_URL}/.well-known/${name}${url.search}`;
  return fetch(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body ?? undefined,
    redirect: "follow",
  });
};
