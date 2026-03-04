export interface ExecutionStep {
    step: number;
    tool: string;
    purpose: string;
    inputFrom: number[];
    outputUsedBy: number[];
  }
  
  export interface ToolSchema {
    tool_slug: string;
    toolkit?: string;
    description?: string;
    input_schema?: unknown;
    [key: string]: unknown;
  }
  
  export interface DependencyResult {
    tool: string;
    data?: { [key: string]: unknown };
    successful?: boolean;
    [key: string]: unknown;
  }
  
  export interface GraphNode {
    id: string;
    label: string;
    toolkit: string;
    description: string;
  }
  
  export interface GraphEdge {
    source: string;
    target: string;
    label: string;
    type: "dep" | "seq";
  }
  