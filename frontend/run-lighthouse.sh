#!/usr/bin/env bash
set -u
cd "d:/PROJECTS/Synapse/frontend"
export CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"
mkdir -p lighthouse-reports
ROUTES=( "" login signup dashboard documents chat quiz flashcards notes analytics )
DEVICES=( desktop mobile )
BASE="http://localhost:4173"
for dev in "${DEVICES[@]}"; do
  for r in "${ROUTES[@]}"; do
    path="/${r}"
    out="./lighthouse-reports/${r:-shell}-${dev}"
    echo "=== [$(date +%H:%M:%S)] ${dev} /${r:-shell} ==="
    npx lighthouse "${BASE}${path}" --preset="${dev}" --chrome-flags="--no-sandbox --disable-gpu" --output=html,json --output-path="${out}" --quiet >/dev/null 2>>lighthouse-reports/errors.log
    node -e "const r=require('${out}.report.json');const c=r.categories;console.log('   P='+Math.round(c.performance.score*100)+' A='+Math.round(c.accessibility.score*100)+' BP='+Math.round(c['best-practices'].score*100)+' SEO='+Math.round(c.seo.score*100));" 2>/dev/null || echo "   (score parse failed)"
  done
done
echo "=== ALL DONE ==="
