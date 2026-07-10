import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter, setBaseUrl, setClientBuildGetter } from "@workspace/api-client-react";
import {
  getAdopsClientBuildId,
  getRuntimeApiBaseUrl,
  getStoredOpsOperatorToken,
  sanitizeStoredOpsOperatorToken,
} from "@/lib/runtime-api";

const apiBaseUrl = getRuntimeApiBaseUrl();
sanitizeStoredOpsOperatorToken();

if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);
}

setAuthTokenGetter(() => getStoredOpsOperatorToken() || null);
setClientBuildGetter(() => getAdopsClientBuildId());

createRoot(document.getElementById("root")!).render(<App />);
