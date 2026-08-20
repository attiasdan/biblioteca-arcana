"use strict";

const form = document.querySelector("#searchForm");
const searchBtn = document.querySelector("#searchBtn");
const queryInput = document.querySelector("#query");
const languageInput = document.querySelector("#language");
const pdfOnlyInput = document.querySelector("#pdfOnly");
const sortInput = document.querySelector("#sortOrder");
const yearMinInput = document.querySelector("#yearMin");
const yearMaxInput = document.querySelector("#yearMax");
const formatCheckboxes = Array.from(document.querySelectorAll(".format-filter"));
const categoryInput = document.querySelector("#category");
const resultsNode = document.querySelector("#results");
const summaryNode = document.querySelector(".summary");
const messageNode = document.querySelector("#message");
const resultTemplate = document.querySelector("#resultTemplate");
const skeletonTemplate = document.querySelector("#skeletonTemplate");
const progressWrap = document.querySelector("#progressWrap");
const progressText = document.querySelector("#progressText");
const progressEta = document.querySelector("#progressEta");
const progressBar = document.querySelector("#progressBar");
const progressTrack = document.querySelector(".progress-track");
const setProgress = (percent) => {
  progressBar.style.width = `${percent}%`;
  progressTrack.setAttribute("aria-valuenow", String(Math.round(percent)));
};
const owlTitle = document.querySelector("#owlTitle");
const owlMessage = document.querySelector("#owlMessage");
const owlAction = document.querySelector("#owlAction");
const fxLayer = document.querySelector("#fxLayer");
const fxToggle = document.querySelector("#fxToggle");
const randomBtn = document.querySelector("#randomBtn");
const shareBtn = document.querySelector("#shareBtn");
const exportBtn = document.querySelector("#exportBtn");
const shelfOpenBtn = document.querySelector("#shelfOpen");
const shelfCount = document.querySelector("#shelfCount");
const shelfPanel = document.querySelector("#shelfPanel");
const shelfOverlay = document.querySelector("#shelfOverlay");
const shelfClose = document.querySelector("#shelfClose");
const shelfList = document.querySelector("#shelfList");
const toasts = document.querySelector("#toasts");
const historyChips = document.querySelector("#historyChips");
const sourceCount = document.querySelector("#sourceCount");
const resultCountEl = document.querySelector("#resultCount");
const pdfCountEl = document.querySelector("#pdfCount");
const sourceOkCountEl = document.querySelector("#sourceOkCount");
const searchNote = document.querySelector("#searchNote");
const statsGrid = document.querySelector("#statsGrid");
const statsFact = document.querySelector("#statsFact");
const statsStatus = document.querySelector("#statsStatus");
const statsLast = document.querySelector("#statsLast");
const translateForm = document.querySelector("#translateForm");
const translateFile = document.querySelector("#translateFile");
const translateSource = document.querySelector("#translateSource");
const translateTarget = document.querySelector("#translateTarget");
const translateBtn = document.querySelector("#translateBtn");
const translateStatus = document.querySelector("#translateStatus");
const pdfTranslateDialog = document.querySelector("#pdfTranslateDialog");
const pdfTranslateDialogForm = document.querySelector("#pdfTranslateDialogForm");
const pdfTranslateBook = document.querySelector("#pdfTranslateBook");
const pdfTranslateSource = document.querySelector("#pdfTranslateSource");
const pdfTranslateTarget = document.querySelector("#pdfTranslateTarget");
const pdfTranslateDialogStatus = document.querySelector("#pdfTranslateDialogStatus");
const pdfTranslateSubmit = document.querySelector("#pdfTranslateSubmit");
const pdfTranslateCancel = document.querySelector("#pdfTranslateCancel");
const translationProgress = {
  upload: {
    wrap: document.querySelector("#translateProgress"),
    text: document.querySelector("#translateProgressText"),
    eta: document.querySelector("#translateProgressEta"),
    bar: document.querySelector("#translateProgressBar")
  },
  remote: {
    wrap: document.querySelector("#pdfTranslateProgress"),
    text: document.querySelector("#pdfTranslateProgressText"),
    eta: document.querySelector("#pdfTranslateProgressEta"),
    bar: document.querySelector("#pdfTranslateProgressBar")
  }
};

const SHELF_KEY = "biblioteca-arcana-shelf";
const HISTORY_KEY = "biblioteca-arcana-history";
const MOTION_KEY = "biblioteca-arcana-motion";
const MAX_HISTORY = 8;

const LANGUAGE_LABELS = {
  any: "todos os idiomas",
  pt: "português",
  en: "inglês",
  es: "espanhol",
  fr: "francês",
  de: "alemão",
  it: "italiano"
};

function updateSearchNote() {
  const lang = languageInput.value;
  searchNote.textContent = lang === "any"
    ? "Buscando em todos os idiomas"
    : `Buscando somente em ${LANGUAGE_LABELS[lang] || lang}`;
}

const OWL_PHASES = [
  { title: "As estantes se abrem…", msg: "Consultando catálogos gratuitos e públicos em paralelo." },
  { title: "A coruja voa entre os acervos…", msg: "Lendo APIs e páginas de busca de dezenas de bibliotecas." },
  { title: "Caçando PDFs públicos…", msg: "Raspando motores de busca atrás de arquivos abertos." },
  { title: "Unificando o que é igual…", msg: "Consolidando o mesmo livro encontrado em vários catálogos." },
  { title: "Organizando o salão…", msg: "Ranqueando as melhores pistas e conferindo licenças." }
];

const CURATED_QUERIES = [
  "Dom Casmurro", "Pride and Prejudice", "Cien años de soledad", "Les Misérables",
  "O Cortiço", "Crime and Punishment", "Don Quixote", "Guerra e Paz",
  "Frankenstein", "The Odyssey", "Le Petit Prince", "Macunaíma",
  "Moby-Dick", "Alice's Adventures in Wonderland", "Grande Sertão Veredas", "1984",
  "La Divina Commedia", "Quincas Borba", "O Guarani", "Fausto"
];

const state = {
  payload: null,
  filtered: [],
  bestId: null,
  loading: false,
  owlTimer: null,
  pdfTranslationItem: null,
  translationTimers: { upload: null, remote: null }
};

const motionReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ============ Busca ============ */

form.addEventListener("submit", (event) => {
  event.preventDefault();
  castSpell(searchBtn);
  runSearch();
});

languageInput.addEventListener("change", () => {
  updateSearchNote();
  if (queryInput.value.trim()) runSearch();
});

pdfOnlyInput.addEventListener("change", () => {
  if (queryInput.value.trim()) runSearch();
});

for (const control of [sortInput, yearMinInput, yearMaxInput, categoryInput, ...formatCheckboxes]) {
  control.addEventListener("input", () => { if (state.payload) renderFiltered(); });
  control.addEventListener("change", () => { if (state.payload) renderFiltered(); });
}

async function runSearch() {
  const query = queryInput.value.trim();
  if (!query) return;

  const params = new URLSearchParams({ q: query, lang: languageInput.value });
  if (pdfOnlyInput.checked) params.set("pdf", "1");

  startLoading();
  try {
    const response = await fetch(`/api/search?${params}`);
    if (!response.ok) throw new Error("A busca não pôde ser concluída.");
    state.payload = await response.json();
    pushHistory(query);
    syncUrl(query);
    renderFiltered(true);
  } catch (error) {
    messageNode.classList.add("error");
    messageNode.textContent = error.message || "Falha de rede. Tente novamente.";
  } finally {
    stopLoading();
  }
}

/* ============ Tradução de PDF ============ */

translateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = translateFile.files?.[0];
  const source = translateSource.value;
  const target = translateTarget.value;

  if (!file) {
    setTranslateStatus("Escolha um arquivo PDF.", true);
    return;
  }
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    setTranslateStatus("O arquivo precisa estar no formato PDF.", true);
    return;
  }
  if (file.size > 200 * 1024 * 1024) {
    setTranslateStatus("O PDF excede o limite de 200 MB.", true);
    return;
  }
  if (source !== "auto" && source === target) {
    setTranslateStatus("Escolha idiomas de origem e destino diferentes.", true);
    return;
  }

  translateBtn.disabled = true;
  translateBtn.textContent = "Traduzindo o livro…";
  setTranslateStatus("Extraindo texto, traduzindo blocos e reconstruindo as páginas…");
  startTranslationProgress("upload", estimateTranslationSeconds(file.size));
  try {
    const params = new URLSearchParams({ source, target });
    const response = await fetch(`/api/translate-pdf?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: file
    });
    if (!response.ok) {
      let message = "A tradução não pôde ser concluída.";
      try { message = (await response.json()).error || message; } catch { /* resposta não JSON */ }
      throw new Error(message);
    }

    const pages = await downloadTranslatedResponse(
      response,
      `livro-traduzido-${source === "auto" ? "detectado" : source}-${target}.pdf`
    );
    setTranslateStatus(`PDF traduzido baixado${pages ? ` (${pages} páginas)` : ""}.`, false);
    toast("O PDF traduzido foi baixado");
  } catch (error) {
    setTranslateStatus(error.message || "Falha de rede ao traduzir o PDF.", true);
  } finally {
    finishTranslationProgress("upload", !translateStatus.classList.contains("error"));
    translateBtn.disabled = false;
    translateBtn.textContent = "Traduzir e baixar PDF";
  }
});

function setTranslateStatus(message, error = false) {
  translateStatus.textContent = message;
  translateStatus.classList.toggle("error", error);
}

async function downloadTranslatedResponse(response, filename) {
  const translated = await response.blob();
  const downloadUrl = URL.createObjectURL(translated);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  return response.headers.get("X-PDF-Translation-Pages") || "";
}

function openPdfTranslation(item) {
  state.pdfTranslationItem = item;
  pdfTranslateBook.textContent = `${item.title} · ${item.site || "Acervo"}`;
  const detected = firstLanguageCode(item.languages);
  pdfTranslateSource.value = detected || "auto";
  pdfTranslateTarget.value = detected === "en" ? "pt" : "en";
  pdfTranslateDialogStatus.textContent = "";
  pdfTranslateDialogStatus.classList.remove("error");
  if (typeof pdfTranslateDialog.showModal === "function") {
    pdfTranslateDialog.showModal();
  } else {
    pdfTranslateDialog.setAttribute("open", "");
  }
}

function firstLanguageCode(languages) {
  return (languages || [])
    .map((language) => String(language || "").toLowerCase().split(/[-_]/)[0])
    .find((language) => ["pt", "en", "es", "fr", "de", "it", "ja", "zh", "ru"].includes(language)) || "";
}

pdfTranslateCancel.addEventListener("click", () => {
  pdfTranslateDialog.close?.();
  pdfTranslateDialog.removeAttribute("open");
});

pdfTranslateDialogForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const item = state.pdfTranslationItem;
  const source = pdfTranslateSource.value;
  const target = pdfTranslateTarget.value;
  if (!item?.pdfUrl) return;
  if (source !== "auto" && source === target) {
    setPdfTranslateDialogStatus("Escolha idiomas diferentes.", true);
    return;
  }

  pdfTranslateSubmit.disabled = true;
  pdfTranslateCancel.disabled = true;
  pdfTranslateSubmit.textContent = "Traduzindo…";
  setPdfTranslateDialogStatus("Baixando o PDF da fonte e traduzindo o livro inteiro…");
  startTranslationProgress("remote", 90);
  try {
    const response = await fetch(`/api/translate-pdf-url?source=${encodeURIComponent(source)}&target=${encodeURIComponent(target)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfUrl: item.pdfUrl })
    });
    if (!response.ok) {
      let message = "A tradução não pôde ser concluída.";
      try { message = (await response.json()).error || message; } catch { /* resposta não JSON */ }
      throw new Error(message);
    }
    const pages = await downloadTranslatedResponse(
      response,
      `livro-${slugifyFilename(item.title)}-traduzido-${target}.pdf`
    );
    setPdfTranslateDialogStatus(`PDF baixado${pages ? ` (${pages} páginas)` : ""}.`);
    toast(`PDF traduzido: ${item.title}`);
    setTimeout(() => {
      pdfTranslateDialog.close?.();
      pdfTranslateDialog.removeAttribute("open");
    }, 900);
  } catch (error) {
    setPdfTranslateDialogStatus(error.message || "Falha de rede ao traduzir o PDF.", true);
  } finally {
    finishTranslationProgress("remote", !pdfTranslateDialogStatus.classList.contains("error"));
    pdfTranslateSubmit.disabled = false;
    pdfTranslateCancel.disabled = false;
    pdfTranslateSubmit.textContent = "Traduzir e baixar";
  }
});

