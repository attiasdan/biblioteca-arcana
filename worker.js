import server from "./server.js";

const API_PATHS = new Set(["/api/search", "/api/sources", "/api/stats", "/api/translate-pdf", "/api/translate-pdf-url"]);

function callHandler(requestUrl, request, env) {
  return new Promise((resolve) => {
    const adapter = {
      status: 200,
      headers: {},
      writeHead(status, headers) {
        this.status = status;
        Object.assign(this.headers, headers || {});
      },
      end(body) {
        resolve(new Response(body, { status: this.status, headers: this.headers }));
      }
    };
    server.handleRequest(requestUrl, adapter, request, { env }).catch(() => {
      resolve(
        new Response(JSON.stringify({ error: "Erro interno no buscador." }), {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        })
      );
    });
  });
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    if (API_PATHS.has(requestUrl.pathname)) {
      return callHandler(requestUrl, request, env);
    }
    if (env && env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }
    return new Response("Assets não configurados.", { status: 503 });
  }
};
