#!/usr/bin/env node
/**
 * Export a Graphify graph.json into an Obsidian vault.
 *
 * graphifyy (Graphify-Labs) has no built-in Obsidian export -- the `--obsidian`
 * flag documented in various blog posts belongs to a different project. This
 * script fills that gap: it turns the node-link graph into one markdown note
 * per node, with wikilinks standing in for edges so Obsidian's graph view and
 * backlinks pane reflect the real code structure.
 *
 * Usage:
 *   node scripts/graphifyToObsidian.mjs [--graph <path>] [--out <vaultDir>]
 */

import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const graphPath = getArg('--graph', 'graphify-out/graph.json');
const outDir = getArg('--out', join(process.env.USERPROFILE || process.env.HOME, 'Documents', 'ObsidianVaults', 'MyLecture'));

const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
const nodes = graph.nodes || [];
const links = graph.links || [];

// ---- filename handling -------------------------------------------------
// Windows forbids \ / : * ? " < > | ; Obsidian also chokes on # ^ [ ]
const sanitize = (s) =>
  s.replace(/[\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').replace(/-+/g, '-').trim().replace(/^\.+|\.+$/g, '') || 'unnamed';

const nameById = new Map();
const used = new Map();
for (const n of nodes) {
  let base = sanitize(n.label || n.id);
  const seen = used.get(base.toLowerCase()) || 0;
  used.set(base.toLowerCase(), seen + 1);
  if (seen > 0) base = `${base} (${n.source_file ? sanitize(n.source_file.split('/').pop()) : seen})`;
  // still colliding? fall back to the id, which is already a safe slug
  if ((used.get(base.toLowerCase()) || 0) > 0 && seen > 0 && nameById.has(base)) base = sanitize(n.id);
  nameById.set(n.id, base);
}

const link = (id) => (nameById.has(id) ? `[[${nameById.get(id)}]]` : `\`${id}\``);

// ---- group edges -------------------------------------------------------
const out = new Map();
const inb = new Map();
for (const l of links) {
  if (!out.has(l.source)) out.set(l.source, []);
  out.get(l.source).push(l);
  if (!inb.has(l.target)) inb.set(l.target, []);
  inb.get(l.target).push(l);
}

const byRelation = (edges, dir) => {
  const groups = new Map();
  for (const e of edges) {
    const rel = e.relation || 'related';
    if (!groups.has(rel)) groups.set(rel, []);
    groups.get(rel).push(e);
  }
  let md = '';
  for (const [rel, es] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    md += `\n### ${rel} (${es.length})\n`;
    for (const e of es.slice(0, 200)) {
      const other = dir === 'out' ? e.target : e.source;
      const loc = e.source_location ? ` — \`${e.source_location}\`` : '';
      md += `- ${link(other)}${loc}\n`;
    }
    if (es.length > 200) md += `- _…${es.length - 200} more_\n`;
  }
  return md;
};

// ---- write vault -------------------------------------------------------
if (existsSync(outDir)) rmSync(join(outDir, 'nodes'), { recursive: true, force: true });
mkdirSync(join(outDir, 'nodes'), { recursive: true });
mkdirSync(join(outDir, 'communities'), { recursive: true });

const yamlStr = (v) => (v === undefined || v === null ? '""' : JSON.stringify(String(v)));

const communities = new Map();
for (const n of nodes) {
  const c = n.community ?? 'none';
  if (!communities.has(c)) communities.set(c, []);
  communities.get(c).push(n);

  const o = out.get(n.id) || [];
  const i = inb.get(n.id) || [];

  let md = '---\n';
  md += `graphify_id: ${yamlStr(n.id)}\n`;
  md += `label: ${yamlStr(n.label)}\n`;
  md += `source_file: ${yamlStr(n.source_file)}\n`;
  md += `source_location: ${yamlStr(n.source_location)}\n`;
  md += `community: ${yamlStr(n.community_name || n.community)}\n`;
  md += `callable: ${Boolean(n._callable)}\n`;
  md += `degree: ${o.length + i.length}\n`;
  md += 'tags: [graphify, code-node]\n';
  md += '---\n\n';
  md += `# ${n.label || n.id}\n\n`;
  if (n.source_file) md += `**Source:** \`${n.source_file}${n.source_location ? ':' + n.source_location : ''}\`\n\n`;
  md += `**Connections:** ${o.length} outbound · ${i.length} inbound\n`;
  md += `
> [!info] Community
> [[Community ${n.community}]]
`;
  if (o.length) md += `\n## Depends on${byRelation(o, 'out')}`;
  if (i.length) md += `\n## Depended on by${byRelation(i, 'in')}`;
  writeFileSync(join(outDir, 'nodes', `${nameById.get(n.id)}.md`), md, 'utf8');
}

// community notes
for (const [c, members] of [...communities].sort((a, b) => b[1].length - a[1].length)) {
  const ranked = members
    .map((n) => ({ n, d: (out.get(n.id) || []).length + (inb.get(n.id) || []).length }))
    .sort((a, b) => b.d - a.d);
  const files = [...new Set(members.map((m) => m.source_file).filter(Boolean))];
  let md = `---\ntags: [graphify, community]\nmembers: ${members.length}\n---\n\n`;
  md += `# Community ${c}\n\n${members.length} nodes across ${files.length} file(s).\n\n## Files\n`;
  for (const f of files.sort()) md += `- \`${f}\`\n`;
  md += `\n## Members (by connectedness)\n`;
  for (const { n, d } of ranked) md += `- ${link(n.id)} — ${d} edge(s)\n`;
  writeFileSync(join(outDir, 'communities', `Community ${c}.md`), md, 'utf8');
}

// root index
const ranked = nodes
  .map((n) => ({ n, d: (out.get(n.id) || []).length + (inb.get(n.id) || []).length }))
  .sort((a, b) => b.d - a.d);
let idx = `---\ntags: [graphify, index]\n---\n\n# MyLecture — Code Graph\n\n`;
idx += `Generated from \`${graphPath}\` on ${new Date().toISOString().slice(0, 10)}.\n`;
idx += `Built from commit \`${graph.graph?.built_at_commit || graph.built_at_commit || 'unknown'}\`.\n\n`;
idx += `- **${nodes.length}** nodes\n- **${links.length}** edges\n- **${communities.size}** communities\n\n`;
idx += `## Architectural hubs (most connected)\n`;
for (const { n, d } of ranked.slice(0, 25)) idx += `- ${link(n.id)} — ${d} edges — \`${n.source_file || ''}\`\n`;
idx += `\n## Communities\n`;
for (const [c, m] of [...communities].sort((a, b) => b[1].length - a[1].length)) idx += `- [[Community ${c}]] — ${m.length} nodes\n`;
idx += `\n## Regenerate\n\n\`\`\`powershell\ngraphify update .\nnode scripts/graphifyToObsidian.mjs\n\`\`\`\n`;
writeFileSync(join(outDir, 'index.md'), idx, 'utf8');

console.log(`Vault written to: ${outDir}`);
console.log(`  ${nodes.length} node notes, ${communities.size} community notes, 1 index`);
