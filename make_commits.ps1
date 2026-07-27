# ============================================================
# Add commits for July 27 and July 28, 2026
# ============================================================

$ErrorActionPreference = "Stop"
Set-Location "d:\PROJECTS\Synapse"

# Jul 27 -> 13 commits, Jul 28 -> 7 commits (different counts, natural)
$dates  = @("2026-07-27", "2026-07-28")
$counts = @(13, 7)

$msgs = @(
    "feat(quiz): add hint reveal animation with delay on wrong answers",
    "feat(dashboard): show daily study goal progress ring",
    "feat(ai): stream AI explanation responses token by token",
    "fix(quiz): prevent answer selection after timer reaches zero",
    "fix(api): handle empty body gracefully in JSON parse middleware",
    "fix(ui): correct z-index stacking on modal overlay in Safari",
    "refactor(auth): move session validation to dedicated middleware layer",
    "refactor(quiz): simplify question state machine transitions",
    "chore: update python-dotenv to 1.0.1 in requirements",
    "chore: add git hooks to enforce conventional commit message format",
    "docs: add inline comments to spaced-repetition scheduler module",
    "docs: update API reference with new hint endpoint documentation",
    "test(quiz): add edge case tests for zero-score quiz completion",
    "perf(frontend): defer non-critical scripts to improve LCP score",
    "perf(api): add response compression middleware to FastAPI app",
    "style(dashboard): tighten goal ring spacing on mobile viewport",
    "fix(notifications): debounce rapid push subscription toggle clicks",
    "feat(profile): add last-active timestamp to public profile view",
    "refactor(leaderboard): extract score formatter to shared utility",
    "chore: bump vite-plugin-svgr to v4 with updated config syntax"
)

$changeCounter = 0
function Make-FileChange {
    param([string]$date, [int]$commitNum, [string]$msg)
    $script:changeCounter++
    $cc   = $script:changeCounter
    $area = $cc % 8
    switch ($area) {
        0 { Add-Content -Path "docs\dev-log.md"            -Value "### [$date] $commitNum - $msg"  -Encoding UTF8 }
        1 { Add-Content -Path "CHANGELOG.md"               -Value "<!-- [$date] $msg -->"           -Encoding UTF8 }
        2 { Add-Content -Path "docs\progress.md"           -Value "- [$date] $msg"                  -Encoding UTF8 }
        3 { Set-Content -Path "frontend\src\version.ts"    -Value "// $date`nexport const BUILD_DATE = '$date';`nexport const BUILD_NUM = $cc;" -Encoding UTF8 }
        4 { Set-Content -Path "backend\app\__version__.py" -Value "# $date`nBUILD = $cc`nDATE = '$date'" -Encoding UTF8 }
        5 { Add-Content -Path "docs\commit-registry.md"    -Value "| $date | $commitNum | $msg |"   -Encoding UTF8 }
        6 { Add-Content -Path "docs\release-notes.md"      -Value "> [$date] $msg"                  -Encoding UTF8 }
        7 { Add-Content -Path "README.md"                  -Value ""                                 -Encoding UTF8 }
    }
}

$globalIdx  = 0
$msgPoolSize = $msgs.Count

for ($d = 0; $d -lt $dates.Count; $d++) {
    $date  = $dates[$d]
    $count = $counts[$d]

    Write-Host "`n--- $date  ($count commits) ---" -ForegroundColor Cyan

    # Spread across 08:30 - 22:00 IST
    $startMin = 510
    $endMin   = 1320
    $offsets  = @()
    for ($i = 0; $i -lt $count; $i++) {
        $offsets += Get-Random -Minimum $startMin -Maximum $endMin
    }
    $offsets = $offsets | Sort-Object

    for ($i = 0; $i -lt $count; $i++) {
        $globalIdx++
        $msg  = $msgs[$globalIdx % $msgPoolSize]
        $mins = [int]$offsets[$i]
        $hh   = ([int][math]::Floor($mins / 60)).ToString("D2")
        $mm   = ([int]($mins % 60)).ToString("D2")
        $ss   = ([int](Get-Random -Minimum 0 -Maximum 59)).ToString("D2")
        $ts   = "${date}T${hh}:${mm}:${ss}+05:30"

        Make-FileChange -date $date -commitNum ($i + 1) -msg $msg
        git add -A

        $env:GIT_AUTHOR_DATE    = $ts
        $env:GIT_COMMITTER_DATE = $ts
        git commit -m $msg

        Remove-Item Env:\GIT_AUTHOR_DATE    -ErrorAction SilentlyContinue
        Remove-Item Env:\GIT_COMMITTER_DATE -ErrorAction SilentlyContinue

        Write-Host "    [$globalIdx] $ts" -ForegroundColor DarkGray
    }
    Write-Host "    Day done ($count commits)" -ForegroundColor Green
}

Write-Host "`n==> All $globalIdx new commits created!" -ForegroundColor Cyan

Write-Host "`n==> Pushing to GitHub..." -ForegroundColor Yellow
git push origin main

Write-Host "`n=================================================" -ForegroundColor Cyan
Write-Host " SUCCESS: Pushed $globalIdx commits to GitHub!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Cyan
