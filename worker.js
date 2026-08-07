import server from "./server.js";

const API_PATHS = new Set(["/api/search", "/api/sources", "/api/stats"]);

function callHandler(requestUrl) {
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
    server.handleRequest(requestUrl, adapter).catch(() => {
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
  async fetch(request) {
    const requestUrl = new URL(request.url);
    if (API_PATHS.has(requestUrl.pathname)) {
      return callHandler(requestUrl);
    }
    return new Response("Não encontrado.", { status: 404 });
  }
};
