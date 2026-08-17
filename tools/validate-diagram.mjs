import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import axe from 'axe-core';
import { kitRoot, loadDiagram, renderDiagramSvg, validateDiagram } from './diagram-core.mjs';

const parseArguments = (arguments_) => {
    const options = { input: undefined, output: undefined, screenshots: true, browser: 'msedge' };
    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index];
        if (argument === '--output') options.output = path.resolve(arguments_[index += 1]);
        else if (argument === '--browser') options.browser = arguments_[index += 1];
        else if (argument === '--no-screenshot') options.screenshots = false;
        else if (!options.input) options.input = path.resolve(argument);
        else throw new Error(`Unexpected argument: ${argument}`);
    }
    if (!options.input) throw new Error('Usage: npm run diagram:validate -- <diagram.json> [--output <directory>]');
    const baseName = path.basename(options.input, path.extname(options.input));
    options.output ??= path.join(kitRoot, '.slide-artifacts', 'validation', `diagram-${baseName}`);
    if (!['msedge', 'chromium'].includes(options.browser)) throw new Error('--browser must be msedge or chromium.');
    return options;
};

const launchBrowser = async (requestedBrowser, warnings) => {
    if (requestedBrowser === 'msedge') {
        try {
            return await chromium.launch({ channel: 'msedge', headless: true });
        } catch (error) {
            warnings.push(`Microsoft Edge could not launch; falling back to Playwright Chromium: ${error.message}`);
        }
    }
    return chromium.launch({ headless: true });
};

