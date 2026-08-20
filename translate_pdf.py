#!/usr/bin/env python3
"""Translate a text-based PDF while keeping page geometry and non-text artwork.

The script intentionally works on the PDF text layer. It masks each original
text line and paints the translated line in the same bounding box, preserving
the original page size and images as much as PDF text reflow allows.

Performance notes:
  - Text extraction reads character positions straight from pdfminer (the
    engine that powers pdfplumber) instead of wrapping it per page, which
    roughly halves extraction time with identical line output.
  - Translation requests run concurrently in a bounded thread pool, so a book
    translates in roughly (unique batches / concurrency) round trips instead
    of one serial request per batch.
  - A single multi-page overlay PDF is built for the whole book instead of one
    temp file per page, cutting disk I/O to two files total.
"""

import argparse
import concurrent.futures
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from pdfminer.high_level import extract_pages as pdfminer_extract_pages
from pdfminer.layout import LAParams, LTAnno, LTChar, LTTextContainer, LTTextLine
from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


MAX_TEXT_CHARS = int(os.environ.get("PDF_TRANSLATION_MAX_CHARS", "0"))
MAX_PAGES = int(os.environ.get("PDF_TRANSLATION_MAX_PAGES", "0"))
CHUNK_CHARS = int(os.environ.get("TRANSLATION_CHUNK_CHARS", "1800"))
TRANSLATION_TIMEOUT = int(os.environ.get("TRANSLATION_TIMEOUT_SECONDS", "30"))
TRANSLATION_CONCURRENCY = int(os.environ.get("TRANSLATION_CONCURRENCY", "8"))
MYMEMORY_CHUNK_CAP = 450  # MyMemory free tier caps ~500 bytes per request.
MYMEMORY_CONCURRENCY = 2  # Free tier rate-limits anonymous IPs.
TRANSLATION_ATTEMPTS = 3


def die(message):
    print(json.dumps({"error": message}, ensure_ascii=False), file=sys.stderr)
    raise SystemExit(2)


def font_name():
    candidates = [
        os.environ.get("PDF_TRANSLATION_FONT", ""),
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeui.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            try:
                pdfmetrics.registerFont(TTFont("TranslationSans", candidate))
                return "TranslationSans"
            except Exception:
                continue
    return "Helvetica"


def normalize_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def extract_pages(pdf_path):
    pages = []
    total_chars = 0
    for page_number, page in enumerate(pdfminer_extract_pages(pdf_path, laparams=LAParams()), start=1):
        if MAX_PAGES > 0 and page_number > MAX_PAGES:
            die(f"O PDF excede o limite de {MAX_PAGES} páginas para uma tradução.")
        width, height = float(page.width), float(page.height)
        normalized_lines = []
        for element in page:
            if not isinstance(element, LTTextContainer):
                continue
            for line in element:
                if not isinstance(line, LTTextLine):
                    continue
                parts = []
                x0s, x1s, y0s, y1s, sizes = [], [], [], [], []
                for char in line:
                    if isinstance(char, LTChar):
                        parts.append(char.get_text())
                        x0s.append(float(char.x0))
                        x1s.append(float(char.x1))
                        y0s.append(float(char.y0))
                        y1s.append(float(char.y1))
                        if char.size:
                            sizes.append(float(char.size))
                    elif isinstance(char, LTAnno):
                        parts.append(char.get_text())
                text = normalize_text("".join(parts))
                if not text or not x0s:
                    continue
                total_chars += len(text)
                normalized_lines.append(
                    {
                        "text": text,
                        "x0": min(x0s),
                        "x1": max(x1s),
                        "top": height - max(y1s),
                        "bottom": height - min(y0s),
                        "size": max(6.0, sum(sizes) / len(sizes))
                        if sizes
                        else 10.0,
                    }
                )
        pages.append(
            {
                "width": width,
                "height": height,
                "lines": normalized_lines,
                "page_number": page_number,
            }
        )

    if total_chars == 0:
        die(
            "Este PDF não possui camada de texto extraível. Faça OCR no arquivo antes de traduzi-lo."
        )
    if MAX_TEXT_CHARS > 0 and total_chars > MAX_TEXT_CHARS:
        die(
            f"O PDF excede o limite de {MAX_TEXT_CHARS} caracteres para uma tradução."
        )
    return pages, total_chars


def translation_request(text, source, target, api_url, api_key):
    if source == target:
        return text

    if "mymemory.translated.net" in api_url:
        query = urllib.parse.urlencode(
            {"q": text, "langpair": f"{source}|{target}"},
            quote_via=urllib.parse.quote,
        )
        request = urllib.request.Request(
            f"{api_url}?{query}",
            headers={"Accept": "application/json", "User-Agent": "BibliotecaArcana/1.0"},
        )
    else:
        body = {"q": text, "source": source, "target": target, "format": "text"}
        if api_key:
            body["api_key"] = api_key
        request = urllib.request.Request(
            api_url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "BibliotecaArcana/1.0",
            },
            method="POST",
        )

    last_error = None
    for attempt in range(TRANSLATION_ATTEMPTS):
        try:
            with urllib.request.urlopen(request, timeout=TRANSLATION_TIMEOUT) as response:
                payload = json.loads(response.read().decode("utf-8"))
            break
        except Exception as error:
            last_error = error
            if attempt + 1 < TRANSLATION_ATTEMPTS:
                time.sleep(0.4 * (attempt + 1))
    else:
        raise RuntimeError(f"Falha no serviço de tradução: {last_error}") from last_error

    if "mymemory.translated.net" in api_url:
        result = (payload.get("responseData") or {}).get("translatedText")
        status = payload.get("responseStatus", 200)
        if not result or str(status) != "200":
            raise RuntimeError("O serviço MyMemory não retornou uma tradução válida.")
        return result

    result = payload.get("translatedText") or payload.get("translation")
    if not result and isinstance(payload.get("data"), dict):
        result = payload["data"].get("translatedText")
    if not result:
        raise RuntimeError("O serviço de tradução não retornou translatedText.")
    return str(result)


