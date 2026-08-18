import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages project-site path — matches this repo's name.
  base: "/Machine/",
  plugins: [react(), tailwindcss()],
});
