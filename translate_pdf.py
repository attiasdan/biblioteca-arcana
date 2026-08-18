#!/usr/bin/env python3
"""Translate a text-based PDF while keeping page geometry and non-text artwork.

The script intentionally works on the PDF text layer. It masks each original
text line and paints the translated line in the same bounding box, preserving
the original page size and images as much as PDF text reflow allows.
"""

import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import pdfplumber
from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


MAX_TEXT_CHARS = int(os.environ.get("PDF_TRANSLATION_MAX_CHARS", "0"))
MAX_PAGES = int(os.environ.get("PDF_TRANSLATION_MAX_PAGES", "0"))
CHUNK_CHARS = int(os.environ.get("TRANSLATION_CHUNK_CHARS", "1800"))
TRANSLATION_TIMEOUT = int(os.environ.get("TRANSLATION_TIMEOUT_SECONDS", "30"))


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
    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            if MAX_PAGES > 0 and page_number > MAX_PAGES:
                die(f"O PDF excede o limite de {MAX_PAGES} páginas para uma tradução.")
            words = page.extract_words(
                x_tolerance=2,
                y_tolerance=3,
                keep_blank_chars=False,
                use_text_flow=True,
                extra_attrs=["size"],
            )
            lines = []
            for word in words:
                text = normalize_text(word.get("text"))
                if not text:
                    continue
                current = lines[-1] if lines else None
                if current is None or abs(float(word["top"]) - current["top"]) > 3:
                    current = {
                        "text_parts": [],
                        "x0": float(word["x0"]),
                        "x1": float(word["x1"]),
                        "top": float(word["top"]),
                        "bottom": float(word["bottom"]),
                        "sizes": [],
                    }
                    lines.append(current)
                current["text_parts"].append(text)
                current["x0"] = min(current["x0"], float(word["x0"]))
                current["x1"] = max(current["x1"], float(word["x1"]))
                current["top"] = min(current["top"], float(word["top"]))
                current["bottom"] = max(current["bottom"], float(word["bottom"]))
                if word.get("size"):
                    current["sizes"].append(float(word["size"]))

            normalized_lines = []
            for line in lines:
                text = normalize_text(" ".join(line["text_parts"]))
                if not text:
                    continue
                total_chars += len(text)
                normalized_lines.append(
                    {
                        "text": text,
                        "x0": line["x0"],
                        "x1": line["x1"],
                        "top": line["top"],
                        "bottom": line["bottom"],
                        "size": max(6.0, sum(line["sizes"]) / len(line["sizes"]))
                        if line["sizes"]
                        else 10.0,
                    }
                )
            pages.append(
                {
                    "width": float(page.width),
                    "height": float(page.height),
                    "lines": normalized_lines,
                    "raw_text": normalize_text(page.extract_text() or ""),
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

    try:
        with urllib.request.urlopen(request, timeout=TRANSLATION_TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as error:
        raise RuntimeError(f"Falha no serviço de tradução: {error}") from error

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


def translate_lines(texts, source, target, api_url, api_key):
    translations = {}
    unique = list(dict.fromkeys(texts))
    for start in range(0, len(unique), 80):
        batch = unique[start : start + 80]
        chunks = []
        current = []
        current_size = 0
        for text in batch:
            extra = len(text) + (1 if current else 0)
            if current and current_size + extra > CHUNK_CHARS:
                chunks.append(current)
                current = []
                current_size = 0
            current.append(text)
            current_size += extra
        if current:
            chunks.append(current)

        for chunk in chunks:
            translated = translation_request(
                "\n".join(chunk), source, target, api_url, api_key
            )
            translated_lines = str(translated).splitlines()
            if len(translated_lines) != len(chunk):
                translated_lines = [
                    translation_request(text, source, target, api_url, api_key)
                    for text in chunk
                ]
            for original, result in zip(chunk, translated_lines):
                translations[original] = normalize_text(result) or original
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


def build_overlay(page, translations, font, output_path):
    c = canvas.Canvas(str(output_path), pagesize=(page["width"], page["height"]))
    c.setFillColorRGB(1, 1, 1)
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
    c.save()


def create_translated_pdf(input_path, output_path, source, target, api_url, api_key):
    pages, total_chars = extract_pages(input_path)
    texts = [line["text"] for page in pages for line in page["lines"]]
    translations = translate_lines(texts, source, target, api_url, api_key)
    font = font_name()

    reader = PdfReader(str(input_path))
    writer = PdfWriter()
    temp_dir = output_path.parent / "overlays"
    temp_dir.mkdir(parents=True, exist_ok=True)
    try:
        for index, (page_data, original_page) in enumerate(zip(pages, reader.pages)):
            overlay_path = temp_dir / f"page-{index + 1}.pdf"
            build_overlay(page_data, translations, font, overlay_path)
            overlay_page = PdfReader(str(overlay_path)).pages[0]
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
        for overlay in temp_dir.glob("page-*.pdf"):
            overlay.unlink(missing_ok=True)
        temp_dir.rmdir()
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
