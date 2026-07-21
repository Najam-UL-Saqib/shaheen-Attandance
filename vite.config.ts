// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (production builds),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// Nitro builds from this entry and auto-targets Vercel when deployed there.
export default defineConfig({
  // Nitro compiles the server for Vercel Functions (Fluid compute).
  nitro: { preset: "vercel" },
  tanstackStart: {
    server: { entry: "server" },
  },
});
