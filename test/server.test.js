"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const server = require("../server.js");

const fontPath = path.join(__dirname, "..", "public", "fonts", "DejaVuSans.ttf");

function call(url, request, runtime = {}) {
  return new Promise((resolve, reject) => {
    const response = {
      status: 200,
      headers: {},
      writeHead(status, headers) {
        this.status = status;
        Object.assign(this.headers, headers || {});
      },
      end(body) {
        resolve({ status: this.status, headers: this.headers, body: Buffer.from(body || "") });
      }
    };
    server.handleRequest(new URL(url), response, request, runtime).catch(reject);
  });
}

async function makePdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([320, 180]);
  page.drawText("The book is on the table.", { x: 20, y: 120, size: 12 });
  return Buffer.from(await document.save());
}

test("recusa corpo que não seja PDF", async () => {
  const request = new Request("http://localhost/api/translate-pdf?source=en&target=pt", {
    method: "POST",
    headers: { "content-type": "application/pdf" },
    body: "not a pdf"
  });
  const response = await call(request.url, request);
  assert.equal(response.status, 400);
  assert.match(response.body.toString("utf8"), /PDF válido/);
});

test("processa o endpoint de tradução sem Python", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    return new Response(JSON.stringify({
      translatedText: body.q.replace(/The book is on the table\./g, "O livro está sobre a mesa.")
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const input = await makePdf();
    const request = new Request("http://localhost/api/translate-pdf?source=en&target=pt", {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: input
    });
    const response = await call(request.url, request, {
      env: { TRANSLATION_API_URL: "https://translator.test/translate" }
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers["Content-Type"], "application/pdf");
    assert.equal(response.headers["X-PDF-Translation-Pages"], "1");
    assert.equal(response.body.subarray(0, 5).toString(), "%PDF-");
  } finally {
    global.fetch = originalFetch;
  }
});

test("carrega a fonte pelo binding de assets no runtime web", async () => {
  const font = await fs.readFile(fontPath);
  const requested = [];
  const assets = {
    async fetch(url) {
      requested.push(new URL(url).pathname);
      return new Response(font, { status: 200 });
    }
  };
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    return new Response(JSON.stringify({ translatedText: body.q }), { status: 200 });
  };

  try {
    const input = await makePdf();
    const request = new Request("http://localhost/api/translate-pdf?source=en&target=pt", {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: input
    });
    const response = await call(request.url, request, {
      env: { ASSETS: assets, TRANSLATION_API_URL: "https://translator.test/translate" }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(requested, ["/fonts/DejaVuSans.ttf"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("usa o binding Workers AI no endpoint hospedado", async () => {
  const aiCalls = [];
  const ai = {
    async run(model, input) {
      aiCalls.push({ model, input });
      return { translated_text: input.text };
    }
  };

  const input = await makePdf();
  const request = new Request("http://localhost/api/translate-pdf?source=en&target=pt", {
    method: "POST",
    headers: { "content-type": "application/pdf" },
    body: input
  });
  const response = await call(request.url, request, { env: { AI: ai } });

  assert.equal(response.status, 200);
  assert.equal(response.headers["Content-Type"], "application/pdf");
  assert.ok(aiCalls.length > 0);
  assert.equal(aiCalls[0].model, "@cf/meta/m2m100-1.2b");
});
