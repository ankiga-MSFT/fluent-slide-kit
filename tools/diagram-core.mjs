import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

export const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsRoot = path.join(kitRoot, 'assets');
const diagramsRoot = path.join(kitRoot, 'diagrams');
const catalogPathsPromise = Promise.all([
    readFile(path.join(assetsRoot, 'fluent-system-icons', 'catalog.json'), 'utf8').then(JSON.parse),
    readFile(path.join(assetsRoot, 'azure-public-service-icons', 'catalog.json'), 'utf8').then(JSON.parse),
    readFile(path.join(assetsRoot, 'external-icons', 'catalog.json'), 'utf8').then(JSON.parse),
]).then(([fluentCatalog, azureCatalog, externalCatalog]) => ({
    fluent: new Set(fluentCatalog.icons.flatMap((icon) =>
        Object.values(icon.styles).filter(Boolean).map((asset) => `assets/${asset.path}`))),
    azure: new Set(azureCatalog.icons.map((icon) => `assets/${icon.path}`)),
    external: new Set(externalCatalog.icons.map((icon) => `assets/${icon.path}`)),
}));

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
const DIAGRAM_WIDTH = 1600;
const DIAGRAM_HEIGHT = 720;
const EDGE_LABEL_MIN_WIDTH = 52;
const EDGE_LABEL_CHARACTER_WIDTH = 7.5;
const EDGE_LABEL_PADDING = 20;
const EDGE_LABEL_NODE_GAP = 8;
const GROUP_HORIZONTAL_PADDING = 22;
const GROUP_TOP_PADDING = 38;
const GROUP_BOTTOM_PADDING = 18;
const RANK_SKIP_CHANNEL_OFFSET = NODE_HEIGHT / 2 + 40;

const edgeLabelWidth = (label) => Math.max(EDGE_LABEL_MIN_WIDTH, String(label ?? '').length * EDGE_LABEL_CHARACTER_WIDTH + EDGE_LABEL_PADDING);

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
    const [schema, designContract, catalogPaths] = await Promise.all([
        readFile(path.join(kitRoot, 'schemas', 'diagram.schema.json'), 'utf8').then(JSON.parse),
        readFile(path.join(kitRoot, 'design', 'design-contract.json'), 'utf8').then(JSON.parse),
        catalogPathsPromise,
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
        if (asset.kind === 'fluent' && !catalogPaths.fluent.has(asset.path)) {
            errors.push(`${owner} Fluent asset is not an exact local catalog entry: ${asset.path}. Resolve it with npm run assets:search.`);
        }
        if (asset.kind === 'azure' && !catalogPaths.azure.has(asset.path)) {
            errors.push(`${owner} Azure asset is not an exact local catalog entry: ${asset.path}. Resolve it with npm run assets:search.`);
        }
        if (asset.kind === 'external' && !catalogPaths.external.has(asset.path)) {
            errors.push(`${owner} external asset is not an exact approved external catalog entry: ${asset.path}. Add it under assets/external-icons with source and license metadata.`);
        }
        if (!asset.alt.trim()) errors.push(`${owner} asset requires useful alt text.`);
    };

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
    const skippedRanks = new Set();
    const usesHorizontalRankSkipChannel = diagram.rankSkipRouting === 'horizontal-channel';
    if (usesHorizontalRankSkipChannel) {
        for (const edge of diagram.edges) {
            const sourceRank = rank.get(edge.source);
            const targetRank = rank.get(edge.target);
            for (let skippedRank = sourceRank + 1; skippedRank < targetRank; skippedRank += 1) {
                skippedRanks.add(skippedRank);
            }
        }
    }
    const rankGaps = Array.from({ length: Math.max(0, rankCount - 1) }, () => RANK_GAP);
    if (direction === 'right') {
        for (const edge of diagram.edges.filter((candidate) => candidate.label)) {
            const sourceRank = rank.get(edge.source);
            const targetRank = rank.get(edge.target);
            if (targetRank === sourceRank + 1) {
                const sourceGroup = diagram.nodes.find((node) => node.id === edge.source)?.group;
                const targetGroup = diagram.nodes.find((node) => node.id === edge.target)?.group;
                const boundaryClearance = sourceGroup !== targetGroup && (sourceGroup || targetGroup) ? GROUP_HORIZONTAL_PADDING : 0;
                rankGaps[sourceRank] = Math.max(
                    rankGaps[sourceRank],
                    edgeLabelWidth(edge.label) + (EDGE_LABEL_NODE_GAP + boundaryClearance) * 2,
                );
            }
        }
    }
    const primaryNodeSize = direction === 'right' ? NODE_WIDTH : NODE_HEIGHT;
    const primaryPosition = (nodeRank) => OUTER_PADDING
        + nodeRank * primaryNodeSize
        + rankGaps.slice(0, nodeRank).reduce((sum, gap) => sum + gap, 0);
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
        const rankSkipOffset = [...buckets.keys()].some((nodeRank) => skippedRanks.has(nodeRank)) ? RANK_SKIP_CHANNEL_OFFSET : 0;
        const bandSize = LANE_LABEL_SIZE + OUTER_PADDING + groupInset * 2 + rankSkipOffset + maxInRank * crossNodeSize + (maxInRank - 1) * SLOT_GAP;
        laneMetrics.push({ ...lane, start: crossCursor, size: bandSize });

        for (const [nodeRank, bucket] of buckets) {
            bucket.forEach((node, index) => {
                const primary = primaryPosition(nodeRank);
                const cross = crossCursor + LANE_LABEL_SIZE + OUTER_PADDING / 2 + groupInset
                    + (skippedRanks.has(nodeRank) ? RANK_SKIP_CHANNEL_OFFSET : 0)
                    + index * (crossNodeSize + SLOT_GAP);
                positions.set(node.id, direction === 'right'
                    ? { x: primary, y: cross, width: NODE_WIDTH, height: NODE_HEIGHT, rank: nodeRank, usesHorizontalRankSkipChannel }
                    : { x: cross, y: primary, width: NODE_WIDTH, height: NODE_HEIGHT, rank: nodeRank, usesHorizontalRankSkipChannel });
            });
        }
        crossCursor += bandSize + SLOT_GAP;
    }

    const primarySize = OUTER_PADDING * 2
        + rankCount * primaryNodeSize
        + rankGaps.reduce((sum, gap) => sum + gap, 0);
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

