import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { useAiEnabled } from "./session";

/** AI screens redirect home while the assistant is switched off on the server. */
export function AiGate({ children }: { children: ReactNode }) {
  return useAiEnabled() ? children : <Navigate to="/" replace />;
}
