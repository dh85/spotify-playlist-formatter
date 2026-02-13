import { defineConfig } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnvIntoProcessEnv(filePath: string): void {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalIndex = line.indexOf("=");
    if (equalIndex <= 0) continue;

    const key = line.slice(0, equalIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    const rawValue = line.slice(equalIndex + 1).trim();
    const value = rawValue.replace(/^"(.*)"$/s, "$1").replace(/^'(.*)'$/s, "$1");
    process.env[key] = value;
  }
}

loadDotEnvIntoProcessEnv(resolve(process.cwd(), ".env"));

export default defineConfig({
  webServer: { command: "npm run build && npm run preview", port: 4173 },
  testDir: "e2e"
});
