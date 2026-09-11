"use client";

import * as React from "react";
import { AI_PROVIDERS, type AiProvider } from "../lib/models";

/** Which provider answers on this page (app_settings ai_provider, read by the server page). */
const AiProviderContext = React.createContext<AiProvider>("openai");

export function AiProviderScope({ provider, children }: { provider: AiProvider; children: React.ReactNode }) {
  return <AiProviderContext value={provider}>{children}</AiProviderContext>;
}

/** The privacy line under the composer for the selected provider ("... OpenAI'ye (ABD) gönderilir ve saklanmaz."). */
export function AiPrivacyText() {
  return <>{AI_PROVIDERS[React.useContext(AiProviderContext)].privacy}</>;
}
