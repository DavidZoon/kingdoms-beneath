import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base =
  process.env.GITHUB_ACTIONS === "true" && repositoryName
    ? `/${repositoryName}/`
    : "/";

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      // The Workbox glob below already precaches every public icon.
      includeManifestIcons: false,
      manifest: {
        id: base,
        name: "Kingdoms Beneath - (Les Royaumes enfouis)",
        short_name: "Kingdoms Beneath",
        description: "Jeu sandbox 2D de survie et de gestion de colonie.",
        lang: "fr",
        start_url: base,
        scope: base,
        display: "fullscreen",
        display_override: ["fullscreen", "standalone"],
        orientation: "any",
        background_color: "#17212b",
        theme_color: "#17212b",
        categories: ["games"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        // The Phaser bundle exceeds Workbox's 2 MiB default and must be precached for offline play.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
