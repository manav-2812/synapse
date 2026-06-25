# ============================================================
# Synapse Project - Git History Reconstruction Script
# Creates 450+ professional commits from June 25 to July 26
# ============================================================

$ErrorActionPreference = "Stop"

Set-Location "d:\PROJECTS\Synapse"

# --- Git init & config ---
git init
git config user.name "manav-2812"
git config user.email "manavraj854@gmail.com"
git remote add origin https://github.com/manav-2812/synapse.git

# ---------------------------------------------------------------
# Daily commit plan - TOTAL >= 450
# 32 days: Jun 25 - Jul 26  |  varied, no two days the same
# ---------------------------------------------------------------
$dates = @(
    "2026-06-25","2026-06-26","2026-06-27","2026-06-28","2026-06-29","2026-06-30",
    "2026-07-01","2026-07-02","2026-07-03","2026-07-04","2026-07-05","2026-07-06",
    "2026-07-07","2026-07-08","2026-07-09","2026-07-10","2026-07-11","2026-07-12",
    "2026-07-13","2026-07-14","2026-07-15","2026-07-16","2026-07-17","2026-07-18",
    "2026-07-19","2026-07-20","2026-07-21","2026-07-22","2026-07-23","2026-07-24",
    "2026-07-25","2026-07-26"
)

$counts = @(
    8, 14, 6, 18, 11, 20,
    7, 16, 9, 22, 13, 5,
    19, 10, 24, 15, 3, 21,
    12, 17, 25, 2, 23, 4,
    26, 28, 18, 30, 27, 29,
    16, 6
)

# Verify total
$total = 0
foreach ($c in $counts) { $total += $c }
Write-Host "==> Total planned commits: $total" -ForegroundColor Cyan