class _NeedSplit(Exception):
    def __init__(self, lines):
        super().__init__("batch line count mismatch")
        self.lines = lines


_newline_folding = False  # set when the API collapses every newline


def translate_batch(lines, source, target, api_url, api_key):
    """Translate a batch, returning {original: translated} for the lines.

    Batched APIs occasionally fold newlines; when the response does not line
    up with the request, NeedSplit is raised so the caller can resubmit the
    batch halves in the shared pool (parallel split). If the response has no
    newlines at all, the caller is told the API folds newlines entirely and
    switches straight to single-line requests.
    """
    global _newline_folding
    joined = "\n".join(lines)
    translated = str(translation_request(joined, source, target, api_url, api_key))
    translated_lines = translated.splitlines()
    if len(translated_lines) == len(lines):
        return {
            original: (normalize_text(result) or original)
            for original, result in zip(lines, translated_lines)
        }
    if "\n" not in translated and len(lines) > 1:
        _newline_folding = True
    raise _NeedSplit(lines)


def translate_lines(texts, source, target, api_url, api_key):
    unique = list(dict.fromkeys(texts))
    if source == target:
        return {text: text for text in unique}

    chunk_chars = (
        min(CHUNK_CHARS, MYMEMORY_CHUNK_CAP)
        if "mymemory.translated.net" in api_url
        else CHUNK_CHARS
    )
    chunks = []
    current = []
    current_size = 0
    for text in unique:
        extra = len(text) + (1 if current else 0)
        if current and current_size + extra > chunk_chars:
            chunks.append(current)
            current = []
            current_size = 0
        current.append(text)
        current_size += extra
    if current:
        chunks.append(current)

    concurrency = (
        min(TRANSLATION_CONCURRENCY, MYMEMORY_CONCURRENCY)
        if "mymemory.translated.net" in api_url
        else TRANSLATION_CONCURRENCY
    )
    translations = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {
            pool.submit(translate_batch, chunk, source, target, api_url, api_key)
            for chunk in chunks
        }
        while futures:
            done, futures = concurrent.futures.wait(
                futures, return_when=concurrent.futures.FIRST_COMPLETED
            )
            for future in done:
                try:
                    result = future.result()
                except _NeedSplit as need:
                    lines = need.lines
                    if len(lines) == 1:
                        translations[lines[0]] = lines[0]
                    elif _newline_folding:
                        for line in lines:
                            futures.add(
                                pool.submit(translate_batch, [line], source, target, api_url, api_key)
                            )
                    else:
                        middle = len(lines) // 2
                        futures.add(
                            pool.submit(translate_batch, lines[:middle], source, target, api_url, api_key)
                        )
                        futures.add(
                            pool.submit(translate_batch, lines[middle:], source, target, api_url, api_key)
                        )
                else:
                    translations.update(result)
    return translations


