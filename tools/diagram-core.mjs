import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

export const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsRoot = path.join(kitRoot, 'assets');
const diagramsRoot = path.join(kitRoot, 'diagrams');

const NODE_WIDTH = 214;
const NODE_HEIGHT = 140;
const NODE_RADIUS = 10;
const NODE_VISUAL_SIZE = 40;
const NODE_VISUAL_GAP = 12;
const NODE_LABEL_LINE = 22;
const NODE_DESCRIPTION_LINE = 18;
const NODE_DESCRIPTION_GAP = 12;
const RANK_GAP = 96;
const SLOT_GAP = 16;
const OUTER_PADDING = 24;
const LANE_LABEL_SIZE = 24;
const GROUP_LANE_INSET = 14;
const ARCHITECTURE_WIDTH = 1600;
const ARCHITECTURE_HEIGHT = 720;

// Non-Azure node kinds keep the shared card and signal meaning with a Fluent glyph instead of a bespoke outline.
const NODE_KIND_GLYPHS = {
    decision: 'assets/fluent-system-icons/svg/regular/arrow-split.svg',
    queue: 'assets/fluent-system-icons/svg/regular/stack.svg',
    'data-store': 'assets/fluent-system-icons/svg/regular/database.svg',
    actor: 'assets/fluent-system-icons/svg/regular/person.svg',
    'external-system': 'assets/fluent-system-icons/svg/regular/globe.svg',
};

const escapeXml = (value = '') =>
    String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');

const ensureContainedPath = (root, relativePath, label) => {
    const absolutePath = path.resolve(kitRoot, relativePath);
    if (!absolutePath.startsWith(`${root}${path.sep}`)) {
        throw new Error(`${label} must remain under ${path.relative(kitRoot, root)}/: ${relativePath}`);
    }
    return absolutePath;
};

export const resolveDiagramPath = (relativePath) => ensureContainedPath(diagramsRoot, relativePath, 'Diagram path');
const resolveAssetPath = (relativePath) => ensureContainedPath(assetsRoot, relativePath, 'Asset path');

export const loadDiagram = async (inputPath) => JSON.parse(await readFile(inputPath, 'utf8'));

const findCycle = (nodeIds, edges) => {
    const outgoing = new Map(nodeIds.map((id) => [id, []]));
    for (const edge of edges) outgoing.get(edge.source)?.push(edge.target);
    const state = new Map();
    const stack = [];

    const visit = (id) => {
        state.set(id, 'visiting');
        stack.push(id);
        for (const target of outgoing.get(id) ?? []) {
            if (state.get(target) === 'visiting') {
                const start = stack.indexOf(target);
                return [...stack.slice(start), target];
            }
            if (!state.has(target)) {
                const cycle = visit(target);
                if (cycle) return cycle;
            }
        }
        stack.pop();
        state.set(id, 'visited');
        return undefined;
    };

    for (const id of nodeIds) {
        if (!state.has(id)) {
            const cycle = visit(id);
            if (cycle) return cycle;
        }
    }
    return undefined;
};

const disconnectedNodes = (nodeIds, edges) => {
    if (nodeIds.length === 0) return [];
    const adjacent = new Map(nodeIds.map((id) => [id, new Set()]));
    for (const edge of edges) {
        adjacent.get(edge.source)?.add(edge.target);
        adjacent.get(edge.target)?.add(edge.source);
    }
    const visited = new Set();
    const queue = [nodeIds[0]];
    while (queue.length) {
        const id = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);
        queue.push(...(adjacent.get(id) ?? []));
    }
    return nodeIds.filter((id) => !visited.has(id));
};

