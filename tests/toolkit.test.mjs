import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { renderDiagramSvg, validateDiagram } from '../tools/diagram-core.mjs';
import { compileDeckScene } from '../tools/scene-core.mjs';
import { renderSceneToPptx } from '../tools/render-scene-pptx.mjs';

const execFileAsync = promisify(execFile);
const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const relativeLuminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((value) => Number.parseInt(value, 16) / 255)
        .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const contrastRatio = (left, right) => {
    const luminances = [relativeLuminance(left), relativeLuminance(right)].sort((a, b) => b - a);
    return (luminances[0] + 0.05) / (luminances[1] + 0.05);
};

test('asset search returns exact local Fluent and Azure paths', async () => {
    const fluent = await execFileAsync(process.execPath, [
        'tools/search-assets.mjs',
        'shield checkmark',
        '--collection',
        'fluent',
        '--json',
    ], { cwd: kitRoot });
    const fluentResults = JSON.parse(fluent.stdout).results;
    assert.equal(fluentResults[0].id, 'shield-checkmark');

    const azure = await execFileAsync(process.execPath, [
        'tools/search-assets.mjs',
        'Azure Kubernetes Service',
        '--collection',
        'azure',
        '--json',
    ], { cwd: kitRoot });
    const azureResults = JSON.parse(azure.stdout).results;
    assert.equal(azureResults[0].name, 'Kubernetes Services');
});