def fit_text(c, text, x, y, width, size, font):
    size = max(6.0, min(float(size), 24.0))
    measured = pdfmetrics.stringWidth(text, font, size)
    if measured > width and measured:
        # Keep the translated line inside the original line box. Horizontal
        # scaling avoids reflow into the next line and retains page geometry.
        c.saveState()
        c.translate(x, y)
        c.scale(max(0.55, min(1.0, width / measured)), 1)
        c.setFont(font, size)
        c.drawString(0, 0, text)
        c.restoreState()
        return
    c.setFont(font, size)
    c.drawString(x, y, text)


def build_overlays(pages, translations, font, output_path):
    first = pages[0]
    c = canvas.Canvas(str(output_path), pagesize=(first["width"], first["height"]))
    for page in pages:
        c.setPageSize((page["width"], page["height"]))
        for line in page["lines"]:
            translated = translations.get(line["text"], line["text"])
            x = max(0, line["x0"] - 1)
            y_top = page["height"] - line["top"]
            y_bottom = page["height"] - line["bottom"]
            box_width = max(8, line["x1"] - line["x0"] + 2)
            box_height = max(7, y_top - y_bottom + 3)
            c.setFillColorRGB(1, 1, 1)
            c.rect(x, y_bottom - 1, box_width, box_height, fill=1, stroke=0)
            c.setFillColorRGB(0.08, 0.08, 0.08)
            fit_text(
                c,
                translated,
                line["x0"],
                max(1, y_bottom + 0.5),
                max(8, line["x1"] - line["x0"]),
                min(line["size"], max(6, box_height * 0.9)),
                font,
            )
        c.showPage()
    c.save()


def create_translated_pdf(input_path, output_path, source, target, api_url, api_key):
    pages, total_chars = extract_pages(input_path)
    texts = [line["text"] for page in pages for line in page["lines"]]
    translations = translate_lines(texts, source, target, api_url, api_key)
    font = font_name()

    reader = PdfReader(str(input_path))
    writer = PdfWriter()
    overlay_path = output_path.parent / f"overlay-{output_path.stem}.pdf"
    try:
        build_overlays(pages, translations, font, overlay_path)
        overlay_reader = PdfReader(str(overlay_path))
        for index, original_page in enumerate(reader.pages):
            overlay_page = overlay_reader.pages[index]
            original_page.merge_page(overlay_page)
            writer.add_page(original_page)
        writer.add_metadata(
            {
                "/Title": "PDF traduzido - Biblioteca Arcana",
                "/Subject": f"Tradução {source} para {target}",
                "/Producer": "Biblioteca Arcana",
            }
        )
        with output_path.open("wb") as stream:
            writer.write(stream)
    finally:
        overlay_path.unlink(missing_ok=True)
    return {"pages": len(pages), "characters": total_chars, "font": font}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input_pdf", type=Path)
    parser.add_argument("output_pdf", type=Path)
    parser.add_argument("--source", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--api-key", default="")
    args = parser.parse_args()
    if args.source == args.target:
        die("O idioma de origem e o idioma de destino precisam ser diferentes.")
    result = create_translated_pdf(
        args.input_pdf,
        args.output_pdf,
        args.source,
        args.target,
        args.api_url,
        args.api_key,
    )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()