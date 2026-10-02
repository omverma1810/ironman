#!/usr/bin/env bash
# Builds ironman-user-manual.pdf from manual.tex. Screenshots and the access
# matrix come from apps/web/scripts/manual/capture.spec.ts — re-run that
# against a freshly seeded local stack first if the UI has changed.
set -euo pipefail
cd "$(dirname "$0")"
python3 make_matrix.py > matrix.tex
pdflatex -interaction=nonstopmode -halt-on-error manual.tex >/dev/null
pdflatex -interaction=nonstopmode -halt-on-error manual.tex >/dev/null
mv manual.pdf ironman-user-manual.pdf
rm -f manual.aux manual.log manual.out manual.toc
echo "built ironman-user-manual.pdf"
