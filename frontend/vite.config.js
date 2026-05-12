import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: ["prolific-liberation-production.up.railway.app"],
    host: "0.0.0.0",
    port: 5173,
  },
});