function setPdfTranslateDialogStatus(message, error = false) {
  pdfTranslateDialogStatus.textContent = message;
  pdfTranslateDialogStatus.classList.toggle("error", error);
}

function estimateTranslationSeconds(bytes) {
  const megabytes = Math.max(0.1, bytes / (1024 * 1024));
  return Math.round(Math.min(12 * 60, Math.max(25, 25 + megabytes * 9)));
}

function formatDuration(seconds) {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${minutes}min ${remainder}s` : `${minutes}min`;
}

function startTranslationProgress(kind, estimateSeconds) {
  const progress = translationProgress[kind];
  if (!progress?.wrap) return;
  clearInterval(state.translationTimers[kind]);
  const startedAt = Date.now();
  progress.wrap.hidden = false;
  progress.bar.style.width = "2%";
  progress.bar.parentElement.setAttribute("aria-valuenow", "2");
  progress.text.textContent = "Extraindo o texto do PDF…";
  progress.eta.textContent = `estimativa: ~${formatDuration(estimateSeconds)}`;

  const update = () => {
    const elapsed = (Date.now() - startedAt) / 1000;
    const ratio = Math.min(0.92, elapsed / Math.max(estimateSeconds * 1.15, 1));
    const percent = Math.max(2, Math.round(ratio * 100));
    progress.bar.style.width = `${percent}%`;
    progress.bar.parentElement.setAttribute("aria-valuenow", String(percent));
    progress.text.textContent = percent < 15
      ? "Extraindo o texto do PDF…"
      : percent < 82 ? "Traduzindo os blocos de texto…" : "Reconstruindo as páginas…";
    const remaining = estimateSeconds - elapsed;
    progress.eta.textContent = remaining > 0
      ? `restante: ~${formatDuration(remaining)}`
      : "mais alguns instantes…";
  };
  update();
  state.translationTimers[kind] = setInterval(update, 500);
}

function finishTranslationProgress(kind, success) {
  const progress = translationProgress[kind];
  clearInterval(state.translationTimers[kind]);
  state.translationTimers[kind] = null;
  if (!progress?.wrap) return;
  if (success) {
    progress.bar.style.width = "100%";
    progress.bar.parentElement.setAttribute("aria-valuenow", "100");
    progress.text.textContent = "Tradução concluída.";
    progress.eta.textContent = "finalizado";
    setTimeout(() => { progress.wrap.hidden = true; }, 1400);
  } else {
    progress.wrap.hidden = true;
  }
}

function slugifyFilename(value) {
  return String(value || "livro")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "livro";
}

/* ============ Carregamento, skeleton e coruja ============ */

function startLoading() {
  state.loading = true;
  document.body.classList.add("loading");
  progressWrap.hidden = false;
  resultsNode.replaceChildren();

  for (let i = 0; i < 6; i++) {
    const card = skeletonTemplate.content.firstElementChild.cloneNode(true);
    card.style.setProperty("--result-index", i);
    resultsNode.append(card);
  }

  messageNode.classList.remove("error");
  messageNode.textContent = "Consultando acervos abertos…";

  let phase = 0;
  const seconds = window.innerWidth < 680 ? 8 : 14;
  const startedAt = Date.now();
  setProgress(8);

  applyOwl(OWL_PHASES[0]);
  progressText.textContent = OWL_PHASES[0].title;
  progressEta.textContent = `≈ ${seconds}s`;

  state.owlTimer = setInterval(() => {
    phase = (phase + 1) % OWL_PHASES.length;
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    const remain = Math.max(1, seconds - elapsed);
    progressEta.textContent = `≈ ${remain}s`;
    setProgress(Math.min(88, 12 + elapsed * 9));
    applyOwl(OWL_PHASES[phase]);
    progressText.textContent = OWL_PHASES[phase].title;
  }, 1400);
}

function stopLoading() {
  state.loading = false;
  document.body.classList.remove("loading");
  clearInterval(state.owlTimer);
  state.owlTimer = null;
  progressWrap.hidden = true;
  setProgress(100);
}

function applyOwl({ title, msg }) {
  owlTitle.textContent = title;
  owlMessage.classList.remove("typewriter");
  owlMessage.textContent = msg;
}

function typeOwl(message) {
  owlMessage.classList.add("typewriter");
  owlMessage.textContent = "";
  let index = 0;
  const tick = () => {
    if (index <= message.length) {
      owlMessage.textContent = message.slice(0, index);
      index += 2;
      setTimeout(tick, 16);
    } else {
      owlMessage.classList.remove("typewriter");
    }
  };
  tick();
}

/* ============ Filtros, ordenação e renderização ============ */

function matchesFilters(item) {
  const category = categoryInput.value;
  if (category !== "all" && item.category !== category) return false;

  const activeFormats = formatCheckboxes.filter((box) => box.checked).map((box) => box.value);
  if (activeFormats.length) {
    const formats = item.formats || [];
    const hit = activeFormats.some((needle) => {
      if (needle === "texto") return formats.some((f) => ["TXT", "HTML", "Digitalizado", "Texto livre"].includes(f));
      return formats.includes(needle);
    });
    if (!hit) return false;
  }

  const year = parseYear(item.year);
  const min = parseYear(yearMinInput.value);
  const max = parseYear(yearMaxInput.value);
  if (min && (!year || year < min)) return false;
  if (max && (!year || year > max)) return false;

  return true;
}

function parseYear(value) {
  const match = String(value || "").match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function compareItems(a, b) {
  const sort = sortInput.value;
  if (sort === "year_desc") return (parseYear(b.year) || -Infinity) - (parseYear(a.year) || -Infinity);
  if (sort === "year_asc") return (parseYear(a.year) || Infinity) - (parseYear(b.year) || Infinity);
  if (sort === "source") return String(a.site).localeCompare(String(b.site)) || String(a.title).localeCompare(String(b.title));
  if (sort === "title") return String(a.title).localeCompare(String(b.title));
  return 0;
}

function renderFiltered(celebrate = false) {
  const payload = state.payload || { results: [], providerStatus: [], catalogChecks: [] };
  const items = payload.results.filter(matchesFilters).sort(compareItems);

  state.filtered = items;
  state.bestId = items.length ? items[0].id : null;
  renderResults(items);
  updateMetrics(items);
  updateStatsLast(payload);
  renderCatalog(payload.providerStatus || [], payload.catalogChecks || []);
  updateSourcePill(payload.providerStatus || []);

  if (celebrate) {
    if (!motionReduced && !document.body.classList.contains("motion-paused") && items.length) {
      const best = document.querySelector(".result-card.best-choice");
      if (best) {
        const rect = best.getBoundingClientRect();
        burstAtPoint(rect.left + rect.width / 2, rect.top + 24, 16, true);
      }
    }
    summaryNode.classList.remove("flash");
    void summaryNode.offsetWidth;
    summaryNode.classList.add("flash");
  }

  messageNode.classList.remove("error");
  const took = Math.round(payload.searchTookMs || payload.tookMs || 0);
  messageNode.textContent = items.length
    ? items.length < payload.results.length
      ? `${items.length} de ${payload.results.length} resultados (filtros ativos) em ${took} ms.`
      : `${items.length} resultados em ${took} ms. PDFs e textos completos aparecem primeiro.`
    : payload.results.length
      ? "Nenhum resultado com os filtros atuais. Ajuste os filtros ou troque de idioma."
      : "Nenhum resultado compatível. Tente o título original ou selecione Todos os idiomas.";

  owlAction.hidden = !items.length;
  if (items.length) {
    owlTitle.textContent = "Encontrei o que procurava.";
    typeOwl(items[0].pdfUrl
      ? "Esta é a minha escolha: PDF direto disponível. Clique para abrir o salão."
      : "Esta é a minha escolha: a melhor pista entre os acervos consultados.");
  } else {
    owlTitle.textContent = "As estantes guardam segredos…";
    owlMessage.textContent = "Nada encontrado com esses critérios. Ajuste os filtros ou tente outra grafia.";
    owlMessage.classList.remove("typewriter");
  }

  if (!motionReduced && !document.body.classList.contains("motion-paused") && items.length) {
    burstSparkles(resultsNode, Math.min(12, items.length + 6));
  }
}

function renderResults(items) {
  resultsNode.replaceChildren();
  for (let i = 0; i < items.length; i++) {
    const card = renderResult(items[i]);
    card.style.setProperty("--result-index", i);
    if (items[i].id === state.bestId) {
      card.classList.add("best-choice");
      card.querySelector(".best-badge").hidden = false;
    }
    resultsNode.append(card);
  }
}

function renderResult(item) {
  const card = resultTemplate.content.firstElementChild.cloneNode(true);
  card.dataset.resultId = item.id;
  const cover = card.querySelector(".cover");
  const fallback = card.querySelector(".cover-fallback");
  card.querySelector(".site").textContent = item.site || "Acervo";
  card.querySelector(".availability").textContent = item.availability || "Verificar acesso";
  card.querySelector(".language").textContent = item.languageLabel || "Idioma não informado";
  card.querySelector(".title").textContent = item.title;
  card.querySelector(".authors").textContent = [item.authors?.join(", "), item.year].filter(Boolean).join(" · ") || "Autoria não informada";
  const metaParts = [
    item.publisher ? `Editora: ${item.publisher}` : "",
    item.pageCount ? `${item.pageCount} páginas` : "",
    item.isbn ? `ISBN: ${item.isbn}` : ""
  ].filter(Boolean);
  const metaNode = card.querySelector(".book-meta");
  if (metaParts.length) {
    metaNode.hidden = false;
    metaNode.textContent = metaParts.join(" · ");
  }
  card.querySelector(".summary-copy").textContent = item.description || "Acesse a fonte para conferir sinopse, edição e licença.";
  card.querySelector(".review-copy").textContent = item.rights || "Confira as condições de uso na fonte original.";

  if (item.coverUrl) {
    cover.src = item.coverUrl;
    cover.alt = `Capa de ${item.title}`;
    cover.addEventListener("error", () => { cover.hidden = true; fallback.hidden = false; }, { once: true });
  } else {
    cover.hidden = true;
  }

  for (const format of item.formats || []) {
    const badge = document.createElement("span");
    badge.className = "format-pill";
    badge.textContent = format;
    card.querySelector(".format-row").append(badge);
  }
  if ((item.mergedFrom || []).length > 1) {
    const badge = document.createElement("span");
    badge.className = "format-pill merged-pill";
    badge.textContent = `Unificado de ${item.mergedFrom.length} acervos`;
    badge.title = item.mergedFrom.join(", ");
    card.querySelector(".format-row").append(badge);
  }

  setLink(card, ".source-link", item.sourceUrl, "Fonte original");
  const pdfLabel = item.pdfSourceSite && item.pdfSourceSite !== item.site
    ? `PDF verificado em ${item.pdfSourceSite}`
    : "Abrir / baixar PDF";
  setLink(card, ".pdf-link", item.pdfUrl, pdfLabel);
  const translatePdfButton = card.querySelector(".pdf-translate-link");
  if (item.pdfUrl) {
    translatePdfButton.hidden = false;
    translatePdfButton.addEventListener("click", () => openPdfTranslation(item));
  }
  if (item.pdfUrl && item.pdfSourceSite && item.pdfSourceSite !== item.site) {
    const origin = card.querySelector(".pdf-origin");
    origin.hidden = false;
    origin.textContent = `Descrição: ${item.site}. PDF anexado e conferido: ${item.pdfSourceSite}.`;
  }
  setLink(card, ".epub-link", item.epubUrl, "Baixar ePub");
  setLink(card, ".reader-link", item.textUrl, "Ler e salvar como PDF");
  const torrentLabel = item.torrentSourceSite && item.torrentSourceSite !== item.site
    ? `Torrent em ${item.torrentSourceSite}`
    : "Baixar via torrent";
  setLink(card, ".torrent-link", item.torrentUrl, torrentLabel);

  const favBtn = card.querySelector(".favorite-btn");
  favBtn.classList.toggle("saved", isFavorited(item.id));
  favBtn.setAttribute("aria-label", isFavorited(item.id) ? "Remover da estante" : "Guardar na estante");
  favBtn.addEventListener("click", () => {
    const saved = toggleFavorite(item);
    favBtn.classList.toggle("saved", saved);
    favBtn.setAttribute("aria-label", saved ? "Remover da estante" : "Guardar na estante");
    if (saved && !motionReduced && !document.body.classList.contains("motion-paused")) {
      const rect = favBtn.getBoundingClientRect();
      burstAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 8, false);
    }
  });

  bindDetails(card);
  return card;
}

function setLink(card, selector, href, label) {
  const link = card.querySelector(selector);
  link.textContent = "";
  link.append(linkIcon(selector));
  link.append(` ${label}`);
  if (!href) { link.hidden = true; return; }
  link.href = href;
}

function linkIcon(selector) {
  const inner = {
    ".source-link":
      '<path d="M14 5h5v5"/><path d="M19 5 11 13"/><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    ".pdf-link":
      '<path d="M12 3.5V12"/><path d="m8.5 9 3.5 3.5L15.5 9"/><path d="M5.5 14.5V17a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-2.5"/>',
    ".epub-link":
      '<path d="M12 6.2c-1.8-1.5-4.1-2-6.4-2-.6 0-1.1 0-1.6.2v13.4c.5-.1 1.1-.2 1.6-.2 2.3 0 4.6.5 6.4 2 1.8-1.5 4.1-2 6.4-2 .5 0 1.1.1 1.6.2V4.4c-.5-.2-1.1-.2-1.6-.2-2.3 0-4.6.5-6.4 2Z"/><path d="M12 6.2v13.4"/>',
    ".reader-link":
      '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    ".torrent-link":
      '<circle cx="5" cy="5" r="2.2"/><circle cx="19" cy="5" r="2.2"/><circle cx="5" cy="19" r="2.2"/><path d="M5 5v0"/><path d="M16.2 7 7.8 17"/><path d="M5 7.2v9.6"/><path d="M19 7.2v0"/><path d="M12 19l7-2v5l-7-2v-1Z"/><path d="M12 19 5 17v5l7 2v-1Z"/>'
  }[selector] || "";
  const span = document.createElement("span");
  span.className = "link-icon";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return span;
}

function bindDetails(card) {
  for (const [buttonClass, panelClass] of [[".summary-toggle", ".summary-panel"], [".review-toggle", ".review-panel"]]) {
    const button = card.querySelector(buttonClass);
    const panel = card.querySelector(panelClass);
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(open));
      panel.hidden = !open;
    });
  }
}

function updateMetrics(items) {
  animateValue(resultCountEl, items.length);
  animateValue(pdfCountEl, items.filter((item) => item.pdfUrl).length);
  animateValue(sourceOkCountEl, (state.payload?.providerStatus || []).filter((item) => item.ok).length);
}

function animateValue(el, target) {
  const from = Number(el.dataset.value || 0);
  if (from === target) { el.textContent = target; el.dataset.value = target; return; }
  const duration = motionReduced ? 0 : 500;
  const startedAt = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(from + (target - from) * eased);
    el.textContent = value;
    el.dataset.value = value;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateSourcePill(statuses) {
  sourceCount.textContent = `${statuses.filter((s) => s.ok).length} fontes ativas`;
}

function updateStatsLast(payload) {
  const pdfs = (payload.results || []).filter((item) => item.pdfUrl).length;
  const took = Math.round(payload.searchTookMs || payload.tookMs || 0);
  statsLast.textContent = `Última busca: ${payload.results.length} resultados · ${pdfs} PDFs · ${took} ms`;
}

let statsFacts = [];
let statsFactIndex = 0;
let statsFactTimer = null;

function renderStatistics(stats) {
  const cards = [
    { value: stats.databasesPerSearch, label: "bases consultadas em cada busca" },
    { value: stats.catalogedSources, label: "fontes catalogadas" },
    { value: stats.apiSources, label: "bases com API dedicada" },
    { value: stats.htmlSources, label: "catálogos navegados por página" },
    { value: stats.trustedPdfHosts, label: "hosts de PDF confiáveis" },
    { value: stats.languages, label: "idiomas de filtro" },
    { value: stats.maxResults, label: "resultados máximos por busca" },
    { value: stats.cacheCapacity, label: `buscas em cache (${stats.cacheTtlMinutes} min)` }
  ];
  const icons = [
    '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    CATALOG_ICONS.book,
    CATALOG_ICONS.bolt,
    '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.5 2.2 3.8 5.2 3.8 8.5s-1.3 6.3-3.8 8.5c-2.5-2.2-3.8-5.2-3.8-8.5s1.3-6.3 3.8-8.5Z"/>',
    '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 7.9-7.5 9.5-4.3-1.6-7.5-5-7.5-9.5V6Z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
    '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.6 0-3.1-.4-4.4-1.2L3 20l1.2-5.1A8.5 8.5 0 1 1 21 11.5Z"/>',
    '<path d="M8.5 6h12"/><path d="M8.5 12h12"/><path d="M8.5 18h12"/><circle cx="4.5" cy="6" r="0.9"/><circle cx="4.5" cy="12" r="0.9"/><circle cx="4.5" cy="18" r="0.9"/>',
    '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>'
  ];
  statsGrid.replaceChildren(
    ...cards.map(({ value, label }, index) => {
      const card = document.createElement("div");
      card.className = "stats-card";
      const iconEl = document.createElement("span");
      iconEl.className = "stats-card-icon";
      iconEl.setAttribute("aria-hidden", "true");
      iconEl.innerHTML =
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[index]}</svg>`;
      const valueEl = document.createElement("b");
      valueEl.textContent = value;
      const labelEl = document.createElement("span");
      labelEl.textContent = label;
      card.append(iconEl, valueEl, labelEl);
      return card;
    })
  );
  statsStatus.textContent = `${stats.catalogedSources} fontes computadas`;
  statsFacts = Array.isArray(stats.facts) ? stats.facts : [];
  rotateStatsFact();
}

