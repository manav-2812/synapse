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
  node -e "const r=require('$1');const c=r.categories;const g=k=>c[k].score==null?'null':Math.round(c[k].score*100);console.log('   P='+g('performance')+' A='+g('accessibility')+' BP='+g('best-practices')+' SEO='+g('seo'));" 2>/dev/null || echo "   (score parse failed)"
}
BASE="http://localhost:4173"
ROUTES=( notes analytics )
for r in "${ROUTES[@]}"; do
  clean
  out="./lighthouse-reports/${r}-mobile"
  echo "=== [$(date +%H:%M:%S)] mobile /${r} ==="
  for attempt in 1 2 3; do
    npx lighthouse "${BASE}/${r}" --form-factor=mobile --screenEmulation.mobile --chrome-flags="--no-sandbox --disable-gpu --disable-dev-shm-usage" --output=html,json --output-path="${out}" --quiet >/dev/null 2>>lighthouse-reports/errors3.log
    if node -e "const r=require('${out}.report.json');process.exit(r.categories.performance.score==null?1:0)" 2>/dev/null; then break; else clean; fi
  done
  score "${out}.report.json"
done
echo "=== MOBILE REMAINING DONE ==="