export const validateDiagram = async (diagram) => {
    const [schema, designContract] = await Promise.all([
        readFile(path.join(kitRoot, 'schemas', 'diagram.schema.json'), 'utf8').then(JSON.parse),
        readFile(path.join(kitRoot, 'design', 'design-contract.json'), 'utf8').then(JSON.parse),
    ]);
    const quality = designContract.diagramQuality;
    const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
    const validate = ajv.compile(schema);
    const errors = [];
    const warnings = [];

    if (!validate(diagram)) {
        errors.push(...validate.errors.map((error) => `${error.instancePath || '/'} ${error.message}`));
        return { errors, warnings };
    }

    const uniqueIds = (items, type) => {
        const ids = new Set();
        for (const item of items ?? []) {
            if (ids.has(item.id)) errors.push(`${type} id is duplicated: ${item.id}`);
            ids.add(item.id);
        }
        return ids;
    };

    const validateAsset = async (owner, asset) => {
        if (!asset) return;
        const absolutePath = resolveAssetPath(asset.path);
        try {
            await access(absolutePath);
        } catch {
            errors.push(`${owner} asset does not exist: ${asset.path}`);
        }
        if (!['.svg', '.png', '.jpg', '.jpeg'].includes(path.extname(absolutePath).toLowerCase())) {
            errors.push(`${owner} asset uses an unsupported format; use SVG, PNG, or JPEG: ${asset.path}`);
        }
        if (!asset.alt.trim()) errors.push(`${owner} asset requires useful alt text.`);
    };

    if (diagram.diagramType === 'layered-architecture') {
        const columnIds = uniqueIds(diagram.columns, 'Column');
        const layerIds = uniqueIds(diagram.layers, 'Layer');
        const concernsIds = uniqueIds(diagram.crossCuttingConcerns, 'Cross-cutting concern');
        const components = diagram.layers.flatMap((layer) => layer.components);
        const componentIds = uniqueIds(components, 'Component');
        const allIds = [...columnIds, ...layerIds, ...concernsIds, ...componentIds];
        if (new Set(allIds).size !== allIds.length) {
            errors.push('Column, layer, component, and cross-cutting concern ids must be globally unique.');
        }

        for (const layer of diagram.layers) {
            await validateAsset(`Layer ${layer.id}`, layer.asset);
            const occupiedColumns = new Set();
            for (const component of layer.components) {
                const start = diagram.columns.findIndex((column) => column.id === component.column);
                const span = component.span ?? 1;
                if (start < 0) {
                    errors.push(`Component ${component.id} references missing column: ${component.column}`);
                    continue;
                }
                if (start + span > diagram.columns.length) {
                    errors.push(`Component ${component.id} span extends beyond the available columns.`);
                    continue;
                }
                for (let index = start; index < start + span; index += 1) {
                    const columnId = diagram.columns[index].id;
                    if (occupiedColumns.has(columnId)) {
                        errors.push(`Layer ${layer.id} has overlapping components in column ${columnId}.`);
                    }
                    occupiedColumns.add(columnId);
                }
                await validateAsset(`Component ${component.id}`, component.asset);
            }
        }
        for (const concern of diagram.crossCuttingConcerns ?? []) {
            await validateAsset(`Cross-cutting concern ${concern.id}`, concern.asset);
        }

        if (components.length > quality.maximumArchitectureComponents) {
            errors.push(`Layered architecture is limited to ${quality.maximumArchitectureComponents} components; split denser content across views.`);
        }
        if (diagram.layers.length === 6 && components.some((component) => component.description)) {
            errors.push('Six-layer architectures cannot include component descriptions; split the diagram or remove detail.');
        }
        return { errors, warnings };
    }

    const nodeIds = uniqueIds(diagram.nodes, 'Node');
    const edgeIds = uniqueIds(diagram.edges, 'Edge');
    const groupIds = uniqueIds(diagram.groups, 'Group');
    const laneIds = uniqueIds(diagram.lanes, 'Lane');
    const allIds = [...nodeIds, ...edgeIds, ...groupIds, ...laneIds];
    if (new Set(allIds).size !== allIds.length) errors.push('Node, edge, group, and lane ids must be globally unique.');

    for (const edge of diagram.edges) {
        if (!nodeIds.has(edge.source)) errors.push(`Edge ${edge.id} references missing source node: ${edge.source}`);
        if (!nodeIds.has(edge.target)) errors.push(`Edge ${edge.id} references missing target node: ${edge.target}`);
        if (edge.source === edge.target) errors.push(`Edge ${edge.id} cannot connect a node to itself.`);
    }

    for (const node of diagram.nodes) {
        if (node.group && !groupIds.has(node.group)) errors.push(`Node ${node.id} references missing group: ${node.group}`);
        if (node.lane && !laneIds.has(node.lane)) errors.push(`Node ${node.id} references missing lane: ${node.lane}`);
        if (node.kind === 'azure-service' && (!node.asset || node.asset.kind !== 'azure')) {
            errors.push(`Azure service node ${node.id} requires an Azure asset.`);
        }
        await validateAsset(`Node ${node.id}`, node.asset);
    }

    for (const group of diagram.groups ?? []) {
        const members = diagram.nodes.filter((node) => node.group === group.id);
        if (members.length === 0) warnings.push(`Group ${group.id} has no nodes.`);
        const memberLanes = new Set(members.map((node) => node.lane).filter(Boolean));
        if (memberLanes.size > 1) errors.push(`Group ${group.id} spans multiple lanes; split it into lane-specific groups.`);
    }

    for (const lane of diagram.lanes ?? []) {
        if (!diagram.nodes.some((node) => node.lane === lane.id)) warnings.push(`Lane ${lane.id} has no nodes.`);
    }

    for (const decision of diagram.nodes.filter((node) => node.kind === 'decision')) {
        const outgoing = diagram.edges.filter((edge) => edge.source === decision.id);
        if (outgoing.length < 2) warnings.push(`Decision node ${decision.id} should have at least two outgoing edges.`);
        if (outgoing.some((edge) => !edge.label)) warnings.push(`Decision node ${decision.id} has an unlabeled outgoing edge.`);
    }

    const cycle = findCycle([...nodeIds], diagram.edges);
    if (cycle && !diagram.allowCycles) errors.push(`Diagram contains a cycle (${cycle.join(' -> ')}); set allowCycles to true when intentional.`);
    const disconnected = disconnectedNodes([...nodeIds], diagram.edges);
    if (disconnected.length) warnings.push(`Disconnected nodes: ${disconnected.join(', ')}`);
    if (diagram.nodes.length > quality.maximumFlowNodes) {
        errors.push(`Flow diagram is limited to ${quality.maximumFlowNodes} nodes; split denser content across views.`);
    }

    return { errors, warnings };
};

