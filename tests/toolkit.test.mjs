import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { findTemporaryArtifactPaths, isTemporaryArtifactPath } from '../tools/check-repo-hygiene.mjs';
import { renderDiagramSvg, validateDiagram } from '../tools/diagram-core.mjs';
import { compileDeckScene } from '../tools/composition-core.mjs';
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

test('Fluent foundation snapshots stay complete, attributed, and renderer-neutral', async () => {
    const foundation = JSON.parse(await readFile(path.join(kitRoot, 'design', 'fluent-foundation.json'), 'utf8'));
    const charts = JSON.parse(await readFile(path.join(kitRoot, 'design', 'fluent-chart-foundation.json'), 'utf8'));
    const provenance = JSON.parse(await readFile(path.join(kitRoot, 'legal', 'provenance.json'), 'utf8'));

    assert.equal(foundation.upstream.package, '@fluentui/tokens');
    assert.match(foundation.upstream.revision, /^[0-9a-f]{40}$/);
    assert.deepEqual(Object.values(foundation.spacing), [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32]);
    assert.deepEqual(Object.values(foundation.strokeWidth), [1, 2, 3, 4]);
    assert.equal(foundation.borderRadius.circular, 10000);
    assert.equal(foundation.typography.roles.display.fontSize, 'hero1000');
    assert.deepEqual(foundation.shadows.levels, [2, 4, 8, 16, 28, 64]);
    assert.equal(Object.keys(foundation.brandWeb).length, 16);
    assert.equal(foundation.motion, undefined);
    assert.equal(foundation.units.duration, undefined);
    assert.equal(foundation.upstream.sourcePaths.some((sourcePath) => /curves|durations/.test(sourcePath)), false);

    assert.equal(charts.upstream.package, '@fluentui/react-charts');
    assert.equal(charts.qualitative.slots.length, 40);
    assert.deepEqual(charts.qualitative.slots.map((slot) => slot.id), Array.from({ length: 40 }, (_, index) => index + 1));
    assert.equal(new Set(charts.qualitative.slots.map((slot) => slot.light)).size, 40);
    assert.equal(Object.keys(charts.semantic.roles).length, 7);
    assert.equal(charts.qualitative.slots.find((slot) => slot.id === 11).dark, '#93A4F4');
    assert.equal(charts.qualitative.slots.find((slot) => slot.id === 1).dark, charts.qualitative.slots[0].light);
    assert.match(charts.resolution.qualitativeSequence, /modulo 40/);
    assert.match(charts.resolution.representation, /falls back to the light value/);
    assert.notEqual(charts.semantic.roles.error.light, charts.semantic.roles.warning.light);
    assert.ok(charts.staticChartRules.required.includes('non-color differentiation when series or status could be ambiguous'));

    const designData = new Map(provenance.designData.map((item) => [item.localFile, item]));
    assert.equal(designData.get('design/fluent-foundation.json').license, 'MIT');
    assert.equal(designData.get('design/fluent-chart-foundation.json').license, 'MIT');
    await readFile(path.join(kitRoot, designData.get('design/fluent-foundation.json').licenseFile), 'utf8');
    await readFile(path.join(kitRoot, designData.get('design/fluent-chart-foundation.json').licenseFile), 'utf8');
});

