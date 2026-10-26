import "@fontsource-variable/nunito";
import "./styles/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { registerServiceWorker } from "./lib/pwa";
import { initTelegram } from "./lib/telegram";

initTelegram();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
