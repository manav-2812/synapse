#!/usr/bin/env bash
set -u
cd "d:/PROJECTS/Synapse/frontend"
export CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"
export TEMP="d:/PROJECTS/Synapse/frontend/.lh-tmp"
export TMP="d:/PROJECTS/Synapse/frontend/.lh-tmp"
export TMPDIR="d:/PROJECTS/Synapse/frontend/.lh-tmp"
mkdir -p lighthouse-reports "$TEMP"
clean() { rm -rf "$TEMP"/lighthouse.* 2>/dev/null; }

score() {
  node -e "const r=require('$1');const c=r.categories;console.log('   P='+(c.performance.score==null?'null':Math.round(c.performance.score*100))+' A='+(c.accessibility.score==null?'null':Math.round(c.accessibility.score*100))+' BP='+(c['best-practices'].score==null?'null':Math.round(c['best-practices'].score*100))+' SEO='+(c.seo.score==null?'null':Math.round(c.seo.score*100)));" 2>/dev/null || echo "   (score parse failed)"
}

BASE="http://localhost:4173"

echo "===== /documents desktop (retry x2) ====="
for i in 1 2; do
  clean
  out="./lighthouse-reports/documents-desktop-retry$i"
  echo "--- attempt $i ---"
  npx lighthouse "${BASE}/documents" --preset=desktop --chrome-flags="--no-sandbox --disable-gpu --disable-dev-shm-usage" --output=html,json --output-path="${out}" --quiet >/dev/null 2>>lighthouse-reports/errors2.log
  score "${out}.report.json"
done

echo "===== MOBILE MATRIX ====="
ROUTES=( "" login signup dashboard documents chat quiz flashcards notes analytics )
for r in "${ROUTES[@]}"; do
  clean
  out="./lighthouse-reports/${r:-shell}-mobile"
  echo "=== [$(date +%H:%M:%S)] mobile /${r:-shell} ==="
  npx lighthouse "${BASE}/${r}" --preset=mobile --chrome-flags="--no-sandbox --disable-gpu --disable-dev-shm-usage" --output=html,json --output-path="${out}" --quiet >/dev/null 2>>lighthouse-reports/errors2.log
  score "${out}.report.json"
done
echo "=== RETRY DONE ==="