test('final deliverables are separate from intermediate artifacts', async () => {
    const source = await readFile(path.join(kitRoot, 'tools', 'build-deck.mjs'), 'utf8');
    assert.match(source, /path\.join\(kitRoot, 'deliverables', path\.basename/);
    assert.doesNotMatch(source, /path\.join\(kitRoot, '\.slide-artifacts', 'deliverables'/);
});

test('semantic deck compiles to a valid renderer-neutral scene', async () => {
    const deck = JSON.parse(await readFile(path.join(kitRoot, 'examples', 'deck.json'), 'utf8'));
    const schema = JSON.parse(await readFile(path.join(kitRoot, 'schemas', 'scene.schema.json'), 'utf8'));
    const brandSchema = JSON.parse(await readFile(path.join(kitRoot, 'schemas', 'brand-profile.schema.json'), 'utf8'));
    const brandProfile = JSON.parse(await readFile(path.join(kitRoot, deck.brandProfile), 'utf8'));
    const scene = await compileDeckScene(deck, { source: 'examples/deck.json' });
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const validateBrand = ajv.compile(brandSchema);
    assert.equal(validateBrand(brandProfile), true, JSON.stringify(validateBrand.errors));
    assert.equal(validate(scene), true, JSON.stringify(validate.errors));
    assert.equal(scene.brandStatus, 'aligned-not-certified');
    assert.equal(scene.slides.length, deck.slides.length);
    for (const slide of scene.slides) {
        assert.ok(slide.elements.length > 0);
        assert.equal(new Set(slide.elements.map((element) => element.id)).size, slide.elements.length);
        for (const item of slide.elements) {
            assert.ok(item.box.x + item.box.width <= scene.canvas.width);
            assert.ok(item.box.y + item.box.height <= scene.canvas.height);
        }
        const footerElements = slide.elements.filter((element) => element.role === 'footer');
        assert.equal(footerElements.length, 1);
        assert.equal(footerElements[0].id, 'footer-confidentiality');
        assert.equal(footerElements[0].text, 'Microsoft Confidential');
        assert.equal(footerElements[0].style.align, 'left');
        assert.equal(slide.elements.some((element) => ['footer-source', 'footer-meta'].includes(element.id)), false);
    }
});

test('semantic tint surfaces stay distinct and readable in both themes', async () => {
    const profile = JSON.parse(await readFile(path.join(kitRoot, 'design', 'brand-profiles', 'fluent-aligned.json'), 'utf8'));
    for (const [theme, colors] of Object.entries(profile.colors)) {
        for (const fillName of ['subtle', 'brandSubtle', 'successSubtle', 'warningSubtle', 'dangerSubtle']) {
            assert.ok(contrastRatio(colors.background, colors[fillName]) >= 1.05, `${theme} ${fillName} is indistinguishable from the background`);
            assert.ok(contrastRatio(colors.foreground, colors[fillName]) >= 4.5, `${theme} foreground fails on ${fillName}`);
            assert.ok(contrastRatio(colors.secondary, colors[fillName]) >= 4.5, `${theme} secondary text fails on ${fillName}`);
            assert.ok(contrastRatio(colors.muted, colors[fillName]) >= 4.5, `${theme} muted text fails on ${fillName}`);
        }
        for (const tone of ['brand', 'success', 'warning', 'danger']) {
            assert.ok(contrastRatio(colors[tone], colors[`${tone}Subtle`]) >= 3, `${theme} ${tone} outline fails on its subtle fill`);
        }
    }
});

test('dark theme propagates through scene, SVG, and native PowerPoint', async () => {
    const deck = {
        schemaVersion: 1,
        title: 'Dark theme propagation',
        theme: 'dark',
        slides: [{
            id: 'dark-cards',
            layout: 'cards',
            takeaway: 'Dark semantics remain intact.',
            title: 'Dark theme remains dark',
            items: [
                { title: 'Focused', body: 'Brand emphasis.', tone: 'brand' },
                { title: 'Healthy', body: 'Success status.', tone: 'success' },
            ],
            notes: 'Regression fixture for dark rendering.',
        }],
    };
    const scene = await compileDeckScene(deck);
    const slide = scene.slides[0];
    assert.equal(slide.theme, 'dark');
    assert.equal(slide.elements.find((element) => element.id === 'background').style.fill, '#202020');
    assert.equal(slide.elements.find((element) => element.id === 'title').style.color, '#FFFFFF');
    assert.equal(slide.elements.find((element) => element.id === 'item-1-surface').style.fill, '#0C3B5E');
    assert.equal(slide.elements.find((element) => element.id === 'item-2-surface').style.fill, '#0B3B0B');
    assert.equal(slide.elements.find((element) => element.id === 'footer-confidentiality').style.color, '#ADADAD');

    const diagram = JSON.parse(await readFile(path.join(kitRoot, 'diagrams', 'templates', 'layered-architecture.json'), 'utf8'));
    diagram.theme = 'dark';
    const svg = await renderDiagramSvg(diagram);
    assert.match(svg, /data-canvas-background="true"[^>]+fill="#202020"/);
    assert.match(svg, /architecture-component\.tone-brand rect \{ fill: #0C3B5E; stroke: #479EF5; \}/);
    const fluentComponent = diagram.layers.flatMap((layer) => layer.components).find((component) => component.asset?.kind === 'fluent');
    const fluentImage = svg.match(new RegExp(`data-diagram-component="${fluentComponent.id}"[\\s\\S]*?href="data:image/svg\\+xml;base64,([^"]+)"`));
    assert.ok(fluentImage, 'Expected an embedded Fluent component icon.');
    const fluentSvg = Buffer.from(fluentImage[1], 'base64').toString('utf8');
    assert.doesNotMatch(fluentSvg, /currentColor/);
    assert.match(fluentSvg, /#FFFFFF/);

    const output = await mkdtemp(path.join(os.tmpdir(), 'fluent-dark-pptx-'));
    try {
        const pptxPath = path.join(output, 'dark.pptx');
        await renderSceneToPptx(scene, pptxPath);
        const inspection = await execFileAsync('pwsh', ['-NoProfile', '-File', path.join(kitRoot, 'tools', 'inspect-pptx.ps1'), pptxPath], { cwd: kitRoot });
        const report = JSON.parse(inspection.stdout);
        const shapes = new Map(report.slides[0].shapeGeometries.map((shape) => [shape.name, shape]));
        assert.equal(shapes.get('fluent-slide-kit:dark-cards:background').fill, '202020');
        assert.equal(shapes.get('fluent-slide-kit:dark-cards:item-1-surface').fill, '0C3B5E');
        assert.equal(shapes.get('fluent-slide-kit:dark-cards:item-2-surface').fill, '0B3B0B');
    } finally {
        await rm(output, { recursive: true, force: true });
    }
});

test('native PowerPoint export contains editable named shapes and notes', async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'fluent-native-pptx-'));
    try {
        const diagramPath = 'diagrams/templates/layered-architecture.json';
        const diagram = JSON.parse(await readFile(path.join(kitRoot, diagramPath), 'utf8'));
        const deck = {
            schemaVersion: 1,
            title: 'Layered architecture template',
            theme: diagram.theme,
            brandProfile: 'design/brand-profiles/fluent-aligned.json',
            slides: [{
                id: 'layered-template',
                layout: 'diagram',
                takeaway: 'Reusable fixtures validate native architecture output.',
                title: 'Layered architecture remains editable',
                diagram: { path: diagramPath, alt: 'Reusable layered Azure architecture fixture.' },
                notes: 'Generic native PowerPoint regression fixture.',
            }],
        };
        const sourceSlide = deck.slides[0];
        const scene = await compileDeckScene(deck, { source: 'inline layered template' });
        const pptxPath = path.join(output, 'layered-template.pptx');
        await renderSceneToPptx(scene, pptxPath);
        const inspection = await execFileAsync('pwsh', [
            '-NoProfile',
            '-File', path.join(kitRoot, 'tools', 'inspect-pptx.ps1'),
            pptxPath,
        ], { cwd: kitRoot });
        const report = JSON.parse(inspection.stdout);
        assert.equal(report.slides.length, 1);
        assert.ok(report.slides[0].shapes >= 30);
        assert.ok(report.slides[0].namedObjects.length >= 30);
        assert.equal(report.slides[0].screenshotOnly, false);
        assert.equal(report.notes[0].hasTakeaway, true);
        assert.ok(report.slides[0].namedObjects.includes(`fluent-slide-kit:${sourceSlide.id}:diagram-component-${diagram.layers[0].components[0].id}`));
        assert.ok(report.slides[0].namedObjects.includes(`fluent-slide-kit:${sourceSlide.id}:diagram-layer-flow-${diagram.layers[0].id}`));
        const geometries = new Map(report.slides[0].shapeGeometries.map((shape) => [shape.name, shape.preset]));
        assert.equal(geometries.get(`fluent-slide-kit:${sourceSlide.id}:diagram-component-${diagram.layers[0].components[0].id}`), 'roundRect');
        assert.equal(geometries.get(`fluent-slide-kit:${sourceSlide.id}:diagram-layer-${diagram.layers[0].id}-surface`), 'roundRect');
        const brandComponent = diagram.layers.flatMap((layer) => layer.components).find((component) => component.tone === 'brand');
        const brandShape = report.slides[0].shapeGeometries.find((shape) => shape.name === `fluent-slide-kit:${sourceSlide.id}:diagram-component-${brandComponent.id}`);
        assert.equal(brandShape.fill, diagram.theme === 'dark' ? '0C3B5E' : 'EBF3FC');
        assert.equal(brandShape.line, diagram.theme === 'dark' ? '479EF5' : '0F6CBD');
    } finally {
        await rm(output, { recursive: true, force: true });
    }
});

test('every narrative layout compiles to positioned scene elements', async () => {
    const item = (title, body = 'Executive-ready supporting detail.') => ({ title, body });
    const deck = {
        schemaVersion: 1,
        title: 'Layout catalog',
        theme: 'light',
        brandProfile: 'design/brand-profiles/fluent-aligned.json',
        slides: [
            { id: 'title', layout: 'title', takeaway: 'Open clearly.', title: 'Title slide', subtitle: 'Supporting context.' },
            { id: 'statement', layout: 'statement', takeaway: 'Land one point.', title: 'Statement', items: [item('Decisive claim')] },
            { id: 'cards', layout: 'cards', takeaway: 'Compare ideas.', title: 'Cards', items: [item('One'), item('Two')] },
            { id: 'split', layout: 'split', takeaway: 'Pair argument and evidence.', title: 'Split', items: [item('Argument'), item('Evidence')] },
            { id: 'metrics', layout: 'metrics', takeaway: 'Feature outcomes.', title: 'Metrics', items: [{ title: 'Adoption', value: '82%' }, { title: 'Time', value: '4x' }] },
            { id: 'comparison', layout: 'comparison', takeaway: 'Contrast options.', title: 'Comparison', items: [item('Option A'), item('Option B')] },
            { id: 'timeline', layout: 'timeline', takeaway: 'Sequence milestones.', title: 'Timeline', items: [{ title: 'Discover', date: 'Q1' }, { title: 'Build', date: 'Q2' }, { title: 'Scale', date: 'Q3' }] },
            { id: 'architecture', layout: 'architecture', takeaway: 'Show a simple path.', title: 'Architecture', items: [item('Entry'), item('Service')] },
            { id: 'quote', layout: 'quote', takeaway: 'Feature a sourced voice.', title: 'Customer perspective', items: [{ body: 'A short sourced quotation.', label: 'Customer leader' }] },
            { id: 'sources', layout: 'sources', takeaway: 'Retain evidence.', title: 'Sources', sources: [{ label: 'Microsoft Learn', url: 'https://learn.microsoft.com/' }] },
        ],
    };
    const scene = await compileDeckScene(deck);
    const layouts = JSON.parse(await readFile(path.join(kitRoot, 'templates', 'layouts.json'), 'utf8'));
    assert.deepEqual(new Set(scene.slides.map((slide) => slide.layout)), new Set(layouts.layouts.map((layout) => layout.id).filter((id) => id !== 'diagram')));
    for (const slide of scene.slides) {
        assert.ok(slide.elements.length >= 2, `${slide.layout} did not compile meaningful scene content.`);
        assert.equal(new Set(slide.elements.map((element) => element.id)).size, slide.elements.length);
    }
});

test('deck validation rejects AI-generated icon assets', async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'fluent-asset-policy-'));
    try {
        const deckPath = path.join(output, 'invalid-generated-icon.json');
        const deck = {
            schemaVersion: 1,
            title: 'Invalid generated icon',
            theme: 'light',
            slides: [{
                id: 'invalid',
                layout: 'cards',
                takeaway: 'Generated icons are prohibited.',
                title: 'Asset policy',
                items: [
                    { title: 'Invalid', asset: { kind: 'fluent', path: 'assets/fluent-system-icons/svg/regular/shield.svg', alt: 'Shield', provenance: 'ai-generated' } },
                    { title: 'Valid', body: 'Structured content remains editable.' },
                ],
            }],
        };
        await writeFile(deckPath, JSON.stringify(deck));
        await assert.rejects(
            execFileAsync(process.execPath, ['tools/validate-deck.mjs', deckPath, '--output', path.join(output, 'render')], { cwd: kitRoot }),
            /AI-generated assets must use kind "image"/,
        );
    } finally {
        await rm(output, { recursive: true, force: true });
    }
});