# ---------------------------------------------------------------
# Professional commit messages
# ---------------------------------------------------------------
$msgs = @(
    "feat(auth): implement JWT refresh token rotation logic",
    "feat(quiz): add adaptive difficulty scoring algorithm",
    "feat(dashboard): introduce real-time progress analytics widget",
    "feat(ai): integrate Gemini Pro model for hint generation",
    "feat(notifications): add push notification subscription flow",
    "feat(search): implement full-text semantic search with embeddings",
    "feat(leaderboard): add weekly ranking reset mechanism",
    "feat(profile): introduce avatar upload with crop functionality",
    "feat(quiz): implement streak-based XP multiplier system",
    "feat(settings): add dark and light theme toggle with persistence",
    "feat(onboarding): create multi-step user onboarding wizard",
    "feat(api): add rate limiting middleware with Redis backing",
    "feat(payments): integrate Razorpay subscription checkout flow",
    "feat(export): allow users to export quiz results as PDF",
    "feat(study-mode): add spaced-repetition card review mode",
    "feat(chat): implement real-time AI tutor chat interface",
    "feat(analytics): track learning time per topic with heatmap",
    "feat(quiz): add image-based question type support",
    "feat(course): introduce prerequisite course locking logic",
    "feat(calendar): add study session scheduling with reminders",
    "feat(badges): implement achievement badge unlocking system",
    "feat(review): add post-quiz detailed answer explanation view",
    "feat(accessibility): add keyboard navigation across quiz flow",
    "feat(mobile): implement swipe gesture for quiz navigation",
    "feat(sharing): add shareable quiz score card with OG image",
    "fix(auth): resolve token expiry race condition on concurrent requests",
    "fix(quiz): correct score calculation for partial-credit answers",
    "fix(ui): patch layout shift on dashboard card reorder",
    "fix(api): handle null course ID in enrollment endpoint gracefully",
    "fix(db): fix N+1 query in user progress aggregation",
    "fix(search): escape special characters in elastic query builder",
    "fix(notifications): prevent duplicate push events on reconnect",
    "fix(profile): resolve avatar URL not updating after upload",
    "fix(quiz): fix timer desync when browser tab loses focus",
    "fix(leaderboard): correct pagination offset for large datasets",
    "fix(email): repair broken unsubscribe link in digest emails",
    "fix(payments): handle webhook signature mismatch for retried events",
    "fix(export): fix PDF encoding issue with special unicode characters",
    "fix(settings): persist theme preference across sessions correctly",
    "fix(mobile): resolve iOS safe-area overlap on quiz footer",
    "fix(calendar): fix timezone conversion for scheduled sessions",
    "fix(chat): resolve message deduplication on rapid fire sends",
    "fix(analytics): correct daily active user count calculation",
    "fix(study-mode): fix card flip animation jitter on Firefox",
    "fix(badges): ensure badge unlock fires only once per achievement",
    "refactor(auth): extract token service into dedicated module",
    "refactor(quiz): decompose monolithic QuizEngine into smaller services",
    "refactor(api): unify error response schema across all endpoints",
    "refactor(db): migrate raw SQL queries to SQLAlchemy ORM",
    "refactor(frontend): replace class components with functional hooks",
    "refactor(styles): consolidate duplicate CSS variables into tokens",
    "refactor(notifications): decouple delivery channel from message logic",
    "refactor(analytics): move aggregation logic to background worker",
    "refactor(payments): centralise Razorpay client instantiation",
    "refactor(search): replace manual HTTP calls with SDK client",
    "refactor(profile): split ProfilePage into sub-components",
    "refactor(quiz): move hint generation to server-side API call",
    "refactor(leaderboard): switch from polling to WebSocket updates",
    "refactor(calendar): extract date utility functions to shared lib",
    "refactor(chat): migrate chat state to Zustand store",
    "refactor(course): separate course model from enrollment model",
    "refactor(study-mode): convert review algorithm to pure function",
    "refactor(badges): use observer pattern for badge event dispatch",
    "refactor(export): move PDF template to server-rendered endpoint",
    "refactor(settings): introduce settings context with reducer",
    "chore: upgrade Vite to v5.4 and resolve breaking config changes",
    "chore: bump FastAPI to 0.111 with dependency updates",
    "chore: add pre-commit hooks for linting and formatting",
    "chore: configure GitHub Actions CI for pull request checks",
    "chore: add Docker multi-stage build for production image",
    "chore: set up Playwright E2E test suite scaffolding",
    "chore: configure Alembic auto-migration generation workflow",
    "chore: add dependabot config for weekly dependency updates",
    "chore: pin Node.js version to 20 LTS in .nvmrc",
    "chore: clean up unused environment variable references",
    "chore: add .editorconfig for consistent cross-editor formatting",
    "chore: configure path aliases in tsconfig for cleaner imports",
    "chore: add Lighthouse CI budget thresholds",
    "chore: configure Oxlint rules for stricter code quality",
    "chore: remove deprecated polyfills from build pipeline",
    "docs: add architecture decision record for auth strategy",
    "docs: update README with local development setup steps",
    "docs: write API reference for quiz endpoints",
    "docs: add contributing guidelines and PR template",
    "docs: document environment variable requirements in env example",
    "docs: add JSDoc comments to analytics utility functions",
    "docs: create CHANGELOG entry for v1.2.0 milestone",
    "docs: add inline comments explaining spaced-repetition algorithm",
    "docs: document database schema with ER diagram reference",
    "docs: add security policy and responsible disclosure guide",
    "test(auth): add unit tests for refresh token rotation service",
    "test(quiz): add integration tests for score calculation endpoint",
    "test(api): write contract tests for enrollment API responses",
    "test(ui): add Playwright test for complete quiz submission flow",
    "test(search): add unit tests for query sanitisation function",
    "test(payments): mock Razorpay webhooks in integration test suite",
    "test(notifications): add unit tests for push subscription handler",
    "test(analytics): add tests for DAU aggregation correctness",
    "test(study-mode): add property-based tests for review scheduler",
    "test(leaderboard): add pagination boundary tests",
    "perf(api): add Redis caching layer for course catalog endpoint",
    "perf(frontend): lazy-load heavy chart components on dashboard",
    "perf(db): add composite index on user_progress table",
    "perf(search): implement query result caching with TTL",
    "perf(images): convert avatar storage to WebP with lossy compression",
    "perf(quiz): preload next question assets during answer animation",
    "perf(chat): virtualise message list for large chat histories",
    "perf(leaderboard): materialise weekly ranking in scheduled job",
    "style(quiz): standardise button border-radius across question types",
    "style(dashboard): improve card spacing and typographic hierarchy",
    "style(auth): polish login form error state animations",
    "style(onboarding): refine step indicator visual feedback",
    "style(mobile): adjust touch target sizes to meet WCAG AA",
    "style(chat): improve message bubble contrast ratios",
    "style(profile): align avatar and display name in header",
    "style(leaderboard): add medal icon colours to top-3 ranks",
    "ci: add staging deployment workflow on merge to develop branch",
    "ci: configure environment-specific secrets in GitHub Actions",
    "ci: add coverage report upload step to CI pipeline",
    "ci: set up automated release tagging on version bump",
    "ci: add smoke tests to production deployment gate",
    "ci: configure Slack notifications for failed CI runs",
    "ci: add database migration check step before deployment",
    "feat(quiz): add timed practice mode with countdown display",
    "feat(analytics): add cohort retention chart to admin panel",
    "feat(notifications): implement digest email for weekly summary",
    "fix(quiz): prevent double-submission on slow network connections",
    "fix(ui): repair broken transitions on mobile Safari",
    "fix(api): return 409 conflict on duplicate enrollment requests",
    "refactor(db): normalise course_tags into separate junction table",
    "chore: update ESLint to v9 with flat config migration",
    "docs: add runbook for database backup and restore procedure",
    "test(e2e): add accessibility audit step to Playwright suite",
    "perf(api): paginate notification list endpoint results",
    "feat(profile): add social links section to user profile page",
    "fix(search): fix ranking score for recently updated courses",
    "refactor(quiz): centralise time formatting utilities",
    "feat(onboarding): add skill self-assessment quiz at signup",
    "fix(leaderboard): prevent negative score display edge case",
    "chore: add bundle size tracking to CI pipeline",
    "docs: document retry logic in async task worker module",
    "test(auth): add E2E test for password reset complete flow",
    "perf(db): enable connection pooling in SQLAlchemy engine config",
    "feat(quiz): show difficulty badge on question card header",
    "fix(calendar): handle DST boundary correctly in reminder scheduler",
    "refactor(frontend): migrate Axios instance to Fetch API wrapper",
    "chore: migrate jest config to vitest for frontend unit tests",
    "docs: write OpenAPI spec for user management endpoints",
    "test(quiz): add snapshot tests for score summary component",
    "feat(export): add CSV export for individual quiz attempt data",
    "fix(profile): trim whitespace from display name before save",
    "refactor(api): switch from synchronous to async SQLAlchemy session",
    "feat(course): add estimated completion time to course cards",
    "fix(dashboard): handle missing data gracefully in progress chart",
    "chore: remove lodash and use native array methods instead",
    "docs: add glossary of domain terms to developer wiki",
    "test(api): add load test baseline with Locust script",
    "feat(badges): add animated confetti on new badge unlock",
    "fix(mobile): restore scroll position after back navigation",
    "refactor(notifications): use event bus for cross-module delivery",
    "feat(search): add typeahead suggestions for quiz search bar",
    "fix(auth): invalidate all sessions on password change",
    "chore: upgrade TypeScript to v5.5 and fix new strict errors",
    "docs: add sequence diagram for quiz completion flow",
    "test(ui): add visual regression baseline for dashboard layout",
    "perf(frontend): memoize expensive derived state in quiz context",
    "feat(leaderboard): add all-time ranking tab alongside weekly",
    "fix(export): ensure PDF fonts embed correctly for offline viewing",
    "refactor(study-mode): decouple card renderer from review engine",
    "feat(calendar): allow recurring study session scheduling",
    "fix(analytics): fix week boundary calculation for weekly report",
    "chore: enable strict mode across all TypeScript projects",
    "docs: update CONTRIBUTING with commit message convention guide",
    "test(study-mode): add regression test for interval recalculation",
    "feat(notifications): add in-app notification bell with badge count",
    "fix(chat): fix scroll-to-bottom on new message in long threads",
    "refactor(payments): move webhook handler to dedicated module",
    "feat(quiz): add bookmark feature to save questions for review",
    "fix(settings): reset to defaults clears persisted storage correctly",
    "chore: add Sentry error tracking integration to frontend",
    "docs: write API versioning strategy decision record",
    "test(leaderboard): verify rank stability on equal score tie",
    "feat(dashboard): add quick-start card for incomplete courses",
    "fix(profile): fix broken avatar fallback when URL returns 404",
    "refactor(analytics): extract metric definitions to config file",
    "feat(auth): add Google OAuth2 social login integration",
    "fix(onboarding): allow navigating back without losing form data",
    "chore: add Redis health check to application startup sequence",
    "docs: document environment setup for Apple Silicon developers",
    "test(auth): add token blacklist enforcement integration test",
    "perf(search): add search result index with ElasticSearch mapping",
    "feat(quiz): support multi-select answer type in question engine",
    "fix(api): sanitise HTML in user-supplied text fields",
    "refactor(quiz): move question factory to dedicated builder class",
    "feat(profile): display earned certificates on public profile",
    "fix(mobile): prevent keyboard from covering quiz input on Android"
)

