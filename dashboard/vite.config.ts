import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages project-site path — matches this repo's name.
  base: "/Machine/",
  plugins: [react(), tailwindcss()],
  server: {
    fs: {
      // BatchDetailDrawer imports the real print-spec constants from
      // agents/bindery/kdpSpecs.ts (outside this package) rather than
      // hardcoding a copy — allow the dev server to serve it.
      allow: [".."],
    },
  },
});