const calculateRanks = (nodes, edges) => {
    const ids = nodes.map((node) => node.id);
    const incoming = new Map(ids.map((id) => [id, 0]));
    const outgoing = new Map(ids.map((id) => [id, []]));
    for (const edge of edges) {
        incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
        outgoing.get(edge.source)?.push(edge.target);
    }

    const rank = new Map(ids.map((id) => [id, 0]));
    const queue = ids.filter((id) => incoming.get(id) === 0);
    const processed = new Set();
    while (queue.length) {
        const id = queue.shift();
        processed.add(id);
        for (const target of outgoing.get(id) ?? []) {
            rank.set(target, Math.max(rank.get(target) ?? 0, (rank.get(id) ?? 0) + 1));
            incoming.set(target, incoming.get(target) - 1);
            if (incoming.get(target) === 0) queue.push(target);
        }
    }

    let cycleRank = Math.max(0, ...rank.values());
    for (const id of ids) {
        if (!processed.has(id)) rank.set(id, cycleRank += 1);
    }
    return rank;
};

const layoutDiagram = (diagram) => {
    const direction = diagram.direction ?? 'right';
    const rank = calculateRanks(diagram.nodes, diagram.edges);
    const rankCount = Math.max(...rank.values()) + 1;
    const configuredLanes = diagram.lanes ?? [];
    const hasUnassigned = diagram.nodes.some((node) => !node.lane);
    const lanes = configuredLanes.length
        ? [...configuredLanes, ...(hasUnassigned ? [{ id: '__unassigned', label: 'Shared' }] : [])]
        : [{ id: '__default', label: '' }];
    const positions = new Map();
    const laneMetrics = [];
    let crossCursor = OUTER_PADDING;

    for (const lane of lanes) {
        const members = diagram.nodes.filter((node) => (node.lane ?? (configuredLanes.length ? '__unassigned' : '__default')) === lane.id);
        const buckets = new Map();
        for (const node of members) {
            const nodeRank = rank.get(node.id);
            if (!buckets.has(nodeRank)) buckets.set(nodeRank, []);
            buckets.get(nodeRank).push(node);
        }
        const maxInRank = Math.max(1, ...[...buckets.values()].map((bucket) => bucket.length));
        const crossNodeSize = direction === 'right' ? NODE_HEIGHT : NODE_WIDTH;
        // Lanes holding a group need extra room so the group frame stays inside the lane band.
        const groupInset = members.some((node) => node.group) ? GROUP_LANE_INSET : 0;
        const bandSize = LANE_LABEL_SIZE + OUTER_PADDING + groupInset * 2 + maxInRank * crossNodeSize + (maxInRank - 1) * SLOT_GAP;
        laneMetrics.push({ ...lane, start: crossCursor, size: bandSize });

        for (const [nodeRank, bucket] of buckets) {
            bucket.forEach((node, index) => {
                const primary = OUTER_PADDING + nodeRank * ((direction === 'right' ? NODE_WIDTH : NODE_HEIGHT) + RANK_GAP);
                const cross = crossCursor + LANE_LABEL_SIZE + OUTER_PADDING / 2 + groupInset + index * (crossNodeSize + SLOT_GAP);
                positions.set(node.id, direction === 'right'
                    ? { x: primary, y: cross, width: NODE_WIDTH, height: NODE_HEIGHT }
                    : { x: cross, y: primary, width: NODE_WIDTH, height: NODE_HEIGHT });
            });
        }
        crossCursor += bandSize + SLOT_GAP;
    }

    const primarySize = OUTER_PADDING * 2
        + rankCount * (direction === 'right' ? NODE_WIDTH : NODE_HEIGHT)
        + Math.max(0, rankCount - 1) * RANK_GAP;
    const crossSize = crossCursor - SLOT_GAP + OUTER_PADDING;
    const width = direction === 'right' ? primarySize : crossSize;
    const height = direction === 'right' ? crossSize : primarySize;
    const laneBounds = laneMetrics.map((lane) => direction === 'right'
        ? { ...lane, x: OUTER_PADDING / 3, y: lane.start, width: width - (OUTER_PADDING * 2) / 3, height: lane.size }
        : { ...lane, x: lane.start, y: OUTER_PADDING / 3, width: lane.size, height: height - (OUTER_PADDING * 2) / 3 });

    return { direction, positions, laneBounds, width, height };
};

const wrapWords = (value, maximumCharacters, maximumLines = 2) => {
    const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length <= maximumCharacters || !line) line = next;
        else {
            lines.push(line);
            line = word;
        }
    }
    if (line) lines.push(line);
    if (lines.length > maximumLines) {
        lines.length = maximumLines;
        lines[maximumLines - 1] = `${lines[maximumLines - 1].slice(0, Math.max(1, maximumCharacters - 1))}…`;
    }
    return lines;
};

const textLines = (lines, x, y, className, lineHeight, anchor = 'middle') => `<text x="${x}" y="${y}" class="${className}" text-anchor="${anchor}">${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join('')}</text>`;

const assetDataUri = async (asset) => {
    if (!asset) return undefined;
    const svg = await readFile(resolveAssetPath(asset.path));
    return `data:image/svg+xml;base64,${svg.toString('base64')}`;
};

const glyphMarkupCache = new Map();