test('presentation skills require local assets, Fluent foundations, and static output', async () => {
    const presentationSkill = await readFile(path.join(kitRoot, '.github', 'skills', 'fluent-presentation', 'SKILL.md'), 'utf8');
    const deckSkill = await readFile(path.join(kitRoot, '.github', 'skills', 'fluent-deck', 'SKILL.md'), 'utf8');
    const designContract = JSON.parse(await readFile(path.join(kitRoot, 'design', 'design-contract.json'), 'utf8'));
    for (const source of [presentationSkill, deckSkill]) {
        assert.match(source, /assets\/manifest\.json/);
        assert.match(source, /design\/design-contract\.json/);
        assert.match(source, /design\/fluent-foundation\.json/);
        assert.match(source, /design\/fluent-chart-foundation\.json/);
        assert.match(source, /npm run assets:search/);
        assert.match(source, /static/);
        assert.match(source, /animations/);
        assert.match(source, /transitions/);
        assert.match(source, /hover/);
        assert.match(source, /autoplay/);
        assert.match(source, /\$surface/);
        assert.match(source, /2\.5px/);
        assert.match(source, /filled triangular arrowhead/);
    }
    assert.equal(designContract.outputMode.staticOnly, true);
    assert.equal(designContract.outputMode.completeMessagePerFrame, true);
    assert.deepEqual(designContract.outputMode.forbidden, [
        'animation',
        'slide-transition',
        'autoplay',
        'hover-dependent-content',
        'interactive-control',
        'loading-state',
        'motion-dependent-meaning',
    ]);
    assert.equal(designContract.authoringDefaults.containers.fill, '$surface');
    assert.equal(designContract.authoringDefaults.containers.lightResolvedFill, '#FFFFFF');
    assert.equal(designContract.authoringDefaults.containers.exceptionMetadata, 'fillIntent');
    assert.equal(designContract.authoringDefaults.connectors.color, '$secondary');
    assert.equal(designContract.authoringDefaults.connectors.lightResolvedColor, '#424242');
    assert.equal(designContract.authoringDefaults.connectors.width, 2.5);
    assert.equal(designContract.authoringDefaults.connectors.arrowhead, 'filled-triangle');
    assert.equal(designContract.authoringDefaults.connectors.exceptionMetadata, 'connectorIntent');
    assert.deepEqual(designContract.authoringDefaults.connectors.marker, {
        width: 10,
        height: 10,
        refX: 9,
        refY: 3,
        path: 'M0,0 L0,6 L9,3 z',
        units: 'strokeWidth',
    });
});

