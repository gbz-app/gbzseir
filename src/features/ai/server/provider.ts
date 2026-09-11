import "server-only";
import type { AiProvider } from "../lib/models";
import type { AgentResult, AgentRunOptions } from "./agent";
import { runAgent as runAnthropicAgent } from "./anthropic";
import { runOpenAiAgent } from "./openai";

/** One GebzemAI turn with the selected provider: same options, same stream events, same usage fields. */
export function runProviderAgent(provider: AiProvider, o: AgentRunOptions): Promise<AgentResult> {
  return provider === "openai" ? runOpenAiAgent(o) : runAnthropicAgent(o);
}
