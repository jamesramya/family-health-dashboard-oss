// Cloudflare Pages Function — proxies /openapi.json to the API Worker.

interface Env {
  API_URL: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const targetUrl = `${env.API_URL}/openapi.json`;

  return fetch(targetUrl, {
    method: request.method,
    headers: request.headers,
    redirect: "follow",
  });
};