test('temporary artifacts stay in ignored dot-prefixed scratch directories', async () => {
    const gitignore = await readFile(path.join(kitRoot, '.gitignore'), 'utf8');
    assert.match(gitignore, /^\.tmp\/$/m);
    assert.match(gitignore, /^\.slide-artifacts\/$/m);

    const instructionPaths = [
        path.join(kitRoot, '.github', 'copilot-instructions.md'),
        path.join(kitRoot, '.github', 'skills', 'fluent-presentation', 'SKILL.md'),
        path.join(kitRoot, '.github', 'skills', 'fluent-deck', 'SKILL.md'),
        path.join(kitRoot, '.github', 'skills', 'fluent-diagram', 'SKILL.md'),
    ];
    for (const instructionPath of instructionPaths) {
        const source = await readFile(instructionPath, 'utf8');
        assert.match(source, /\.tmp\/<task>\//);
        assert.match(source, /repository root/);
        assert.match(source, /npm run repo:check/);
    }

    const hook = JSON.parse(await readFile(path.join(kitRoot, '.github', 'hooks', 'repository-hygiene.json'), 'utf8'));
    assert.ok(hook.hooks.Stop.some((entry) => entry.command === 'node tools/check-repo-hygiene.mjs --hook'));
    const packageJson = JSON.parse(await readFile(path.join(kitRoot, 'package.json'), 'utf8'));
    assert.equal(packageJson.scripts['repo:check'], 'node tools/check-repo-hygiene.mjs');
    assert.match(packageJson.scripts.pretest, /repo:check/);

    assert.equal(isTemporaryArtifactPath('run_searches.cjs'), true);
    assert.equal(isTemporaryArtifactPath('run_searches_correct.cjs'), true);
    assert.equal(isTemporaryArtifactPath('tools/probe.ps1'), true);
    assert.equal(isTemporaryArtifactPath('notes.tmp'), true);
    assert.equal(isTemporaryArtifactPath('.tmp/asset-search/run_searches.cjs'), false);
    assert.equal(isTemporaryArtifactPath('.slide-artifacts/advisor/probe.ps1'), false);
    assert.equal(isTemporaryArtifactPath('tools/render-deck.mjs'), false);
    assert.deepEqual(findTemporaryArtifactPaths([
        'run_searches_correct.cjs',
        '.tmp/asset-search/run_searches.cjs',
        'run_searches.cjs',
    ]), ['run_searches.cjs', 'run_searches_correct.cjs']);
});

test('static pattern fixture compiles six native still-frame patterns', async () => {
    const fixturePath = path.join(kitRoot, 'examples', 'static-patterns.json');
    const source = await readFile(fixturePath, 'utf8');
    const deck = JSON.parse(source);
    const schema = JSON.parse(await readFile(path.join(kitRoot, 'schemas', 'composition.schema.json'), 'utf8'));
    const validate = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(schema);
    assert.equal(validate(deck), true, JSON.stringify(validate.errors));
    assert.deepEqual(deck.slides.map((slide) => slide.id), [
        'status-message',
        'persona-owner',
        'progress-milestones',
        'structured-table',
        'metadata-tags',
        'kpi-summary',
    ]);
    assert.doesNotMatch(source, /animation|transition|autoplay|hover/i);
    assert.equal(deck.slides.flatMap((slide) => slide.elements)
        .some((element) => element.type === 'shape' && element.style?.fill === '$subtle'), false);
    assert.equal(deck.slides.every((slide) => slide.notes.startsWith('Static native')), true);
    assert.equal(deck.slides.every((slide) => slide.elements.every((element) => element.type !== 'diagram')), true);

    const imageElements = deck.slides.flatMap((slide) => slide.elements).filter((element) => element.type === 'image');
    assert.ok(imageElements.length >= 6);
    assert.equal(imageElements.every((element) => element.path.startsWith('assets/fluent-system-icons/svg/regular/')), true);
    assert.equal(imageElements.every((element) => element.provenance === 'local-catalog'), true);
    for (const element of imageElements) await readFile(path.join(kitRoot, element.path));

    const scene = await compileDeckScene(deck, { source: 'examples/static-patterns.json' });
    assert.equal(scene.slides.length, 6);
    assert.equal(scene.slides.every((slide) => slide.elements.some((element) => element.role === 'footer')), true);
});

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

test('freeform deck compiles to a valid renderer-neutral scene', async () => {
    const deck = JSON.parse(await readFile(path.join(kitRoot, 'examples', 'deck.json'), 'utf8'));
    const schema = JSON.parse(await readFile(path.join(kitRoot, 'schemas', 'scene.schema.json'), 'utf8'));
    const brandSchema = JSON.parse(await readFile(path.join(kitRoot, 'schemas', 'brand-profile.schema.json'), 'utf8'));
    const brandProfile = JSON.parse(await readFile(path.join(kitRoot, deck.brandProfile), 'utf8'));
    const scene = await compileDeckScene(deck, { source: 'examples/deck.json' });
    assert.equal(deck.footer, undefined);
    assert.equal(deck.date, undefined);
    assert.equal(deck.slides.every((slide) => slide.layout === undefined), true);
    assert.equal(deck.slides.every((slide) => slide.elements.length > 0), true);
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const validateBrand = ajv.compile(brandSchema);
    assert.equal(validateBrand(brandProfile), true, JSON.stringify(validateBrand.errors));
    assert.equal(validate(scene), true, JSON.stringify(validate.errors));
    assert.equal(scene.brandStatus, 'aligned-not-certified');
    assert.equal(scene.slides.length, deck.slides.length);
    assert.equal(deck.slides.flatMap((slide) => slide.elements)
        .some((element) => element.type === 'shape' && element.style?.fill === '$subtle'), false);
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
    assert.equal(scene.slides[1].elements.find((item) => item.id === 'assets-card').style.fill, '#EBF3FC');
    assert.equal(scene.slides[1].elements.find((item) => item.id === 'assets-icon').group, 'assets');
    assert.equal(scene.slides[2].elements.find((item) => item.id === 'front-door-to-aks').end.x, 704);
    assert.equal(scene.slides[2].elements.find((item) => item.id === 'front-door-to-aks').style.color, '#424242');
    assert.equal(scene.slides[2].elements.find((item) => item.id === 'front-door-to-aks').style.width, 2.5);
    assert.equal(scene.slides[2].elements.find((item) => item.id === 'front-door-to-aks').style.endArrow, true);
});

test('neutral shapes and primary connectors inherit shared visual defaults', async () => {
    const scene = await compileDeckScene({
        schemaVersion: 1,
        title: 'Shared visual defaults',
        theme: 'light',
        slides: [{
            id: 'shared-defaults',
            title: 'Shared defaults remain consistent',
            takeaway: 'Neutral containers stay white and primary connectors match validated flows.',
            elements: [
                { id: 'neutral-box', type: 'shape', z: 3, box: { x: 112, y: 240, width: 480, height: 280 }, shape: 'roundRect', style: { stroke: '$stroke', strokeWidth: 1 } },
                { id: 'primary-connector', type: 'line', role: 'connector', z: 4, start: { x: 592, y: 380 }, end: { x: 820, y: 380 } },
                { id: 'divider', type: 'line', role: 'divider', z: 4, start: { x: 112, y: 560 }, end: { x: 820, y: 560 } },
            ],
        }],
    });
    const elements = new Map(scene.slides[0].elements.map((element) => [element.id, element]));
    assert.equal(elements.get('neutral-box').style.fill, '#FFFFFF');
    assert.equal(elements.get('primary-connector').style.color, '#424242');
    assert.equal(elements.get('primary-connector').style.width, 2.5);
    assert.equal(elements.get('primary-connector').style.endArrow, true);
    assert.equal(elements.get('divider').style.endArrow, undefined);
});

test('image accessibility descriptions allow up to 300 characters', async () => {
    const schema = JSON.parse(await readFile(path.join(kitRoot, 'schemas', 'composition.schema.json'), 'utf8'));
    const validate = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(schema);
    const deck = {
        schemaVersion: 1,
        title: 'Accessibility boundary',
        theme: 'light',
        slides: [{
            id: 'image-alt-boundary',
            takeaway: 'Detailed image descriptions remain available to assistive technology.',
            title: 'Image descriptions stay useful',
            elements: [
                { id: 'title', type: 'text', role: 'title', z: 10, box: { x: 112, y: 68, width: 1200, height: 70 }, text: 'Image descriptions stay useful', typography: 'title' },
                { id: 'image', type: 'image', z: 5, box: { x: 112, y: 220, width: 300, height: 300 }, path: 'assets/azure-public-service-icons/svg/management + governance/00003-icon-service-Advisor.svg', assetKind: 'azure', alt: 'A'.repeat(300), provenance: 'local-catalog' },
            ],
        }],
    };
    assert.equal(validate(deck), true, JSON.stringify(validate.errors));
    deck.slides[0].elements[1].alt += 'A';
    assert.equal(validate(deck), false);
    assert.match(JSON.stringify(validate.errors), /must NOT have more than 300 characters/);
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

test('dark theme tokens propagate through scene, SVG, and native PowerPoint', async () => {
    const deck = {
        schemaVersion: 1,
        title: 'Dark theme propagation',
        theme: 'dark',
        slides: [{
            id: 'dark-freeform',
            takeaway: 'Dark semantics remain intact.',
            title: 'Dark theme remains dark',
            elements: [
                { id: 'title', type: 'text', role: 'title', z: 10, box: { x: 112, y: 68, width: 1200, height: 70 }, text: 'Dark theme remains dark', typography: 'title' },
                { id: 'brand-surface', type: 'shape', z: 3, box: { x: 112, y: 240, width: 500, height: 300 }, shape: 'roundRect', style: { fill: '$brandSubtle', stroke: '$brand', strokeWidth: 2 } },
                { id: 'success-surface', type: 'shape', z: 3, box: { x: 680, y: 240, width: 500, height: 300 }, shape: 'roundRect', style: { fill: '$successSubtle', stroke: '$success', strokeWidth: 2 } },
            ],
            notes: 'Regression fixture for dark rendering.',
        }],
    };
    const scene = await compileDeckScene(deck);
    const slide = scene.slides[0];
    assert.equal(slide.theme, 'dark');
    assert.equal(slide.elements.find((element) => element.id === 'background').style.fill, '#202020');
    assert.equal(slide.elements.find((element) => element.id === 'title').style.color, '#FFFFFF');
    assert.equal(slide.elements.find((element) => element.id === 'brand-surface').style.fill, '#0C3B5E');
    assert.equal(slide.elements.find((element) => element.id === 'success-surface').style.fill, '#0B3B0B');
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
        assert.equal(shapes.get('fluent-slide-kit:dark-freeform:background').fill, '202020');
        assert.equal(shapes.get('fluent-slide-kit:dark-freeform:brand-surface').fill, '0C3B5E');
        assert.equal(shapes.get('fluent-slide-kit:dark-freeform:success-surface').fill, '0B3B0B');
    } finally {
        await rm(output, { recursive: true, force: true });
    }
});

test('native PowerPoint export contains editable freeform objects and notes', async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'fluent-native-pptx-'));
    try {
        const deck = {
            schemaVersion: 1,
            title: 'Freeform native output',
            theme: 'light',
            brandProfile: 'design/brand-profiles/fluent-aligned.json',
            slides: [{
                id: 'freeform-native',
                takeaway: 'Every authored primitive remains a named Office object.',
                title: 'Freeform composition remains editable',
                elements: [
                    { id: 'title', type: 'text', role: 'title', z: 10, box: { x: 112, y: 68, width: 1300, height: 70 }, text: 'Freeform composition remains editable', typography: 'title' },
                    { id: 'surface', type: 'shape', group: 'advisor', z: 3, box: { x: 112, y: 240, width: 520, height: 360 }, shape: 'roundRect', style: { fill: '$brandSubtle', stroke: '$brand', strokeWidth: 2 } },
                    { id: 'advisor-icon', type: 'image', group: 'advisor', z: 8, box: { x: 160, y: 288, width: 96, height: 96 }, path: 'assets/azure-public-service-icons/svg/management + governance/00003-icon-service-Advisor.svg', assetKind: 'azure', alt: 'Azure Advisor', provenance: 'local-catalog' },
                    { id: 'connector', type: 'line', z: 5, start: { x: 632, y: 420 }, end: { x: 900, y: 320 }, style: { color: '$brand', width: 3, endArrow: true } },
                ],
                notes: 'Generic freeform native PowerPoint regression fixture.',
            }],
        };
        const sourceSlide = deck.slides[0];
        const scene = await compileDeckScene(deck, { source: 'inline freeform composition' });
        const pptxPath = path.join(output, 'freeform-native.pptx');
        await renderSceneToPptx(scene, pptxPath);
        const inspection = await execFileAsync('pwsh', [
            '-NoProfile',
            '-File', path.join(kitRoot, 'tools', 'inspect-pptx.ps1'),
            pptxPath,
        ], { cwd: kitRoot });
        const report = JSON.parse(inspection.stdout);
        assert.equal(report.slides.length, 1);
        assert.ok(report.slides[0].shapes >= 4);
        assert.ok(report.slides[0].namedObjects.length >= 6);
        assert.equal(report.slides[0].screenshotOnly, false);
        assert.equal(report.notes[0].hasTakeaway, true);
        assert.ok(report.slides[0].namedObjects.includes(`fluent-slide-kit:${sourceSlide.id}:surface`));
        assert.ok(report.slides[0].namedObjects.includes(`fluent-slide-kit:${sourceSlide.id}:advisor-icon`));
        assert.ok(report.slides[0].namedObjects.includes(`fluent-slide-kit:${sourceSlide.id}:connector`));
        const geometries = new Map(report.slides[0].shapeGeometries.map((shape) => [shape.name, shape.preset]));
        assert.equal(geometries.get(`fluent-slide-kit:${sourceSlide.id}:surface`), 'roundRect');
        const brandShape = report.slides[0].shapeGeometries.find((shape) => shape.name === `fluent-slide-kit:${sourceSlide.id}:surface`);
        assert.equal(brandShape.fill, 'EBF3FC');
        assert.equal(brandShape.line, '0F6CBD');
        assert.ok(brandShape.cornerAdjustment > 0 && brandShape.cornerAdjustment < 5000);
    } finally {
        await rm(output, { recursive: true, force: true });
    }
});

