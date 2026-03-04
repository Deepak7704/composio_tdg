import type { ExecutionStep, ToolSchema, DependencyResult, GraphNode, GraphEdge } from "../types/toolGraph";

export function buildGraphData(
  toolSchemas: Record<string, ToolSchema>,
  depGraphs: DependencyResult[],
  executionSequence: ExecutionStep[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const knownIds = new Set<string>();
  const edgeKeys = new Set<string>();

  const addEdge = (edge: GraphEdge) => {
    const key = `${edge.source}->${edge.target}:${edge.type}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge);
  };

  for (const [slug, schema] of Object.entries(toolSchemas)) {
    knownIds.add(slug);
    nodes.push({
      id: slug,
      label: schema.tool_slug || slug,
      toolkit: (schema.toolkit as string) || "",
      description: ((schema.description as string) || "").slice(0, 200),
    });
  }

  for (const dep of depGraphs) {
    const data = dep.data as Record<string, unknown> | undefined;
    if (!data) continue;

    const parentTools = (data.parent_tools ?? data.parentTools ?? data.parents ?? data.dependencies ?? []) as Array<Record<string, unknown>>;
    if (Array.isArray(parentTools)) {
      for (const parent of parentTools) {
        const parentSlug = (parent.slug ?? parent.tool_slug ?? parent.name ?? parent.tool_name ?? "") as string;
        if (!parentSlug) continue;
        if (!knownIds.has(parentSlug)) {
          knownIds.add(parentSlug);
          nodes.push({ id: parentSlug, label: parentSlug, toolkit: "", description: "Dependency (from graph)" });
        }
        addEdge({ source: parentSlug, target: dep.tool, label: (parent.reason as string) || "", type: "dep" });
      }
    }

    const childTools = (data.child_tools ?? data.childTools ?? data.children ?? data.dependents ?? []) as Array<Record<string, unknown>>;
    if (Array.isArray(childTools)) {
      for (const child of childTools) {
        const childSlug = (child.slug ?? child.tool_slug ?? child.name ?? child.tool_name ?? "") as string;
        if (!childSlug) continue;
        if (!knownIds.has(childSlug)) {
          knownIds.add(childSlug);
          nodes.push({ id: childSlug, label: childSlug, toolkit: "", description: "Dependent (from graph)" });
        }
        addEdge({ source: dep.tool, target: childSlug, label: (child.reason as string) || "", type: "dep" });
      }
    }
  }

  for (const step of executionSequence) {
    for (const fromStep of step.inputFrom) {
      const sourceStep = executionSequence.find((s) => s.step === fromStep);
      if (sourceStep && knownIds.has(sourceStep.tool) && knownIds.has(step.tool)) {
        addEdge({ source: sourceStep.tool, target: step.tool, label: `Step ${fromStep} → Step ${step.step}`, type: "seq" });
      }
    }
  }

  return { nodes, edges };
}
