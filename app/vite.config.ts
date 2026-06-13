import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves from /<repo-name>/ — the deploy workflow sets VITE_BASE.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "/",
});
