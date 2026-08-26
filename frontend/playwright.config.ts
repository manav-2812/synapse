import { defineConfig, devices } from "@playwright/test";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "../backend");
const pythonCmd =
  process.env.PYTHON_BIN ||
  (process.platform === "win32"
    ? path.join(backendDir, ".venv", "Scripts", "python.exe")
    : "python");

// End-to-end tests run against the REAL backend (127.0.0.1:8011) and a
// production build of the frontend served by `vite preview` (webServer below).
// They are NOT mocked — the goal is proving the whole stack works together.
//
// The frontend is built with VITE_API_BASE_URL pointing at the e2e backend so
// the SPA talks to 127.0.0.1:8011 instead of the dev default (localhost:8000).
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  // Serialize against the single local backend — concurrent signup + LLM +
  // document-processing + Chroma calls across workers cause intermittent
  // 401s/timeouts that falsely bounce tests to /login.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Start both the backend and (after building) the frontend preview server.
  webServer: [
    {
      command: `${pythonCmd} -m uvicorn app.main:app --host 127.0.0.1 --port 8011`,
      url: "http://127.0.0.1:8011/health",
      cwd: backendDir,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: {
        APP_ENV: "test",
        CHROMA_TELEMETRY_OPTOUT: "true",
      },
    },
    {
      command:
        "npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_API_BASE_URL: "http://127.0.0.1:8011/api/v1",
      },
    },
  ],
});
