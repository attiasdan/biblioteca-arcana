"use strict";

const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = typeof __dirname !== "undefined" ? path.join(__dirname, "public") : "public";

let fileSystem;
async function getFileSystem() {
  if (!fileSystem) fileSystem = require("fs/promises");
  return fileSystem;
}
const USER_AGENT =
  "BuscadorGlobalDeLivros/1.0 (+local educational catalog search)";
const PROVIDER_TIMEOUT_MS = 6000;
const INTERNET_ARCHIVE_TIMEOUT_MS = 7000;
const HTML_SEARCH_TIMEOUT_MS = 1500;
const HTML_DETAIL_TIMEOUT_MS = 2200;
const PDF_DISCOVERY_TIMEOUT_MS = 2400;
const HTML_CONCURRENCY = 6;
const PDF_TRANSLATION_MAX_BYTES = Number(process.env.PDF_TRANSLATION_MAX_BYTES || 200 * 1024 * 1024);
const PDF_TRANSLATION_API_URL =
  process.env.TRANSLATION_API_URL || "http://127.0.0.1:5000/translate";
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_CACHE_MAX_ENTRIES = 50;
const MAX_RESULTS = 36;
const SUPPORTED_LANGUAGES = {
  any: { label: "Todos os idiomas", codes: [] },
  pt: { label: "Português", codes: ["pt", "por", "portuguese"] },
  en: { label: "English", codes: ["en", "eng", "english"] },
  es: { label: "Español", codes: ["es", "spa", "spanish"] },
  fr: { label: "Français", codes: ["fr", "fra", "fre", "french"] },
  de: { label: "Deutsch", codes: ["de", "deu", "ger", "german"] },
  it: { label: "Italiano", codes: ["it", "ita", "italian"] }
};
const SEARCH_CACHE = new Map();
const SEARCH_IN_FLIGHT = new Map();

const TRUSTED_PDF_HOST_SUFFIXES = [
  "archive.org",
  "gutenberg.org",
  "planetebook.com",
  "dominiopublico.gov.br",
  "scielo.org",
  "doabooks.org",
  "oapen.org",
  "senado.leg.br",
  "usp.br",
  "ufsc.br",
  "fiocruz.br",
  "bn.gov.br",
  "gov.br",
  "edu.br",
  "instituto-camoes.pt",
  "openstax.org",
  "open.umn.edu",
  "wikisource.org",
  "wikibooks.org",
  "wikimedia.org",
  "arxiv.org",
  "zenodo.org",
  "core.ac.uk",
  "doaj.org",
  "standardebooks.org",
  "oercommons.org",
  "europeana.eu",
  "hathitrust.org",
  "oapen.org",
  "doabooks.org"
];

const PUBLIC_PDF_HINT_TOKENS = [
  "dominio publico",
  "dominio-publico",
  "public domain",
  "creative commons",
  "open access",
  "acesso aberto",
  "biblioteca digital",
  "repositorio",
  "scielo",
  "doab",
  "gutenberg"
];

const ORIGINAL_SITES = [
  "Planet eBook",
  "Free-eBooks.net",
  "ManyBooks",
  "LibriVox",
  "Internet Archive",
  "BookBub",
  "Open Library",
  "BookBoon",
  "Feedbooks",
  "Smashwords",
  "Project Gutenberg",
  "Google Books",
  "PDFBooksWorld",
  "FreeTechBooks",
  "Bookyards",
  "GetFreeEBooks",
  "eBookLobby",
  "FreeComputerBooks",
  "LibriVox",
  "ManyBooks"
];

const ADDITIONAL_SITES = [
  "Portal Dominio Publico",
  "Wikisource em português",
  "Wikilivros",
  "SciELO Livros",
  "DOAB",
  "Biblioteca Brasiliana Guita e José Mindlin",
  "Biblioteca Nacional Digital",
  "Biblioteca Digital do Senado Federal",
  "ARCA Fiocruz",
  "Luso Livros",
  "Biblioteca Digital Camões",
  "Literatura Brasileira UFSC",
  "Google filetype:pdf",
  "Bing filetype:pdf",
  "DuckDuckGo filetype:pdf",
  "Google Acadêmico",
  "OpenAlex",
  "Crossref",
  "arXiv",
  "OAPEN"
];

const HTML_SOURCES = [
  {
    id: "planet-ebook",
    name: "Planet eBook",
    baseUrl: "https://www.planetebook.com",
    searchUrl: (query) => `https://www.planetebook.com/?s=${encode(query)}`,
    access: "Public domain",
    pdfPolicy: "direct-public"
  },
  {
    id: "free-ebooks",
    name: "Free-eBooks.net",
    baseUrl: "https://www.free-ebooks.net",
    searchUrl: (query) => `https://www.free-ebooks.net/search/${encode(query)}`,
    access: "Free catalog",
    pdfPolicy: "source-only"
  },
  {
    id: "manybooks",
    name: "ManyBooks",
    baseUrl: "https://manybooks.net",
    searchUrl: (query) => `https://manybooks.net/search-book?search=${encode(query)}`,
    access: "Free catalog",
    pdfPolicy: "source-only"
  },
  {
    id: "bookbub",
    name: "BookBub",
    baseUrl: "https://www.bookbub.com",
    searchUrl: (query) => `https://www.bookbub.com/search?search=${encode(query)}`,
    access: "Deals and free offers",
    pdfPolicy: "source-only"
  },
  {
    id: "bookboon",
    name: "BookBoon",
    baseUrl: "https://bookboon.com",
    searchUrl: (query) => `https://bookboon.com/en/search?q=${encode(query)}`,
    access: "Free catalog",
    pdfPolicy: "source-only"
  },
  {
    id: "feedbooks",
    name: "Feedbooks",
    baseUrl: "https://www.feedbooks.com",
    searchUrl: (query) => `https://www.feedbooks.com/search?query=${encode(query)}`,
    access: "Public domain and store catalog",
    pdfPolicy: "source-only"
  },
  {
    id: "smashwords",
    name: "Smashwords",
    baseUrl: "https://www.smashwords.com",
    searchUrl: (query) =>
      `https://www.smashwords.com/books/search?query=${encode(query)}`,
    access: "Independent author catalog",
    pdfPolicy: "source-only"
  },
  {
    id: "pdfbooksworld",
    name: "PDFBooksWorld",
    baseUrl: "https://www.pdfbooksworld.com",
    searchUrl: (query) => `https://www.pdfbooksworld.com/gsearch.php?q=${encode(query)}`,
    access: "Public domain PDF catalog",
    pdfPolicy: "direct-public"
  },
  {
    id: "freetechbooks",
    name: "FreeTechBooks",
    baseUrl: "https://www.freetechbooks.com",
    searchUrl: (query) => `https://www.freetechbooks.com/search/?q=${encode(query)}`,
    access: "Free technical books",
    pdfPolicy: "direct-public"
  },
  {
    id: "bookyards",
    name: "Bookyards",
    baseUrl: "https://www.bookyards.com",
    searchUrl: (query) => `https://www.bookyards.com/en/search?query=${encode(query)}`,
    access: "Free catalog",
    pdfPolicy: "source-only"
  },
  {
    id: "getfreeebooks",
    name: "GetFreeEBooks",
    baseUrl: "https://www.getfreeebooks.com",
    searchUrl: (query) => `https://www.getfreeebooks.com/?s=${encode(query)}`,
    access: "Free ebook posts",
    pdfPolicy: "source-only"
  },
  {
    id: "ebooklobby",
    name: "eBookLobby",
    baseUrl: "https://www.ebooklobby.com",
    searchUrl: (query) =>
      `https://www.ebooklobby.com/search/default.aspx?q=${encode(query)}`,
    access: "Free catalog",
    pdfPolicy: "source-only"
  },
  {
    id: "freecomputerbooks",
    name: "FreeComputerBooks",
    baseUrl: "https://freecomputerbooks.com",
    searchUrl: (query) => `https://freecomputerbooks.com/search.html?q=${encode(query)}`,
    access: "Free technical books",
    pdfPolicy: "direct-public"
  }
];

