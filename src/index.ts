import { OpenRouter } from "@openrouter/sdk";
import * as readline from "node:readline/promises";
import { queryActionsPrompt } from "./prompts/queryActions";
import { toolSelection } from "./prompts/toolSelection";
import { createSession, searchTools, composio } from "./utils/session";

const openRouter = new OpenRouter();

const generateQueryActions = async (query: string) => {
  const result = await openRouter.chat.send({
    chatGenerationParams: {
      messages: [
        { role: "system", content: queryActionsPrompt },
        { role: "user", content: query },
      ],
      model: "openai/gpt-4o",
      provider: { zdr: true, sort: "price" },
      stream: false,
    },
  });
  return result?.choices[0]?.message?.content as string;
};

const selectRelevantTools = async (
  query: string,
  toolSchemas: Record<string, { tool_slug: string; description?: string; [k: string]: unknown }>,
): Promise<string[]> => {
  const toolSummary = Object.entries(toolSchemas).map(([slug, schema]) => ({
    slug,
    description: ((schema.description as string) || "").slice(0, 150),
  }));
  const result = await openRouter.chat.send({
    chatGenerationParams: {
      messages: [
        { role: "system", content: toolSelection(toolSummary) },
        { role: "user", content: query },
      ],
      model: "openai/gpt-4o",
      provider: { zdr: true, sort: "price" },
      stream: false,
    },
  });
  const content = result?.choices[0]?.message?.content as string || "[]";
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.every((s: unknown) => typeof s === "string")) {
      const validSlugs = new Set(Object.keys(toolSchemas));
      return (parsed as string[]).filter((s) => validSlugs.has(s));
    }
  } catch {
    console.warn("Failed to parse tool selection, falling back to all tools");
  }
  return Object.keys(toolSchemas);
};

async function start() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const query = await rl.question("Hello, how can I help you today?\n> ");
  rl.close();

  if (!query.trim()) { console.error("Please provide a query"); process.exit(1); }

  const actions = await generateQueryActions(query);
  console.log("Query actions:", actions);

  const sessionId = await createSession();
  console.log("Session ID:", sessionId);

  const toolSchemas = await searchTools(sessionId, actions);
  console.log("Tool slugs from search:", Object.keys(toolSchemas));

  const selectedSlugs = await selectRelevantTools(query, toolSchemas);
  console.log("Selected relevant tools:", selectedSlugs);
}

start();
