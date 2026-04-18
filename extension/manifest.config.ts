import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

export default defineManifest({
  manifest_version: 3,
  name: "Copilot Buddy",
  version: pkg.version,
  description:
    "Side-panel companion that talks to a local Copilot Buddy daemon (Go) wrapping the GitHub Copilot CLI SDK.",
  minimum_chrome_version: "116",
  action: {
    default_title: "Open Copilot Buddy",
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  permissions: ["storage", "sidePanel", "activeTab", "scripting", "tabs"],
  host_permissions: ["http://127.0.0.1/*", "http://localhost/*"],
  icons: {
    16: "public/icons/icon-16.png",
    48: "public/icons/icon-48.png",
    128: "public/icons/icon-128.png",
  },
});