const ADDITIONAL_SOURCES = [
  {
    id: "dominio-publico",
    name: "Portal Dominio Publico",
    baseUrl: "http://www.dominiopublico.gov.br",
    searchUrl: () => "http://www.dominiopublico.gov.br/pesquisa/PesquisaObraForm.jsp",
    access: "Domínio público e obras cedidas",
    pdfPolicy: "source-only"
  },
  {
    id: "wikisource-pt",
    name: "Wikisource em português",
    baseUrl: "https://pt.wikisource.org",
    searchUrl: (query) => `https://pt.wikisource.org/w/index.php?search=${encode(query)}`,
    access: "Textos livres e domínio público",
    pdfPolicy: "source-only"
  },
  {
    id: "wikibooks-pt",
    name: "Wikilivros",
    baseUrl: "https://pt.wikibooks.org",
    searchUrl: (query) => `https://pt.wikibooks.org/w/index.php?search=${encode(query)}`,
    access: "Livros didáticos livres",
    pdfPolicy: "source-only"
  },
  {
    id: "scielo-books",
    name: "SciELO Livros",
    baseUrl: "https://books.scielo.org",
    searchUrl: (query) => `https://books.scielo.org/?s=${encode(query)}`,
    access: "Livros acadêmicos abertos",
    pdfPolicy: "source-only"
  },
  {
    id: "doab",
    name: "DOAB",
    baseUrl: "https://directory.doabooks.org",
    searchUrl: (query) => `https://directory.doabooks.org/discover?query=${encode(query)}`,
    access: "Diretório de livros open access",
    pdfPolicy: "source-only"
  },
  {
    id: "bbm-usp",
    name: "Biblioteca Brasiliana Guita e José Mindlin",
    baseUrl: "https://digital.bbm.usp.br",
    searchUrl: (query) => `https://digital.bbm.usp.br/simple-search?query=${encode(query)}`,
    access: "Acervo digital USP",
    pdfPolicy: "source-only"
  },
  {
    id: "bn-digital",
    name: "Biblioteca Nacional Digital",
    baseUrl: "https://bndigital.bn.gov.br",
    searchUrl: (query) => `https://bndigital.bn.gov.br/?s=${encode(query)}`,
    access: "Acervo digital da Biblioteca Nacional",
    pdfPolicy: "source-only"
  },
  {
    id: "bd-senado",
    name: "Biblioteca Digital do Senado Federal",
    baseUrl: "https://www2.senado.leg.br",
    searchUrl: (query) => `https://www2.senado.leg.br/bdsf/simple-search?query=${encode(query)}`,
    access: "Publicações e acervo digital",
    pdfPolicy: "source-only"
  },
  {
    id: "arca-fiocruz",
    name: "ARCA Fiocruz",
    baseUrl: "https://www.arca.fiocruz.br",
    searchUrl: (query) => `https://www.arca.fiocruz.br/simple-search?query=${encode(query)}`,
    access: "Repositório institucional aberto",
    pdfPolicy: "source-only"
  },
  {
    id: "luso-livros",
    name: "Luso Livros",
    baseUrl: "https://www.luso-livros.net",
    searchUrl: (query) => `https://www.luso-livros.net/?s=${encode(query)}`,
    access: "Livros gratuitos em português",
    pdfPolicy: "source-only"
  },
  {
    id: "camoes",
    name: "Biblioteca Digital Camões",
    baseUrl: "https://cvc.instituto-camoes.pt",
    searchUrl: (query) =>
      `https://www.google.com/search?q=${encode(`site:cvc.instituto-camoes.pt filetype:pdf "${query}"`)}`,
    access: "Biblioteca digital em português",
    pdfPolicy: "source-only"
  },
  {
    id: "literatura-ufsc",
    name: "Literatura Brasileira UFSC",
    baseUrl: "https://www.literaturabrasileira.ufsc.br",
    searchUrl: (query) =>
      `https://www.google.com/search?q=${encode(`site:literaturabrasileira.ufsc.br "${query}"`)}`,
    access: "Acervo de literatura brasileira",
    pdfPolicy: "source-only"
  },
  {
    id: "oapen",
    name: "OAPEN Library",
    baseUrl: "https://library.oapen.org",
    searchUrl: (query) =>
      `https://library.oapen.org/discover?query=${encode(query)}`,
    access: "Livros acadêmicos de acesso aberto",
    pdfPolicy: "source-only"
  },
  {
    id: "arxiv",
    name: "arXiv",
    baseUrl: "https://arxiv.org",
    searchUrl: (query) => `https://arxiv.org/list?search_query=${encode(query)}`,
    access: "Artigos técnicos de acesso aberto",
    pdfPolicy: "source-only"
  }
];

const DISCOVERY_SOURCES = [
  {
    id: "google-scholar",
    name: "Google Acadêmico",
    searchUrl: (query) => `https://scholar.google.com/scholar?q=${encode(query)}`,
    access: "Atalho para pesquisa acadêmica; acesso e licença definidos pelo editor",
    pdfPolicy: "source-only"
  },
  {
    id: "google-pdf",
    name: "Google filetype:pdf",
    searchUrl: (query) =>
      `https://www.google.com/search?q=${encode(`filetype:pdf "${query}" "public domain" OR "open access" OR "dominio publico" OR "domínio público"`)}`,
    access: "Busca web; verificar direitos na fonte",
    pdfPolicy: "source-only"
  },
  {
    id: "bing-pdf",
    name: "Bing filetype:pdf",
    searchUrl: (query) =>
      `https://www.bing.com/search?q=${encode(`filetype:pdf "${query}" "public domain" OR "open access" OR "dominio publico"`)}`,
    access: "Busca web; verificar direitos na fonte",
    pdfPolicy: "source-only"
  },
  {
    id: "duckduckgo-pdf",
    name: "DuckDuckGo filetype:pdf",
    searchUrl: (query) =>
      `https://html.duckduckgo.com/html/?q=${encode(`filetype:pdf "${query}" "public domain" OR "open access"`)}`,
    access: "Busca web; verificar direitos na fonte",
    pdfPolicy: "source-only"
  },
  {
    id: "yahoo-pdf",
    name: "Yahoo Search filetype:pdf",
    searchUrl: (query) =>
      `https://search.yahoo.com/search?p=${encode(`filetype:pdf "${query}" "open access" OR "public domain"`)}`,
    access: "Busca web; verificar direitos na fonte",
    pdfPolicy: "source-only"
  },
  {
    id: "mojeek-pdf",
    name: "Mojeek filetype:pdf",
    searchUrl: (query) =>
      `https://www.mojeek.com/search?q=${encode(`filetype:pdf "${query}"`)}`,
    access: "Busca web independente; verificar direitos na fonte",
    pdfPolicy: "source-only"
  },
  {
    id: "zenodo-pdf",
    name: "Zenodo",
    searchUrl: (query) =>
      `https://www.google.com/search?q=${encode(`site:zenodo.org/records filetype:pdf "${query}"`)}`,
    access: "Repositório aberto de publicações e dados",
    pdfPolicy: "source-only"
  },
  {
    id: "core-pdf",
    name: "CORE",
    searchUrl: (query) => `https://core.ac.uk/search?q=${encode(query)}`,
    access: "Agregador de pesquisa de acesso aberto",
    pdfPolicy: "source-only"
  },
  {
    id: "open-textbooks",
    name: "Open Textbook Library",
    searchUrl: (query) =>
      `https://open.umn.edu/opentextbooks/search?query=${encode(query)}`,
    access: "Livros didáticos abertos",
    pdfPolicy: "source-only"
  },
  {
    id: "standard-ebooks",
    name: "Standard Ebooks",
    searchUrl: (query) =>
      `https://standardebooks.org/ebooks?query=${encode(query)}`,
    access: "Edições livres de domínio público",
    pdfPolicy: "source-only"
  }
];

const API_SOURCES = [
  {
    id: "internet-archive",
    name: "Internet Archive",
    access: "Texts and public files",
    provider: searchInternetArchive
  },
  {
    id: "open-library",
    name: "Open Library",
    access: "Readable and borrowable books",
    provider: searchOpenLibrary
  },
  {
    id: "project-gutenberg",
    name: "Project Gutenberg",
    access: "Public domain",
    provider: searchGutenberg
  },
  {
    id: "google-books",
    name: "Google Books",
    access: "Preview and public downloads",
    provider: searchGoogleBooks
  },
  {
    id: "librivox",
    name: "LibriVox",
    access: "Public domain audiobooks",
    provider: searchLibriVox
  },
  {
    id: "wikisource-api",
    name: "Wikisource em português",
    access: "Textos livres e domínio público",
    provider: searchWikisource
  },
  {
    id: "wikibooks-api",
    name: "Wikilivros",
    access: "Livros didáticos livres",
    provider: searchWikibooks
  },
  {
    id: "openalex",
    name: "OpenAlex",
    access: "Índice aberto de literatura científica",
    provider: searchOpenAlex
  },
  {
    id: "crossref",
    name: "Crossref",
    access: "Metadados acadêmicos e DOI",
    provider: searchCrossref
  },
  {
    id: "arxiv",
    name: "arXiv",
    access: "Artigos técnicos de acesso aberto",
    provider: searchArxiv
  },
  {
    id: "doab",
    name: "DOAB",
    access: "Livros acadêmicos open access",
    timeoutMs: 10000,
    provider: searchDoab
  },
  {
    id: "oapen",
    name: "OAPEN",
    access: "Livros acadêmicos open access",
    timeoutMs: 10000,
    provider: searchOapen
  }
];

const SOURCE_DIRECTORY = buildSourceDirectory();
const SOURCE_PAYLOAD = {
  sites: SOURCE_DIRECTORY,
  searchableSources: [...API_SOURCES, ...HTML_SOURCES, ...ADDITIONAL_SOURCES, ...DISCOVERY_SOURCES].map(
    (source) => ({
      id: source.id,
      name: source.name,
      access: source.access
    })
  )
};

async function handleRequest(requestUrl, response, request = null) {
  try {
    if (requestUrl.pathname === "/api/search") {
      await handleSearch(requestUrl, response);
      return;
    }

    if (requestUrl.pathname === "/api/translate-pdf") {
      await handlePdfTranslation(requestUrl, response, request);
      return;
    }

    if (requestUrl.pathname === "/api/translate-pdf-url") {
      await handlePdfUrlTranslation(requestUrl, response, request);
      return;
    }

    if (requestUrl.pathname === "/api/sources") {
      sendJson(response, { ...SOURCE_PAYLOAD, languages: SUPPORTED_LANGUAGES });
      return;
    }

    if (requestUrl.pathname === "/api/stats") {
      sendJson(response, buildStatistics());
      return;
    }

    await serveStatic(requestUrl.pathname, response);
  } catch (error) {
    console.error(error);
    sendJson(response, { error: "Erro interno no buscador." }, 500);
  }
}

const isNodeRuntime =
  typeof process !== "undefined" && Boolean(process.release) && process.release.name === "node";
if (require.main === module && isNodeRuntime) {
  const http = require("http");
  http.createServer((request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    handleRequest(requestUrl, response, request);
  }).listen(PORT, () => {
    console.log(`Buscador global de livros: http://127.0.0.1:${PORT}`);
  });
}

async function handlePdfTranslation(requestUrl, response, request) {
  const source = normalizeTranslationLanguage(requestUrl.searchParams.get("source"), true);
  const target = normalizeTranslationLanguage(requestUrl.searchParams.get("target"), false);

  if (!source || !target || source === target) {
    sendJson(
      response,
      { error: "Informe idiomas de origem e destino diferentes (códigos ISO, como pt e en)." },
      400
    );
    return;
  }

  try {
    const pdf = await readPdfRequestBody(request);
    const translated = await translatePdfBuffer(pdf, source, target);
    sendTranslatedPdf(response, translated, source, target);
  } catch (error) {
    const status = Number(error.statusCode || 502);
    sendJson(response, { error: readableError(error) }, status);
  }
}

