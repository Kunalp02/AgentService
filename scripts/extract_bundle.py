#!/usr/bin/env python3
"""Extract multi-file bundles with FILE: headers into a destination tree."""

from __future__ import annotations

import re
import sys
from pathlib import Path

FILE_HEADER_RE = re.compile(
    r"\n={80,}\nFILE:\s*(?P<path>[^\n=]+?)\s*\n={80,}\n",
    re.MULTILINE,
)


def extract_bundle(bundle_text: str, dest_root: Path, preamble_name: str | None = None) -> list[str]:
    dest_root.mkdir(parents=True, exist_ok=True)
    written: list[str] = []

    first_match = FILE_HEADER_RE.search(bundle_text)
    if preamble_name and first_match:
        preamble = bundle_text[: first_match.start()].strip()
        if preamble:
            out = dest_root / preamble_name
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(preamble + "\n", encoding="utf-8")
            written.append(str(out.relative_to(dest_root)))

    matches = list(FILE_HEADER_RE.finditer(bundle_text))
    for i, match in enumerate(matches):
        rel = match.group("path").strip().replace("\\", "/")
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(bundle_text)
        content = bundle_text[start:end].rstrip("\n")
        if content.endswith("\n\n"):
            content = content.rstrip("\n")
        out = dest_root / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        if content and not content.endswith("\n"):
            content = content + "\n"
        out.write_text(content, encoding="utf-8")
        written.append(rel)

    return written


def main() -> int:
    if len(sys.argv) != 4:
        print("Usage: extract_bundle.py <bundle.txt> <dest_dir> <preamble_filename|->", file=sys.stderr)
        return 2
    bundle_path = Path(sys.argv[1])
    dest = Path(sys.argv[2])
    preamble = sys.argv[3] if sys.argv[3] != "-" else None
    text = bundle_path.read_text(encoding="utf-8", errors="replace")
    files = extract_bundle(text, dest, preamble_name=preamble)
    print(f"Wrote {len(files)} paths under {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
