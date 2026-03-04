import { Composio } from "@composio/core";

export const composio = new Composio();

export const createSession = async (): Promise<string> => {
  const res = await fetch("https://backend.composio.dev/api/v3/tool_router/session", {
    method: "POST",
    headers: { "x-api-key": process.env.COMPOSIO_API_KEY || "", "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "test" }),
  });
  const data = await res.json();
  return (data as { session_id: string }).session_id;
};

export const searchTools = async (
  sessionId: string,
  actions: string
): Promise<Record<string, { tool_slug: string; [k: string]: unknown }>> => {
  const res = await fetch(
    `https://backend.composio.dev/api/v3/tool_router/session/${sessionId}/search`,
    {
      method: "POST",
      headers: { "x-api-key": process.env.COMPOSIO_API_KEY || "", "Content-Type": "application/json" },
      body: JSON.stringify({
        toolkits: ["googlesuper", "github"],
        queries: JSON.parse((actions || "[]").replace(/(,|\{)\s*(\w+)\s*:/g, '$1"$2":'))
          ?.map((a: { query: string }) => ({ use_case: a.query }))
          ?.slice(0, 7) || [],
      }),
    }
  );
  const result = await res.json() as {
    tool_schemas?: Record<string, { tool_slug: string }>;
    error?: { message: string };
  };
  if (result.error || !result.tool_schemas) {
    throw new Error(result.error?.message || "No tool_schemas in response");
  }
  return result.tool_schemas;
};
