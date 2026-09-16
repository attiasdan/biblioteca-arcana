"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument } = require("pdf-lib");
const { translatePdf, detectLanguage } = require("../translate_pdf.js");

const FONT_PATH = require("path").join(__dirname, "..", "public", "fonts", "DejaVuSans.ttf");
const fs = require("fs/promises");

async function makePdf(text = "The book is on the table.") {
  const document = await PDFDocument.create();
  const page = document.addPage([360, 220]);
  const font = await document.embedFont("Helvetica");
  page.drawText(text, { x: 32, y: 160, size: 14, font });
  return Buffer.from(await document.save());
}

function mockTranslator() {
  return async (_url, init) => {
    const body = JSON.parse(init.body);
    const translatedText = body.q
      .replace(/The book is on the table\./g, "O livro está sobre a mesa.")
      .replace(/The book is/g, "O livro está");
    return {
      ok: true,
      status: 200,
      async json() {
        return { translatedText };
      }
    };
  };
}

test("detecta idiomas comuns sem serviço externo", () => {
  assert.equal(detectLanguage("The book is on the table and this is a test."), "en");
  assert.equal(detectLanguage("O livro está sobre a mesa e não é novo."), "pt");
  assert.equal(detectLanguage("これは日本語の文章です。"), "ja");
});

test("traduz um PDF de texto e mantém a página", async () => {
  const originalFetch = global.fetch;
  global.fetch = mockTranslator();
  try {
    const input = await makePdf();
    const result = await translatePdf(input, "en", "pt", {
      apiUrl: "https://translator.test/translate",
      loadFont: (name) => name === "dejavu" ? fs.readFile(FONT_PATH) : Promise.reject(new Error("fonte inesperada"))
    });

    assert.equal(result.pages, 1);
    assert.ok(result.characters > 0);
    assert.equal(result.source, "en");
    assert.equal(Buffer.from(result.buffer).subarray(0, 5).toString(), "%PDF-");

    const translatedDocument = await PDFDocument.load(result.buffer);
    assert.equal(translatedDocument.getPageCount(), 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("detecta automaticamente o idioma antes de traduzir", async () => {
  const originalFetch = global.fetch;
  global.fetch = mockTranslator();
  try {
    const result = await translatePdf(await makePdf(), "auto", "pt", {
      apiUrl: "https://translator.test/translate",
      loadFont: () => fs.readFile(FONT_PATH)
    });
    assert.equal(result.source, "en");
  } finally {
    global.fetch = originalFetch;
  }
});

test("usa Workers AI quando o binding está disponível", async () => {
  const aiCalls = [];
  const ai = {
    async run(model, input) {
      aiCalls.push({ model, input });
      return {
        translated_text: input.text.replace(/The book is on the table\./g, "O livro está sobre a mesa.")
      };
    }
  };

  const result = await translatePdf(await makePdf(), "en", "pt", {
    ai,
    loadFont: () => fs.readFile(FONT_PATH)
  });

  assert.equal(result.source, "en");
  assert.equal(result.pages, 1);
  assert.equal(aiCalls[0].model, "@cf/meta/m2m100-1.2b");
  assert.equal(aiCalls[0].input.source_lang, "en");
  assert.equal(aiCalls[0].input.target_lang, "pt");
});