function rotateStatsFact() {
  clearInterval(statsFactTimer);
  if (!statsFacts.length) return;
  statsFact.textContent = statsFacts[0];
  statsFactTimer = setInterval(() => {
    statsFactIndex = (statsFactIndex + 1) % statsFacts.length;
    if (motionReduced) {
      statsFact.textContent = statsFacts[statsFactIndex];
      return;
    }
    statsFact.classList.add("swapping");
    setTimeout(() => {
      statsFact.textContent = statsFacts[statsFactIndex];
      statsFact.classList.remove("swapping");
    }, 300);
  }, 9000);
}

async function loadStatistics() {
  try {
    const response = await fetch("/api/stats");
    if (!response.ok) throw new Error();
    renderStatistics(await response.json());
  } catch {
    statsStatus.textContent = "indisponível";
  }
}

const CATALOG_ICONS = {
  academic:
    '<path d="M12 3.5 22 8l-10 4.5L2 8Z"/><path d="M6 10.5v4.5c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-4.5"/><path d="M22 8v4.5"/>',
  audio:
    '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M3.5 14h4v5h-4Z"/><path d="M16.5 14h4v5h-4Z"/>',
  search: '<circle cx="11" cy="11" r="6.3"/><path d="m15.8 15.8 4.4 4.4"/>',
  pdf:
    '<path d="M7 3.5h7l4.5 4.5V20a.9.9 0 0 1-.9.9H7a.9.9 0 0 1-.9-.9V4.4A.9.9 0 0 1 7 3.5Z"/><path d="M14 3.5V8.5h4.5"/><path d="M12 11.5V16"/><path d="m10 14.5 2 2 2-2"/>',
  library:
    '<path d="M4 20.5V9.5L12 4l8 5.5v11"/><path d="M8 20.5v-6h8v6"/><path d="M3 20.5h18"/>',
  book:
    '<path d="M12 6.2c-1.8-1.5-4.1-2-6.4-2-.6 0-1.1 0-1.6.2v13.4c.5-.1 1.1-.2 1.6-.2 2.3 0 4.6.5 6.4 2 1.8-1.5 4.1-2 6.4-2 .5 0 1.1.1 1.6.2V4.4c-.5-.2-1.1-.2-1.6-.2-2.3 0-4.6.5-6.4 2Z"/><path d="M12 6.2v13.4"/>',
  bolt: '<path d="M13 2.5 5 13h6l-1 8.5L17 11h-6Z"/>'
};