test('renderer creates standalone slides with inlined Fluent SVG', async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'fluent-slide-kit-'));
    try {
        await execFileAsync(process.execPath, [
            'tools/render-deck.mjs',
            'examples/deck.json',
            '--output',
            output,
        ], { cwd: kitRoot });
        const manifest = JSON.parse(await readFile(path.join(output, 'deck-manifest.json'), 'utf8'));
        assert.equal(manifest.slides.length, 4);
        const cards = await readFile(path.join(output, '02-quality-system.html'), 'utf8');
        assert.match(cards, /data-scene-slide="quality-system"/);
        assert.match(cards, /data-scene-element="item-1-visual"/);
        assert.match(cards, /data-scene-element="item-1-surface"[^>]+border-radius:8px/);
        assert.match(cards, /data-scene-element="item-1-surface"[^>]+background:#EBF3FC[^>]+border:2px solid #0F6CBD/);
        assert.match(cards, /data-scene-element="item-2-surface"[^>]+background:#F5F5F5[^>]+border:1px solid #D1D1D1/);
        assert.match(cards, /data-scene-element="item-3-surface"[^>]+background:#F1FAF1[^>]+border:2px solid #107C10/);
        assert.match(cards, /currentColor/i);
        assert.match(cards, /data-scene-element="footer-confidentiality"[^>]*>Microsoft Confidential<\/div>/);
        assert.doesNotMatch(cards, /data-scene-element="footer-(?:source|meta)"|>Source:/);
        const architecture = await readFile(path.join(output, '03-azure-flow.html'), 'utf8');
        assert.match(architecture, /10023-icon-service-Kubernetes-Services\.svg/);
        const diagram = await readFile(path.join(output, '04-azure-workflow.html'), 'utf8');
        assert.match(diagram, /data-diagram-node="route"/);
        assert.match(diagram, /data-diagram-edge="queue-work"/);
        assert.match(diagram, /data:image\/svg\+xml;base64,/);
        const scene = JSON.parse(await readFile(path.join(output, 'deck.scene.json'), 'utf8'));
        assert.equal(scene.source, 'examples/deck.json');
        assert.equal(scene.brandProfile, 'fluent-aligned');
    } finally {
        await rm(output, { recursive: true, force: true });
    }
});

test('diagram renderer creates a standalone graph with embedded Azure assets', async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'fluent-diagram-'));
    try {
        const svgPath = path.join(output, 'diagram.svg');
        await execFileAsync(process.execPath, [
            'tools/render-diagram.mjs',
            'diagrams/templates/flow.json',
            '--output',
            svgPath,
        ], { cwd: kitRoot });
        const svg = await readFile(svgPath, 'utf8');
        assert.match(svg, /data-diagram-node="route"/);
        assert.match(svg, /data-diagram-edge="sync-write"/);
        assert.match(svg, /Application platform/);
        assert.match(svg, /Data and messaging/);
    } finally {
        await rm(output, { recursive: true, force: true });
    }
});

