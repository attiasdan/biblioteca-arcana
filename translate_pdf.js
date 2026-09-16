"use strict";

const { rgb } = require("pdf-lib");

const DEFAULT_API_URL = "https://api.mymemory.translated.net/get";
const CHUNK_CHARS = 1800;
const MYMEMORY_CHUNK_CAP = 450;
const TRANSLATION_TIMEOUT_MS = 30000;
const TRANSLATION_CONCURRENCY = 8;
const MYMEMORY_CONCURRENCY = 2;
const TRANSLATION_ATTEMPTS = 3;
const FONT_FILES = {
  dejavu: "DejaVuSans.ttf",
  notoCjk: "NotoSansCJKsc-Regular.otf"
};
const CJK_TARGETS = new Set(["ja", "zh", "zh-cn", "zh-tw", "zh-hans", "zh-hant"]);

let _pdfjs = null;

async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  const originalWarn = typeof console !== "undefined" && console.warn ? console.warn.bind(console) : null;
  if (originalWarn) console.warn = function () {};
  try {
    _pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (!globalThis.pdfjsWorker) {
      globalThis.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    }
  } finally {
    if (originalWarn) console.warn = originalWarn;
  }
  return _pdfjs;
}

function businessError(message) {
  const error = new Error(message);
  error.statusCode = 422;
  return error;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isMyMemory(apiUrl) {
  return String(apiUrl || "").includes("mymemory.translated.net");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeEntities(value) {
  return String(value)
    .replace(/&#(\d+);/g, (match, code) => {
      const number = Number(code);
      return Number.isFinite(number) ? String.fromCodePoint(number) : match;
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => {
      const number = parseInt(code, 16);
      return Number.isFinite(number) ? String.fromCodePoint(number) : match;
    })
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function mymemoryLang(code) {
  const base = String(code || "").toLowerCase().split("-")[0];
  return base === "zh" ? "zh-CN" : base;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || TRANSLATION_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function myMemoryRequest(text, source, target, apiUrl, email) {
  const params = new URLSearchParams();
  params.set("q", text);
  params.set("langpair", `${mymemoryLang(source)}|${mymemoryLang(target)}`);
  if (email) params.set("de", email);
  const separator = apiUrl.includes("?") ? "&" : "?";
  const response = await fetchWithTimeout(
    `${apiUrl}${separator}${params.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "BibliotecaArcana/1.0"
      }
    }
  );
  const payload = await response.json().catch(() => null);
  const translated = payload && payload.responseData ? payload.responseData.translatedText : "";
  const status = String((payload && payload.responseStatus) || response.status);
  const message = decodeEntities(String(translated || ""));
  if (/MYMEMORY WARNING|used all available free translations/i.test(message)) {
    const error = new Error(
      "A cota gratuita diária do MyMemory foi atingida. Aguarde até amanhã ou configure TRANSLATION_API_URL com outro backend."
    );
    error.statusCode = 429;
    throw error;
  }
  if (/QUERY LENGTH LIMIT EXCEEDED/i.test(message)) {
    const error = new Error("O MyMemory rejeitou um trecho muito longo.");
    error.statusCode = 422;
    throw error;
  }
  if (!message || status !== "200") {
    throw new Error("O serviço MyMemory não retornou uma tradução válida.");
  }
  return message;
}

async function libreTranslateRequest(text, source, target, apiUrl, apiKey) {
  const body = { q: text, source, target, format: "text" };
  if (apiKey) body.api_key = apiKey;
  const response = await fetchWithTimeout(
    apiUrl,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "BibliotecaArcana/1.0"
      },
      body: JSON.stringify(body)
    }
  );
  const payload = await response.json().catch(() => null);
  const result = payload && (payload.translatedText || payload.translation);
  if (!result) {
    throw new Error("O serviço de tradução não retornou translatedText.");
  }
  return String(result);
}

async function cloudflareAiRequest(text, source, target, ai) {
  const payload = await ai.run("@cf/meta/m2m100-1.2b", {
    text,
    source_lang: source,
    target_lang: target
  });
  const translated = payload && (
    payload.translated_text ||
    payload.translatedText ||
    payload.translation ||
    payload.text
  );
  if (!translated) {
    throw new Error("O Workers AI não retornou uma tradução válida.");
  }
  return String(translated);
}

async function translationRequest(text, source, target, apiUrl, apiKey, email, ai) {
  if (source === target) return text;
  let lastError = null;
  for (let attempt = 0; attempt < TRANSLATION_ATTEMPTS; attempt++) {
    try {
      if (ai && typeof ai.run === "function") {
        return await cloudflareAiRequest(text, source, target, ai);
      }
      if (isMyMemory(apiUrl)) return await myMemoryRequest(text, source, target, apiUrl, email);
      return await libreTranslateRequest(text, source, target, apiUrl, apiKey);
    } catch (error) {
      lastError = error;
      if (error && error.statusCode === 429) throw error;
      if (attempt + 1 < TRANSLATION_ATTEMPTS) await sleep(400 * (attempt + 1));
    }
  }
  const error = new Error(`Falha no serviço de tradução: ${lastError ? lastError.message : "sem resposta"}`);
  error.statusCode = 502;
  throw error;
}

function normBatchOut(value) {
  const decoded = decodeEntities(String(value || ""));
  return normalizeText(decoded);
}

async function translateBatch(lines, source, target, apiUrl, apiKey, email, ai) {
  const joined = lines.join("\n");
  const translated = await translationRequest(joined, source, target, apiUrl, apiKey, email, ai);
  const translatedLines = String(translated).split(/\r?\n/);
  if (translatedLines.length === lines.length) {
    const result = {};
    for (let index = 0; index < lines.length; index++) {
      result[lines[index]] = normBatchOut(translatedLines[index]) || lines[index];
    }
    return result;
  }
  const error = new Error("batch line count mismatch");
  error.needSplit = true;
  error.foldsLines = !/\r?\n/.test(String(translated));
  throw error;
}

async function translateLines(texts, source, target, apiUrl, apiKey, email, options = {}) {
  const unique = [];
  const seen = new Set();
  for (const text of texts) {
    if (!seen.has(text)) {
      seen.add(text);
      unique.push(text);
    }
  }
  if (source === target) {
    const identity = {};
    for (const text of unique) identity[text] = text;
    return identity;
  }

  const requestedChunkChars = Number(options.chunkChars || CHUNK_CHARS);
  const cap = isMyMemory(apiUrl)
    ? Math.min(requestedChunkChars, MYMEMORY_CHUNK_CAP)
    : requestedChunkChars;
  const allLines = [];
  let current = [];
  let currentSize = 0;
  for (const text of unique) {
    const extra = text.length + (current.length ? 1 : 0);
    if (current.length && currentSize + extra > cap) {
      allLines.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(text);
    currentSize += extra;
  }
  if (current.length) allLines.push(current);

  const requestedConcurrency = Math.max(1, Number(options.concurrency || TRANSLATION_CONCURRENCY));
  const concurrency = isMyMemory(apiUrl)
    ? Math.min(requestedConcurrency, MYMEMORY_CONCURRENCY)
    : requestedConcurrency;
  const translations = {};
  const queue = [...allLines];
  let nextBatchIndex = 0;
  let folding = false;

  async function worker() {
    while (nextBatchIndex < queue.length) {
      const lines = queue[nextBatchIndex++];
      let pending = true;
      while (pending) {
        try {
          const result = await translateBatch(lines, source, target, apiUrl, apiKey, email, options.ai);
          Object.assign(translations, result);
          pending = false;
        } catch (error) {
          if (!(error && error.needSplit)) throw error;
          if (error.foldsLines) folding = true;
          if (lines.length === 1) {
            translations[lines[0]] = lines[0];
            pending = false;
          } else if (folding) {
            for (const line of lines) queue.push([line]);
            pending = false;
          } else {
            const middle = lines.length >> 1;
            queue.push(lines.slice(0, middle));
            queue.push(lines.slice(middle));
            pending = false;
          }
        }
      }
    }
  }

  const workers = [];
  for (let index = 0; index < concurrency; index++) workers.push(worker());
  await Promise.all(workers);
  return translations;
}

const HAN_CHARS = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u{20000}-\u{2ffff}]/u;
const KANA_CHARS = /[\u3040-\u30ff]/;
const CYRILLIC_CHARS = /[\u0400-\u04ff]/;

const LANGUAGE_WORDS = {
  pt: ["de", "que", "o", "a", "do", "da", "em", "uma", "os", "as", "para", "com", "é", "não", "um"],
  es: ["el", "la", "los", "las", "y", "es", "un", "una", "de", "que", "en", "para", "del", "al", "como", "no"],
  fr: ["le", "la", "les", "des", "du", "et", "est", "un", "une", "en", "pour", "dans", "que", "pas", "au"],
  de: ["der", "die", "das", "und", "ist", "ein", "eine", "den", "in", "zu", "von", "auf", "für", "mit", "nicht"],
  it: ["il", "lo", "la", "le", "gli", "di", "che", "e", "in", "un", "una", "per", "non", "con", "da", "è"],
  en: ["the", "and", "of", "to", "in", "is", "that", "for", "it", "with", "was", "are", "as", "this", "on"]
};

function detectLanguage(text) {
  const sample = normalizeText(text).slice(0, 600);
  if (!sample) return "pt";
  if (KANA_CHARS.test(sample)) return "ja";
  if (HAN_CHARS.test(sample)) return "zh";
  if (CYRILLIC_CHARS.test(sample)) return "ru";
  if (/[ãõç]/.test(sample)) return "pt";
  if (/[ñ¿¡]/.test(sample)) return "es";
  const lower = " " + sample.toLowerCase() + " ";
  const scores = {};
  let best = "pt";
  let bestScore = 0;
  for (const [language, words] of Object.entries(LANGUAGE_WORDS)) {
    let score = 0;
    for (const word of words) {
      const matches = lower.match(new RegExp(`\\b${word}\\b`, "g"));
      if (matches) score += matches.length;
    }
    scores[language] = score;
    if (score > bestScore) {
      bestScore = score;
      best = language;
    }
  }
  if (bestScore === 0) return "pt";
  return best;
}

function finishLine(accumulator) {
  const line = accumulator;
  return {
    text: normalizeText(line.texts.join(" ")),
    x0: line.x0,
    x1: line.x1,
    top: line.top,
    bottom: line.bottom,
    size: line.count ? line.size / line.count : 10
  };
}

async function extractPages(pdfBuffer, limits) {
  const pdfjs = await getPdfjs();
  const originalWarn = typeof console !== "undefined" && console.warn ? console.warn.bind(console) : null;
  let documentProxy;
  try {
    if (originalWarn) console.warn = function () {};
    documentProxy = await pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: false,
      verbosity: 0
    }).promise;
  } catch (error) {
    const enhanced = new Error(`Não foi possível ler o PDF: ${error && error.message ? error.message : "arquivo inválido ou protegido"}`);
    enhanced.statusCode = 422;
    throw enhanced;
  } finally {
    if (originalWarn) console.warn = originalWarn;
  }

  try {
    const pages = [];
    let totalChars = 0;
    const amount = documentProxy.numPages;
    for (let index = 1; index <= amount; index++) {
      if (limits.maxPages > 0 && index > limits.maxPages) {
        throw businessError(`O PDF excede o limite de ${limits.maxPages} páginas para uma tradução.`);
      }
      const page = await documentProxy.getPage(index);
      const viewport = page.getViewport({ scale: 1 });
      const width = viewport.width;
      const height = viewport.height;
      const content = await page.getTextContent();
      const lines = [];
      let accumulator = null;
      for (const item of content.items) {
        if (!item || typeof item.str !== "string" || !item.str) continue;
        const text = normalizeText(item.str);
        if (!text) continue;
        const transform = item.transform || [1, 0, 0, 1, 0, 0];
        const x0 = transform[4];
        const yBaseline = transform[5];
        if (!accumulator) {
          accumulator = { texts: [], x0: Infinity, x1: -Infinity, top: -Infinity, bottom: Infinity, size: 0, count: 0 };
        }
        const itemHeight = Number(item.height) || 0;
        accumulator.texts.push(text);
        accumulator.x0 = Math.min(accumulator.x0, x0);
        accumulator.x1 = Math.max(accumulator.x1, x0 + (Number(item.width) || 0));
        accumulator.top = Math.max(accumulator.top, yBaseline + itemHeight);
        accumulator.bottom = Math.min(accumulator.bottom, yBaseline);
        accumulator.size += itemHeight;
        accumulator.count += 1;
        if (item.hasEOL) {
          lines.push(finishLine(accumulator));
          accumulator = null;
        }
      }
      if (accumulator) lines.push(finishLine(accumulator));

      const pageLines = [];
      for (const line of lines) {
        if (!line.text) continue;
        totalChars += line.text.length;
        pageLines.push({
          text: line.text,
          x0: line.x0,
          x1: line.x1,
          top: height - line.top,
          bottom: height - line.bottom,
          size: line.size
        });
      }
      pages.push({ width, height, lines: pageLines, pageNumber: index });
    }

    if (totalChars === 0) {
      throw businessError(
        "Este PDF não possui camada de texto extraível. Faça OCR no arquivo antes de traduzi-lo."
      );
    }
    if (limits.maxChars > 0 && totalChars > limits.maxChars) {
      throw businessError(`O PDF excede o limite de ${limits.maxChars} caracteres para uma tradução.`);
    }
    return { pages, totalChars };
  } catch (error) {
    if (error && error.statusCode) throw error;
    const enhanced = new Error(`Não foi possível extrair o texto do PDF: ${error && error.message ? error.message : "erro desconhecido"}`);
    enhanced.statusCode = 422;
    throw enhanced;
  } finally {
    try {
      documentProxy.destroy && documentProxy.destroy();
    } catch {
      // Best effort.
    }
  }
}

function fitText(page, font, text, x, y, boxWidth, size) {
  const finalSize = Math.max(6.0, Math.min(24.0, Number(size) || 10));
  const measured = font.widthOfTextAtSize(text, finalSize);
  if (measured > boxWidth && measured > 0) {
    const scale = Math.max(0.55, Math.min(1.0, boxWidth / measured));
    page.drawText(text, { x, y, size: finalSize, font, xScale: scale, color: rgb(0.08, 0.08, 0.08) });
    return;
  }
  page.drawText(text, { x, y, size: finalSize, font, color: rgb(0.08, 0.08, 0.08) });
}

async function buildOverlays(pdfDocument, pages, translations, font) {
  for (const pageInfo of pages) {
    const page = pdfDocument.getPage(pageInfo.pageNumber - 1);
    const pageHeight = pageInfo.height;
    for (const line of pageInfo.lines) {
      const translated = translations[line.text] || line.text;
      if (!translated) continue;
      const x = Math.max(0, line.x0 - 1);
      const yTopPdf = pageHeight - line.top;
      const yBottomPdf = pageHeight - line.bottom;
      const boxWidth = Math.max(8, line.x1 - line.x0 + 2);
      const boxHeight = Math.max(7, yTopPdf - yBottomPdf + 3);
      page.drawRectangle({
        x,
        y: yBottomPdf - 1,
        width: boxWidth,
        height: boxHeight,
        color: rgb(1, 1, 1)
      });
      fitText(
        page,
        font,
        translated,
        line.x0,
        Math.max(1, yBottomPdf + 0.5),
        Math.max(8, line.x1 - line.x0),
        Math.min(line.size, Math.max(6, boxHeight * 0.9))
      );
    }
  }
}

async function translatePdf(pdfBuffer, source, target, options) {
  const settings = options || {};
  const apiUrl = settings.apiUrl || DEFAULT_API_URL;
  const apiKey = settings.apiKey || "";
  const email = settings.email || "";
  const limits = {
    maxPages: Number(settings.maxPages || 0),
    maxChars: Number(settings.maxChars || 0)
  };

  if (!source || !target || source === target) {
    const error = new Error("O idioma de origem e o idioma de destino precisam ser diferentes.");
    error.statusCode = 400;
    throw error;
  }

  let effectiveSource = source;
  const { pages, totalChars } = await extractPages(pdfBuffer, limits);
  if (effectiveSource === "auto") {
    const sample = pages
      .slice(0, 3)
      .map((page) => page.lines.map((line) => line.text).join(" "))
      .join(" ");
    effectiveSource = detectLanguage(sample);
  }

  const texts = [];
  for (const page of pages) {
    for (const line of page.lines) texts.push(line.text);
  }
  const translations = await translateLines(texts, effectiveSource, target, apiUrl, apiKey, email, {
    chunkChars: settings.chunkChars,
    concurrency: settings.concurrency,
    ai: settings.ai
  });

  const { PDFDocument } = require("pdf-lib");
  const fontkit = require("@pdf-lib/fontkit");
  let pdfDocument;
  try {
    pdfDocument = await PDFDocument.load(pdfBuffer);
  } catch (error) {
    const enhanced = new Error(`Não foi possível processar o PDF: ${error && error.message ? error.message : "arquivo inválido"}`);
    enhanced.statusCode = 422;
    throw enhanced;
  }
  pdfDocument.registerFontkit(fontkit);

  const needsCjk = CJK_TARGETS.has(String(target).toLowerCase());
  const fontName = needsCjk ? "notoCjk" : "dejavu";
  const fontBytes = settings.loadFont ? await settings.loadFont(fontName) : null;
  if (!fontBytes) {
    const error = new Error("Não foi possível carregar a fonte de tradução.");
    error.statusCode = 500;
    throw error;
  }
  const font = await pdfDocument.embedFont(fontBytes, { subset: true });

  await buildOverlays(pdfDocument, pages, translations, font);

  pdfDocument.setTitle("PDF traduzido - Biblioteca Arcana");
  pdfDocument.setSubject(`Tradução ${effectiveSource} para ${target}`);
  pdfDocument.setProducer("Biblioteca Arcana");

  const bytes = await pdfDocument.save();
  return {
    buffer: bytes,
    pages: pages.length,
    characters: totalChars,
    source: effectiveSource
  };
}

module.exports = { translatePdf, detectLanguage, FONT_FILES, DEFAULT_API_URL };