function catalogIcon(status) {
  const key = `${status.id || ""} ${status.name || ""}`.toLowerCase();
  let kind = "book";
  if (/scholar|acadêmico|openalex|crossref|arxiv/.test(key)) kind = "academic";
  else if (/librivox/.test(key)) kind = "audio";
  else if (/google-pdf|bing-pdf|duckduckgo-pdf|filetype:pdf/.test(key)) kind = "search";
  else if (/pdf-discovery|complementar/.test(key)) kind = "pdf";
  else if (/biblioteca|portal|nacional|senado|fiocruz|luso|camões|camoes|brasiliana|ufsc|scielo|wikisource|wikilivros|domínio|dominio|acervo/.test(key)) kind = "library";
  const span = document.createElement("span");
  span.className = "catalog-chip-icon";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${CATALOG_ICONS[kind]}</svg>`;
  return span;
}

function renderCatalog(statuses, catalogChecks) {
  const catalog = document.querySelector("#catalogList");
  catalog.replaceChildren();
  for (const status of statuses) {
    const row = document.createElement("span");
    row.className = "catalog-chip";
    row.append(catalogIcon(status));
    row.append(` ${status.name}: ${status.ok ? `${status.count} resultados` : "indisponível"}`);
    catalog.append(row);
  }
  for (const check of catalogChecks.filter((item) => item.id === "google-scholar")) {
    const link = document.createElement("a");
    link.className = "catalog-chip";
    link.href = check.sourceUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.append(catalogIcon({ id: check.id, name: check.site }));
    link.append(" Pesquisar no Google Acadêmico");
    catalog.append(link);
  }
  document.querySelector("#catalogStatus").textContent = `${statuses.filter((s) => s.ok).length} fontes ativas`;
}

/* ============ Estante (favoritos) ============ */

function loadShelf() {
  try { return JSON.parse(localStorage.getItem(SHELF_KEY)) || []; } catch { return []; }
}

function saveShelf(list) {
  localStorage.setItem(SHELF_KEY, JSON.stringify(list));
  updateShelfCount();
}

function updateShelfCount() {
  const count = loadShelf().length;
  shelfCount.textContent = count;
  shelfOpenBtn.classList.toggle("has-items", count > 0);
}

function isFavorited(id) {
  return loadShelf().some((item) => item.id === id);
}

function toggleFavorite(item) {
  let list = loadShelf();
  const index = list.findIndex((saved) => saved.id === item.id);
  if (index >= 0) {
    list.splice(index, 1);
    saveShelf(list);
    toast(`Removido da estante: ${item.title}`);
    return false;
  }
  list.unshift({
    id: item.id,
    title: item.title,
    site: item.site,
    authors: item.authors || [],
    year: item.year,
    sourceUrl: item.sourceUrl,
    pdfUrl: item.pdfUrl,
    torrentUrl: item.torrentUrl
  });
  saveShelf(list);
  toast(`Guardado na estante: ${item.title}`);
  return true;
}

function openShelf() {
  renderShelf();
  shelfPanel.hidden = false;
  shelfOverlay.hidden = false;
  document.body.classList.add("shelf-open");
}

function closeShelf() {
  shelfPanel.hidden = true;
  shelfOverlay.hidden = true;
  document.body.classList.remove("shelf-open");
}

function renderShelf() {
  const list = loadShelf();
  shelfList.replaceChildren();
  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "shelf-empty";
    empty.textContent = "Sua estante está vazia. Toque no ícone de guardar de um resultado para adicioná-lo aqui.";
    shelfList.append(empty);
    return;
  }
  for (const item of list) {
    const row = document.createElement("div");
    row.className = "shelf-item";

    const info = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = item.title;
    const meta = document.createElement("p");
    meta.textContent = [item.site, item.year, item.authors?.join(", ")].filter(Boolean).join(" · ") || "Sem detalhes";
    info.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "shelf-actions";
    const open = document.createElement("a");
    open.href = item.sourceUrl;
    open.target = "_blank";
    open.rel = "noreferrer";
    open.textContent = "Abrir";
    const pdf = document.createElement("a");
    pdf.href = item.pdfUrl;
    pdf.target = "_blank";
    pdf.rel = "noreferrer";
    pdf.textContent = "PDF";
    if (!item.pdfUrl) pdf.hidden = true;
    const torrent = document.createElement("a");
    torrent.href = item.torrentUrl;
    torrent.target = "_blank";
    torrent.rel = "noreferrer";
    torrent.textContent = "Torrent";
    if (!item.torrentUrl) torrent.hidden = true;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remover";
    remove.addEventListener("click", () => {
      const listNow = loadShelf().filter((saved) => saved.id !== item.id);
      saveShelf(listNow);
      renderShelf();
      refreshFavoriteButtons();
      toast("Removido da estante");
    });
    actions.append(open, pdf, torrent, remove);

    row.append(info, actions);
    shelfList.append(row);
  }
}

function refreshFavoriteButtons() {
  for (const btn of document.querySelectorAll(".favorite-btn")) {
    const card = btn.closest(".result-card");
    const id = card?.dataset.resultId;
    if (!id) continue;
    const saved = isFavorited(id);
    btn.classList.toggle("saved", saved);
    btn.setAttribute("aria-label", saved ? "Remover da estante" : "Guardar na estante");
  }
}

shelfOpenBtn.addEventListener("click", openShelf);
shelfClose.addEventListener("click", closeShelf);
shelfOverlay.addEventListener("click", closeShelf);

/* ============ Ações: sorteio, link, CSV ============ */

randomBtn.addEventListener("click", () => {
  randomBtn.classList.add("spin-once");
  setTimeout(() => randomBtn.classList.remove("spin-once"), 700);
  const candidates = CURATED_QUERIES.filter((query) => query !== queryInput.value.trim());
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  queryInput.value = pick;
  toast(`Sorteada: ${pick}`);
  runSearch();
});

shareBtn.addEventListener("click", async () => {
  const url = buildShareUrl();
  await copyText(url);
  toast("Link desta busca copiado");
});

function buildShareUrl() {
  const params = new URLSearchParams();
  const query = queryInput.value.trim();
  if (query) params.set("q", query);
  params.set("lang", languageInput.value);
  if (pdfOnlyInput.checked) params.set("pdf", "1");
  if (sortInput.value !== "relevance") params.set("sort", sortInput.value);
  if (yearMinInput.value) params.set("minYear", yearMinInput.value);
  if (yearMaxInput.value) params.set("maxYear", yearMaxInput.value);
  const formats = formatCheckboxes.filter((box) => box.checked).map((box) => box.value).join(",");
  if (formats) params.set("format", formats);
  if (categoryInput.value !== "all") params.set("cat", categoryInput.value);
  return `${location.origin}${location.pathname}${params.toString() ? `?${params}` : ""}`;
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

exportBtn.addEventListener("click", () => {
  const items = state.filtered;
  if (!items.length) { toast("Nada para exportar"); return; }
  const rows = [["titulo", "autores", "ano", "editora", "paginas", "isbn", "fonte", "categoria", "disponibilidade", "idiomas", "formatos", "link", "pdf"]];
  for (const item of items) {
    rows.push([
      csvCell(item.title),
      csvCell((item.authors || []).join("; ")),
      item.year || "",
      csvCell(item.publisher || ""),
      item.pageCount || "",
      item.isbn || "",
      item.site || "",
      item.category || "",
      csvCell(item.availability || ""),
      (item.languages || []).join("; "),
      (item.formats || []).join("; "),
      item.sourceUrl || "",
      item.pdfUrl || ""
    ]);
  }
  const blob = new Blob(["\uFEFF" + rows.map((row) => row.join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "buscador-de-livros.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  toast(`CSV exportado (${items.length} resultados)`);
});

function csvCell(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

/* ============ Histórico ============ */

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}

function pushHistory(query) {
  const history = [query, ...loadHistory().filter((item) => item.toLowerCase() !== query.toLowerCase())].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = loadHistory();
  historyChips.replaceChildren();
  for (const query of history) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "history-chip";
    chip.textContent = query;
    chip.addEventListener("click", () => {
      queryInput.value = query;
      runSearch();
    });
    historyChips.append(chip);
  }
}

/* ============ Atalhos de teclado ============ */

document.addEventListener("keydown", (event) => {
  const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
  if (event.key === "/" && !typing) {
    event.preventDefault();
    queryInput.focus();
    queryInput.select();
  }
  if (event.key === "Escape" && document.activeElement === queryInput) {
    queryInput.value = "";
    queryInput.blur();
  }
  if (event.key === "Escape" && !shelfPanel.hidden) {
    closeShelf();
  }
});

/* ============ Toasts e sparkles ============ */

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  toasts.append(node);
  setTimeout(() => {
    node.classList.add("out");
    setTimeout(() => node.remove(), 250);
  }, 2600);
}

function burstSparkles(container, count) {
  const rect = container.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const spark = document.createElement("span");
    spark.className = "sparkle";
    spark.style.left = `${Math.random() * rect.width}px`;
    spark.style.top = `${Math.random() * rect.height}px`;
    spark.style.setProperty("--sx", `${(Math.random() * 60 - 30).toFixed(0)}px`);
    spark.style.setProperty("--sy", `${(Math.random() * 60 - 30).toFixed(0)}px`);
    container.append(spark);
    setTimeout(() => spark.remove(), 900);
  }
}

/* ============ Efeitos mágicos (FX) ============ */

function initFx() {
  const paused = localStorage.getItem(MOTION_KEY) === "paused";
  document.body.classList.toggle("motion-paused", paused);
  fxToggle.setAttribute("aria-pressed", String(!paused));

  fxToggle.addEventListener("click", () => {
    const nowPaused = document.body.classList.toggle("motion-paused");
    localStorage.setItem(MOTION_KEY, nowPaused ? "paused" : "on");
    fxToggle.setAttribute("aria-pressed", String(!nowPaused));
    if (!nowPaused && !motionReduced && !document.querySelector(".magic-mote")) spawnMotes();
  });

  if (!paused && !motionReduced) spawnMotes();
}

function spawnMotes() {
  const count = Math.min(18, Math.max(8, Math.floor(window.innerWidth / 90)));
  for (let i = 0; i < count; i++) {
    const mote = document.createElement("span");
    mote.className = "magic-mote";
    mote.style.left = `${(Math.random() * 100).toFixed(1)}%`;
    mote.style.setProperty("--mote-size", `${(2 + Math.random() * 4).toFixed(1)}px`);
    mote.style.setProperty("--mote-speed", `${(9 + Math.random() * 9).toFixed(1)}s`);
    mote.style.setProperty("--mote-delay", `${(Math.random() * 8).toFixed(1)}s`);
    mote.style.setProperty("--mote-drift", `${(Math.random() * 120 - 60).toFixed(0)}px`);
    fxLayer.append(mote);
  }
}

/* ============ Céu estrelado ============ */

function initSky() {
  if (motionReduced) return;
  const sky = document.querySelector("#skyLayer");
  if (!sky) return;
  const count = Math.min(90, Math.max(40, Math.floor(window.innerWidth / 14)));
  for (let i = 0; i < count; i++) {
    const star = document.createElement("span");
    star.className = "star";
    const size = (1 + Math.random() * 2).toFixed(1);
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.left = `${(Math.random() * 100).toFixed(2)}%`;
    star.style.top = `${(Math.random() * 100).toFixed(2)}%`;
    star.style.setProperty("--tw", `${(2.5 + Math.random() * 4).toFixed(1)}s`);
    star.style.setProperty("--td", `${(Math.random() * 5).toFixed(1)}s`);
    star.style.setProperty("--o", (0.3 + Math.random() * 0.6).toFixed(2));
    if (Math.random() < 0.08) {
      star.classList.add("beacon");
      star.style.width = `${(2.5 + Math.random() * 1.5).toFixed(1)}px`;
      star.style.height = star.style.width;
    }
    sky.append(star);
  }
}

/* ============ Sparkles no cursor ============ */

function initCursorSparkles() {
  if (motionReduced || !window.matchMedia("(pointer: fine)").matches) return;
  let last = 0;
  document.addEventListener("pointermove", (event) => {
    if (document.body.classList.contains("motion-paused")) return;
    const now = performance.now();
    if (now - last < 70) return;
    last = now;
    const spark = document.createElement("span");
    spark.className = "cursor-spark";
    spark.style.left = `${event.clientX + (Math.random() * 14 - 7)}px`;
    spark.style.top = `${event.clientY + (Math.random() * 14 - 7)}px`;
    spark.style.setProperty("--cx", `${(Math.random() * 44 - 22).toFixed(0)}px`);
    spark.style.setProperty("--cy", `${(Math.random() * 44 - 22).toFixed(0)}px`);
    document.body.append(spark);
    setTimeout(() => spark.remove(), 700);
  }, { passive: true });
}

/* ============ Revelação ao rolar ============ */

function initReveal() {
  if (motionReduced) return;
  const targets = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    for (const target of targets) target.classList.add("visible");
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.1 });
  for (const target of targets) observer.observe(target);
}

/* ============ Feitiço e explosão de luz ============ */

function castSpell(button) {
  if (motionReduced || document.body.classList.contains("motion-paused")) return;
  const ring = document.createElement("span");
  ring.className = "cast-ring";
  button.append(ring);
  setTimeout(() => ring.remove(), 720);
}

function burstAtPoint(x, y, count, big) {
  if (motionReduced || document.body.classList.contains("motion-paused")) return;
  for (let i = 0; i < count; i++) {
    const spark = document.createElement("span");
    spark.className = "sparkle";
    const spread = big ? 70 : 44;
    spark.style.left = `${x + (Math.random() * spread - spread / 2)}px`;
    spark.style.top = `${y + (Math.random() * spread - spread / 2)}px`;
    spark.style.width = `${big ? 5 + Math.random() * 4 : 4 + Math.random() * 2}px`;
    spark.style.height = spark.style.width;
    spark.style.setProperty("--sx", `${(Math.random() * 60 - 30).toFixed(0)}px`);
    spark.style.setProperty("--sy", `${(Math.random() * 60 - 30).toFixed(0)}px`);
    fxLayer.append(spark);
    setTimeout(() => spark.remove(), 900);
  }
}

/* ============ Escolha da coruja ============ */

owlAction.addEventListener("click", () => {
  const best = document.querySelector(".result-card.best-choice");
  if (!best) return;
  best.scrollIntoView({ behavior: motionReduced ? "auto" : "smooth", block: "center" });
  best.classList.remove("owl-focus");
  void best.offsetWidth;
  best.classList.add("owl-focus");
});

/* ============ URL de entrada / sincronização ============ */

function syncUrl(query) {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("lang", languageInput.value);
  if (pdfOnlyInput.checked) params.set("pdf", "1");
  history.replaceState(null, "", `${location.pathname}?${params}`);
}

function applyUrlParams() {
  const params = new URLSearchParams(location.search);
  const query = params.get("q") || "";
  if (query) queryInput.value = query;
  if (params.get("lang")) languageInput.value = params.get("lang");
  pdfOnlyInput.checked = params.get("pdf") === "1";
  if (params.get("sort")) sortInput.value = params.get("sort");
  if (params.get("minYear")) yearMinInput.value = params.get("minYear");
  if (params.get("maxYear")) yearMaxInput.value = params.get("maxYear");
  if (params.get("format")) {
    const wanted = params.get("format").split(",");
    for (const box of formatCheckboxes) box.checked = wanted.includes(box.value);
  }
  if (params.get("cat")) categoryInput.value = params.get("cat");
  return query;
}

/* ============ Inicialização ============ */

function init() {
  initFx();
  initSky();
  initCursorSparkles();
  initReveal();
  updateShelfCount();
  renderHistory();
  renderShelf();
  loadStatistics();

  const query = applyUrlParams();
  updateSearchNote();
  if (query) runSearch();
}

init();