test('flow nodes keep icons labels and descriptions separated', async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'fluent-flow-spacing-'));
    try {
        await execFileAsync(process.execPath, [
            'tools/validate-diagram.mjs',
            'diagrams/templates/flow.json',
            '--output',
            output,
            '--no-screenshot',
        ], { cwd: kitRoot });
        const report = JSON.parse(await readFile(path.join(output, 'validation-report.json'), 'utf8'));
        assert.equal(report.passed, true);
        assert.deepEqual(report.inspection.geometry.nodeContentSpacingViolations, []);
    } finally {
        await rm(output, { recursive: true, force: true });
    }
});

test('flow nodes share one card shape and signal kind with a glyph', async () => {
    const diagram = JSON.parse(await readFile(path.join(kitRoot, 'diagrams', 'templates', 'flow.json'), 'utf8'));
    const svg = await renderDiagramSvg(diagram);
    assert.equal(svg.includes('<polygon'), false);
    assert.equal((svg.match(/class="node-shape/g) ?? []).length, diagram.nodes.length);
    for (const rectangle of svg.match(/<rect\b(?![^>]*data-canvas-background)[^>]*>/g) ?? []) {
        assert.ok(Number(rectangle.match(/rx="([\d.]+)"/)?.[1]) >= 6, rectangle);
    }
    assert.match(svg, /data-diagram-node="route"[\s\S]*?class="node-glyph/);
    assert.match(svg, /data-diagram-node="work-queue"[\s\S]*?class="node-glyph/);
});

test('diagram validation rejects cycles unless they are intentional', async () => {
    const diagram = {
        schemaVersion: 1,
        diagramType: 'flow',
        id: 'retry-loop',
        title: 'Retry loop',
        theme: 'light',
        nodes: [
            { id: 'request', label: 'Request', kind: 'process' },
            { id: 'retry', label: 'Retry', kind: 'process' },
        ],
        edges: [
            { id: 'attempt', source: 'request', target: 'retry' },
            { id: 'try-again', source: 'retry', target: 'request' },
        ],
    };
    const accidental = await validateDiagram(diagram);
    assert.match(accidental.errors.join('\n'), /contains a cycle/);

    diagram.allowCycles = true;
    const intentional = await validateDiagram(diagram);
    assert.equal(intentional.errors.length, 0);
});

test('layered architecture renders on a fixed executive canvas', async () => {
    const source = await readFile(path.join(kitRoot, 'diagrams', 'templates', 'layered-architecture.json'), 'utf8');
    const diagram = JSON.parse(source);
    const contract = await validateDiagram(diagram);
    assert.deepEqual(contract.errors, []);

    const svg = await renderDiagramSvg(diagram);
    assert.match(svg, /viewBox="0 0 1600 720"/);
    assert.match(svg, /data-diagram-type="layered-architecture"/);
    assert.match(svg, diagram.theme === 'dark'
        ? /architecture-component\.tone-brand rect \{ fill: #0C3B5E; stroke: #479EF5; \}/
        : /architecture-component\.tone-brand rect \{ fill: #EBF3FC; stroke: #0F6CBD; \}/);
    assert.match(svg, diagram.theme === 'dark'
        ? /architecture-component\.tone-success rect \{ fill: #0B3B0B; stroke: #54B054; \}/
        : /architecture-component\.tone-success rect \{ fill: #F1FAF1; stroke: #107C10; \}/);
    for (const rectangle of svg.match(/<rect\b(?![^>]*data-canvas-background)[^>]*>/g) ?? []) {
        assert.ok(Number(rectangle.match(/rx="([\d.]+)"/)?.[1]) >= 6, rectangle);
    }
    assert.match(svg, new RegExp(`data-diagram-component="${diagram.layers[0].components[0].id}"`));
    assert.match(svg, new RegExp(`data-diagram-concern="${diagram.crossCuttingConcerns[0].id}"`));
    assert.match(svg, /id="architecture-arrow"[^>]+markerUnits="userSpaceOnUse"/);
    const connector = svg.match(/<line class="layer-flow"[^>]+y1="([\d.]+)"[^>]+y2="([\d.]+)"/);
    assert.ok(connector, 'Expected a connector between architecture layers.');
    assert.ok(Number(connector[2]) - Number(connector[1]) >= 24, 'Architecture connector must retain a visible tail.');
});

test('layered architecture rejects overlapping column spans', async () => {
    const source = await readFile(path.join(kitRoot, 'diagrams', 'templates', 'layered-architecture.json'), 'utf8');
    const diagram = JSON.parse(source);
    diagram.layers[0].components.push({
        id: 'overlap',
        label: 'Overlapping component',
        column: diagram.layers[0].components[0].column,
    });
    const contract = await validateDiagram(diagram);
    assert.match(contract.errors.join('\n'), /overlapping components/);
});

test('layered architecture template passes browser typography and collision checks', async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'fluent-layered-diagram-'));
    try {
        await execFileAsync(process.execPath, [
            'tools/validate-diagram.mjs',
            'diagrams/templates/layered-architecture.json',
            '--output',
            output,
            '--no-screenshot',
        ], { cwd: kitRoot });
        const report = JSON.parse(await readFile(path.join(output, 'validation-report.json'), 'utf8'));
        assert.equal(report.passed, true);
        assert.deepEqual(report.inspection.geometry.undersizedText, []);
        assert.deepEqual(report.inspection.geometry.shortLayerFlows, []);
        assert.deepEqual(report.inspection.geometry.collisions, []);
        assert.equal(report.inspection.geometry.viewBox.width, 1600);
        assert.equal(report.inspection.geometry.viewBox.height, 720);
    } finally {
        await rm(output, { recursive: true, force: true });
    }
});