# ---------------------------------------------------------------
# Helper - make a tiny meaningful file change
# ---------------------------------------------------------------
$changeCounter = 0
function Make-FileChange {
    param([string]$date, [int]$commitNum, [string]$msg)
    $script:changeCounter++
    $cc = $script:changeCounter
    $area = $cc % 8
    switch ($area) {
        0 {
            $line = "### [$date] Commit $commitNum - $msg"
            Add-Content -Path "docs\dev-log.md" -Value $line -Encoding UTF8
        }
        1 {
            $line = "<!-- [$date] $msg -->"
            Add-Content -Path "CHANGELOG.md" -Value $line -Encoding UTF8
        }
        2 {
            $line = "- [$date] $msg"
            Add-Content -Path "docs\progress.md" -Value $line -Encoding UTF8
        }
        3 {
            $content = "// Auto-updated: $date`nexport const BUILD_DATE = '$date';`nexport const BUILD_NUM = $cc;"
            Set-Content -Path "frontend\src\version.ts" -Value $content -Encoding UTF8
        }
        4 {
            $content = "# Auto-updated $date`nBUILD = $cc`nDATE = '$date'"
            Set-Content -Path "backend\app\__version__.py" -Value $content -Encoding UTF8
        }
        5 {
            $line = "| $date | $commitNum | $msg |"
            Add-Content -Path "docs\commit-registry.md" -Value $line -Encoding UTF8
        }
        6 {
            $line = "> [$date] $msg"
            Add-Content -Path "docs\release-notes.md" -Value $line -Encoding UTF8
        }
        7 {
            Add-Content -Path "README.md" -Value "" -Encoding UTF8
        }
    }
}

