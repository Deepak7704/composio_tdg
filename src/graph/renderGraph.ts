import type { ExecutionStep, ToolSchema, DependencyResult } from "../types/toolGraph";
import { buildGraphData } from "./buildGraph";

export function buildGraphHTML(
  toolSchemas: Record<string, ToolSchema>,
  depGraphs: DependencyResult[],
  query: string,
  executionSequence: ExecutionStep[] = [],
): string {
  const { nodes, edges } = buildGraphData(toolSchemas, depGraphs, executionSequence);

  const nodesJSON = JSON.stringify(nodes);
  const edgesJSON = JSON.stringify(edges);
  const seqJSON = JSON.stringify(executionSequence);
  const rawJSON = JSON.stringify({ executionSequence, depGraphs }, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Tool Dependency Graph — ${query.slice(0, 60)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,sans-serif;background:#0a0a0f;color:#e0e0e8;height:100vh;overflow:hidden}
#app{display:flex;height:100vh}
.sidebar{width:340px;min-width:340px;background:#12121a;border-right:1px solid #2a2a3a;display:flex;flex-direction:column;overflow:hidden}
.sidebar-header{padding:20px;border-bottom:1px solid #2a2a3a}
.sidebar-header h1{font-size:16px;font-weight:700;color:#fff;margin-bottom:4px}
.sidebar-header p{font-size:11px;color:#888;line-height:1.4}
.stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:14px 20px;border-bottom:1px solid #2a2a3a}
.stat{background:#1a1a2a;border-radius:6px;padding:8px 10px;text-align:center}
.stat-val{font-size:20px;font-weight:700;color:#7c6cff}
.stat-label{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.5px}
.tool-list{flex:1;overflow-y:auto;padding:8px 12px}
.tool-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:12px;transition:background .15s;border:1px solid transparent}
.tool-item:hover{background:#1a1a2e}
.tool-item.selected{background:#1a1a3a;border-color:#7c6cff44}
.tool-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.tool-name{flex:1;color:#ccc;font-size:11px;word-break:break-all}
.main-area{flex:1;position:relative}
#graph{width:100%;height:100%}
svg{width:100%;height:100%}
.tooltip{position:absolute;background:#1a1a2aee;border:1px solid #3a3a4a;border-radius:8px;padding:12px;pointer-events:none;z-index:100;max-width:360px;font-size:12px;display:none;box-shadow:0 4px 20px rgba(0,0,0,.5)}
.tooltip h3{font-size:13px;color:#fff;margin-bottom:4px}
.tooltip .tt-tk{font-size:10px;color:#7c6cff;margin-bottom:4px}
.tooltip .tt-desc{color:#999;font-size:11px;line-height:1.4}
.zoom-controls{position:absolute;bottom:16px;right:16px;display:flex;flex-direction:column;gap:4px;z-index:5}
.zoom-btn{width:32px;height:32px;background:#12121a;border:1px solid #2a2a3a;border-radius:6px;color:#aaa;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.zoom-btn:hover{border-color:#7c6cff;color:#fff}
.raw-toggle{position:absolute;top:16px;right:16px;z-index:5}
.raw-toggle button{padding:6px 14px;font-size:11px;background:#12121a;border:1px solid #2a2a3a;border-radius:6px;color:#aaa;cursor:pointer}
.raw-toggle button:hover{border-color:#7c6cff;color:#fff}
.raw-panel{position:absolute;top:50px;right:16px;bottom:60px;width:480px;background:#12121aee;border:1px solid #2a2a3a;border-radius:8px;overflow-y:auto;padding:16px;font-size:11px;font-family:monospace;color:#999;display:none;z-index:5;white-space:pre-wrap;word-break:break-all}
.raw-panel.open{display:block}
.legend{position:absolute;bottom:16px;left:16px;background:#12121acc;border:1px solid #2a2a3a;border-radius:8px;padding:12px;font-size:10px;z-index:5}
.legend-title{font-size:11px;font-weight:600;color:#999;margin-bottom:6px}
.legend-item{display:flex;align-items:center;gap:6px;margin:3px 0;color:#888}
.legend-circle{width:8px;height:8px;border-radius:50%}
.pipeline-wrap{background:#12121a;border-bottom:1px solid #2a2a3a;padding:16px 20px;overflow-x:auto}
.pipeline{display:flex;align-items:center;min-width:max-content}
.pipe-step{display:flex;flex-direction:column;align-items:center;min-width:140px;max-width:180px}
.pipe-num{width:28px;height:28px;border-radius:50%;background:#7c6cff;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:6px}
.pipe-tool{font-size:10px;color:#b0a0ff;font-weight:600;text-align:center;word-break:break-all;line-height:1.3;margin-bottom:4px}
.pipe-purpose{font-size:10px;color:#888;text-align:center;line-height:1.3;max-width:160px}
.pipe-arrow{color:#7c6cff55;font-size:22px;margin:0 4px;padding-bottom:30px}
.pipe-deps{font-size:9px;color:#555;margin-top:4px;text-align:center}
</style>
</head>
<body>
<div id="app">
  <div class="sidebar">
    <div class="sidebar-header">
      <h1>Tool Dependency Graph</h1>
      <p>Query: "${query.replace(/"/g, "&quot;").slice(0, 120)}"</p>
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-val" id="s-nodes">0</div><div class="stat-label">Tools</div></div>
      <div class="stat"><div class="stat-val" id="s-edges">0</div><div class="stat-label">Edges</div></div>
      <div class="stat"><div class="stat-val" id="s-primary">0</div><div class="stat-label">Primary</div></div>
    </div>
    <div class="pipeline-wrap" id="pipeline-wrap"></div>
    <div class="tool-list" id="tool-list"></div>
  </div>
  <div class="main-area">
    <div id="graph"></div>
    <div class="tooltip" id="tooltip"></div>
    <div class="raw-toggle"><button onclick="toggleRaw()">Raw JSON</button></div>
    <div class="raw-panel" id="raw-panel"></div>
    <div class="legend">
      <div class="legend-title">Node Colors</div>
      <div class="legend-item"><div class="legend-circle" style="background:#7c6cff"></div> Primary tool</div>
      <div class="legend-item"><div class="legend-circle" style="background:#3a9a6c"></div> Dependency tool</div>
      <div class="legend-title" style="margin-top:8px">Edges</div>
      <div class="legend-item"><div style="width:20px;height:2.5px;background:#ff9800"></div> Execution flow</div>
      <div class="legend-item"><div style="width:20px;border-top:1px dashed #7c6cff88"></div> Dependency link</div>
    </div>
    <div class="zoom-controls">
      <div class="zoom-btn" onclick="zoomIn()">+</div>
      <div class="zoom-btn" onclick="zoomOut()">&minus;</div>
      <div class="zoom-btn" onclick="zoomFit()">&#9634;</div>
    </div>
  </div>
</div>
<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
const NODES = ${nodesJSON};
const EDGES = ${edgesJSON};
const SEQ = ${seqJSON};
const RAW = ${rawJSON};
const primarySlugs = new Set(${JSON.stringify(Object.keys(toolSchemas))});

document.getElementById("s-nodes").textContent = NODES.length;
document.getElementById("s-edges").textContent = EDGES.length;
document.getElementById("s-primary").textContent = primarySlugs.size;
document.getElementById("raw-panel").textContent = JSON.stringify(RAW, null, 2);

(function renderPipeline() {
  const wrap = document.getElementById("pipeline-wrap");
  if (!SEQ.length) { wrap.style.display = "none"; return; }
  let html = '<div style="font-size:12px;font-weight:600;color:#999;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px">Execution Sequence (' + SEQ.length + ' steps)</div><div class="pipeline">';
  SEQ.forEach((s, i) => {
    const shortTool = s.tool.replace(/^GMAIL_|^GOOGLE[A-Z]*_|^GITHUB_/, "");
    html += '<div class="pipe-step"><div class="pipe-num">' + s.step + '</div><div class="pipe-tool">' + shortTool + '</div><div class="pipe-purpose">' + (s.purpose || "") + '</div>';
    if (s.inputFrom && s.inputFrom.length) html += '<div class="pipe-deps">needs step ' + s.inputFrom.join(", ") + '</div>';
    html += '</div>';
    if (i < SEQ.length - 1) html += '<div class="pipe-arrow">\u2192</div>';
  });
  wrap.innerHTML = html + '</div>';
})();

const list = document.getElementById("tool-list");
NODES.forEach(n => {
  const el = document.createElement("div");
  el.className = "tool-item";
  el.innerHTML = '<div class="tool-dot" style="background:' + (primarySlugs.has(n.id) ? "#7c6cff" : "#3a9a6c") + '"></div><div class="tool-name">' + n.label + '</div>';
  el.onclick = () => focusNode(n.id);
  list.appendChild(el);
});

const container = document.getElementById("graph");
const W = container.clientWidth, H = container.clientHeight;
const svg = d3.select("#graph").append("svg").attr("width", W).attr("height", H);
const defs = svg.append("defs");
defs.append("marker").attr("id","arrowhead").attr("viewBox","0 -5 10 10").attr("refX",24).attr("refY",0).attr("markerWidth",6).attr("markerHeight",6).attr("orient","auto").append("path").attr("d","M0,-4L10,0L0,4").attr("fill","#7c6cff88");

const gRoot = svg.append("g");
const zoomBehavior = d3.zoom().scaleExtent([0.05, 6]).on("zoom", e => gRoot.attr("transform", e.transform));
svg.call(zoomBehavior);

const nodesCopy = NODES.map(n => ({...n}));
const edgesCopy = EDGES.map(e => ({...e}));

const sim = d3.forceSimulation(nodesCopy)
  .force("link", d3.forceLink(edgesCopy).id(d => d.id).distance(140).strength(0.3))
  .force("charge", d3.forceManyBody().strength(-350).distanceMax(600))
  .force("center", d3.forceCenter(W/2, H/2))
  .force("collision", d3.forceCollide().radius(24))
  .force("x", d3.forceX(W/2).strength(0.03))
  .force("y", d3.forceY(H/2).strength(0.03));

const linkG = gRoot.append("g");
const nodeG = gRoot.append("g");
const labelG = gRoot.append("g");

const links = linkG.selectAll("line").data(edgesCopy).enter().append("line")
  .attr("stroke", d => d.type==="seq" ? "#ff9800" : "#7c6cff66")
  .attr("stroke-width", d => d.type==="seq" ? 2.5 : 1.2)
  .attr("stroke-dasharray", d => d.type==="seq" ? "none" : "4,3")
  .attr("marker-end","url(#arrowhead)");

const circles = nodeG.selectAll("circle").data(nodesCopy).enter().append("circle")
  .attr("r", d => primarySlugs.has(d.id) ? 12 : 8)
  .attr("fill", d => primarySlugs.has(d.id) ? "#7c6cff" : "#3a9a6c")
  .attr("stroke", d => primarySlugs.has(d.id) ? "#a090ff" : "#2a7a5a")
  .attr("stroke-width", 2).attr("cursor","pointer").attr("opacity", 0.9)
  .on("mouseover", (ev,d) => {
    const tt = document.getElementById("tooltip");
    tt.innerHTML = '<h3>'+d.label+'</h3>'+(d.toolkit?'<div class="tt-tk">'+d.toolkit+'</div>':'')+'<div class="tt-desc">'+d.description+'</div>';
    tt.style.display = "block"; tt.style.left = (ev.pageX+12)+"px"; tt.style.top = (ev.pageY-20)+"px";
  })
  .on("mouseout", () => { document.getElementById("tooltip").style.display = "none"; })
  .on("click", (ev,d) => focusNode(d.id))
  .call(d3.drag()
    .on("start", (ev,d) => { if(!ev.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
    .on("drag", (ev,d) => { d.fx=ev.x; d.fy=ev.y; })
    .on("end", (ev,d) => { if(!ev.active) sim.alphaTarget(0); d.fx=null; d.fy=null; })
  );

const labels = labelG.selectAll("text").data(nodesCopy).enter().append("text")
  .attr("text-anchor","middle").attr("dy", d => primarySlugs.has(d.id) ? -16 : -12)
  .attr("fill","#aaa").attr("font-size", d => primarySlugs.has(d.id) ? "10px" : "8px")
  .attr("pointer-events","none")
  .text(d => { const s = d.label.replace(/^GMAIL_|^GOOGLE[A-Z]*_|^GITHUB_/, ""); return s.length > 26 ? s.slice(0,23)+"..." : s; });

sim.on("tick", () => {
  links.attr("x1",d=>d.source.x).attr("y1",d=>d.source.y).attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);
  circles.attr("cx",d=>d.x).attr("cy",d=>d.y);
  labels.attr("x",d=>d.x).attr("y",d=>d.y);
});

function focusNode(id) {
  circles.attr("opacity", d => d.id===id ? 1 : 0.25);
  links.attr("stroke-opacity", d => (d.source.id===id||d.target.id===id) ? 1 : 0.08);
  labels.attr("opacity", d => {
    if (d.id===id) return 1;
    for (const e of edgesCopy) { if ((e.source.id===id&&e.target.id===d.id)||(e.target.id===id&&e.source.id===d.id)) return 0.9; }
    return 0.15;
  });
  document.querySelectorAll(".tool-item").forEach((el,i) => el.classList.toggle("selected", NODES[i].id===id));
}

svg.on("click", ev => {
  if (ev.target===svg.node()) {
    circles.attr("opacity", 0.9); links.attr("stroke-opacity", 1); labels.attr("opacity", 1);
    document.querySelectorAll(".tool-item.selected").forEach(e => e.classList.remove("selected"));
  }
});

function zoomIn(){ svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.4); }
function zoomOut(){ svg.transition().duration(300).call(zoomBehavior.scaleBy, 0.7); }
function zoomFit(){
  const bounds = gRoot.node().getBBox();
  if (!bounds.width) return;
  const scale = Math.min(W/bounds.width, H/bounds.height) * 0.85;
  svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity.translate(W/2-(bounds.x+bounds.width/2)*scale, H/2-(bounds.y+bounds.height/2)*scale).scale(scale));
}
function toggleRaw(){ document.getElementById("raw-panel").classList.toggle("open"); }
setTimeout(zoomFit, 2000);
</script>
</body>
</html>`;
}