const assetDataUri = async (asset, foreground = '#242424') => {
    if (!asset) return undefined;
    let svg = await readFile(resolveAssetPath(asset.path), 'utf8');
    if (asset.kind === 'fluent') svg = svg.replaceAll('currentColor', foreground);
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
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

const renderNode = async (node, position, colors) => {
    const assetUri = await assetDataUri(node.asset, colors.text);
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
    const labelFraction = edge.labelPosition === 'target'
        ? 1
        : edge.labelPosition === 'middle'
            ? 0.5
            : edge.labelPosition === 'source'
                ? 0
                : 0.25;
    if (direction === 'right') {
        const start = { x: source.x + source.width, y: source.y + source.height / 2 };
        const end = { x: target.x, y: target.y + target.height / 2 };
        if (end.x > start.x) {
            if (target.rank > source.rank + 1) {
                if (source.usesHorizontalRankSkipChannel && target.usesHorizontalRankSkipChannel && start.y === end.y) {
                    return { path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, label: { x: (start.x + end.x) / 2, y: start.y - 8 } };
                }
                const routeY = Math.max(5, Math.min(source.y, target.y) - GROUP_TOP_PADDING - 8);
                return { path: `M ${start.x} ${start.y} L ${start.x + 30} ${start.y} L ${start.x + 30} ${routeY} L ${end.x - 30} ${routeY} L ${end.x - 30} ${end.y} L ${end.x} ${end.y}`, label: { x: (start.x + end.x) / 2, y: routeY + 18 } };
            }
            const middleX = (start.x + end.x) / 2;
            // Unspecified labels stay source-biased; explicit positions align to the routed edge segments.
            return { path: `M ${start.x} ${start.y} L ${middleX} ${start.y} L ${middleX} ${end.y} L ${end.x} ${end.y}`, label: { x: middleX, y: start.y + (end.y - start.y) * labelFraction } };
        }
        const routeY = Math.max(source.y + source.height, target.y + target.height) + 34 + (index % 4) * 18;
        return { path: `M ${start.x} ${start.y} L ${start.x + 30} ${start.y} L ${start.x + 30} ${routeY} L ${end.x - 30} ${routeY} L ${end.x - 30} ${end.y} L ${end.x} ${end.y}`, label: { x: (start.x + end.x) / 2, y: routeY - 8 } };
    }
    const start = { x: source.x + source.width / 2, y: source.y + source.height };
    const end = { x: target.x + target.width / 2, y: target.y };
    if (end.y > start.y) {
        const middleY = (start.y + end.y) / 2;
        return { path: `M ${start.x} ${start.y} L ${start.x} ${middleY} L ${end.x} ${middleY} L ${end.x} ${end.y}`, label: { x: start.x + (end.x - start.x) * labelFraction, y: middleY - 8 } };
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
    return {
        ...group,
        x: left - GROUP_HORIZONTAL_PADDING,
        y: top - GROUP_TOP_PADDING,
        width: right - left + GROUP_HORIZONTAL_PADDING * 2,
        height: bottom - top + GROUP_TOP_PADDING + GROUP_BOTTOM_PADDING,
    };
}).filter(Boolean);

const palette = (theme) => theme === 'dark'
    ? { background: '#202020', surface: '#292929', text: '#FFFFFF', secondary: '#D6D6D6', muted: '#ADADAD', stroke: '#666666', card: '#5C5C5C', lane: '#252525', group: '#333333', label: '#202020', brand: '#479EF5', brandSubtle: '#0C3B5E', success: '#54B054', successSubtle: '#0B3B0B', warning: '#FCE100', warningSubtle: '#4A1E04', danger: '#DC626D', dangerSubtle: '#3B0509' }
    : { background: '#FFFFFF', surface: '#FFFFFF', text: '#242424', secondary: '#424242', muted: '#616161', stroke: '#BDBDBD', card: '#D1D1D1', lane: '#F7F7F7', group: '#FAFAFA', label: '#FFFFFF', brand: '#0F6CBD', brandSubtle: '#EBF3FC', success: '#107C10', successSubtle: '#F1FAF1', warning: '#8A6D00', warningSubtle: '#FFF4CE', danger: '#C50F1F', dangerSubtle: '#FDF3F4' };

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
        .map((group) => `<g class="diagram-group tone-${group.tone ?? 'neutral'} boundary-${group.borderStyle ?? 'dashed'}"><rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="8" /><text x="${group.x + 14}" y="${group.y + 27}" class="group-label">${escapeXml(group.label)}</text></g>`)
        .join('\n');
    const renderedEdges = diagram.edges.map((edge, index) => {
        const geometry = edgeGeometry(edge, layout.positions.get(edge.source), layout.positions.get(edge.target), layout.direction, index);
        const kind = edge.kind ?? 'primary';
        const markerStart = edge.bidirectional ? ' marker-start="url(#arrow-start)"' : '';
        const labelWidth = edgeLabelWidth(edge.label);
        return { edge, geometry, kind, markerStart, labelWidth };
    });
    const edgeMarkup = renderedEdges.map(({ edge, geometry, kind, markerStart }) => `<g class="diagram-edge edge-${kind}" data-diagram-edge="${escapeXml(edge.id)}" data-edge-source="${escapeXml(edge.source)}" data-edge-target="${escapeXml(edge.target)}">
                    <path d="${geometry.path}" marker-end="url(#arrow-${kind})"${markerStart} />
                </g>`).join('\n');
    const edgeLabelMarkup = renderedEdges.filter(({ edge }) => edge.label).map(({ edge, geometry, labelWidth }) => `<g class="edge-label" data-diagram-edge-label="${escapeXml(edge.id)}">
                    <rect x="${geometry.label.x - labelWidth / 2}" y="${geometry.label.y - 16}" width="${labelWidth}" height="24" rx="12" />
                    <text x="${geometry.label.x}" y="${geometry.label.y + 1}" text-anchor="middle">${escapeXml(edge.label)}</text>
                </g>`).join('\n');
    const nodeMarkup = (await Promise.all(diagram.nodes.map((node) => renderNode(node, layout.positions.get(node.id), colors)))).join('\n');
    const legendMarkup = (diagram.legend ?? []).map((item, index) => {
        const x = OUTER_PADDING + index * 250;
        const y = layout.height + 38;
        return `<g class="legend-item edge-${item.kind}"><line x1="${x}" y1="${y}" x2="${x + 54}" y2="${y}" marker-end="url(#arrow-${item.kind})" /><text x="${x + 68}" y="${y + 6}">${escapeXml(item.label)}</text></g>`;
    }).join('\n');
    const description = diagram.description ?? `${diagram.nodes.length} nodes and ${diagram.edges.length} connections.`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="720" viewBox="0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="diagram-title diagram-description" data-diagram-type="flow">
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
            .diagram-group.boundary-solid rect { stroke-dasharray: none; }
            .diagram-group.boundary-dotted rect { stroke-dasharray: 1 6; stroke-linecap: round; }
    .group-label { fill: ${colors.secondary}; font: 600 18px "Segoe UI", sans-serif; }
      .node-shape { fill: ${colors.surface}; stroke: ${colors.card}; stroke-width: 1.5; }
      .node-shape--external { stroke-dasharray: 6 4; }
    .node-shape.tone-brand { fill: ${colors.brandSubtle}; stroke: ${colors.brand}; }
    .node-shape.tone-success { fill: ${colors.successSubtle}; stroke: ${colors.success}; }
    .node-shape.tone-warning { fill: ${colors.warningSubtle}; stroke: ${colors.warning}; }
    .node-shape.tone-danger { fill: ${colors.dangerSubtle}; stroke: ${colors.danger}; }
      .node-glyph { color: ${colors.muted}; }
      .node-glyph path { fill: currentColor; }
    .tone-glyph-brand { color: ${colors.brand}; }
    .tone-glyph-success { color: ${colors.success}; }
    .tone-glyph-warning { color: ${colors.warning}; }
    .tone-glyph-danger { color: ${colors.danger}; }
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
    <rect data-canvas-background="true" width="${DIAGRAM_WIDTH}" height="${DIAGRAM_HEIGHT}" fill="${colors.background}" />
  ${laneMarkup}
  ${groupMarkup}
  ${edgeMarkup}
    ${edgeLabelMarkup}
  ${nodeMarkup}
  ${legendMarkup}
</svg>`;
};

export const renderDiagramSvg = async (diagram, options = {}) => renderFlowDiagramSvg(diagram, options);

export const renderDiagramFile = async (inputPath, options = {}) => {
    const diagram = await loadDiagram(inputPath);
    return { diagram, svg: await renderDiagramSvg(diagram, options) };
};