const inspectDiagram = async (page, diagram, quality) => {
    const geometry = await page.evaluate(({ diagramDefinition, qualityDefinition }) => {
        const svg = document.querySelector('svg');
        const bounds = svg.getBoundingClientRect();
        const viewBox = svg.viewBox.baseVal;
        const scale = Math.min(bounds.width / viewBox.width, bounds.height / viewBox.height);
        const tolerance = 1;
        const itemSelector = '[data-diagram-node], [data-diagram-component], [data-diagram-concern]';
        const itemElements = [...document.querySelectorAll(itemSelector)];
        const itemBounds = itemElements.map((element) => ({
            id: element.getAttribute('data-diagram-node') ?? element.getAttribute('data-diagram-component') ?? element.getAttribute('data-diagram-concern'),
            rect: element.getBoundingClientRect(),
        }));
        const outside = itemBounds.filter(({ rect: box }) => {
            return box.left < bounds.left - tolerance || box.top < bounds.top - tolerance || box.right > bounds.right + tolerance || box.bottom > bounds.bottom + tolerance;
        }).map(({ id }) => id);
        const emptyText = [...document.querySelectorAll('text')].filter((element) => !element.textContent.trim()).length;
        const invalidImages = [...document.querySelectorAll('image')].filter((element) => !element.getAttribute('href')?.startsWith('data:image/svg+xml;base64,')).length;
        const sharpCornerRectangles = [...document.querySelectorAll('rect:not([data-canvas-background])')]
            .filter((element) => element.rx.baseVal.value < qualityDefinition.minimumCornerRadius)
            .map((element) => element.closest('[data-diagram-node], [data-diagram-component], [data-diagram-concern], .diagram-lane, .diagram-group, .architecture-column, .architecture-layer, .architecture-concerns')?.getAttribute('data-diagram-node')
                ?? element.closest('[data-diagram-component]')?.getAttribute('data-diagram-component')
                ?? element.closest('[data-diagram-concern]')?.getAttribute('data-diagram-concern')
                ?? element.getAttribute('class')
                ?? 'unnamed rectangle');
        const readableText = [...document.querySelectorAll('.node-label, .node-description, .lane-label, .group-label, .column-label, .layer-label, .component-label, .component-description, .concern-title, .concern-label')]
            .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                    text: element.textContent.trim(),
                    effectiveFontSize: Number.parseFloat(getComputedStyle(element).fontSize) * scale,
                    outside: rect.left < bounds.left - tolerance || rect.top < bounds.top - tolerance || rect.right > bounds.right + tolerance || rect.bottom > bounds.bottom + tolerance,
                };
            });
        const undersizedText = readableText.filter((text) => text.effectiveFontSize < qualityDefinition.minimumEffectiveFontSize - 0.05);
        const outsideText = readableText.filter((text) => text.outside);
        const nodeContentSpacingViolations = [];
        for (const node of document.querySelectorAll('[data-diagram-node]')) {
            const parts = [
                { role: 'icon', element: node.querySelector('image, .node-glyph') },
                { role: 'label', element: node.querySelector('.node-label') },
                { role: 'description', element: node.querySelector('.node-description') },
            ].filter((part) => part.element);
            for (let leftIndex = 0; leftIndex < parts.length; leftIndex += 1) {
                for (let rightIndex = leftIndex + 1; rightIndex < parts.length; rightIndex += 1) {
                    const left = { ...parts[leftIndex], rect: parts[leftIndex].element.getBoundingClientRect() };
                    const right = { ...parts[rightIndex], rect: parts[rightIndex].element.getBoundingClientRect() };
                    const horizontalOverlap = Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left);
                    if (horizontalOverlap <= tolerance) continue;
                    const verticalGap = Math.max(left.rect.top - right.rect.bottom, right.rect.top - left.rect.bottom, 0);
                    if (verticalGap + 0.05 < qualityDefinition.minimumNodeContentGap) {
                        nodeContentSpacingViolations.push({
                            id: node.getAttribute('data-diagram-node'),
                            parts: `${left.role} / ${right.role}`,
                            gap: verticalGap,
                        });
                    }
                }
            }
        }
        const shortLayerFlows = [...document.querySelectorAll('[data-diagram-layer-flow]')]
            .map((element) => ({
                id: element.getAttribute('data-diagram-layer-flow'),
                length: Math.hypot(
                    element.x2.baseVal.value - element.x1.baseVal.value,
                    element.y2.baseVal.value - element.y1.baseVal.value,
                ),
            }))
            .filter((flow) => flow.length < qualityDefinition.minimumLayerConnectorLength);
        const collisions = [];
        for (let leftIndex = 0; leftIndex < itemBounds.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < itemBounds.length; rightIndex += 1) {
                const left = itemBounds[leftIndex];
                const right = itemBounds[rightIndex];
                const overlapWidth = Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left);
                const overlapHeight = Math.min(left.rect.bottom, right.rect.bottom) - Math.max(left.rect.top, right.rect.top);
                if (overlapWidth > tolerance && overlapHeight > tolerance) collisions.push(`${left.id} / ${right.id}`);
            }
        }
        const nodeShapeBounds = [...document.querySelectorAll('[data-diagram-node]')].map((element) => ({
            id: element.getAttribute('data-diagram-node'),
            rect: element.querySelector(':scope > .node-shape').getBoundingClientRect(),
        }));
        const edgeLabelBounds = [...document.querySelectorAll('[data-diagram-edge-label]')].map((element) => ({
            id: element.getAttribute('data-diagram-edge-label'),
            rect: element.querySelector(':scope > rect').getBoundingClientRect(),
        }));
        const edgeLabelNodeCollisions = [];
        for (const label of edgeLabelBounds) {
            for (const node of nodeShapeBounds) {
                const overlapWidth = Math.min(label.rect.right, node.rect.right) - Math.max(label.rect.left, node.rect.left);
                const overlapHeight = Math.min(label.rect.bottom, node.rect.bottom) - Math.max(label.rect.top, node.rect.top);
                if (overlapWidth > tolerance && overlapHeight > tolerance) edgeLabelNodeCollisions.push(`${label.id} / ${node.id}`);
            }
        }

        const parseSegments = (pathElement) => {
            const values = [...pathElement.getAttribute('d').matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)]
                .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
            return values.slice(1).map((point, index) => ({ start: values[index], end: point }));
        };
        const edgeDefinitions = new Map((diagramDefinition.edges ?? []).map((edge) => [edge.id, edge]));
        const paths = [...document.querySelectorAll('[data-diagram-edge]')].map((element) => ({
            id: element.getAttribute('data-diagram-edge'),
            segments: parseSegments(element.querySelector('path')),
        }));
        const crossings = [];
        for (let leftIndex = 0; leftIndex < paths.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < paths.length; rightIndex += 1) {
                const left = paths[leftIndex];
                const right = paths[rightIndex];
                const leftEdge = edgeDefinitions.get(left.id);
                const rightEdge = edgeDefinitions.get(right.id);
                if ([leftEdge?.source, leftEdge?.target].some((id) => id === rightEdge?.source || id === rightEdge?.target)) continue;
                const intersects = left.segments.some((leftSegment) => right.segments.some((rightSegment) => {
                    const leftVertical = leftSegment.start.x === leftSegment.end.x;
                    const rightVertical = rightSegment.start.x === rightSegment.end.x;
                    if (leftVertical === rightVertical) return false;
                    const vertical = leftVertical ? leftSegment : rightSegment;
                    const horizontal = leftVertical ? rightSegment : leftSegment;
                    const x = vertical.start.x;
                    const y = horizontal.start.y;
                    return x > Math.min(horizontal.start.x, horizontal.end.x) + tolerance
                        && x < Math.max(horizontal.start.x, horizontal.end.x) - tolerance
                        && y > Math.min(vertical.start.y, vertical.end.y) + tolerance
                        && y < Math.max(vertical.start.y, vertical.end.y) - tolerance;
                }));
                if (intersects) crossings.push(`${left.id} / ${right.id}`);
            }
        }
        return {
            viewBox: { width: viewBox.width, height: viewBox.height },
            scale,
            outside,
            emptyText,
            invalidImages,
            sharpCornerRectangles,
            undersizedText,
            outsideText,
            nodeContentSpacingViolations,
            shortLayerFlows,
            collisions,
            edgeLabelNodeCollisions,
            crossings,
        };
    }, { diagramDefinition: diagram, qualityDefinition: quality });
    const renderedNodes = await page.locator('[data-diagram-node]').count();
    const renderedEdges = await page.locator('[data-diagram-edge]').count();
    const renderedComponents = await page.locator('[data-diagram-component]').count();
    const renderedConcerns = await page.locator('[data-diagram-concern]').count();
    await page.evaluate((source) => globalThis.eval(source), axe.source);
    const accessibility = await page.evaluate(async () => window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    }));
    const accessibilityViolations = accessibility.violations
        .filter((violation) => ['critical', 'serious'].includes(violation.impact))
        .map((violation) => ({ id: violation.id, impact: violation.impact, help: violation.help }));
    const errors = [];
    if (diagram.diagramType === 'flow') {
        if (renderedNodes !== diagram.nodes.length) errors.push(`Rendered ${renderedNodes} of ${diagram.nodes.length} nodes.`);
        if (renderedEdges !== diagram.edges.length) errors.push(`Rendered ${renderedEdges} of ${diagram.edges.length} edges.`);
    } else {
        const expectedComponents = diagram.layers.reduce((sum, layer) => sum + layer.components.length, 0);
        if (geometry.viewBox.width !== quality.canvas.width || geometry.viewBox.height !== quality.canvas.height) {
            errors.push(`Layered architecture must use a fixed ${quality.canvas.width}x${quality.canvas.height} viewBox.`);
        }
        if (renderedComponents !== expectedComponents) errors.push(`Rendered ${renderedComponents} of ${expectedComponents} components.`);
        if (renderedConcerns !== (diagram.crossCuttingConcerns?.length ?? 0)) errors.push(`Rendered ${renderedConcerns} of ${diagram.crossCuttingConcerns?.length ?? 0} cross-cutting concerns.`);
    }
    if (geometry.outside.length) errors.push(`Diagram items outside SVG viewport: ${geometry.outside.join(', ')}`);
    if (geometry.emptyText) errors.push(`${geometry.emptyText} empty SVG text elements rendered.`);
    if (geometry.invalidImages) errors.push(`${geometry.invalidImages} diagram assets were not embedded.`);
    if (geometry.sharpCornerRectangles.length) errors.push(`Diagram rectangles below the ${quality.minimumCornerRadius}px corner radius: ${geometry.sharpCornerRectangles.join(', ')}`);
    if (geometry.undersizedText.length) errors.push(`Text below ${quality.minimumEffectiveFontSize}px effective size: ${geometry.undersizedText.map((text) => `${text.text} (${text.effectiveFontSize.toFixed(1)}px)`).join(', ')}`);
    if (geometry.outsideText.length) errors.push(`Text outside SVG viewport: ${geometry.outsideText.map((text) => text.text).join(', ')}`);
    if (geometry.nodeContentSpacingViolations.length) errors.push(`Flow-node content overlaps or is too tightly spaced: ${geometry.nodeContentSpacingViolations.map((violation) => `${violation.id}: ${violation.parts} (${violation.gap.toFixed(1)}px)`).join(', ')}`);
    if (geometry.shortLayerFlows.length) errors.push(`Layer connectors without a visible tail: ${geometry.shortLayerFlows.map((flow) => `${flow.id} (${flow.length.toFixed(1)}px)`).join(', ')}`);
    if (geometry.collisions.length) errors.push(`Overlapping diagram items: ${geometry.collisions.join(', ')}`);
    if (geometry.edgeLabelNodeCollisions.length) errors.push(`Edge labels overlap diagram nodes: ${geometry.edgeLabelNodeCollisions.join(', ')}`);
    if (geometry.crossings.length) errors.push(`Crossing connectors: ${geometry.crossings.join(', ')}`);
    if (accessibilityViolations.length) errors.push(`Accessibility: ${accessibilityViolations.map((violation) => `${violation.id} (${violation.impact})`).join(', ')}`);
    return { geometry, renderedNodes, renderedEdges, renderedComponents, renderedConcerns, accessibilityViolations, errors };
};