async function handlePdfUrlTranslation(requestUrl, response, request) {
  const source = normalizeTranslationLanguage(requestUrl.searchParams.get("source"), true);
  const target = normalizeTranslationLanguage(requestUrl.searchParams.get("target"), false);

  if (!source || !target || source === target) {
    sendJson(response, { error: "Informe idiomas de origem e destino diferentes." }, 400);
    return;
  }

  try {
    const body = await readJsonRequestBody(request);
    const pdfUrl = String(body.pdfUrl || "").trim();
    if (!isAllowedRemotePdfUrl(pdfUrl)) {
      const error = new Error("O link do PDF não é um endereço público http(s) válido.");
      error.statusCode = 400;
      throw error;
    }
    const pdf = await fetchRemotePdf(pdfUrl);
    const translated = await translatePdfBuffer(pdf, source, target);
    sendTranslatedPdf(response, translated, source, target);
  } catch (error) {
    const status = Number(error.statusCode || 502);
    sendJson(response, { error: readableError(error) }, status);
  }
}

function sendTranslatedPdf(response, translated, source, target) {
  response.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="livro-traduzido-${source}-${target}.pdf"`,
    "Content-Length": String(translated.buffer.length),
    "X-PDF-Translation-Pages": String(translated.pages),
    "X-PDF-Translation-Characters": String(translated.characters),
    "Cache-Control": "no-store"
  });
  response.end(translated.buffer);
}

function normalizeTranslationLanguage(value, allowAuto) {
  const language = String(value || "").trim().toLowerCase();
  if (allowAuto && language === "auto") return language;
  return /^[a-z]{2,3}$/.test(language) ? language : "";
}

async function readPdfRequestBody(request) {
  if (!request) {
    const error = new Error("Envie o arquivo PDF no corpo da requisição.");
    error.statusCode = 400;
    throw error;
  }

  const contentType = String(request.headers?.["content-type"] || request.headers?.get?.("content-type") || "").toLowerCase();
  if (contentType && !contentType.includes("application/pdf") && !contentType.includes("application/octet-stream")) {
    const error = new Error("O endpoint aceita apenas um PDF enviado como application/pdf.");
    error.statusCode = 415;
    throw error;
  }

  let buffer;
  if (typeof request.arrayBuffer === "function") {
    const contentLength = Number(request.headers?.get?.("content-length") || 0);
    if (contentLength > PDF_TRANSLATION_MAX_BYTES) {
      const error = new Error(`O PDF excede o limite de ${Math.round(PDF_TRANSLATION_MAX_BYTES / 1024 / 1024)} MB.`);
      error.statusCode = 413;
      throw error;
    }
    buffer = Buffer.from(await request.arrayBuffer());
  } else {
    const contentLength = Number(request.headers?.["content-length"] || 0);
    if (contentLength > PDF_TRANSLATION_MAX_BYTES) {
      const error = new Error(`O PDF excede o limite de ${Math.round(PDF_TRANSLATION_MAX_BYTES / 1024 / 1024)} MB.`);
      error.statusCode = 413;
      throw error;
    }
    const chunks = [];
    let received = 0;
    for await (const chunk of request) {
      received += chunk.length;
      if (received > PDF_TRANSLATION_MAX_BYTES) {
        const error = new Error(`O PDF excede o limite de ${Math.round(PDF_TRANSLATION_MAX_BYTES / 1024 / 1024)} MB.`);
        error.statusCode = 413;
        throw error;
      }
      chunks.push(chunk);
    }
    buffer = Buffer.concat(chunks);
  }

  if (!buffer.length || buffer.subarray(0, 5).toString() !== "%PDF-") {
    const error = new Error("O arquivo enviado não parece ser um PDF válido.");
    error.statusCode = 400;
    throw error;
  }
  return buffer;
}

async function readJsonRequestBody(request) {
  if (!request) {
    const error = new Error("Envie os dados da tradução no corpo da requisição.");
    error.statusCode = 400;
    throw error;
  }

  let raw;
  if (typeof request.json === "function") {
    return request.json();
  }

  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > 64 * 1024) {
      const error = new Error("Os dados da tradução excedem o limite permitido.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Os dados da tradução não são JSON válidos.");
    error.statusCode = 400;
    throw error;
  }
}

function isAllowedRemotePdfUrl(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd")) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchRemotePdf(pdfUrl) {
  const response = await fetchWithTimeout(pdfUrl, Math.max(PROVIDER_TIMEOUT_MS, 15000), {
    headers: {
      Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.5",
      "User-Agent": USER_AGENT
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  if (!isAllowedRemotePdfUrl(response.url || pdfUrl)) {
    const error = new Error("O redirecionamento do PDF não aponta para um endereço público.");
    error.statusCode = 400;
    throw error;
  }
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > PDF_TRANSLATION_MAX_BYTES) {
    const error = new Error(`O PDF remoto excede o limite de ${Math.round(PDF_TRANSLATION_MAX_BYTES / 1024 / 1024)} MB.`);
    error.statusCode = 413;
    throw error;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > PDF_TRANSLATION_MAX_BYTES) {
    const error = new Error(`O PDF remoto excede o limite de ${Math.round(PDF_TRANSLATION_MAX_BYTES / 1024 / 1024)} MB.`);
    error.statusCode = 413;
    throw error;
  }
  if (!buffer.length || buffer.subarray(0, 5).toString() !== "%PDF-") {
    const error = new Error("O endereço não retornou um PDF válido.");
    error.statusCode = 415;
    throw error;
  }
  return buffer;
}

async function translatePdfBuffer(pdfBuffer, source, target) {
  if (!isNodeRuntime) {
    const error = new Error("A tradução de PDFs precisa ser executada no servidor local com Python e pdfplumber instalados.");
    error.statusCode = 501;
    throw error;
  }

  const fileSystem = await getFileSystem();
  const crypto = require("crypto");
  const { spawn } = require("child_process");
  const baseDir = path.join(__dirname, "tmp", "pdfs");
  await fileSystem.mkdir(baseDir, { recursive: true });
  const token = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const inputPath = path.join(baseDir, `source-${token}.pdf`);
  const outputPath = path.join(baseDir, `translated-${token}.pdf`);
  const scriptPath = path.join(__dirname, "translate_pdf.py");
  const python = process.env.PDF_PYTHON || (process.platform === "win32" ? "python" : "python3");

  try {
    await fileSystem.writeFile(inputPath, pdfBuffer);
    const args = [
      scriptPath,
      inputPath,
      outputPath,
      "--source",
      source,
      "--target",
      target,
      "--api-url",
      PDF_TRANSLATION_API_URL,
      "--api-key",
      process.env.TRANSLATION_API_KEY || ""
    ];
    const result = await new Promise((resolve, reject) => {
      const child = spawn(python, args, { windowsHide: true });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", (error) => reject(error));
      child.on("close", (code) => {
        if (code !== 0) {
          const detail = (stderr || stdout || `Tradutor terminou com código ${code}`).trim();
          let message = detail;
          try {
            const parsed = JSON.parse(detail.split(/\r?\n/).pop() || "{}");
            message = parsed.error || message;
          } catch {
            // Mantém a mensagem original do processo Python.
          }
          const error = new Error(message);
          error.statusCode = code === 2 ? 422 : 502;
          reject(error);
          return;
        }
        try {
          resolve(JSON.parse(stdout.trim().split(/\r?\n/).pop() || "{}"));
        } catch {
          reject(new Error("O tradutor não retornou um resumo válido."));
        }
      });
    });
    const buffer = await fileSystem.readFile(outputPath);
    return { buffer, pages: result.pages || 0, characters: result.characters || 0 };
  } catch (error) {
    if (error.code === "ENOENT") {
      error.message = "Python não foi encontrado. Configure PDF_PYTHON com o caminho do interpretador.";
      error.statusCode = 503;
    }
    throw error;
  } finally {
    await Promise.all([
      fileSystem.unlink(inputPath).catch(() => {}),
      fileSystem.unlink(outputPath).catch(() => {})
    ]);
  }
}

async function handleSearch(requestUrl, response) {
  const query = cleanQuery(requestUrl.searchParams.get("q") || "");
  const pdfOnly = requestUrl.searchParams.get("pdf") === "1";
  const language = normalizeLanguage(requestUrl.searchParams.get("lang"));
  const requestStartedAt = Date.now();

  if (!query) {
    sendJson(response, {
      query,
      results: [],
      catalogChecks: [],
      providerStatus: [],
      sites: SOURCE_DIRECTORY,
      tookMs: 0,
      searchTookMs: 0,
      cached: false
    });
    return;
  }

  const search = await getOrStartSearch(query, language);
  const results = pdfOnly
    ? search.payload.results.filter((entry) => entry.pdfUrl)
    : search.payload.results;

  sendJson(response, {
    ...search.payload,
    results,
    tookMs: Date.now() - requestStartedAt,
    cached: search.cached,
    sharedRequest: search.shared
  });
}

async function getOrStartSearch(query, language) {
  const cacheKey = `${normalize(query)}|${language}`;
  const cachedPayload = getCachedSearch(cacheKey);
  if (cachedPayload) {
    return { payload: cachedPayload, cached: true, shared: false };
  }

  const current = SEARCH_IN_FLIGHT.get(cacheKey);
  if (current) {
    return { payload: await current, cached: false, shared: true };
  }

  const job = performSearch(query, language)
    .then((payload) => {
      cacheSearch(cacheKey, payload);
      return payload;
    })
    .finally(() => {
      SEARCH_IN_FLIGHT.delete(cacheKey);
    });

  SEARCH_IN_FLIGHT.set(cacheKey, job);
  return { payload: await job, cached: false, shared: false };
}

async function performSearch(query, language = "any") {
  const startedAt = Date.now();

  const enabledHtmlIds = (process.env.HTML_SOURCES || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const activeHtml = enabledHtmlIds.length
    ? HTML_SOURCES.filter((source) => enabledHtmlIds.includes(source.id))
    : HTML_SOURCES;

  const apiJobs = API_SOURCES.map((source) => runProvider(source, query, language));
  const htmlJob = mapLimit(activeHtml, HTML_CONCURRENCY, (source) =>
    runProvider({ ...source, provider: () => searchHtmlSource(source, query) }, query, language)
  );
  const isbnJobs = looksLikeIsbn(query)
    ? [
        runProvider(
          {
            id: "open-library-isbn",
            name: "Open Library (ISBN)",
            access: "Registro preciso por ISBN",
            isbnExact: true,
            provider: () => searchOpenLibraryByIsbn(query)
          },
          query,
          language
        ),
        runProvider(
          {
            id: "google-books-isbn",
            name: "Google Books (ISBN)",
            access: "Registro preciso por ISBN",
            isbnExact: true,
            provider: () => searchGoogleBooks(`isbn:${normalizeIsbn(query)}`)
          },
          query,
          language
        )
      ]
    : [];
  const pdfDiscoveryJob = findComplementaryPdfCandidates(query, language);

  const settled = await Promise.all([...apiJobs, htmlJob, ...isbnJobs]);
  const settledEntries = settled.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
  const pdfDiscovery = await pdfDiscoveryJob;
  const providerStatus = settledEntries.map(({ source, ok, error, count, discarded }) => ({
    id: source.id,
    name: source.name,
    ok,
    error,
    count,
    discarded
  }));
  providerStatus.push({
    id: "pdf-discovery",
    name: "PDF complementar",
    ok: pdfDiscovery.ok,
    error: pdfDiscovery.error,
    count: pdfDiscovery.candidates.length,
    discarded: pdfDiscovery.discarded
  });

  const allResults = settledEntries.flatMap((entry) => entry.results);
  const complementaryCandidates = dedupePdfCandidates([
    ...pdfCandidatesFromResults(allResults),
    ...pdfDiscovery.candidates
  ]);
  const ranked = rankResults(dedupeResults(allResults), query);
  const consolidated = fuzzyGroupResults(ranked);
  const enriched = attachComplementaryPdfs(consolidated.slice(0, MAX_RESULTS), complementaryCandidates, query, language);

  return {
    query, language,
    searchTookMs: Date.now() - startedAt,
    results: enriched,
    catalogChecks: buildCatalogChecks(query),
    providerStatus,
    sites: SOURCE_DIRECTORY,
    notices: [
      language === "any" ? "Resultados em todos os idiomas; priorizamos textos completos e PDFs." : `Filtro de idioma ativo: ${SUPPORTED_LANGUAGES[language].label}.`,
      "PDFs encontrados em fontes abertas podem ser anexados ao resultado, inclusive quando vierem de outra fonte.",
      "Buscas filetype:pdf entram como descoberta complementar, com filtro por fonte pública ou confiável.",
      "Resultados do mesmo livro vindos de catálogos diferentes são consolidados em um só cartão."
    ]
  };
}

function getCachedSearch(cacheKey) {
  const cached = SEARCH_CACHE.get(cacheKey);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    SEARCH_CACHE.delete(cacheKey);
    return null;
  }

  SEARCH_CACHE.delete(cacheKey);
  SEARCH_CACHE.set(cacheKey, cached);
  return cached.payload;
}

function cacheSearch(cacheKey, payload) {
  SEARCH_CACHE.set(cacheKey, {
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    payload
  });

  while (SEARCH_CACHE.size > SEARCH_CACHE_MAX_ENTRIES) {
    const oldestKey = SEARCH_CACHE.keys().next().value;
    SEARCH_CACHE.delete(oldestKey);
  }
}

async function runProvider(source, query, language) {
  try {
    const timeoutMs =
      source.timeoutMs ||
      (source.id === "internet-archive"
        ? INTERNET_ARCHIVE_TIMEOUT_MS
        : PROVIDER_TIMEOUT_MS);
    const rawResults = await withTimeout(source.provider(query, language), timeoutMs);
    const results = rawResults
      .filter((entry) =>
        source.isbnExact
          ? !entry.isCatalogSearch && passesLanguageFilter(entry, query, language)
          : isLanguageResult(entry, query, language)
      )
      .map((entry) => ({ ...entry, languageLabel: languageLabel(entry.languages, language) }));
    return {
      source,
      ok: true,
      error: null,
      count: results.length,
      discarded: rawResults.length - results.length,
      results
    };
  } catch (error) {
    return {
      source,
      ok: false,
      error: readableError(error),
      count: 0,
      discarded: 0,
      results: []
    };
  }
}

async function findComplementaryPdfCandidates(query, language) {
  const queries = buildAdvancedPdfQueries(query, language);
  try {
    const webSearches = [
      ["Google PDF exato", `https://www.google.com/search?q=${encode(queries.exact)}`],
      ["Bing PDF exato", `https://www.bing.com/search?q=${encode(queries.exact)}`],
      ["DuckDuckGo PDF exato", `https://html.duckduckgo.com/html/?q=${encode(queries.exact)}`],
      ["Yahoo PDF exato", `https://search.yahoo.com/search?p=${encode(queries.exact)}`],
      ["Mojeek PDF exato", `https://www.mojeek.com/search?q=${encode(queries.exact)}`],
      ["Google repositórios abertos", `https://www.google.com/search?q=${encode(queries.repositories)}`],
      ["Bing repositórios abertos", `https://www.bing.com/search?q=${encode(queries.repositories)}`],
      ["DuckDuckGo repositórios abertos", `https://html.duckduckgo.com/html/?q=${encode(queries.repositories)}`],
      ["Google acervos digitais", `https://www.google.com/search?q=${encode(queries.digitalLibraries)}`],
      ["Bing acervos digitais", `https://www.bing.com/search?q=${encode(queries.digitalLibraries)}`],
      ["Google nome de arquivo", `https://www.google.com/search?q=${encode(queries.fileName)}`]
    ];
    const rawCandidates = await withTimeout(
      Promise.all(webSearches.map(([site, searchUrl]) => searchPdfSearchEngine({ site, searchUrl }))),
      PDF_DISCOVERY_TIMEOUT_MS
    );
    const candidates = dedupePdfCandidates(rawCandidates.flat())
      .filter((candidate) => isSafePdfCandidate(candidate, query, language))
      .slice(0, 12);

    return {
      ok: true,
      error: null,
      discarded: rawCandidates.flat().length - candidates.length,
      candidates
    };
  } catch (error) {
    return {
      ok: false,
      error: readableError(error),
      discarded: 0,
      candidates: []
    };
  }
}

