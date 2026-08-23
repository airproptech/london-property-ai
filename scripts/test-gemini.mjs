// Quick standalone smoke test for the Gemini provider.
// Run with: GOOGLE_API_KEY=your_key node scripts/test-gemini.mjs
import { createAIProvider } from "../packages/ai/dist/provider-factory.js";

process.env.AI_PROVIDER = "gemini";
process.env.AI_MODEL = process.env.AI_MODEL || "gemini-3.5-flash";

const provider = createAIProvider();

const response = await provider.complete(
  [{ role: "user", content: "Say hello in exactly five words." }],
  [],
  "You are a helpful assistant."
);

console.log("Text response:", response.text);
console.log("Tool calls:", response.toolCalls);
