import { OpenRouter } from "@openrouter/sdk";
import * as readline from "node:readline/promises";
import { writeFile } from "node:fs/promises";
import { queryActionsPrompt } from "./prompts/queryActions";
import { toolSelection } from "./prompts/toolSelection";
import { createSession, searchTools, composio } from "./utils/session";
import { buildGraphHTML } from "./graph/renderGraph";
import type { ExecutionStep, ToolSchema, DependencyResult } from "./types/toolGraph";

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

const filterDepGraphResults = async (
  query: string,
  depGraphs: DependencyResult[],
): Promise<DependencyResult[]> => {
  const summary = depGraphs.map((d) => ({ tool: d.tool, data: d.data }));
  const prompt = `You are a dependency-graph pruning expert. Given a user query and a set of tool dependency graphs, return ONLY the dependencies that are actually relevant to fulfilling the query.

Return valid JSON — an array of objects with this shape:
[{ "tool": "<SLUG>", "relevant_deps": ["<DEP_SLUG_1>", "<DEP_SLUG_2>"] }]

If a tool has no relevant dependencies, use an empty array.

Dependency graphs:
${JSON.stringify(summary, null, 2)}`;

  const result = await openRouter.chat.send({
    chatGenerationParams: {
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: query },
      ],
      model: "openai/gpt-4o",
      provider: { zdr: true, sort: "price" },
      stream: false,
    },
  });

  const content = result?.choices[0]?.message?.content as string || "[]";
  try {
    const parsed = JSON.parse(content) as Array<{ tool: string; relevant_deps: string[] }>;
    if (!Array.isArray(parsed)) throw new Error("not an array");
    const relevantByTool = new Map<string, Set<string>>();
    for (const entry of parsed) {
      relevantByTool.set(entry.tool, new Set(entry.relevant_deps || []));
    }
    return depGraphs.map((dg) => {
      const allowed = relevantByTool.get(dg.tool);
      if (!allowed || !dg.data) return dg;
      const filtered = { ...dg, data: { ...dg.data } };
      for (const key of ["parent_tools", "parentTools", "parents", "dependencies", "child_tools", "childTools", "children", "dependents"]) {
        const arr = filtered.data[key];
        if (Array.isArray(arr)) {
          filtered.data[key] = arr.filter((item: Record<string, unknown>) => {
            const slug = (item.slug ?? item.tool_slug ?? item.name ?? item.tool_name ?? "") as string;
            return allowed.has(slug);
          });
        }
      }
      return filtered;
    });
  } catch {
    console.warn("Failed to parse dep graph filter, using unfiltered graphs");
    return depGraphs;
  }
};

const generateExecutionSequence = async (
  query: string,
  selectedSlugs: string[],
  toolSchemas: Record<string, { tool_slug: string; description?: string; [k: string]: unknown }>,
): Promise<ExecutionStep[]> => {
  const toolInfo = selectedSlugs.map((slug) => ({
    slug,
    description: ((toolSchemas[slug]?.description as string) || "").slice(0, 200),
  }));
  const prompt = `You are an execution-planning expert. Given a user query and a set of selected tools, produce an ordered execution sequence.

Each step must have: "step", "tool", "purpose", "input_from", "output_used_by".
Respond ONLY with a valid JSON array.

Available tools:
${JSON.stringify(toolInfo, null, 2)}`;

  const result = await openRouter.chat.send({
    chatGenerationParams: {
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: query },
      ],
      model: "openai/gpt-4o",
      provider: { zdr: true, sort: "price" },
      stream: false,
    },
  });

  const content = result?.choices[0]?.message?.content as string || "[]";
  try {
    const parsed = JSON.parse(content.replace(/(,|\{)\s*(\w+)\s*:/g, '$1"$2":'));
    if (!Array.isArray(parsed)) throw new Error("not an array");
    const toNumberArray = (val: unknown): number[] => {
      if (Array.isArray(val)) return val.filter((v) => typeof v === "number");
      if (typeof val === "number") return [val];
      return [];
    };
    return parsed.map((s: Record<string, unknown>) => ({
      step: s.step as number,
      tool: s.tool as string,
      purpose: s.purpose as string,
      inputFrom: toNumberArray(s.input_from ?? s.inputFrom),
      outputUsedBy: toNumberArray(s.output_used_by ?? s.outputUsedBy),
    }));
  } catch {
    console.warn("Failed to parse execution sequence, building linear fallback");
    return selectedSlugs.map((slug, i) => ({
      step: i + 1,
      tool: slug,
      purpose: "",
      inputFrom: i > 0 ? [i] : [],
      outputUsedBy: i < selectedSlugs.length - 1 ? [i + 2] : [],
    }));
  }
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

  const rawDepGraphs = await Promise.all(
    selectedSlugs.map(async (slug) => {
      const result = await composio.tools.execute("COMPOSIO_GET_DEPENDENCY_GRAPH", {
        arguments: { tool_name: slug },
        dangerouslySkipVersionCheck: true,
      });
      return { tool: slug, ...result } as DependencyResult;
    })
  );
  console.log("Raw dependency graphs:", JSON.stringify(rawDepGraphs, null, 2));

  const depGraphs = await filterDepGraphResults(query, rawDepGraphs);
  console.log("Filtered dependency graphs:", JSON.stringify(depGraphs, null, 2));

  const executionSequence = await generateExecutionSequence(query, selectedSlugs, toolSchemas);
  console.log("Execution sequence:", JSON.stringify(executionSequence, null, 2));

  const selectedSchemas = Object.fromEntries(
    Object.entries(toolSchemas).filter(([slug]) => selectedSlugs.includes(slug))
  ) as Record<string, ToolSchema>;

  const html = buildGraphHTML(selectedSchemas, depGraphs, query, executionSequence);
  await writeFile("graph.html", html, "utf-8");
  console.log("Graph written to graph.html — open it in a browser.");
}

start();