const kindGlyphMarkup = async (kind) => {
    const relativePath = NODE_KIND_GLYPHS[kind];
    if (!relativePath) return undefined;
    if (!glyphMarkupCache.has(kind)) {
        const source = await readFile(resolveAssetPath(relativePath), 'utf8');
        glyphMarkupCache.set(kind, [...source.matchAll(/<path\b[^>]*\/>/g)].map((match) => match[0]).join(''));
    }
    return glyphMarkupCache.get(kind) || undefined;
};

const nodeShape = (node, position) => {
    const { x, y, width, height } = position;
    const extraClass = node.kind === 'external-system' ? ' node-shape--external' : '';
    return `<rect class="node-shape tone-${node.tone ?? 'neutral'}${extraClass}" x="${x}" y="${y}" width="${width}" height="${height}" rx="${NODE_RADIUS}" />`;
};

const renderNode = async (node, position) => {
    const assetUri = await assetDataUri(node.asset);
    const glyphMarkup = assetUri ? undefined : await kindGlyphMarkup(node.kind);
    const hasVisual = Boolean(assetUri || glyphMarkup);
    const centerX = position.x + position.width / 2;
    const labelLines = wrapWords(node.label, 20, 2);
    const descriptionLines = wrapWords(node.description, hasVisual ? 24 : 32, hasVisual && labelLines.length > 1 ? 1 : 2);
    const visualHeight = hasVisual ? NODE_VISUAL_SIZE + NODE_VISUAL_GAP : 0;
    const descriptionHeight = descriptionLines.length ? NODE_DESCRIPTION_GAP + descriptionLines.length * NODE_DESCRIPTION_LINE : 0;
    const contentHeight = visualHeight + labelLines.length * NODE_LABEL_LINE + descriptionHeight;
    const contentTop = position.y + Math.max(10, (position.height - contentHeight) / 2);
    const visualY = contentTop;
    const labelY = contentTop + visualHeight + 16;
    const descriptionY = contentTop + visualHeight + labelLines.length * NODE_LABEL_LINE + NODE_DESCRIPTION_GAP + 14;
    const aria = [node.label, node.description, node.asset?.alt].filter(Boolean).join('. ');
    const visual = assetUri
        ? `<image href="${assetUri}" x="${centerX - NODE_VISUAL_SIZE / 2}" y="${visualY}" width="${NODE_VISUAL_SIZE}" height="${NODE_VISUAL_SIZE}" preserveAspectRatio="xMidYMid meet" />`
        : glyphMarkup
            ? `<g class="node-glyph tone-glyph-${node.tone ?? 'neutral'}" transform="translate(${centerX - NODE_VISUAL_SIZE / 2} ${visualY}) scale(${NODE_VISUAL_SIZE / 24})" aria-hidden="true">${glyphMarkup}</g>`
            : '';
    return `<g class="diagram-node" role="group" aria-label="${escapeXml(aria)}" data-diagram-node="${escapeXml(node.id)}">
      ${nodeShape(node, position)}
      ${visual}
    ${textLines(labelLines, centerX, labelY, 'node-label', NODE_LABEL_LINE)}
    ${descriptionLines.length ? textLines(descriptionLines, centerX, descriptionY, 'node-description', NODE_DESCRIPTION_LINE) : ''}
    </g>`;
};

const edgeGeometry = (edge, source, target, direction, index) => {
    if (direction === 'right') {
        const start = { x: source.x + source.width, y: source.y + source.height / 2 };
        const end = { x: target.x, y: target.y + target.height / 2 };
        if (end.x > start.x) {
            const middleX = (start.x + end.x) / 2;
            // Bias the label toward the source so it sits inside a lane instead of on the lane divider.
            return { path: `M ${start.x} ${start.y} L ${middleX} ${start.y} L ${middleX} ${end.y} L ${end.x} ${end.y}`, label: { x: middleX, y: start.y + (end.y - start.y) * 0.25 } };
        }
        const routeY = Math.max(source.y + source.height, target.y + target.height) + 34 + (index % 4) * 18;
        return { path: `M ${start.x} ${start.y} L ${start.x + 30} ${start.y} L ${start.x + 30} ${routeY} L ${end.x - 30} ${routeY} L ${end.x - 30} ${end.y} L ${end.x} ${end.y}`, label: { x: (start.x + end.x) / 2, y: routeY - 8 } };
    }
    const start = { x: source.x + source.width / 2, y: source.y + source.height };
    const end = { x: target.x + target.width / 2, y: target.y };
    if (end.y > start.y) {
        const middleY = (start.y + end.y) / 2;
        return { path: `M ${start.x} ${start.y} L ${start.x} ${middleY} L ${end.x} ${middleY} L ${end.x} ${end.y}`, label: { x: (start.x + end.x) / 2, y: middleY - 8 } };
    }
    const routeX = Math.max(source.x + source.width, target.x + target.width) + 34 + (index % 4) * 18;
    return { path: `M ${start.x} ${start.y} L ${start.x} ${start.y + 30} L ${routeX} ${start.y + 30} L ${routeX} ${end.y - 30} L ${end.x} ${end.y - 30} L ${end.x} ${end.y}`, label: { x: routeX, y: (start.y + end.y) / 2 } };
};

