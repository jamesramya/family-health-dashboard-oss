import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as { version: string };

function gitShortSha(): string {
  const full =
    process.env.GITHUB_SHA ??
    (() => {
      try {
        return execFileSync("git", ["rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] })
          .toString()
          .trim();
      } catch {
        return "0000000";
      }
    })();
  return full.slice(0, 7);
}

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(gitShortSha()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
  },
});
