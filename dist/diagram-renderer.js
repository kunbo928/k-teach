import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { parse } from "yaml";


import { KTeachError } from "./errors.js";
import { validateDocument } from "./schema.js";

const NODE_WIDTH = 240;
const NODE_HEIGHT = 108;
const GAP = 60;
const PADDING = 48;
const TITLE_HEIGHT = 92;






function escapeXml(value         )         {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapDiagramText(value        , maxUnits        )           {
  const lines           = [];
  let line = "";
  let units = 0;
  for (const character of Array.from(value)) {
    const size = /[\u3400-\u9fff]/.test(character) ? 2 : 1;
    if (line && units + size > maxUnits) {
      lines.push(line);
      line = character;
      units = size;
    } else {
      line += character;
      units += size;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function textTspans(lines          , x        , startY        , lineHeight        )         {
  return lines.map((line, index) => `<tspan x="${x}" y="${startY + index * lineHeight}">${escapeXml(line)}</tspan>`).join("");
}

function assertGraphIntegrity(spec             )       {
  const safeId = /^[a-z0-9][a-z0-9-]*$/;
  if (!safeId.test(spec.id)) {
    throw new KTeachError(
      "invalid-diagram",
      "Diagram id must use lowercase letters, digits, and hyphens.",
      "Correct the Diagram Spec id and render again.",
    );
  }
  const ids = new Set        ();
  for (const node of spec.nodes) {
    if (!safeId.test(node.id) || ids.has(node.id)) {
      throw new KTeachError(
        "invalid-diagram",
        `Node id is invalid or duplicated: ${node.id}.`,
        "Use unique lowercase node ids with letters, digits, and hyphens.",
      );
    }
    ids.add(node.id);
  }
  for (const edge of spec.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      throw new KTeachError(
        "invalid-diagram",
        `Edge references an unknown node: ${edge.from} -> ${edge.to}.`,
        "Correct the edge endpoints and render again.",
      );
    }
  }
}

function positions(spec             )



  {
  const horizontal = spec.direction === "left-to-right";
  const incoming = new Map(spec.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(spec.nodes.map((node) => [node.id, []            ]));
  for (const edge of spec.edges) {
    incoming.set(edge.to, incoming.get(edge.to)  + 1);
    outgoing.get(edge.from) .push(edge.to);
  }
  const levels = new Map                (
    spec.nodes.map((node) => [node.id, 0]),
  );
  const queue = spec.nodes
    .filter((node) => incoming.get(node.id) === 0)
    .map((node) => node.id);
  const visited = new Set        ();
  while (queue.length > 0) {
    const id = queue.shift() ;
    visited.add(id);
    for (const target of outgoing.get(id) ) {
      levels.set(target, Math.max(levels.get(target) , levels.get(id)  + 1));
      incoming.set(target, incoming.get(target)  - 1);
      if (incoming.get(target) === 0) queue.push(target);
    }
  }
  for (const node of spec.nodes) {
    if (!visited.has(node.id)) {
      levels.set(node.id, Math.max(...levels.values()) + 1);
    }
  }
  const groups = new Map                  ();
  for (const node of spec.nodes) {
    const level = levels.get(node.id) ;
    groups.set(level, [...(groups.get(level) ?? []), node.id]);
  }
  const maxLevel = Math.max(...groups.keys());
  const maxBreadth = Math.max(...[...groups.values()].map((group) => group.length));
  const points = new Map               ();
  for (const [level, ids] of groups) {
    ids.forEach((id, index) => {
      points.set(id, {
        x:
          PADDING +
          (horizontal ? level * (NODE_WIDTH + GAP) : index * (NODE_WIDTH + GAP)),
        y:
          TITLE_HEIGHT +
          (horizontal ? index * (NODE_HEIGHT + GAP) : level * (NODE_HEIGHT + GAP)),
      });
    });
  }
  return {
    points,
    width:
      PADDING * 2 +
      (horizontal
        ? (maxLevel + 1) * NODE_WIDTH + maxLevel * GAP
        : maxBreadth * NODE_WIDTH + Math.max(0, maxBreadth - 1) * GAP),
    height:
      TITLE_HEIGHT +
      PADDING +
      (horizontal
        ? maxBreadth * NODE_HEIGHT + Math.max(0, maxBreadth - 1) * GAP
        : (maxLevel + 1) * NODE_HEIGHT + maxLevel * GAP),
  };
}

function renderEdge(
  edge                              ,
  points                    ,
  horizontal         ,
)         {
  const from = points.get(edge.from) ;
  const to = points.get(edge.to) ;
  const x1 = from.x + (horizontal ? NODE_WIDTH : NODE_WIDTH / 2);
  const y1 = from.y + (horizontal ? NODE_HEIGHT / 2 : NODE_HEIGHT);
  const x2 = to.x + (horizontal ? 0 : NODE_WIDTH / 2);
  const y2 = to.y + (horizontal ? NODE_HEIGHT / 2 : 0);
  const label = edge.label
    ? `<text class="edge-label" x="${(x1 + x2) / 2}" y="${
        (y1 + y2) / 2 - 9
      }">${escapeXml(edge.label)}</text>`
    : "";
  return `<g class="edge"><path d="M ${x1} ${y1} L ${x2} ${y2}" marker-end="url(#arrow)"/>${label}</g>`;
}

function renderNode(
  node                              ,
  point       ,
)         {
  const role = node.role ?? "step";
  const centerX = point.x + NODE_WIDTH / 2;
  const labelLines = wrapDiagramText(node.label, 27);
  const detailLines = node.detail ? wrapDiagramText(node.detail, 38) : [];
  const labelStart = point.y + (detailLines.length > 0 ? 29 : 45 - (labelLines.length - 1) * 8);
  const detailStart = point.y + 70;
  const detail = detailLines.length > 0
    ? `<text class="node-detail">${textTspans(detailLines, centerX, detailStart, 14)}</text>`
    : "";
  if (role === "decision") {
    const cx = point.x + NODE_WIDTH / 2;
    const cy = point.y + NODE_HEIGHT / 2;
    return `<g class="node role-decision"><polygon points="${cx},${point.y} ${
      point.x + NODE_WIDTH
    },${cy} ${cx},${point.y + NODE_HEIGHT} ${point.x},${cy}"/><text class="node-label">${textTspans(labelLines, cx, cy - (labelLines.length - 1) * 8 + 4, 17)}</text></g>`;
  }
  return `<g class="node role-${escapeXml(role)}"><rect x="${point.x}" y="${
    point.y
  }" rx="${role === "start" || role === "end" ? 38 : 3}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}"/><text class="node-label" x="${
    point.x + NODE_WIDTH / 2
  }">${textTspans(labelLines, centerX, labelStart, 17)}</text>${detail}</g>`;
}

function renderSequenceSvg(spec             )         {
  const participantWidth = 150;
  const participantGap = 70;
  const messageGap = 64;
  const headerY = TITLE_HEIGHT;
  const lifelineTop = headerY + 54;
  const width = PADDING * 2 + spec.nodes.length * participantWidth + Math.max(0, spec.nodes.length - 1) * participantGap;
  const height = lifelineTop + Math.max(1, spec.edges.length) * messageGap + 56;
  const centers = new Map(spec.nodes.map((node, index) => [node.id, PADDING + participantWidth / 2 + index * (participantWidth + participantGap)]));
  const participants = spec.nodes.map((node) => {
    const center = centers.get(node.id) ;
    return `<g class="sequence-participant"><rect x="${center - participantWidth / 2}" y="${headerY}" width="${participantWidth}" height="44" rx="8"/><text x="${center}" y="${headerY + 28}">${escapeXml(node.label)}</text><path class="sequence-lifeline" d="M ${center} ${lifelineTop} L ${center} ${height - 30}"/></g>`;
  }).join("");
  const messages = spec.edges.map((edge, index) => {
    const from = centers.get(edge.from) ;
    const to = centers.get(edge.to) ;
    const y = lifelineTop + 38 + index * messageGap;
    const direction = to >= from ? 1 : -1;
    const labelX = (from + to) / 2;
    return `<g class="sequence-message"><path d="M ${from} ${y} L ${to - direction * 7} ${y}" marker-end="url(#arrow)"/><text x="${labelX}" y="${y - 10}">${escapeXml(edge.label ?? "消息")}</text><circle cx="${from}" cy="${y}" r="3"/></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${spec.id}-title ${spec.id}-desc">
  <title id="${spec.id}-title">${escapeXml(spec.title)}</title><desc id="${spec.id}-desc">${escapeXml(spec.description)}</desc>
  <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" fill="#315c49"/></marker></defs>
  <rect width="100%" height="100%" fill="#f6f1e7"/><text x="${PADDING}" y="29" fill="#647069" font-family="system-ui,sans-serif" font-size="11" letter-spacing="2">SEQUENCE</text><text x="${PADDING}" y="61" fill="#17221d" font-family="Songti SC,serif" font-size="22" font-weight="700">${escapeXml(spec.title)}</text>
  <style>text{font-family:ui-sans-serif,-apple-system,"PingFang SC",sans-serif}.sequence-participant rect{fill:#fff;stroke:#315c49;stroke-width:1.5}.sequence-participant text{fill:#17221d;font-size:14px;font-weight:700;text-anchor:middle}.sequence-lifeline{stroke:#9aa39e;stroke-width:1.2;stroke-dasharray:6 6}.sequence-message path{stroke:#315c49;stroke-width:1.8;fill:none}.sequence-message text{fill:#425049;font-size:12px;font-weight:600;text-anchor:middle;paint-order:stroke;stroke:#f6f1e7;stroke-width:6px}.sequence-message circle{fill:#315c49}</style>
  ${participants}${messages}</svg>`;
}

export function renderDiagramSvg(spec             )         {
  assertGraphIntegrity(spec);
  if (spec.kind === "sequence") return renderSequenceSvg(spec);
  const layout = positions(spec);
  const horizontal = spec.direction === "left-to-right";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-labelledby="${spec.id}-title ${spec.id}-desc">
  <title id="${spec.id}-title">${escapeXml(spec.title)}</title>
  <desc id="${spec.id}-desc">${escapeXml(spec.description)}</desc>
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z"/></marker>
  </defs>
  <style>
    :root { color-scheme: light dark; }
    text { font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; }
    .diagram-title { fill: var(--kt-diagram-ink, #17221d); font-family: ui-serif, "Songti SC", serif; font-size: 22px; font-weight: 700; }
    .diagram-kind { fill: var(--kt-diagram-muted, #647069); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
    .node rect, .node polygon { fill: var(--kt-diagram-paper, #f6f1e7); stroke: var(--kt-diagram-accent, #315c49); stroke-width: 1.5; }
    .role-decision polygon { fill: var(--kt-diagram-note, #e8e0cc); }
    .role-end rect { stroke-width: 3; }
    .node-label { fill: var(--kt-diagram-ink, #17221d); font-size: 14px; font-weight: 650; text-anchor: middle; }
    .node-detail { fill: var(--kt-diagram-muted, #647069); font-size: 11px; text-anchor: middle; }
    .edge path { fill: none; stroke: var(--kt-diagram-line, #7a837e); stroke-width: 1.5; }
    #arrow path { fill: var(--kt-diagram-line, #7a837e); }
    .edge-label { fill: var(--kt-diagram-muted, #647069); font-size: 11px; text-anchor: middle; paint-order: stroke; stroke: var(--kt-diagram-paper, #f6f1e7); stroke-width: 5px; }
    @media (prefers-color-scheme: dark) {
      .diagram-background { fill: #111814; }
      .diagram-title, .node-label { fill: #e7e9e5; }
      .diagram-kind, .node-detail, .edge-label { fill: #afb7b1; }
      .node rect, .node polygon { fill: #17201c; }
      .role-decision polygon { fill: #252d27; }
      .edge-label { stroke: #111814; }
    }
  </style>
  <rect class="diagram-background" x="0" y="0" width="100%" height="100%" fill="var(--kt-diagram-paper, #f6f1e7)"/>
  <text class="diagram-kind" x="${PADDING}" y="29">${escapeXml(spec.kind)}</text>
  <text class="diagram-title" x="${PADDING}" y="61">${escapeXml(spec.title)}</text>
  <g class="edges">${spec.edges
    .map((edge) => renderEdge(edge, layout.points, horizontal))
    .join("")}</g>
  <g class="nodes">${spec.nodes
    .map((node) => renderNode(node, layout.points.get(node.id) ))
    .join("")}</g>
</svg>
`;
}

export async function renderDiagram(
  inputPath        ,
  outputDirectory        ,
)                  {
  const source = await readFile(inputPath, "utf8");
  const value = parse(source)           ;
  const errors = await validateDocument("diagram-spec", value);
  if (errors.length > 0) {
    throw new KTeachError(
      "invalid-diagram",
      `${path.basename(inputPath)}: ${errors.join("; ")}.`,
      "Correct the Diagram Spec and render again.",
      { file: inputPath, errors },
    );
  }
  const spec = value               ;
  const svg = renderDiagramSvg(spec);
  const output = path.resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  const svgName = `${spec.id}.svg`;
  const pngName = `${spec.id}@2x.png`;
  const svgPath = path.join(output, svgName);
  const pngPath = path.join(output, pngName);
  await writeFile(svgPath, svg, "utf8");
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(pngPath);
  const manifest = {
    schema_version: 1,
    id: spec.id,
    kind: spec.kind,
    input_hash: createHash("sha256").update(source).digest("hex"),
    renderer: "k-teach-diagram-v1",
    design_profile: "field-manual",
    scale: 2,
    files: [svgName, pngName],
  };
  await writeFile(
    path.join(output, `${spec.id}.manifest.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return output;
}


//# sourceURL=k-teach/src/diagram-renderer.ts