#!/usr/bin/env python3
"""Fail if a relative Markdown link in README.md or docs/*.md points at a missing file."""
import pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
files = [root / "README.md", *sorted((root / "docs").glob("*.md"))]
link = re.compile(r"\]\(([^)#\s]+\.md)(?:#[^)]*)?\)")
missing = []
for f in files:
    for target in link.findall(f.read_text(encoding="utf-8")):
        if target.startswith(("http://", "https://")):
            continue
        if not (f.parent / target).resolve().exists():
            missing.append(f"{f.relative_to(root)} -> {target}")
if missing:
    print("missing link targets:\n  " + "\n  ".join(missing))
    sys.exit(1)
print(f"ok: {len(files)} files, all relative .md links resolve")
