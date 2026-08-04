#!/usr/bin/env python3
"""Build a delivery PDF from audited screenshot files without changing originals."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps


def bounded_int(value: Any, *, minimum: int, maximum: int, fallback: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, parsed))


def load_manifest(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Manifesto precisa ser um objeto JSON.")
    pages = payload.get("pages")
    if not isinstance(pages, list) or not pages:
        raise ValueError("Manifesto não possui páginas.")
    return payload


def prepare_page(source_path: Path, max_width: int) -> tuple[Image.Image, int]:
    with Image.open(source_path) as source:
        original_bytes = source_path.stat().st_size
        normalized = ImageOps.exif_transpose(source)
        normalized.load()

        if normalized.width > max_width:
            target_height = max(1, round(normalized.height * max_width / normalized.width))
            normalized = normalized.resize((max_width, target_height), Image.Resampling.LANCZOS)

        if normalized.mode in {"RGBA", "LA"} or (
            normalized.mode == "P" and "transparency" in normalized.info
        ):
            rgba = normalized.convert("RGBA")
            background = Image.new("RGB", rgba.size, "white")
            background.paste(rgba, mask=rgba.getchannel("A"))
            page = background
        else:
            page = normalized.convert("RGB")

        return page.copy(), original_bytes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    manifest_path = Path(args.manifest).resolve()
    output_path = Path(args.output).resolve()
    manifest = load_manifest(manifest_path)
    max_width = bounded_int(manifest.get("maxWidth"), minimum=800, maximum=2560, fallback=1920)
    quality = bounded_int(manifest.get("quality"), minimum=45, maximum=85, fallback=68)
    resolution = bounded_int(manifest.get("resolution"), minimum=72, maximum=180, fallback=120)
    images_output_dir_raw = manifest.get("imagesOutputDir")
    images_output_dir = (
        Path(images_output_dir_raw).resolve()
        if isinstance(images_output_dir_raw, str) and images_output_dir_raw.strip()
        else None
    )

    prepared_pages: list[Image.Image] = []
    source_bytes = 0
    image_bytes = 0
    image_count = 0
    try:
        for index, item in enumerate(manifest["pages"], start=1):
            if not isinstance(item, dict) or not isinstance(item.get("inputPath"), str):
                raise ValueError("Página inválida no manifesto.")
            source_path = Path(item["inputPath"]).resolve()
            if not source_path.is_file():
                raise FileNotFoundError(f"Imagem não encontrada: {source_path}")
            page, page_source_bytes = prepare_page(source_path, max_width)
            prepared_pages.append(page)
            source_bytes += page_source_bytes

            if images_output_dir is not None:
                relative_raw = item.get("outputRelativePath")
                relative_path = (
                    Path(relative_raw)
                    if isinstance(relative_raw, str) and relative_raw.strip()
                    else Path(f"{index:03d}-{source_path.stem}.jpg")
                )
                if relative_path.is_absolute() or ".." in relative_path.parts:
                    raise ValueError("Caminho relativo inválido para imagem independente.")
                image_path = (images_output_dir / relative_path).with_suffix(".jpg")
                image_path.parent.mkdir(parents=True, exist_ok=True)
                page.save(
                    image_path,
                    "JPEG",
                    quality=quality,
                    optimize=True,
                    progressive=True,
                )
                image_bytes += image_path.stat().st_size
                image_count += 1

        output_path.parent.mkdir(parents=True, exist_ok=True)
        first_page, *remaining_pages = prepared_pages
        first_page.save(
            output_path,
            "PDF",
            save_all=True,
            append_images=remaining_pages,
            resolution=resolution,
            quality=quality,
            optimize=True,
        )
    finally:
        for page in prepared_pages:
            page.close()

    output_bytes = output_path.stat().st_size
    ratio = round(output_bytes / source_bytes, 6) if source_bytes else None
    print(
        json.dumps(
            {
                "ok": True,
                "pageCount": len(manifest["pages"]),
                "sourceBytes": source_bytes,
                "outputBytes": output_bytes,
                "compressionRatio": ratio,
                "maxWidth": max_width,
                "quality": quality,
                "resolution": resolution,
                "outputPath": str(output_path),
                "imageCount": image_count,
                "imageBytes": image_bytes,
                "imagesOutputDir": str(images_output_dir) if images_output_dir else None,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
