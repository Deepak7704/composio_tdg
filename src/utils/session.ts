import { Composio } from "@composio/core";

export const composio = new Composio();

const getApiKey = (): string => {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) {
    throw new Error("COMPOSIO_API_KEY environment variable is not set");
  }
  return key;
};

export const createSession = async (): Promise<string> => {
  const res = await fetch("https://backend.composio.dev/api/v3/tool_router/session", {
    method: "POST",
    headers: { "x-api-key": getApiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "test" }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to create session (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { session_id?: string };
  if (!data.session_id) {
    throw new Error("Session response missing session_id");
  }
  return data.session_id;
};

export const searchTools = async (
  sessionId: string,
  actions: Array<{ query: string }>,
): Promise<Record<string, { tool_slug: string; [k: string]: unknown }>> => {
  const queries = actions.map((a) => ({ use_case: a.query })).slice(0, 7);

  if (queries.length === 0) {
    throw new Error("No valid actions to search tools for");
  }

  const res = await fetch(
    `https://backend.composio.dev/api/v3/tool_router/session/${sessionId}/search`,
    {
      method: "POST",
      headers: { "x-api-key": getApiKey(), "Content-Type": "application/json" },
      body: JSON.stringify({ toolkits: ["googlesuper", "github"], queries }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tool search failed (${res.status}): ${body}`);
  }

  const result = (await res.json()) as {
    tool_schemas?: Record<string, { tool_slug: string }>;
    error?: { message?: string };
  };

  if (result.error?.message) {
    throw new Error(`Tool search returned error: ${result.error.message}`);
  }
  if (!result.tool_schemas || Object.keys(result.tool_schemas).length === 0) {
    throw new Error("Tool search returned no tool_schemas");
  }

  return result.tool_schemas;
};

export const getDependencyGraph = async (slug: string): Promise<{ tool: string; data?: Record<string, unknown>; successful?: boolean }> => {
  try {
    const result = await composio.tools.execute("COMPOSIO_GET_DEPENDENCY_GRAPH", {
      arguments: { tool_name: slug },
      dangerouslySkipVersionCheck: true,
    });
    return { tool: slug, ...result } as { tool: string; data?: Record<string, unknown>; successful?: boolean };
  } catch (err) {
    console.warn(`Failed to get dependency graph for ${slug}:`, err instanceof Error ? err.message : err);
    return { tool: slug, data: undefined, successful: false };
  }
};
