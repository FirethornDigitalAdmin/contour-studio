import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react()],
  define: {
    __HOSTED_WORKSPACE__: JSON.stringify(mode === "hosted"),
    __GEOCODER_URL__: JSON.stringify(process.env.VITE_GEOCODER_URL || "https://nominatim.openstreetmap.org/search"),
  },
  build: { outDir: mode === "hosted" ? "dist-hosted" : "dist" },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8765" },
  },
}));