test('freeform composition embeds an opt-in flow as one named PowerPoint graphic', async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'fluent-hybrid-pptx-'));
    try {
        const deck = {
            schemaVersion: 1,
            title: 'Hybrid composition',
            theme: 'light',
            slides: [{
                id: 'hybrid-flow',
                takeaway: 'Structured graphs remain optional inside a freeform slide.',
                title: 'Graph semantics earn the constraint',
                elements: [
                    { id: 'title', type: 'text', role: 'title', z: 20, box: { x: 112, y: 68, width: 1400, height: 70 }, text: 'Graph semantics earn the constraint', typography: 'title' },
                    { id: 'decision-flow', type: 'diagram', z: 10, box: { x: 160, y: 220, width: 1600, height: 720 }, diagramPath: 'diagrams/templates/flow.json', alt: 'A validated branching request flow.' },
                ],
            }],
        };
        const schema = JSON.parse(await readFile(path.join(kitRoot, 'schemas', 'composition.schema.json'), 'utf8'));
        const validate = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(schema);
        assert.equal(validate(deck), true, JSON.stringify(validate.errors));
        const scene = await compileDeckScene(deck);
        assert.equal(scene.slides[0].elements.find((element) => element.id === 'decision-flow').diagramPath, 'diagrams/templates/flow.json');

        const pptxPath = path.join(output, 'hybrid.pptx');
        await renderSceneToPptx(scene, pptxPath);
        const inspection = await execFileAsync('pwsh', ['-NoProfile', '-File', path.join(kitRoot, 'tools', 'inspect-pptx.ps1'), pptxPath], { cwd: kitRoot });
        const report = JSON.parse(inspection.stdout);
        assert.equal(report.slides[0].screenshotOnly, false);
        assert.ok(report.slides[0].namedObjects.includes('fluent-slide-kit:hybrid-flow:decision-flow'));
        assert.ok(report.slides[0].pictures >= 1);
    } finally {
        await rm(output, { recursive: true, force: true });
    }
});

