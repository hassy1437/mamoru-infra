from __future__ import annotations

import sys
from pathlib import Path

import fitz  # PyMuPDF


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: python scripts/render-pdf-pages.py <input.pdf> <output_dir> [scale]")
        return 1

    pdf_path = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    scale = float(sys.argv[3]) if len(sys.argv) >= 4 else 2.0

    if not pdf_path.exists():
        print(f"Input not found: {pdf_path}")
        return 1

    out_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    mat = fitz.Matrix(scale, scale)
    stem = pdf_path.stem

    for i, page in enumerate(doc, start=1):
        pix = page.get_pixmap(matrix=mat, alpha=False)
        out_path = out_dir / f"{stem}_p{i}.png"
        pix.save(out_path)
        print(out_path)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
