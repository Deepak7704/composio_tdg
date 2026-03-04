import { OpenRouter } from "@openrouter/sdk";
import * as readline from "node:readline/promises";
import { writeFile } from "node:fs/promises";
import { queryActionsPrompt } from "./prompts/queryActions";
import { toolSelection } from "./prompts/toolSelection";
import { createSession, searchTools, getDependencyGraph } from "./utils/session";
import { buildGraphHTML } from "./graph/renderGraph";
import type { ExecutionStep, ToolSchema, DependencyResult } from "./types/toolGraph";

const openRouter = new OpenRouter();

const stripMarkdownFences = (text: string): string => {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return fenceMatch?.[1] ? fenceMatch[1].trim() : trimmed;
};

interface QueryAction {
  query: string;
}

const parseQueryActions = (raw: string): QueryAction[] => {
  try {
    const parsed = JSON.parse(stripMarkdownFences(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is QueryAction =>
        typeof item === "object" && item !== null && typeof item.query === "string",
      )
      .map((item) => ({ query: item.query.trim() }))
      .filter((item) => item.query.length > 0)
      .slice(0, 7);
  } catch {
    return [];
  }
};

const generateQueryActions = async (query: string): Promise<QueryAction[]> => {
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

  const content = (result?.choices[0]?.message?.content as string) || "";
  const actions = parseQueryActions(content);

  if (actions.length === 0) {
    throw new Error(`Planner returned no valid actions. Raw response: "${content.slice(0, 200)}"`);
  }

  return actions;
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

  const content = (result?.choices[0]?.message?.content as string) || "[]";
  try {
    const parsed = JSON.parse(stripMarkdownFences(content));
    if (Array.isArray(parsed) && parsed.every((s: unknown) => typeof s === "string")) {
      const validSlugs = new Set(Object.keys(toolSchemas));
      const filtered = (parsed as string[]).filter((s) => validSlugs.has(s));
      if (filtered.length > 0) return filtered;
    }
  } catch {
    console.warn("Failed to parse tool selection response");
  }
  console.warn("Tool selection returned no valid slugs, using top 10 candidates");
  return Object.keys(toolSchemas).slice(0, 10);
};

const filterDepGraphResults = async (
  query: string,
  depGraphs: DependencyResult[],
): Promise<DependencyResult[]> => {
  const summary = depGraphs
    .filter((d) => d.data)
    .map((d) => ({ tool: d.tool, data: d.data }));

  if (summary.length === 0) return depGraphs;

  const prompt = `You are a dependency-graph pruning expert. Given a user query and a set of tool dependency graphs, return ONLY the dependencies that are actually relevant to fulfilling the query.

Return valid JSON — an array of objects with this shape:
[{ "tool": "<SLUG>", "relevant_deps": ["<DEP_SLUG_1>", "<DEP_SLUG_2>"] }]

If a tool has no relevant dependencies, use an empty array.

Dependency graphs:
${JSON.stringify(summary, null, 2).slice(0, 8000)}`;

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

  const content = (result?.choices[0]?.message?.content as string) || "[]";
  try {
    const parsed = JSON.parse(stripMarkdownFences(content)) as Array<{ tool: string; relevant_deps: string[] }>;
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

const toNumberArray = (val: unknown): number[] => {
  if (Array.isArray(val)) return val.filter((v) => typeof v === "number");
  if (typeof val === "number") return [val];
  return [];
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

Each step must have: "step" (number), "tool" (string), "purpose" (string), "input_from" (array of step numbers), "output_used_by" (array of step numbers).
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

  const content = (result?.choices[0]?.message?.content as string) || "[]";
  try {
    const parsed = JSON.parse(stripMarkdownFences(content));
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed.map((s: Record<string, unknown>) => ({
      step: s.step as number,
      tool: s.tool as string,
      purpose: (s.purpose as string) || "",
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
  try {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const query = await rl.question("Hello, how can I help you today?\n> ");
    rl.close();

    if (!query.trim()) {
      console.error("Please provide a query");
      process.exit(1);
    }

    console.log("\n1. Planning query actions...");
    const actions = await generateQueryActions(query);
    console.log("   Actions:", actions.map((a) => a.query));

    console.log("\n2. Creating tool router session...");
    const sessionId = await createSession();
    console.log("   Session ID:", sessionId);

    console.log("\n3. Searching tools...");
    const toolSchemas = await searchTools(sessionId, actions);
    console.log("   Tool slugs from search:", Object.keys(toolSchemas));

    console.log("\n4. Selecting relevant tools...");
    const selectedSlugs = await selectRelevantTools(query, toolSchemas);
    console.log("   Selected:", selectedSlugs);

    console.log("\n5. Fetching dependency graphs...");
    const rawDepGraphs = await Promise.allSettled(
      selectedSlugs.map((slug) => getDependencyGraph(slug)),
    );
    const depGraphResults = rawDepGraphs
      .filter((r): r is PromiseFulfilledResult<DependencyResult> => r.status === "fulfilled")
      .map((r) => r.value);

    const failedCount = rawDepGraphs.filter((r) => r.status === "rejected").length;
    if (failedCount > 0) {
      console.warn(`   ${failedCount} dependency graph(s) failed to fetch`);
    }
    console.log(`   Got ${depGraphResults.length} dependency graph(s)`);

    console.log("\n6. Filtering dependency graphs...");
    const depGraphs = await filterDepGraphResults(query, depGraphResults);

    console.log("\n7. Generating execution sequence...");
    const executionSequence = await generateExecutionSequence(query, selectedSlugs, toolSchemas);
    console.log("   Steps:", executionSequence.map((s) => `${s.step}. ${s.tool}`));

    console.log("\n8. Building graph HTML...");
    const selectedSchemas = Object.fromEntries(
      Object.entries(toolSchemas).filter(([slug]) => selectedSlugs.includes(slug)),
    ) as Record<string, ToolSchema>;

    const html = buildGraphHTML(selectedSchemas, depGraphs, query, executionSequence);
    await writeFile("graph.html", html, "utf-8");
    console.log("   Graph written to graph.html — open it in a browser.");
  } catch (err) {
    console.error("\nError:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

start();