const groupBounds = (diagram, positions) => (diagram.groups ?? []).map((group) => {
    const members = diagram.nodes.filter((node) => node.group === group.id).map((node) => positions.get(node.id));
    if (!members.length) return undefined;
    const left = Math.min(...members.map((member) => member.x));
    const top = Math.min(...members.map((member) => member.y));
    const right = Math.max(...members.map((member) => member.x + member.width));
    const bottom = Math.max(...members.map((member) => member.y + member.height));
    return { ...group, x: left - 22, y: top - 38, width: right - left + 44, height: bottom - top + 56 };
}).filter(Boolean);

const palette = (theme) => theme === 'dark'
    ? { background: '#202020', surface: '#292929', text: '#FFFFFF', secondary: '#D6D6D6', muted: '#ADADAD', stroke: '#666666', card: '#5C5C5C', lane: '#252525', group: '#333333', label: '#202020' }
    : { background: '#FFFFFF', surface: '#FFFFFF', text: '#242424', secondary: '#424242', muted: '#616161', stroke: '#BDBDBD', card: '#D1D1D1', lane: '#F7F7F7', group: '#FAFAFA', label: '#FFFFFF' };

const renderFlowDiagramSvg = async (diagram, options = {}) => {
    const layout = layoutDiagram(diagram);
    const colors = palette(options.theme ?? diagram.theme ?? 'light');
    const groups = groupBounds(diagram, layout.positions);
    const legendHeight = diagram.legend?.length ? 76 : 0;
    const laneMarkup = layout.laneBounds
        .filter((lane) => lane.id !== '__default')
        .map((lane) => `<g class="diagram-lane"><rect x="${lane.x}" y="${lane.y}" width="${lane.width}" height="${lane.height}" rx="8" /><text x="${lane.x + 16}" y="${lane.y + 28}" class="lane-label">${escapeXml(lane.label)}</text></g>`)
        .join('\n');
    const groupMarkup = groups
        .map((group) => `<g class="diagram-group tone-${group.tone ?? 'neutral'}"><rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="8" /><text x="${group.x + 14}" y="${group.y + 27}" class="group-label">${escapeXml(group.label)}</text></g>`)
        .join('\n');
    const edgeMarkup = diagram.edges.map((edge, index) => {
        const geometry = edgeGeometry(edge, layout.positions.get(edge.source), layout.positions.get(edge.target), layout.direction, index);
        const kind = edge.kind ?? 'primary';
        const markerStart = edge.bidirectional ? ' marker-start="url(#arrow-start)"' : '';
        const labelWidth = Math.max(52, (edge.label?.length ?? 0) * 7.5 + 20);
        return `<g class="diagram-edge edge-${kind}" data-diagram-edge="${escapeXml(edge.id)}" data-edge-source="${escapeXml(edge.source)}" data-edge-target="${escapeXml(edge.target)}">
          <path d="${geometry.path}" marker-end="url(#arrow-${kind})"${markerStart} />
          ${edge.label ? `<g class="edge-label"><rect x="${geometry.label.x - labelWidth / 2}" y="${geometry.label.y - 16}" width="${labelWidth}" height="24" rx="12" /><text x="${geometry.label.x}" y="${geometry.label.y + 1}" text-anchor="middle">${escapeXml(edge.label)}</text></g>` : ''}
        </g>`;
    }).join('\n');
    const nodeMarkup = (await Promise.all(diagram.nodes.map((node) => renderNode(node, layout.positions.get(node.id))))).join('\n');
    const legendMarkup = (diagram.legend ?? []).map((item, index) => {
        const x = OUTER_PADDING + index * 250;
        const y = layout.height + 38;
        return `<g class="legend-item edge-${item.kind}"><line x1="${x}" y1="${y}" x2="${x + 54}" y2="${y}" marker-end="url(#arrow-${item.kind})" /><text x="${x + 68}" y="${y + 6}">${escapeXml(item.label)}</text></g>`;
    }).join('\n');
    const description = diagram.description ?? `${diagram.nodes.length} nodes and ${diagram.edges.length} connections.`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="720" viewBox="0 0 ${ARCHITECTURE_WIDTH} ${ARCHITECTURE_HEIGHT}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="diagram-title diagram-description" data-diagram-type="flow">
  <title id="diagram-title">${escapeXml(diagram.title)}</title>
  <desc id="diagram-description">${escapeXml(description)}</desc>
  <defs>
    <marker id="arrow-primary" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#424242" /></marker>
    <marker id="arrow-asynchronous" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#0F6CBD" /></marker>
    <marker id="arrow-dependency" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#616161" /></marker>
    <marker id="arrow-error" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#C50F1F" /></marker>
    <marker id="arrow-start" markerWidth="10" markerHeight="10" refX="1" refY="3" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M9,0 L9,6 L0,3 z" fill="#424242" /></marker>
    <style>
      .diagram-lane rect { fill: ${colors.lane}; stroke: ${colors.stroke}; stroke-width: 1.5; }
    .lane-label { fill: ${colors.secondary}; font: 600 18px "Segoe UI", sans-serif; }
      .diagram-group rect { fill: ${colors.group}; fill-opacity: .72; stroke: #7A7574; stroke-width: 1.5; stroke-dasharray: 7 5; }
    .group-label { fill: ${colors.secondary}; font: 600 18px "Segoe UI", sans-serif; }
      .node-shape { fill: ${colors.surface}; stroke: ${colors.card}; stroke-width: 1.5; }
      .node-shape--external { stroke-dasharray: 6 4; }
      .tone-brand { stroke: #0F6CBD; }
      .tone-success { stroke: #107C10; }
      .tone-warning { stroke: #8A6D00; }
      .tone-danger { stroke: #C50F1F; }
      .node-glyph { color: ${colors.muted}; }
      .node-glyph path { fill: currentColor; }
      .tone-glyph-brand { color: #0F6CBD; }
      .tone-glyph-success { color: #107C10; }
      .tone-glyph-warning { color: #8A6D00; }
      .tone-glyph-danger { color: #C50F1F; }
    .node-label { fill: ${colors.text}; font: 600 20px "Segoe UI", sans-serif; }
    .node-description { fill: ${colors.muted}; font: 18px "Segoe UI", sans-serif; }
      .diagram-edge path { fill: none; stroke: #424242; stroke-width: 2.5; }
      .edge-asynchronous path, .edge-asynchronous line { stroke: #0F6CBD; stroke-dasharray: 8 6; }
      .edge-dependency path, .edge-dependency line { stroke: #616161; stroke-dasharray: 3 5; }
      .edge-error path, .edge-error line { stroke: #C50F1F; }
      .edge-label rect { fill: ${colors.label}; stroke: ${colors.card}; stroke-width: 1; }
    .edge-label text, .legend-item text { fill: ${colors.secondary}; font: 16px "Segoe UI", sans-serif; }
      .legend-item line { stroke: #424242; stroke-width: 2.5; }
    </style>
  </defs>
    <rect width="${ARCHITECTURE_WIDTH}" height="${ARCHITECTURE_HEIGHT}" fill="${colors.background}" />
  ${laneMarkup}
  ${groupMarkup}
  ${edgeMarkup}
  ${nodeMarkup}
  ${legendMarkup}
</svg>`;
};

const layeredArchitectureLayout = (diagram) => {
    const padding = 24;
    const layerRailWidth = 170;
    const concernGap = diagram.crossCuttingConcerns?.length ? 20 : 0;
    const concernWidth = diagram.crossCuttingConcerns?.length ? 232 : 0;
    const mainX = padding + layerRailWidth + 16;
    const mainWidth = ARCHITECTURE_WIDTH - mainX - padding - concernGap - concernWidth;
    const columnGap = 22;
    // Columns sit inside the layer surface, so the surface keeps a visible margin on both ends.
    const surfacePadding = 12;
    const contentX = mainX + surfacePadding;
    const contentWidth = mainWidth - surfacePadding * 2;
    const columnWidth = (contentWidth - columnGap * (diagram.columns.length - 1)) / diagram.columns.length;
    const headerY = 16;
    const headerHeight = 44;
    const layersY = 76;
    const layerGap = 38;
    const layerHeight = (ARCHITECTURE_HEIGHT - layersY - padding - layerGap * (diagram.layers.length - 1)) / diagram.layers.length;
    const concernX = mainX + mainWidth + concernGap;
    return { padding, layerRailWidth, mainX, mainWidth, contentX, contentWidth, surfacePadding, columnGap, columnWidth, headerY, headerHeight, layersY, layerGap, layerHeight, concernX, concernWidth };
};

export const compileLayeredArchitectureDiagram = (diagram, options = {}) => {
    if (diagram.diagramType !== 'layered-architecture') {
        throw new Error(`Expected layered-architecture diagram; received ${diagram.diagramType}.`);
    }
    const layout = layeredArchitectureLayout(diagram);
    const colors = palette(options.theme ?? diagram.theme ?? 'light');
    const columns = diagram.columns.map((column, index) => ({
        ...column,
        box: {
            x: layout.contentX + index * (layout.columnWidth + layout.columnGap),
            y: layout.headerY,
            width: layout.columnWidth,
            height: layout.headerHeight,
        },
    }));
    const layers = diagram.layers.map((layer, index) => {
        const y = layout.layersY + index * (layout.layerHeight + layout.layerGap);
        const number = layer.number ?? index + 1;
        const labelLines = wrapWords(layer.label, 14, 2);
        const labelY = y + (layout.layerHeight - labelLines.length * 23) / 2 + 18;
        const components = layer.components.map((component) => {
            const columnIndex = diagram.columns.findIndex((column) => column.id === component.column);
            const span = component.span ?? 1;
            const x = layout.contentX + columnIndex * (layout.columnWidth + layout.columnGap);
            const width = span * layout.columnWidth + (span - 1) * layout.columnGap;
            const height = Math.min(104, layout.layerHeight - 22);
            const componentY = y + (layout.layerHeight - height) / 2;
            const textX = x + (component.asset ? 52 : 18);
            const textWidth = width - (component.asset ? 66 : 36);
            const componentLabelLines = wrapWords(component.label, Math.max(10, Math.floor(textWidth / 9.3)), 2);
            const descriptionLines = wrapWords(component.description, Math.max(12, Math.floor(textWidth / 8.4)), 2);
            const contentHeight = componentLabelLines.length * 22 + descriptionLines.length * 20 + (descriptionLines.length ? 3 : 0);
            const componentLabelY = componentY + (height - contentHeight) / 2 + 17;
            return {
                ...component,
                tone: component.tone ?? 'neutral',
                box: { x, y: componentY, width, height },
                imageBox: component.asset ? { x: x + 14, y: componentY + (height - 32) / 2, width: 32, height: 32 } : undefined,
                textX,
                textWidth,
                labelLines: componentLabelLines,
                labelY: componentLabelY,
                descriptionLines,
                descriptionY: componentLabelY + componentLabelLines.length * 22 + 3,
                aria: [component.label, component.description, component.asset?.alt].filter(Boolean).join('. '),
            };
        });
        return {
            ...layer,
            number,
            tone: layer.tone ?? 'neutral',
            y,
            labelLines,
            labelY,
            bandBox: { x: layout.padding, y, width: layout.layerRailWidth, height: layout.layerHeight },
            numberCircle: { cx: layout.padding + 25, cy: y + layout.layerHeight / 2, radius: 17 },
            surfaceBox: { x: layout.mainX, y, width: layout.mainWidth, height: layout.layerHeight },
            components,
        };
    });
    const flows = diagram.showLayerFlow === false ? [] : diagram.layers.slice(0, -1).map((layer, index) => {
        const startY = layout.layersY + (index + 1) * layout.layerHeight + index * layout.layerGap;
        const x = layout.mainX + layout.mainWidth / 2;
        return { id: layer.id, x1: x, y1: startY + 1, x2: x, y2: startY + layout.layerGap - 3 };
    });
    const concerns = diagram.crossCuttingConcerns ?? [];
    const concernRail = concerns.length ? (() => {
        const y = layout.layersY;
        const height = ARCHITECTURE_HEIGHT - y - layout.padding;
        const titleHeight = 48;
        const itemGap = 10;
        const itemHeight = Math.min(82, (height - titleHeight - 20 - itemGap * Math.max(0, concerns.length - 1)) / concerns.length);
        return {
            box: { x: layout.concernX, y, width: layout.concernWidth, height },
            title: 'Cross-cutting concerns',
            titlePosition: { x: layout.concernX + 18, y: y + 31 },
            items: concerns.map((concern, index) => {
                const itemY = y + titleHeight + 12 + index * (itemHeight + itemGap);
                const labelLines = wrapWords(concern.label, 18, 2);
                return {
                    ...concern,
                    tone: concern.tone ?? 'neutral',
                    box: { x: layout.concernX + 12, y: itemY, width: layout.concernWidth - 24, height: itemHeight },
                    labelLines,
                    textPosition: { x: layout.concernX + 28, y: itemY + (itemHeight - labelLines.length * 22) / 2 + 17 },
                };
            }),
        };
    })() : undefined;
    return { width: ARCHITECTURE_WIDTH, height: ARCHITECTURE_HEIGHT, colors, layout, columns, layers, flows, concernRail };
};

const renderArchitectureComponent = async (component) => {
    const { x, y, width, height } = component.box;
    const assetUri = await assetDataUri(component.asset);
    return `<g class="architecture-component tone-${component.tone}${component.emphasis ? ' architecture-component--emphasis' : ''}" role="group" aria-label="${escapeXml(component.aria)}" data-diagram-component="${escapeXml(component.id)}">
            <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" />
            ${assetUri ? `<image href="${assetUri}" x="${component.imageBox.x}" y="${component.imageBox.y}" width="${component.imageBox.width}" height="${component.imageBox.height}" preserveAspectRatio="xMidYMid meet" />` : ''}
            ${textLines(component.labelLines, component.textX, component.labelY, 'component-label', 22, 'start')}
            ${component.descriptionLines.length ? textLines(component.descriptionLines, component.textX, component.descriptionY, 'component-description', 20, 'start') : ''}
        </g>`;
};

const renderLayeredArchitectureSvg = async (diagram, options = {}) => {
    const compiled = compileLayeredArchitectureDiagram(diagram, options);
    const { colors, layout } = compiled;
    const columnMarkup = compiled.columns.map((column) => {
        const { x, y, width, height } = column.box;
        return `<g class="architecture-column"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" /><text x="${x + width / 2}" y="${y + 29}" text-anchor="middle" class="column-label">${escapeXml(column.label)}</text></g>`;
    }).join('\n');

    const layerMarkup = [];
    for (const layer of compiled.layers) {
        const components = await Promise.all(layer.components.map((component) => renderArchitectureComponent(component)));
        layerMarkup.push(`<g class="architecture-layer tone-${layer.tone}" role="group" aria-label="Layer ${layer.number}: ${escapeXml(layer.label)}" data-diagram-layer="${escapeXml(layer.id)}">
                    <rect class="layer-band" x="${layer.bandBox.x}" y="${layer.bandBox.y}" width="${layer.bandBox.width}" height="${layer.bandBox.height}" rx="8" />
                    <circle class="layer-number" cx="${layer.numberCircle.cx}" cy="${layer.numberCircle.cy}" r="${layer.numberCircle.radius}" />
                    <text x="${layer.numberCircle.cx}" y="${layer.numberCircle.cy + 6}" text-anchor="middle" class="layer-number-label">${layer.number}</text>
                    ${textLines(layer.labelLines, layout.padding + 52, layer.labelY, 'layer-label', 23, 'start')}
                    <rect class="layer-surface" x="${layer.surfaceBox.x}" y="${layer.surfaceBox.y}" width="${layer.surfaceBox.width}" height="${layer.surfaceBox.height}" rx="8" />
                    ${components.join('\n')}
                </g>`);
    }

    const flowMarkup = compiled.flows.map((flow) => {
        return `<line class="layer-flow" x1="${flow.x1}" y1="${flow.y1}" x2="${flow.x2}" y2="${flow.y2}" marker-end="url(#architecture-arrow)" data-diagram-layer-flow="${escapeXml(flow.id)}" />`;
    }).join('\n');

    const concernMarkup = compiled.concernRail ? (() => {
        const rail = compiled.concernRail;
        const items = rail.items.map((concern) => {
            return `<g class="architecture-concern tone-${concern.tone}" role="group" aria-label="${escapeXml([concern.label, concern.description].filter(Boolean).join('. '))}" data-diagram-concern="${escapeXml(concern.id)}">
                            <rect x="${concern.box.x}" y="${concern.box.y}" width="${concern.box.width}" height="${concern.box.height}" rx="7" />
                            ${textLines(concern.labelLines, concern.textPosition.x, concern.textPosition.y, 'concern-label', 22, 'start')}
                        </g>`;
        }).join('\n');
        return `<g class="architecture-concerns"><rect class="concern-rail" x="${rail.box.x}" y="${rail.box.y}" width="${rail.box.width}" height="${rail.box.height}" rx="8" /><text x="${rail.titlePosition.x}" y="${rail.titlePosition.y}" class="concern-title">${escapeXml(rail.title)}</text>${items}</g>`;
    })() : '';
    const concerns = diagram.crossCuttingConcerns ?? [];
    const componentCount = diagram.layers.reduce((sum, layer) => sum + layer.components.length, 0);
    const description = diagram.description ?? `${diagram.layers.length} architecture layers, ${componentCount} components, and ${concerns.length} cross-cutting concerns.`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="720" viewBox="0 0 ${ARCHITECTURE_WIDTH} ${ARCHITECTURE_HEIGHT}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="diagram-title diagram-description" data-diagram-type="layered-architecture">
    <title id="diagram-title">${escapeXml(diagram.title)}</title>
    <desc id="diagram-description">${escapeXml(description)}</desc>
    <defs>
        <marker id="architecture-arrow" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L0,14 L12,7 z" fill="#0F6CBD" /></marker>
        <style>
            text { font-family: "Segoe UI", sans-serif; }
            .architecture-column rect { fill: ${colors.lane}; stroke: ${colors.stroke}; stroke-width: 1; }
            .column-label { fill: ${colors.secondary}; font-size: 18px; font-weight: 600; }
            .layer-band { fill: ${colors.lane}; stroke: ${colors.stroke}; stroke-width: 1.5; }
            .layer-surface { fill: ${colors.group}; stroke: ${colors.stroke}; stroke-width: 1.25; }
            .layer-number { fill: #0F6CBD; }
            .layer-number-label { fill: #FFFFFF; font-size: 18px; font-weight: 700; }
            .layer-label { fill: ${colors.text}; font-size: 19px; font-weight: 600; }
            .architecture-component rect { fill: ${colors.surface}; stroke: ${colors.stroke}; stroke-width: 1.5; }
            .architecture-component--emphasis rect { stroke-width: 3; }
            .architecture-component.tone-brand rect, .architecture-layer.tone-brand .layer-band { stroke: #0F6CBD; }
            .architecture-component.tone-success rect, .architecture-layer.tone-success .layer-band { stroke: #107C10; }
            .architecture-component.tone-warning rect, .architecture-layer.tone-warning .layer-band { stroke: #8A6D00; }
            .architecture-component.tone-danger rect, .architecture-layer.tone-danger .layer-band { stroke: #C50F1F; }
            .component-label { fill: ${colors.text}; font-size: 19px; font-weight: 600; }
            .component-description { fill: ${colors.muted}; font-size: 18px; }
            .layer-flow { fill: none; stroke: #0F6CBD; stroke-width: 3.5; stroke-linecap: butt; }
            .concern-rail { fill: ${colors.lane}; stroke: #0F6CBD; stroke-width: 1.5; }
            .concern-title { fill: ${colors.text}; font-size: 18px; font-weight: 700; }
            .architecture-concern rect { fill: ${colors.surface}; stroke: ${colors.stroke}; stroke-width: 1.5; }
            .architecture-concern.tone-brand rect { stroke: #0F6CBD; }
            .architecture-concern.tone-success rect { stroke: #107C10; }
            .architecture-concern.tone-warning rect { stroke: #8A6D00; }
            .architecture-concern.tone-danger rect { stroke: #C50F1F; }
            .concern-label { fill: ${colors.secondary}; font-size: 18px; font-weight: 600; }
        </style>
    </defs>
    <rect width="${ARCHITECTURE_WIDTH}" height="${ARCHITECTURE_HEIGHT}" fill="${colors.background}" />
    ${columnMarkup}
    ${layerMarkup.join('\n')}
    ${flowMarkup}
    ${concernMarkup}
</svg>`;
};

export const renderDiagramSvg = async (diagram, options = {}) => diagram.diagramType === 'layered-architecture'
    ? renderLayeredArchitectureSvg(diagram, options)
    : renderFlowDiagramSvg(diagram, options);

export const renderDiagramFile = async (inputPath, options = {}) => {
    const diagram = await loadDiagram(inputPath);
    return { diagram, svg: await renderDiagramSvg(diagram, options) };
};