test('freeform composition preserves authored geometry and token semantics', async () => {
    const deck = {
        schemaVersion: 1,
        title: 'Freeform composition',
        theme: 'light',
        brandProfile: 'design/brand-profiles/fluent-aligned.json',
        slides: [
            {
                id: 'composition',
                takeaway: 'The author owns geometry.',
                title: 'Geometry remains explicit',
                elements: [
                    { id: 'title', type: 'text', role: 'title', z: 10, box: { x: 112, y: 68, width: 1200, height: 70 }, text: 'Geometry remains explicit', typography: 'title' },
                    { id: 'surface', type: 'shape', group: 'message', z: 3, box: { x: 240, y: 320, width: 640, height: 360 }, shape: 'roundRect', style: { fill: '$warningSubtle', stroke: '$warning', strokeWidth: 2 } },
                    { id: 'line', type: 'line', z: 4, start: { x: 880, y: 500 }, end: { x: 1180, y: 360 }, style: { color: '$brand', endArrow: true } },
                ],
            },
        ],
    };
    const scene = await compileDeckScene(deck);
    const slide = scene.slides[0];
    assert.deepEqual(slide.elements.find((element) => element.id === 'surface').box, { x: 240, y: 320, width: 640, height: 360 });
    assert.equal(slide.elements.find((element) => element.id === 'surface').style.fill, '#FFF4CE');
    assert.deepEqual(slide.elements.find((element) => element.id === 'line').end, { x: 1180, y: 360 });
});

