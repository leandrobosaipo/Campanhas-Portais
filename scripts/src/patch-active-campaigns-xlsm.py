#!/usr/bin/env python3
"""Patch only the approved active-campaign cells in the current XLSM bytes.

The script deliberately edits one worksheet XML member instead of loading and
saving the workbook through an office library. This preserves macros (when
present), comments, validation rules, styles and every unrelated ZIP member.
"""

from __future__ import annotations

import argparse
import hashlib
import zipfile
from pathlib import Path


SHEET_PATH = "xl/worksheets/sheet14.xml"
REPLACEMENTS = {
    '<c r="G25" s="330" t="s"><v>794</v></c>': (
        '<c r="G25" s="330" t="inlineStr"><is><t>'
        'LATERAL 02 — SIDEBAR — 300x250'
        '</t></is></c>'
    ),
    '<c r="H24" s="329"/>': '<c r="H24" s="329" t="inlineStr"><is><t>ATIVO</t></is></c>',
    '<c r="H25" s="329"/>': '<c r="H25" s="329" t="inlineStr"><is><t>ATIVO</t></is></c>',
    '<c r="H59" s="332"/>': '<c r="H59" s="332" t="inlineStr"><is><t>ATIVO</t></is></c>',
    '<c r="H60" s="171"/>': '<c r="H60" s="171" t="inlineStr"><is><t>ATIVO</t></is></c>',
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()

    with zipfile.ZipFile(args.source, "r") as source:
        entries = source.infolist()
        names = [entry.filename for entry in entries]
        if SHEET_PATH not in names:
            raise SystemExit(f"worksheet ausente: {SHEET_PATH}")
        original_members = {entry.filename: source.read(entry.filename) for entry in entries}

    worksheet = original_members[SHEET_PATH].decode("utf-8")
    for old, new in REPLACEMENTS.items():
        count = worksheet.count(old)
        if count != 1:
            raise SystemExit(f"precondição falhou para {old[:24]!r}: ocorrências={count}")
        worksheet = worksheet.replace(old, new)
    patched_members = dict(original_members)
    patched_members[SHEET_PATH] = worksheet.encode("utf-8")

    with zipfile.ZipFile(args.destination, "w") as destination:
        for entry in entries:
            destination.writestr(entry, patched_members[entry.filename])

    with zipfile.ZipFile(args.destination, "r") as checked:
        checked_names = checked.namelist()
        if checked_names != names:
            raise SystemExit("a estrutura ZIP mudou")
        for name in names:
            if name == SHEET_PATH:
                continue
            if checked.read(name) != original_members[name]:
                raise SystemExit(f"membro não autorizado mudou: {name}")

    vba_path = "xl/vbaProject.bin"
    print(f"source_sha256={digest(args.source.read_bytes())}")
    print(f"output_sha256={digest(args.destination.read_bytes())}")
    print(f"zip_entries={len(names)}")
    if vba_path in original_members:
        print(f"vba_sha256={digest(original_members[vba_path])}")
    else:
        print("vba_sha256=absent_in_source_and_output")
    print("changed_cells=G25,H24,H25,H59,H60")


if __name__ == "__main__":
    main()