const main = async () => {
    const options = parseArguments(process.argv.slice(2));
    const diagram = await loadDiagram(options.input);
    const designContract = JSON.parse(await readFile(path.join(kitRoot, 'design', 'design-contract.json'), 'utf8'));
    const contract = await validateDiagram(diagram);
    const report = { diagram: options.input, output: options.output, errors: [...contract.errors], warnings: [...contract.warnings] };
    if (report.errors.length) {
        console.error(report.errors.join('\n'));
        process.exitCode = 1;
        return;
    }

    await mkdir(options.output, { recursive: true });
    const svgPath = path.join(options.output, `${diagram.id}.svg`);
    await writeFile(svgPath, `${await renderDiagramSvg(diagram)}\n`);
    const browser = await launchBrowser(options.browser, report.warnings);
    try {
        const context = await browser.newContext({ viewport: { width: 1600, height: 720 }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        await page.goto(pathToFileURL(svgPath).href, { waitUntil: 'load' });
        report.inspection = await inspectDiagram(page, diagram, designContract.diagramQuality);
        report.errors.push(...report.inspection.errors);
        if (options.screenshots) {
            report.screenshot = path.join(options.output, `${diagram.id}.png`);
            await page.screenshot({ path: report.screenshot, fullPage: false });
        }
        await context.close();
    } finally {
        await browser.close();
    }

    report.svg = svgPath;
    report.passed = report.errors.length === 0;
    await writeFile(path.join(options.output, 'validation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    const itemSummary = diagram.diagramType === 'flow'
        ? `${diagram.nodes.length} nodes and ${diagram.edges.length} edges`
        : `${diagram.layers.length} layers and ${diagram.layers.reduce((sum, layer) => sum + layer.components.length, 0)} components`;
    console.log(`${report.passed ? 'PASS' : 'FAIL'}: ${itemSummary} checked; ${report.errors.length} errors; ${report.warnings.length} warnings.`);
    if (!report.passed) {
        console.error(report.errors.join('\n'));
        process.exitCode = 1;
    }
};

main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
});