test('deck validation requires explicit intent for grey boxes and custom connectors', async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'fluent-visual-policy-'));
    try {
        const deckPath = path.join(output, 'visual-policy.json');
        const deck = {
            schemaVersion: 1,
            title: 'Visual policy',
            theme: 'light',
            slides: [{
                id: 'visual-policy',
                takeaway: 'Visual exceptions remain explicit.',
                title: 'Visual exceptions remain explicit',
                elements: [
                    { id: 'title', type: 'text', role: 'title', z: 10, box: { x: 112, y: 68, width: 1200, height: 70 }, text: 'Visual exceptions remain explicit', typography: 'title' },
                    { id: 'grey-box', type: 'shape', z: 3, box: { x: 112, y: 240, width: 400, height: 240 }, shape: 'roundRect', style: { fill: '$subtle', stroke: '$stroke', strokeWidth: 1 } },
                    { id: 'custom-arrow', type: 'line', role: 'connector', z: 4, start: { x: 512, y: 360 }, end: { x: 800, y: 360 }, style: { color: '$brand', width: 4, endArrow: true } },
                ],
            }],
        };
        await writeFile(deckPath, JSON.stringify(deck));
        await assert.rejects(
            execFileAsync(process.execPath, ['tools/validate-deck.mjs', deckPath, '--no-screenshots', '--output', path.join(output, 'invalid')], { cwd: kitRoot }),
            /neutral box grey-box must use \$surface|connector custom-arrow departs from the primary flow style/,
        );

        deck.slides[0].elements[1].metadata = { fillIntent: 'The user explicitly requested a grey comparison state.' };
        deck.slides[0].elements[2].metadata = { connectorIntent: 'The user explicitly requested a brand-emphasis arrow.' };
        await writeFile(deckPath, JSON.stringify(deck));
        const result = await execFileAsync(process.execPath, ['tools/validate-deck.mjs', deckPath, '--no-screenshots', '--output', path.join(output, 'valid')], { cwd: kitRoot });
        assert.match(result.stdout, /PASS: 1 slides checked; 0 errors; 0 warnings\./);
    } finally {
        await rm(output, { recursive: true, force: true });
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
                takeaway: 'Generated icons are prohibited.',
                title: 'Asset policy',
                elements: [
                    { id: 'title', type: 'text', role: 'title', z: 10, box: { x: 112, y: 68, width: 1200, height: 70 }, text: 'Asset policy', typography: 'title' },
                    { id: 'invalid-icon', type: 'image', z: 5, box: { x: 112, y: 220, width: 120, height: 120 }, path: 'assets/fluent-system-icons/svg/regular/shield-checkmark.svg', assetKind: 'fluent', alt: 'Shield', provenance: 'ai-generated' },
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
        const staleSlide = path.join(output, '99-stale-layout.html');
        await writeFile(staleSlide, '<section class="layout-cards">stale</section>');
        await execFileAsync(process.execPath, [
            'tools/render-deck.mjs',
            'examples/deck.json',
            '--output',
            output,
        ], { cwd: kitRoot });
        await assert.rejects(readFile(staleSlide, 'utf8'), { code: 'ENOENT' });
        const manifest = JSON.parse(await readFile(path.join(output, 'deck-manifest.json'), 'utf8'));
        assert.equal(manifest.slides.length, 3);
        const cards = await readFile(path.join(output, '02-quality-contract.html'), 'utf8');
        assert.match(cards, /data-scene-slide="quality-contract"/);
        assert.match(cards, /data-scene-element="assets-icon"/);
        assert.match(cards, /data-scene-element="assets-card"[^>]+border-radius:8px/);
        assert.match(cards, /data-scene-element="assets-card"[^>]+background:#EBF3FC[^>]+border:2px solid #0F6CBD/);
        assert.match(cards, /data-scene-element="composition-card"[^>]+background:#FFFFFF[^>]+border:1px solid #D1D1D1/);
        assert.match(cards, /data-scene-element="validation-card"[^>]+background:#F1FAF1[^>]+border:2px solid #107C10/);
        assert.match(cards, /currentColor/i);
        assert.match(cards, /data-scene-element="footer-confidentiality"[^>]*>Microsoft Confidential<\/div>/);
        assert.doesNotMatch(cards, /data-scene-element="footer-(?:source|meta)"|>Source:/);
        const architecture = await readFile(path.join(output, '03-azure-journey.html'), 'utf8');
        assert.match(architecture, /10023-icon-service-Kubernetes-Services\.svg/);
        assert.match(architecture, /data-scene-element="front-door-to-aks"/);
        assert.match(architecture, /marker-end=/);
        assert.match(architecture, /markerWidth="10" markerHeight="10" refX="9" refY="3"[^>]+markerUnits="strokeWidth"/);
        assert.match(architecture, /<path d="M0,0 L0,6 L9,3 z" fill="#424242"/);
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

test('flow layout keeps long edge labels clear of node cards', async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'fluent-flow-edge-labels-'));
    try {
        const input = path.join(output, 'long-edge-label.json');
        const validationOutput = path.join(output, 'validation');
        await writeFile(input, JSON.stringify({
            schemaVersion: 1,
            diagramType: 'flow',
            id: 'long-edge-label',
            title: 'Long edge labels remain clear',
            direction: 'right',
            theme: 'light',
            nodes: [
                { id: 'advisor', label: 'Advisor skill', kind: 'process' },
                { id: 'resiliency', label: 'Resiliency skill', kind: 'process' },
            ],
            edges: [
                { id: 'remediate', source: 'advisor', target: 'resiliency', label: 'Remediate reliability recommendation' },
            ],
        }));
        await execFileAsync(process.execPath, [
            'tools/validate-diagram.mjs',
            input,
            '--output',
            validationOutput,
            '--no-screenshot',
        ], { cwd: kitRoot });
        const report = JSON.parse(await readFile(path.join(validationOutput, 'validation-report.json'), 'utf8'));
        assert.equal(report.passed, true);
        assert.deepEqual(report.inspection.geometry.edgeLabelNodeCollisions, []);
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

test('flow edge labels render above every connector path', async () => {
    const diagram = JSON.parse(await readFile(path.join(kitRoot, 'diagrams', 'templates', 'flow.json'), 'utf8'));
    const svg = await renderDiagramSvg(diagram);
    assert.ok(svg.indexOf('class="edge-label"') > svg.lastIndexOf('class="diagram-edge'));
    assert.equal((svg.match(/data-diagram-edge-label=/g) ?? []).length, diagram.edges.filter((edge) => edge.label).length);
});

test('flow edge labels can align with the target node', async () => {
    const diagram = {
        schemaVersion: 1,
        diagramType: 'flow',
        id: 'target-label-position',
        title: 'Target-aligned edge label',
        direction: 'right',
        theme: 'light',
        nodes: [
            { id: 'source', label: 'Source', kind: 'process' },
            { id: 'upper-target', label: 'Upper target', kind: 'process', group: 'target-boundary' },
            { id: 'lower-target', label: 'Lower target', kind: 'process', group: 'target-boundary' },
        ],
        edges: [
            { id: 'upper', source: 'source', target: 'upper-target' },
            { id: 'lower', source: 'source', target: 'lower-target', label: 'Apply changes', labelPosition: 'target' },
        ],
        groups: [
            { id: 'target-boundary', label: 'Target boundary' },
        ],
    };
    const contract = await validateDiagram(diagram);
    assert.deepEqual(contract.errors, []);
    const svg = await renderDiagramSvg(diagram);
    const labelY = Number(svg.match(/data-diagram-edge-label="lower"[\s\S]*?<rect[^>]+y="([\d.]+)"/)?.[1]) + 16;
    const targetY = Number(svg.match(/data-diagram-node="lower-target"[\s\S]*?class="node-shape[^>]+y="([\d.]+)"[^>]+height="([\d.]+)"/)?.[1])
        + Number(svg.match(/data-diagram-node="lower-target"[\s\S]*?class="node-shape[^>]+y="([\d.]+)"[^>]+height="([\d.]+)"/)?.[2]) / 2;
    assert.equal(labelY, targetY);
    const labelRectangle = svg.match(/data-diagram-edge-label="lower"[\s\S]*?<rect[^>]+x="([\d.]+)"[^>]+width="([\d.]+)"/);
    const boundaryX = Number(svg.match(/class="diagram-group[^>]*><rect x="([\d.]+)"/)?.[1]);
    assert.ok(Number(labelRectangle?.[1]) + Number(labelRectangle?.[2]) <= boundaryX - 8);
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