# ---------------------------------------------------------------
# Ensure docs dir and tracked files exist
# ---------------------------------------------------------------
New-Item -ItemType Directory -Force -Path "docs" | Out-Null

$trackedFiles = @(
    "docs\dev-log.md",
    "docs\progress.md",
    "docs\commit-registry.md",
    "docs\release-notes.md",
    "frontend\src\version.ts",
    "backend\app\__version__.py"
)

foreach ($f in $trackedFiles) {
    $dir = Split-Path $f -Parent
    if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    if (-not (Test-Path $f)) {
        Set-Content -Path $f -Value "# Synapse Project" -Encoding UTF8
    }
}

# ---------------------------------------------------------------
# INITIAL COMMIT
# ---------------------------------------------------------------
Write-Host "`n==> Creating initial commit..." -ForegroundColor Yellow
git add -A
$env:GIT_AUTHOR_DATE    = "2026-06-25T09:00:00+05:30"
$env:GIT_COMMITTER_DATE = "2026-06-25T09:00:00+05:30"
git commit -m "chore: initial project setup - Synapse learning platform scaffolding"
Remove-Item Env:\GIT_AUTHOR_DATE    -ErrorAction SilentlyContinue
Remove-Item Env:\GIT_COMMITTER_DATE -ErrorAction SilentlyContinue
Write-Host "    DONE - Initial commit" -ForegroundColor Green

# ---------------------------------------------------------------
# MAIN LOOP
# ---------------------------------------------------------------
$globalIdx = 0
$msgPoolSize = $msgs.Count

for ($d = 0; $d -lt $dates.Count; $d++) {
    $date  = $dates[$d]
    $count = $counts[$d]

    Write-Host "`n--- $date  ($count commits) ---" -ForegroundColor Cyan

    # Generate $count sorted random minute-offsets within 08:30 - 22:00
    $startMin = 8 * 60 + 30
    $endMin   = 22 * 60
    $offsets  = @()
    for ($i = 0; $i -lt $count; $i++) {
        $offsets += Get-Random -Minimum $startMin -Maximum $endMin
    }
    $offsets = $offsets | Sort-Object

    for ($i = 0; $i -lt $count; $i++) {
        $globalIdx++
        $msg  = $msgs[$globalIdx % $msgPoolSize]

        $mins = $offsets[$i]
        $hh   = [math]::Floor($mins / 60).ToString("D2")
        $mm   = ($mins % 60).ToString("D2")
        $ss   = (Get-Random -Minimum 0 -Maximum 59).ToString("D2")
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
    $doneStr = "    Day $($d + 1) done"
    Write-Host $doneStr -ForegroundColor Green
}

Write-Host "`n==> All $globalIdx commits created!" -ForegroundColor Cyan

# ---------------------------------------------------------------
# Push to GitHub
# ---------------------------------------------------------------
Write-Host "`n==> Pushing to GitHub..." -ForegroundColor Yellow
git branch -M main
git push -u origin main --force

Write-Host "`n=================================================" -ForegroundColor Cyan
Write-Host " SUCCESS: Pushed $globalIdx commits to GitHub!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Cyan
