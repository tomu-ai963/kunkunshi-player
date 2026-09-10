import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages でサブパス配信するため base を設定。
// ユーザー/組織ページ (xxx.github.io) に置く場合は "/" に変更してください。
export default defineConfig({
  plugins: [react()],
  base: "/kunkunshi-player/",
});