function buildAdvancedPdfQueries(query, language) {
  const languageTerms = {
    pt: '"acesso aberto" OR "domínio público"',
    en: '"open access" OR "public domain"',
    es: '"acceso abierto" OR "dominio público"',
    fr: '"accès ouvert" OR "domaine public"',
    de: '"open access" OR "gemeinfrei"',
    it: '"accesso aperto" OR "pubblico dominio"',
    any: '"open access" OR "public domain" OR "acesso aberto"'
  };
  const rights = languageTerms[language] || languageTerms.any;
  const phrase = cleanQuery(query).replace(/["()]/g, " ").trim();
  const exact = `intitle:"${phrase}" filetype:pdf (${rights})`;
  const repositories = `"${phrase}" filetype:pdf (site:archive.org OR site:arxiv.org OR site:zenodo.org OR site:core.ac.uk OR site:doaj.org OR site:scielo.org OR site:oapen.org OR site:doabooks.org OR site:gov.br OR site:edu.br)`;
  const digitalLibraries = `"${phrase}" filetype:pdf (site:dominiopublico.gov.br OR site:bn.gov.br OR site:senado.leg.br OR site:usp.br OR site:ufsc.br OR site:fiocruz.br OR site:instituto-camoes.pt OR site:openstax.org OR site:standardebooks.org)`;
  const fileName = `filetype:pdf ("${phrase}" OR ${phrase.replace(/\s+/g, "_")} OR ${phrase.replace(/\s+/g, "-")}) (${rights})`;
  return {
    exact,
    repositories,
    digitalLibraries,
    fileName
  };
}

async function searchPdfSearchEngine({ site, searchUrl }) {
  try {
    const html = await fetchText(searchUrl, HTML_SEARCH_TIMEOUT_MS);
    const links = extractLinks(html, searchUrl);

    return links
      .map((link) => {
        const pdfUrl = unwrapSearchResultUrl(link.href);
        return {
          title: link.text || fileNameText(pdfUrl),
          pdfUrl,
          sourceUrl: pdfUrl,
          site: hostLabel(pdfUrl) || site,
          discoveredBy: site
        };
      })
      .filter((candidate) => /\.pdf(?:$|[?#])/i.test(candidate.pdfUrl))
      .slice(0, 8);
  } catch {
    return [];
  }
}

function attachComplementaryPdfs(results, candidates, query, language = "any") {
  if (!candidates.length) return results;

  return results.map((entry) => {
    if (entry.pdfUrl) return entry;

    const match = candidates.find((candidate) => pdfCandidateMatchesResult(candidate, entry, query, language));
    if (!match) return entry;

    return {
      ...entry,
      pdfUrl: match.pdfUrl,
      pdfSourceUrl: match.sourceUrl,
      pdfSourceSite: match.site,
      pdfDiscoveredBy: match.discoveredBy,
      availability: "PDF complementar",
      formats: uniqueBy([...entry.formats, "PDF externo"], (item) => item)
    };
  });
}

function pdfCandidatesFromResults(results) {
  return results
    .filter((entry) => entry.pdfUrl)
    .map((entry) => ({
      title: entry.title,
      pdfUrl: entry.pdfUrl,
      sourceUrl: entry.sourceUrl,
      site: entry.site,
      discoveredBy: "resultado encontrado"
    }));
}

function pdfCandidateMatchesResult(candidate, entry, query, language = "any") {
  const candidateText = normalize(`${candidate.title} ${fileNameText(candidate.pdfUrl)}`);
  const entryText = normalize(`${entry.title} ${asArray(entry.authors).join(" ")}`);
  const queryTokens = tokenize(query);

  if (!candidateText || !entryText || !queryTokens.length) return false;
  if (language === "pt" && !looksPortugueseTitle(`${candidate.title} ${fileNameText(candidate.pdfUrl)}`)) return false;

  const queryHits = queryTokens.filter((token) => candidateText.includes(token)).length;
  if (queryHits < Math.min(2, queryTokens.length)) return false;

  const ignored = new Set(["book", "livro", "ebook", "edition", "edicao", "volume", "the", "and", "das", "dos"]);
  const entryTokens = tokenize(entry.title).filter((token) => token.length > 2 && !ignored.has(token));
  const entryHits = entryTokens.filter((token) => candidateText.includes(token)).length;
  const requiredTitleHits = entryTokens.length <= 2 ? entryTokens.length : Math.ceil(entryTokens.length * 0.6);
  return entryHits >= requiredTitleHits;
}

async function searchOpenLibrary(query) {
  const data = await fetchJson(
    `https://openlibrary.org/search.json?q=${encode(query)}&fields=${encode(OPEN_LIBRARY_FIELDS)}&limit=8`
  );

  return (data.docs || []).slice(0, 10).map(mapOpenLibraryDoc);
}

async function searchOpenLibraryByIsbn(isbn) {
  const normalized = normalizeIsbn(isbn);
  const data = await fetchJson(
    `https://openlibrary.org/search.json?isbn=${encode(normalized)}&fields=${encode(OPEN_LIBRARY_FIELDS)}&limit=5`
  );

  if (data.docs && data.docs.length) {
    return data.docs.slice(0, 5).map(mapOpenLibraryDoc);
  }

  const edition = await fetchJson(`https://openlibrary.org/isbn/${encode(normalized)}.json`);
  if (!edition || !edition.title) return [];

  return [
    result({
      site: "Open Library",
      sourceId: "open-library",
      title: edition.title,
      year: yearFromDate(edition.publish_date),
      sourceUrl: `https://openlibrary.org${edition.key}`,
      coverUrl: edition.covers && edition.covers[0]
        ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-M.jpg`
        : "",
      availability: "Registro preciso por ISBN",
      languages: (edition.languages || []).map((lang) => lang.key.replace("/languages/", "")),
      formats: [],
      rights: "Disponibilidade informada pela Open Library",
      confidence: 0.85
    })
  ];
}

const OPEN_LIBRARY_FIELDS = [
  "key",
  "title",
  "author_name",
  "first_publish_year",
  "edition_count",
  "ia",
  "ebook_access",
  "has_fulltext",
  "public_scan_b",
  "cover_i",
  "language"
].join(",");

function mapOpenLibraryDoc(doc) {
  const readable =
    doc.ebook_access === "public"
      ? "Leitura pública"
      : doc.ebook_access === "borrowable"
        ? "Empréstimo digital"
        : doc.has_fulltext
          ? "Texto completo"
          : "Registro catalográfico";

  return result({
    site: "Open Library",
    sourceId: "open-library",
    title: doc.title,
    authors: doc.author_name || [],
    year: doc.first_publish_year,
    sourceUrl: `https://openlibrary.org${doc.key}`,
    coverUrl: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : "",
    availability: readable,
    languages: doc.language || [],
    formats: doc.public_scan_b ? ["Digitalizado"] : [],
    rights: "Disponibilidade informada pela Open Library",
    confidence: 0.8
  });
}

async function searchGutenberg(query) {
  const data = await fetchJson(`https://gutendex.com/books/?search=${encode(query)}`);

  return (data.results || []).slice(0, 8).map((book) => {
    const formats = book.formats || {};
    const pdfUrl = findFormatUrl(formats, "pdf");
    const epubUrl = findFormatUrl(formats, "epub");
    const textUrl = findFormatUrl(formats, "text/plain");
    const coverUrl =
      findFormatUrl(formats, "image/jpeg") || findFormatUrl(formats, "image/");

    return result({
      site: "Project Gutenberg",
      sourceId: "project-gutenberg",
      title: book.title,
      authors: (book.authors || []).map((author) => author.name),
      year: firstAuthorYear(book.authors),
      sourceUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
      pdfUrl,
      epubUrl,
      textUrl,
      coverUrl,
      availability: pdfUrl ? "PDF direto" : "Público em outros formatos",
      languages: book.languages || [],
      formats: Object.keys(formats).map(shortFormat).filter(Boolean),
      rights: book.copyright === false ? "Domínio público" : "Verificar direitos na fonte",
      confidence: 0.92,
      description: firstSentence(book.summaries && book.summaries[0])
    });
  });
}

async function searchGoogleBooks(query) {
  const url =
    `https://www.googleapis.com/books/v1/volumes?q=${encode(query)}` +
    "&printType=books&projection=lite&maxResults=8";
  const data = await fetchJson(url);

  return (data.items || []).slice(0, 8).map((item) => {
    const info = item.volumeInfo || {};
    const access = item.accessInfo || {};
    const pdf = access.pdf || {};
    const pdfUrl = pdf.isAvailable && pdf.downloadLink ? pdf.downloadLink : "";

    return result({
      site: "Google Books",
      sourceId: "google-books",
      title: info.title,
      authors: info.authors || [],
      year: yearFromDate(info.publishedDate),
      sourceUrl: info.infoLink || info.previewLink || `https://books.google.com/books?id=${item.id}`,
      pdfUrl,
      coverUrl: info.imageLinks && (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail),
      availability: pdfUrl
        ? "PDF público pelo Google Books"
        : access.viewability === "ALL_PAGES"
          ? "Leitura integral"
          : "Previa ou registro",
      languages: info.language ? [info.language] : [],
      formats: pdfUrl ? ["PDF"] : [],
      rights: "Disponibilidade informada pelo Google Books",
      confidence: 0.78,
      description: firstSentence(info.description)
    });
  });
}

async function searchInternetArchive(query) {
  const params = new URLSearchParams();
  params.set(
    "q",
    `title:(${query}) AND mediatype:texts`
  );
  for (const field of ["identifier", "title", "creator", "year", "description", "language"]) {
    params.append("fl[]", field);
  }
  params.set("rows", "6");
  params.set("page", "1");
  params.set("output", "json");

  const data = await fetchJson(`https://archive.org/advancedsearch.php?${params}`);
  const docs = (data.response && data.response.docs) || [];
  const pdfEntries = await Promise.all(
    docs.slice(0, 4).map(async (doc) => [doc.identifier, await findInternetArchivePdf(doc.identifier)])
  );
  const pdfByIdentifier = new Map(pdfEntries);

  return docs.slice(0, 6).map((doc) => {
    const pdfUrl = pdfByIdentifier.get(doc.identifier) || "";
    return result({
      site: "Internet Archive",
      sourceId: "internet-archive",
      title: doc.title,
      authors: asArray(doc.creator),
      year: doc.year,
      sourceUrl: `https://archive.org/details/${doc.identifier}`,
      pdfUrl,
      coverUrl: `https://archive.org/services/img/${doc.identifier}`,
      availability: pdfUrl ? "PDF direto" : "Item de texto",
      languages: asArray(doc.language),
      formats: pdfUrl ? ["PDF"] : [],
      rights: "Verificar direitos e acesso no item do Internet Archive",
      confidence: 0.86,
      description: firstSentence(asArray(doc.description)[0])
    });
  });
}

async function searchOpenAlex(query, language) {
  const params = new URLSearchParams({ search: query, "per-page": "10" });
  if (language !== "any") params.set("filter", `language:${language}`);
  const data = await fetchJson(`https://api.openalex.org/works?${params}`);

  return (data.results || []).map((work) => {
    const location = work.best_oa_location || work.primary_location || {};
    const source = location.source || {};
    const pdfUrl = location.pdf_url || "";
    return result({
      site: "OpenAlex",
      sourceId: "openalex",
      title: work.display_name,
      authors: (work.authorships || []).map((item) => item.author && item.author.display_name).filter(Boolean),
      year: work.publication_year,
      sourceUrl: location.landing_page_url || work.doi || work.id,
      pdfUrl,
      availability: pdfUrl ? "Artigo de acesso aberto (PDF)" : work.open_access && work.open_access.is_oa ? "Artigo de acesso aberto" : "Registro acadêmico",
      languages: work.language ? [work.language] : [],
      formats: pdfUrl ? ["PDF", "Artigo científico"] : ["Artigo científico"],
      rights: "Acesso e licença informados pela fonte do artigo",
      confidence: pdfUrl ? 0.94 : 0.82,
      description: source.display_name ? `Publicado em ${source.display_name}.` : "Registro do índice OpenAlex."
    });
  });
}

async function searchCrossref(query) {
  const data = await fetchJson(`https://api.crossref.org/works?query.bibliographic=${encode(query)}&rows=8&select=title,author,published,URL,DOI,link,container-title,language,type`);
  const items = (data.message && data.message.items) || [];
  return items.map((item) => {
    const links = item.link || [];
    const pdf = links.find((link) => /pdf/i.test(link["content-type"] || ""));
    return result({
      site: "Crossref",
      sourceId: "crossref",
      title: asArray(item.title)[0],
      authors: (item.author || []).map((author) => [author.given, author.family].filter(Boolean).join(" ")),
      year: item.published && item.published["date-parts"] && item.published["date-parts"][0] && item.published["date-parts"][0][0],
      sourceUrl: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ""),
      pdfUrl: pdf && pdf.URL,
      availability: pdf ? "PDF indicado pelo editor" : "Registro acadêmico / DOI",
      languages: item.language ? [item.language] : [],
      formats: pdf ? ["PDF", "Artigo científico"] : ["Artigo científico"],
      rights: "Verificar licença e acesso no DOI/editora",
      confidence: 0.8,
      description: asArray(item["container-title"])[0] || item.type || "Registro Crossref."
    });
  });
}

async function searchArxiv(query) {
  const clean = cleanQuery(query).replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, "+");
  const url =
    `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(clean)}` +
    `&start=0&max_results=8&sortBy=relevance`;
  const xml = await fetchText(url, PROVIDER_TIMEOUT_MS);
  const entries = xml.split("<entry>").slice(1);

  return entries.slice(0, 8).map((block) => {
    const grab = (tag) => {
      const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
      return match ? decodeHtml(match[1]).replace(/\s+/g, " ").trim() : "";
    };
    const links = [...block.matchAll(/<link\b[^>]*\/?>/gi)].map((match) => ({
      href: (match[0].match(/href="([^"]*)"/) || [])[1] || "",
      rel: (match[0].match(/rel="([^"]*)"/) || [])[1] || "",
      title: (match[0].match(/title="([^"]*)"/) || [])[1] || ""
    }));
    const absoluteLink = links.find((link) => link.rel === "alternate" || /\/abs\//.test(link.href));
    const absUrl = (absoluteLink && absoluteLink.href) || "";
    const pdfLink = links.find((link) => link.rel === "related" || /\/pdf\//.test(link.href));
    const pdfUrl =
      (pdfLink && pdfLink.href) ||
      (absUrl ? absUrl.replace(/\/abs\//, "/pdf/") + ".pdf" : "");

    return result({
      site: "arXiv",
      sourceId: "arxiv",
      title: grab("title"),
      authors: [...block.matchAll(/<name>([\s\S]*?)<\/name>/gi)]
        .map((match) => decodeHtml(match[1]).replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 4),
      year: yearFromDate(grab("published")),
      sourceUrl: absUrl,
      pdfUrl,
      availability: pdfUrl ? "PDF de acesso aberto" : "Artigo de acesso aberto",
      languages: ["en"],
      formats: pdfUrl ? ["PDF", "Artigo científico"] : ["Artigo científico"],
      rights: "Acesso aberto conforme o arXiv e os autores",
      confidence: 0.88,
      description: firstSentence(grab("summary"))
    });
  });
}

async function searchDoab(query) {
  return searchDspaceBooks("doab", "DOAB", "https://directory.doabooks.org", query);
}

async function searchOapen(query) {
  return searchDspaceBooks("oapen", "OAPEN", "https://library.oapen.org", query);
}

async function searchDspaceBooks(sourceId, site, baseUrl, query) {
  const searchParams = new URLSearchParams();
  searchParams.set("query", cleanQuery(query));
  searchParams.set("expand", "metadata");
  searchParams.set("limit", "6");
  const data = await fetchJson(`${baseUrl}/rest/search?${searchParams}`);
  const items = (data || []).slice(0, 6);

  const details = await Promise.all(
    items.slice(0, 3).map(async (item) => {
      try {
        return await fetchJson(`${baseUrl}/rest/items/${item.uuid}?expand=bitstreams`, 2500);
      } catch {
        return null;
      }
    })
  );

  return items.map((item, index) => {
    const detail = details[index] || item;
    const meta = {};
    for (const field of detail.metadata || item.metadata || []) {
      if (!meta[field.key]) meta[field.key] = [];
      meta[field.key].push(field.value);
    }
    const title = (meta["dc.title"] || [])[0] || item.name || "Título não informado";
    const authors = (meta["dc.creator"] || []).map(cleanText).filter(Boolean);
    const year = yearFromDate((meta["dc.date.issued"] || [])[0]);
    const languages = (meta["dc.language.iso"] || meta["dc.language"] || [])
      .map(cleanText)
      .filter(Boolean);
    const rights = (meta["dc.rights"] || meta["dc.rights.accessRights"] || [])[0];
    const handle = item.handle || "";
    const sourceUrl = handle ? `${baseUrl}/handle/${handle}` : `${baseUrl}${item.link || ""}`;
    const bitstream = (detail.bitstreams || []).find(
      (file) =>
        file.bundleName === "ORIGINAL" &&
        (/\.pdf(?:$|[?])/i.test(file.name || "") || /pdf/i.test(file.format || ""))
    );
    const pdfUrl = bitstream && bitstream.link ? `${baseUrl}${bitstream.link}/retrieve` : "";

    return result({
      site,
      sourceId,
      title,
      authors,
      year,
      sourceUrl,
      pdfUrl,
      availability: pdfUrl ? "PDF de acesso aberto" : "Livro de acesso aberto",
      languages,
      formats: pdfUrl ? ["PDF", "Livro open access"] : ["Livro open access"],
      rights: rights || "Acesso aberto conforme o repositorio",
      confidence: 0.85,
      description: firstSentence(meta["dc.description.abstract"] && meta["dc.description.abstract"][0])
    });
  });
}

async function searchLibriVox(query) {
  const fields = "id,title,authors,url_librivox,url_project,url_text_source,language,coverart_jpg";
  const url =
    `https://librivox.org/api/feed/audiobooks/?title=${encode(query)}` +
    `&format=json&limit=10&extended=1&coverart=1&fields={${fields}}`;
  const data = await fetchJson(url);

  return (data.books || []).slice(0, 10).map((book) => {
    const authors = (book.authors || []).map((author) =>
      [author.first_name, author.last_name].filter(Boolean).join(" ")
    );

    return result({
      site: "LibriVox",
      sourceId: "librivox",
      title: book.title,
      authors,
      sourceUrl: book.url_librivox || book.url_project || book.url_text_source,
      coverUrl: book.coverart_jpg || "",
      availability: "Audiolivro público",
      languages: book.language ? [book.language] : [],
      formats: ["Audio"],
      rights: "Domínio público em áudio pela LibriVox",
      confidence: 0.76,
      description: "Fonte de áudio; a LibriVox não disponibiliza PDF."
    });
  });
}

async function searchWikisource(query) {
  const data = await fetchJson(
    `https://pt.wikisource.org/w/api.php?action=query&list=search&srsearch=${encode(query)}&format=json&origin=*&srlimit=8`
  );
  const rows = (data.query && data.query.search) || [];

  return rows.slice(0, 8).map((page) =>
    result({
      site: "Wikisource em português",
      sourceId: "wikisource-api",
      title: page.title,
      sourceUrl: `https://pt.wikisource.org/wiki/${encodePath(page.title.replace(/\s+/g, "_"))}`,
      availability: "Texto livre",
      formats: ["HTML"],
      rights: "Texto livre ou domínio público conforme a Wikisource",
      confidence: 0.7,
      description: firstSentence(page.snippet)
    })
  );
}

async function searchWikibooks(query) {
  const data = await fetchJson(
    `https://pt.wikibooks.org/w/api.php?action=query&list=search&srsearch=${encode(query)}&format=json&origin=*&srlimit=8`
  );
  const rows = (data.query && data.query.search) || [];

  return rows.slice(0, 8).map((page) =>
    result({
      site: "Wikilivros",
      sourceId: "wikibooks-api",
      title: page.title,
      sourceUrl: `https://pt.wikibooks.org/wiki/${encodePath(page.title.replace(/\s+/g, "_"))}`,
      availability: "Livro didatico livre",
      formats: ["HTML"],
      rights: "Conteudo livre conforme Wikilivros",
      confidence: 0.64,
      description: firstSentence(page.snippet)
    })
  );
}

async function searchHtmlSource(source, query) {
  const searchUrl = source.searchUrl(query);
  const html = await fetchText(searchUrl, HTML_SEARCH_TIMEOUT_MS);
  const links = extractLinks(html, source.baseUrl);
  const candidates = links
    .map((link) => ({ ...link, score: scoreLink(link, query, source) }))
    .filter((link) => link.score > 0 && isCatalogLink(link, source))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const detailed = await Promise.all(
    candidates.map(async (link) => {
      const pdfUrl =
        source.pdfPolicy === "direct-public" ? await findPdfFromPage(link.href) : "";

      return result({
        site: source.name,
        sourceId: source.id,
        title: link.text || `Resultado em ${source.name}`,
        sourceUrl: link.href,
        pdfUrl,
        availability: pdfUrl ? "PDF direto" : "Verificar na fonte",
        languages: [],
        formats: pdfUrl ? ["PDF"] : [],
        rights: source.access,
        confidence: Math.min(0.74, 0.42 + link.score / 10)
      });
    })
  );

  if (detailed.length) {
    return detailed;
  }

  return [
    result({
      site: source.name,
      sourceId: source.id,
      title: `Pesquisar "${query}" em ${source.name}`,
      sourceUrl: searchUrl,
      availability: "Busca no catalogo",
      languages: [],
      formats: [],
      rights: source.access,
      confidence: 0.28,
      isCatalogSearch: true
    })
  ];
}

async function findInternetArchivePdf(identifier) {
  if (!identifier) return "";

  try {
    const metadata = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, HTML_DETAIL_TIMEOUT_MS);
    const files = metadata.files || [];
    const pdf =
      files.find((file) => isPreferredPdf(file)) ||
      files.find((file) => file.name && /\.pdf$/i.test(file.name));

    if (!pdf || !pdf.name) return "";
    return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodePath(pdf.name)}`;
  } catch {
    return "";
  }
}

async function findPdfFromPage(pageUrl) {
  try {
    const html = await fetchText(pageUrl, HTML_DETAIL_TIMEOUT_MS);
    const links = extractLinks(html, pageUrl);
    const pdf = links.find((link) => /\.pdf(?:$|[?#])/i.test(link.href));
    return pdf ? pdf.href : "";
  } catch {
    return "";
  }
}

function isPreferredPdf(file) {
  const format = String(file.format || "").toLowerCase();
  const name = String(file.name || "");
  return /\.pdf$/i.test(name) && /(text pdf|pdf|additional text pdf)/i.test(format);
}

function dedupePdfCandidates(candidates) {
  return uniqueBy(candidates.filter((candidate) => candidate.pdfUrl), (candidate) =>
    normalize(candidate.pdfUrl)
  );
}

function isSafePdfCandidate(candidate, query, language = "any") {
  if (!candidate || !/\.pdf(?:$|[?#])/i.test(candidate.pdfUrl || "")) return false;
  if (!matchesQuery({ title: candidate.title, pdfUrl: candidate.pdfUrl, sourceUrl: candidate.sourceUrl }, query)) {
    return false;
  }
  if (language === "pt" && !looksPortugueseTitle(`${candidate.title} ${fileNameText(candidate.pdfUrl)}`)) return false;

  const host = hostName(candidate.pdfUrl);
  if (isTrustedPdfHost(host)) return true;

  const hintText = normalize(`${candidate.title} ${candidate.pdfUrl}`);
  return PUBLIC_PDF_HINT_TOKENS.some((hint) => hintText.includes(normalize(hint)));
}

function isTrustedPdfHost(host) {
  return TRUSTED_PDF_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function unwrapSearchResultUrl(href) {
  try {
    const url = new URL(href);
    const candidate =
      url.searchParams.get("uddg") ||
      url.searchParams.get("q") ||
      url.searchParams.get("url") ||
      url.searchParams.get("u") ||
      href;
    return new URL(candidate, href).toString();
  } catch {
    return href;
  }
}

function hostName(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function hostLabel(value) {
  const host = hostName(value);
  if (!host) return "";
  return host
    .split(".")
    .slice(0, -1)
    .join(".")
    .replace(/[-_]+/g, " ");
}

function extractLinks(html, baseUrl) {
  const links = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(html))) {
    const attrs = match[1] || "";
    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;

    const text = decodeHtml(stripTags(match[2])).replace(/\s+/g, " ").trim();
    const href = toAbsoluteUrl(hrefMatch[1], baseUrl);
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) continue;

    links.push({ href, text });
  }

  return uniqueBy(links, (link) => `${link.href}|${link.text}`).slice(0, 80);
}

function scoreLink(link, query, source) {
  const tokens = tokenize(query);
  const haystack = `${link.text} ${link.href}`.toLowerCase();
  if (!tokens.length) return 0;

  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += token.length > 3 ? 2 : 1;
  }

  const lowerText = link.text.toLowerCase();
  if (lowerText.includes(query.toLowerCase())) score += 4;
  if (/download|pdf|book|ebook|livro|read|title/i.test(link.href)) score += 1;
  if (new URL(link.href).hostname.replace(/^www\./, "") === new URL(source.baseUrl).hostname.replace(/^www\./, "")) {
    score += 1;
  }

  return score;
}

function isCatalogLink(link, source) {
  const url = new URL(link.href);
  const sourceHost = new URL(source.baseUrl).hostname.replace(/^www\./, "");
  const linkHost = url.hostname.replace(/^www\./, "");
  const text = link.text.toLowerCase();

  if (!link.text || link.text.length < 3) return false;
  if (text.length > 180) return false;
  if (/privacy|terms|contact|login|sign in|account|facebook|twitter|instagram/i.test(text)) {
    return false;
  }

  return linkHost === sourceHost || /\.pdf(?:$|[?#])/i.test(link.href);
}

function buildCatalogChecks(query) {
  return [...HTML_SOURCES, ...ADDITIONAL_SOURCES, ...DISCOVERY_SOURCES].map((source) => ({
    id: source.id,
    site: source.name,
    sourceUrl: source.searchUrl(query),
    access: source.access,
    pdfMode:
      source.pdfPolicy === "direct-public"
        ? "PDF direto quando a página publicar o arquivo"
        : "PDF apenas pela fonte"
  }));
}

function result(data) {
  const languages = uniqueBy(asArray(data.languages).map(cleanText).filter(Boolean), (item) => normalize(item));
  const formats = uniqueBy(asArray(data.formats).map(cleanText).filter(Boolean), (item) => item).slice(0, 6);
  return {
    id: makeResultId(data),
    sourceId: data.sourceId || "",
    site: data.site || "",
    category: categoryFor(data.site || "", formats),
    title: cleanText(data.title) || "Título não informado",
    authors: asArray(data.authors).map(cleanText).filter(Boolean).slice(0, 4),
    year: cleanText(data.year),
    sourceUrl: data.sourceUrl || "",
    pdfUrl: data.pdfUrl || "",
    pdfVerified: Boolean(data.pdfVerified),
    pdfVerification: cleanText(data.pdfVerification || ""),
    epubUrl: data.epubUrl || "",
    textUrl: data.textUrl || "",
    pdfSourceUrl: data.pdfSourceUrl || "",
    pdfSourceSite: cleanText(data.pdfSourceSite || (data.pdfUrl ? data.site : "")),
    pdfDiscoveredBy: cleanText(data.pdfDiscoveredBy || ""),
    coverUrl: normalizeImageUrl(data.coverUrl || ""),
    availability: data.availability || "Verificar na fonte",
    languages,
    languageLabel: data.languageLabel || "",
    formats,
    rights: data.rights || "Verificar direitos na fonte",
    confidence: Number(data.confidence || 0),
    description: cleanText(data.description || ""),
    isCatalogSearch: Boolean(data.isCatalogSearch)
  };
}

function categoryFor(site, formats) {
  const siteKey = normalize(site);
  const formatKey = formats.map(normalize).join(" ");
  if (formatKey.includes("audio")) return "audiolivro";
  if (
    formatKey.includes("artigo") ||
    siteKey.includes("openalex") ||
    siteKey.includes("crossref") ||
    siteKey.includes("arxiv")
  ) {
    return "artigo";
  }
  if (/(^| )pdf( |$)/.test(formatKey) || formatKey.includes("epub") || formatKey.includes("kindle")) {
    return "livro";
  }
  if (
    formatKey.includes("html") ||
    formatKey.includes("txt") ||
    siteKey.includes("wikisource") ||
    siteKey.includes("wikilivros") ||
    siteKey.includes("wikibooks")
  ) {
    return "texto";
  }
  return "livro";
}

function isLanguageResult(entry, query, language = "any") {
  if (entry.isCatalogSearch) return false;
  if (!matchesQuery(entry, query)) return false;
  return passesLanguageFilter(entry, query, language);
}

function passesLanguageFilter(entry, query, language = "any") {
  if (language === "any") return true;

  const accepted = SUPPORTED_LANGUAGES[language].codes;
  const declared = asArray(entry.languages).map(normalize);
  if (declared.some((item) => accepted.includes(item))) return true;
  if (language !== "pt") return false;

  const titleText = `${entry.title || ""} ${fileNameText(entry.pdfUrl)} ${fileNameText(entry.sourceUrl)}`;
  if (looksPortugueseTitle(titleText)) return true;

  const normalizedTitle = normalize(entry.title);
  const normalizedQuery = normalize(query);
  const sameTitle = normalizedTitle === normalizedQuery || normalizedTitle.includes(normalizedQuery);
  return sameTitle && looksPortugueseTitle(query);
}

function normalizeLanguage(value) {
  const language = String(value || "any").toLowerCase();
  return SUPPORTED_LANGUAGES[language] ? language : "any";
}

function languageLabel(languages, requested) {
  const values = asArray(languages).map(cleanText).filter(Boolean);
  if (values.length) return values.slice(0, 2).join(", ").toUpperCase();
  return requested === "any" ? "Idioma não informado" : SUPPORTED_LANGUAGES[requested].label;
}

function matchesQuery(entry, query) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return false;

  const text = normalize(
    [
      entry.title,
      asArray(entry.authors).join(" "),
      fileNameText(entry.pdfUrl),
      fileNameText(entry.sourceUrl)
    ].join(" ")
  );
  const normalizedQuery = normalize(query);
  if (text.includes(normalizedQuery)) return true;

  const hits = queryTokens.filter((token) => text.includes(token)).length;
  return hits >= Math.min(2, queryTokens.length);
}

function looksPortugueseTitle(value) {
  const raw = cleanText(value);
  if (!raw) return false;
  if (/[\u00e1\u00e0\u00e2\u00e3\u00e9\u00ea\u00ed\u00f3\u00f4\u00f5\u00fa\u00e7]/i.test(raw)) return true;

  const tokens = tokenize(raw);
  const strongHits = tokens.filter((token) => PORTUGUESE_STRONG_TITLE_TOKENS.has(token)).length;
  if (strongHits > 0) return true;

  const connectorHits = tokens.filter((token) => PORTUGUESE_CONNECTOR_TOKENS.has(token)).length;
  return connectorHits >= 2;
}

const PORTUGUESE_CONNECTOR_TOKENS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "no",
  "na",
  "nos",
  "nas",
  "ao",
  "aos",
  "pelo",
  "pela",
  "pelos",
  "pelas",
  "para",
  "com",
  "sem",
  "sobre",
  "entre",
  "que"
]);

const PORTUGUESE_STRONG_TITLE_TOKENS = new Set([
  "alienista",
  "assis",
  "azevedo",
  "brasil",
  "brasileira",
  "brasileiro",
  "bras",
  "borba",
  "cartas",
  "casmurro",
  "contos",
  "cortico",
  "cronicas",
  "dicionario",
  "direito",
  "dom",
  "economia",
  "educacao",
  "filosofia",
  "gramatica",
  "historia",
  "historias",
  "iracema",
  "introducao",
  "lendas",
  "lingua",
  "literatura",
  "livro",
  "livros",
  "lobato",
  "lusiadas",
  "machado",
  "manual",
  "memorias",
  "menino",
  "moreninha",
  "obras",
  "orgulho",
  "poemas",
  "poesias",
  "portugues",
  "portuguesa",
  "preconceito",
  "quincas",
  "romance",
  "saude",
  "senhora",
  "sertoes",
  "sociologia",
  "triste"
]);

function fileNameText(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const fileName = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
    return fileName.replace(/\.[a-z0-9]{2,6}$/i, "").replace(/[-_+]+/g, " ");
  } catch {
    return "";
  }
}

function rankResults(results, query) {
  return results
    .map((entry) => ({
      ...entry,
      rank:
        (entry.pdfUrl ? 1.4 : 0) +
        (entry.isCatalogSearch ? -0.5 : 0) +
        (entry.textUrl || entry.epubUrl ? 0.5 : 0) +
        Math.min((entry.formats || []).length, 3) * 0.12 +
        ((entry.mergedFrom || []).length > 1 ? 0.35 : 0) +
        (entry.pdfUrl && isTrustedPdfHost(hostName(entry.pdfUrl)) ? 0.25 : 0) +
        entry.confidence +
        titleMatchBonus(entry, query)
    }))
    .sort((a, b) => b.rank - a.rank)
    .map(({ rank, ...entry }) => entry);
}

function titleMatchBonus(entry, query) {
  const normalizedTitle = normalize(entry.title);
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;
  if (normalizedTitle === normalizedQuery) return 1.4;
  if (normalizedTitle.includes(normalizedQuery)) return 0.7;
  return tokenize(query).reduce((sum, token) => sum + (normalizedTitle.includes(token) ? 0.12 : 0), 0);
}

function dedupeResults(results) {
  return uniqueBy(results, (entry) => {
    const urlKey = entry.sourceUrl ? normalize(entry.sourceUrl) : "";
    return `${entry.sourceId}|${normalize(entry.title)}|${urlKey}`;
  });
}

function fuzzyGroupResults(results) {
  const groups = [];
  for (const entry of results) {
    const group = groups.find((candidate) => sameBook(candidate.base, entry));
    if (group) {
      group.members.push(entry);
      group.base = mergeEntries(group.base, entry);
    } else {
      groups.push({ base: entry, members: [entry] });
    }
  }
  return groups.map((group) => group.base);
}

function titleTokens(value) {
  return new Set(tokenize(value));
}

function authorsOverlap(a, b) {
  const aAuthors = new Set(asArray(a.authors).map(normalize).filter(Boolean));
  const bAuthors = new Set(asArray(b.authors).map(normalize).filter(Boolean));
  return [...aAuthors].some((author) => bAuthors.has(author));
}

function sameBook(a, b) {
  const aTokens = titleTokens(a.title);
  const bTokens = titleTokens(b.title);
  if (!aTokens.size || !bTokens.size) return false;

  const common = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = aTokens.size + bTokens.size - common;
  const jaccard = common / union;

  if (jaccard >= 0.7) return true;
  if (jaccard >= 0.45 && authorsOverlap(a, b)) return true;

  const aTitle = normalize(a.title);
  const bTitle = normalize(b.title);
  if (aTitle.length >= 6 && (aTitle.includes(bTitle) || bTitle.includes(aTitle))) return true;
  return false;
}

function mergeEntries(base, other) {
  const merged = { ...base };

  if (!merged.pdfUrl && other.pdfUrl) {
    merged.pdfUrl = other.pdfUrl;
    merged.pdfSourceUrl = other.pdfSourceUrl || other.sourceUrl;
    merged.pdfSourceSite = other.pdfSourceSite || other.site;
    merged.pdfDiscoveredBy = other.pdfDiscoveredBy || merged.pdfDiscoveredBy;
    merged.availability = "PDF direto";
  }
  if (!merged.coverUrl && other.coverUrl) merged.coverUrl = other.coverUrl;
  if (!merged.epubUrl && other.epubUrl) merged.epubUrl = other.epubUrl;
  if (!merged.textUrl && other.textUrl) merged.textUrl = other.textUrl;
  if (!merged.description && other.description) merged.description = other.description;

  merged.formats = uniqueBy([...asArray(merged.formats), ...asArray(other.formats)], (item) => normalize(item)).slice(0, 6);
  merged.languages = uniqueBy([...asArray(merged.languages), ...asArray(other.languages)], (item) => normalize(item));
  merged.confidence = Math.max(base.confidence || 0, other.confidence || 0);
  merged.mergedFrom = uniqueBy(
    [...asArray(base.mergedFrom || [base.site]), ...asArray(other.mergedFrom || [other.site])],
    (item) => normalize(item)
  );
  return merged;
}

function looksLikeIsbn(value) {
  const clean = String(value || "").replace(/[\s-]/g, "");
  return /^(?:\d{9}[\dXx]|\d{13})$/.test(clean);
}

function normalizeIsbn(value) {
  return String(value || "").replace(/[\s-]/g, "").toUpperCase();
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

function buildSourceDirectory() {
  const counts = new Map();
  return [...ORIGINAL_SITES, ...ADDITIONAL_SITES].map((site, index) => {
    const key = normalize(site);
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);

    return {
      order: index + 1,
      name: site,
      duplicate: count > 1,
      uniqueName: count > 1 ? `${site} (${count})` : site
    };
  });
}

function buildStatistics() {
  const catalogedSources = new Set(
    [...API_SOURCES, ...HTML_SOURCES, ...ADDITIONAL_SOURCES, ...DISCOVERY_SOURCES].map((source) => source.id)
  ).size;
  const databasesPerSearch = API_SOURCES.length + HTML_SOURCES.length;
  const trustedPdfHosts = new Set(TRUSTED_PDF_HOST_SUFFIXES).size;
  const languages = Object.keys(SUPPORTED_LANGUAGES).length - 1;
  const cacheTtlMinutes = SEARCH_CACHE_TTL_MS / 60000;
  const formatCombinations = languages * Math.pow(2, 4);

  const facts = [
    `Cada busca dispara ${databasesPerSearch} bases em paralelo — se fossem consultadas em série, seriam cerca de ${databasesPerSearch} segundos por busca.`,
    `São ${catalogedSources} fontes catalogadas para no máximo ${MAX_RESULTS} resultados exibidos: em média, cada fonte "empresta" menos de 1 resultado por busca.`,
    `O cache guarda até ${SEARCH_CACHE_MAX_ENTRIES} buscas por ${cacheTtlMinutes} minutos. Se 100 pessoas procurarem o mesmo livro em uma hora, metade delas não precisa refazer o trabalho.`,
    `Com ${languages} idiomas e 4 filtros de formato (PDF, ePub, áudio e texto), existem ${formatCombinations} combinações básicas de filtro — além do interruptor "Somente PDF".`,
    `${trustedPdfHosts} domínios são considerados fontes confiáveis de PDF público; qualquer arquivo vindo de fora deles passa por conferência extra antes de ser anexado.`,
    `A busca equilibra ${API_SOURCES.length} bases com API dedicada e ${HTML_SOURCES.length} catálogos navegados por página, combinando velocidade e cobertura.`
  ];

  return {
    apiSources: API_SOURCES.length,
    htmlSources: HTML_SOURCES.length,
    additionalSources: ADDITIONAL_SOURCES.length,
    discoveryTools: DISCOVERY_SOURCES.length,
    catalogedSources,
    databasesPerSearch,
    trustedPdfHosts,
    languages,
    maxResults: MAX_RESULTS,
    cacheTtlMinutes,
    cacheCapacity: SEARCH_CACHE_MAX_ENTRIES,
    facts
  };
}

async function serveStatic(pathname, response) {
  const cleanPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(response, "Arquivo inválido.", 400);
    return;
  }

  try {
    const fileSystem = await getFileSystem();
    const body = await fileSystem.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": staticCacheControl(filePath)
    });
    response.end(body);
  } catch {
    sendText(response, "Nao encontrado.", 404);
  }
}

async function fetchJson(url, timeoutMs = 9000) {
  const response = await fetchWithTimeout(url, timeoutMs, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

function withTimeout(promise, timeoutMs) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Tempo esgotado")), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

async function fetchText(url, timeoutMs = 9000) {
  const response = await fetchWithTimeout(url, timeoutMs, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchWithTimeout(url, timeoutMs, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timeout);
  }
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, text, status = 200) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(text);
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  };

  return types[extension] || "application/octet-stream";
}

function staticCacheControl(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".svg"].includes(extension)) {
    return "public, max-age=86400, immutable";
  }
  if ([".css", ".js"].includes(extension)) {
    return "public, max-age=300";
  }
  return "no-cache";
}

function encode(value) {
  return encodeURIComponent(value);
}

function encodePath(value) {
  return String(value).split("/").map(encodeURIComponent).join("/");
}

function cleanQuery(value) {
  return String(value).replace(/\s+/g, " ").trim().slice(0, 120);
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return decodeHtml(String(value)).replace(/\s+/g, " ").trim();
}

function stripTags(value) {
  return String(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
}

function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalize(value).split(/\s+/).filter((token) => token.length > 1);
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}

function toAbsoluteUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return "";
  }
}

function normalizeImageUrl(value) {
  if (!value) return "";
  return String(value).replace(/^http:\/\//i, "https://");
}

function findFormatUrl(formats, needle) {
  const entry = Object.entries(formats || {}).find(([mime, url]) =>
    mime.toLowerCase().includes(needle.toLowerCase()) && url
  );
  return entry ? entry[1] : "";
}

function shortFormat(format) {
  const lower = String(format).toLowerCase();
  if (lower.includes("pdf")) return "PDF";
  if (lower.includes("epub")) return "EPUB";
  if (lower.includes("kindle") || lower.includes("mobi")) return "Kindle";
  if (lower.includes("html")) return "HTML";
  if (lower.includes("plain")) return "TXT";
  if (lower.includes("jpeg") || lower.includes("image")) return "";
  return "";
}

function firstAuthorYear(authors) {
  const author = (authors || [])[0];
  if (!author) return "";
  if (author.birth_year && author.death_year) return `${author.birth_year}-${author.death_year}`;
  return "";
}

function yearFromDate(value) {
  const match = String(value || "").match(/\d{4}/);
  return match ? match[0] : "";
}

function firstSentence(value) {
  const text = cleanText(stripTags(value || ""));
  if (!text) return "";
  const sentence = text.match(/^(.{40,220}?[.!?])\s/);
  return sentence ? sentence[1] : text.slice(0, 220);
}

function makeResultId(data) {
  return Buffer.from(`${data.site}|${data.title}|${data.sourceUrl || data.pdfUrl || ""}`)
    .toString("base64url")
    .slice(0, 28);
}

function readableError(error) {
  if (error && error.name === "AbortError") return "Tempo esgotado";
  return cleanText(error && error.message ? error.message : "Falha ao consultar fonte");
}

module.exports = { handleRequest, serveStatic, buildStatistics, SOURCE_PAYLOAD };
