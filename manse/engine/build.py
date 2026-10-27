#!/usr/bin/env python3
"""ui-manse.html + 엔진 4개 파일 → 자족형 manse.html"""
import re, sys, pathlib

HERE = pathlib.Path(__file__).parent

def strip_mod(src):
    out = []
    for line in src.split("\n"):
        s = line.strip()
        if s.startswith("import ") or s.startswith("} from "):
            continue
        if s.startswith("import {") or re.match(r"^\s*[\w,\s{}]+\s*}?\s*from\s+[\"']", s):
            continue
        out.append(line)
    t = "\n".join(out)
    t = re.sub(r"^export\s+(function|const|let|class)\s", r"\1 ", t, flags=re.M)
    t = re.sub(r"^export\s*\{[^}]*\};?\s*$", "", t, flags=re.M)
    return t

def read(n):
    return strip_mod((HERE / n).read_text(encoding="utf-8"))

# saju.js 의 import 블록은 여러 줄이므로 수동 처리
def read_saju():
    t = (HERE / "saju.js").read_text(encoding="utf-8")
    t = re.sub(r'import\s*\{[^}]*\}\s*from\s*["\'][^"\']+["\'];?', "", t, flags=re.S)
    t = re.sub(r"^export\s+(function|const|let|class)\s", r"\1 ", t, flags=re.M)
    t = re.sub(r"^export\s*\{[^}]*\};?\s*$", "", t, flags=re.M)
    return t

def read_any(n):
    t = (HERE / n).read_text(encoding="utf-8")
    t = re.sub(r'import\s*\{[^}]*\}\s*from\s*["\'][^"\']+["\'];?', "", t, flags=re.S)
    t = re.sub(r'import\s+\w+\s+from\s*["\'][^"\']+["\'];?', "", t)
    t = re.sub(r"^export\s+(function|const|let|class)\s", r"\1 ", t, flags=re.M)
    t = re.sub(r"^export\s*\{[^}]*\};?\s*$", "", t, flags=re.M)
    return t

engine = "\n".join([
    "/* ── saju-data.js ── */", read_any("saju-data.js"),
    "/* ── saju.js ── */",     read_any("saju.js"),
    "/* ── report.js ── */",   read_any("report.js"),
    "/* ── sinsal.js ── */",   read_any("sinsal.js"),
    "/* ── glossary.js ── */", read_any("glossary.js"),
    "/* ── examples.js ── */", read_any("examples.js"),
    "/* ── manse.js ── */",    read_any("manse.js"),
])

ui = (HERE / "ui-manse.html").read_text(encoding="utf-8")
assert "/* ENGINE_PLACEHOLDER */" in ui, "placeholder 없음"
out = ui.replace("/* ENGINE_PLACEHOLDER */", engine)

dest = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "manse.html"
dest.write_text(out, encoding="utf-8")
print(f"{dest}  {len(out):,} bytes")
