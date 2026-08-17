import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL, fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { chromium } from '@playwright/test';
import axe from 'axe-core';
import { loadDiagram, resolveDiagramPath, validateDiagram } from './diagram-core.mjs';

const execFileAsync = promisify(execFile);
const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsRoot = path.join(kitRoot, 'assets');

const parseArguments = (arguments_) => {
    const options = {
        input: undefined,
        output: undefined,
        screenshots: true,
        browser: 'msedge',
    };

    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index];
        if (argument === '--output') options.output = path.resolve(arguments_[index += 1]);
        else if (argument === '--browser') options.browser = arguments_[index += 1];
        else if (argument === '--no-screenshots') options.screenshots = false;
        else if (!options.input) options.input = path.resolve(argument);
        else throw new Error(`Unexpected argument: ${argument}`);
    }

    if (!options.input) throw new Error('Usage: npm run deck:validate -- <deck.json> [--output <directory>]');
    options.output ??= path.join(
        kitRoot,
        '.slide-artifacts',
        'validation',
        path.basename(options.input, path.extname(options.input)),
    );
    if (!['msedge', 'chromium'].includes(options.browser)) {
        throw new Error('--browser must be msedge or chromium.');
    }
    return options;
};

const wordCount = (value = '') => String(value).trim().split(/\s+/).filter(Boolean).length;
const pngDimensions = (buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });

const validateDeckContract = async (deck) => {
    const [schema, brandProfileSchema, designContract, fluentCatalog, azureCatalog, externalCatalog] = await Promise.all([
        readFile(path.join(kitRoot, 'schemas', 'composition.schema.json'), 'utf8').then(JSON.parse),
        readFile(path.join(kitRoot, 'schemas', 'brand-profile.schema.json'), 'utf8').then(JSON.parse),
        readFile(path.join(kitRoot, 'design', 'design-contract.json'), 'utf8').then(JSON.parse),
        readFile(path.join(assetsRoot, 'fluent-system-icons', 'catalog.json'), 'utf8').then(JSON.parse),
        readFile(path.join(assetsRoot, 'azure-public-service-icons', 'catalog.json'), 'utf8').then(JSON.parse),
        readFile(path.join(assetsRoot, 'external-icons', 'catalog.json'), 'utf8').then(JSON.parse),
    ]);
    const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
    const validate = ajv.compile(schema);
    const errors = [];
    const warnings = [];

    if (!validate(deck)) {
        errors.push(...validate.errors.map((error) => `${error.instancePath || '/'} ${error.message}`));
        return { errors, warnings };
    }

    const brandProfilesRoot = path.join(kitRoot, 'design', 'brand-profiles');
    const brandProfilePath = path.resolve(kitRoot, deck.brandProfile ?? 'design/brand-profiles/fluent-aligned.json');
    let brandProfile;
    if (!brandProfilePath.startsWith(`${brandProfilesRoot}${path.sep}`)) {
        errors.push(`Brand profile must remain under design/brand-profiles/: ${deck.brandProfile}`);
        return { errors, warnings };
    }
    try {
        brandProfile = JSON.parse(await readFile(brandProfilePath, 'utf8'));
        const validateBrandProfile = ajv.compile(brandProfileSchema);
        if (!validateBrandProfile(brandProfile)) {
            errors.push(...validateBrandProfile.errors.map((error) => `brand profile ${error.instancePath || '/'} ${error.message}`));
            return { errors, warnings };
        }
    } catch (error) {
        errors.push(`Brand profile could not be loaded: ${error.message}`);
        return { errors, warnings };
    }

    const slideIds = new Set();
    const slideNumbers = new Set();
    const reservedElementIds = new Set(['background', 'footer-confidentiality']);
    const canvas = brandProfile.canvas;
    const fluentCatalogPaths = new Set(fluentCatalog.icons.flatMap((icon) =>
        Object.values(icon.styles).filter(Boolean).map((asset) => `assets/${asset.path}`)));
    const azureCatalogPaths = new Set(azureCatalog.icons.map((icon) => `assets/${icon.path}`));
    const externalCatalogPaths = new Set(externalCatalog.icons.map((icon) => `assets/${icon.path}`));
    const externalIds = new Set();
    for (const icon of externalCatalog.icons) {
        const owner = `external icon ${icon.id}`;
        if (externalIds.has(icon.id)) errors.push(`${owner} has a duplicate id.`);
        externalIds.add(icon.id);
        if (!icon.path?.startsWith('external-icons/')) errors.push(`${owner} path must remain under assets/external-icons/: ${icon.path}`);
        if (!/^https:\/\//.test(icon.source ?? '')) errors.push(`${owner} requires an HTTPS official source URL.`);
        if (!/^[0-9a-f]{40}$/.test(icon.sourceRevision ?? '')) errors.push(`${owner} requires a 40-character immutable sourceRevision.`);
        for (const field of ['vendor', 'license', 'licenseFile', 'trademarkNotice']) {
            if (!icon[field]?.trim()) errors.push(`${owner} requires ${field}.`);
        }
        for (const relativePath of [icon.path, icon.licenseFile].filter(Boolean)) {
            try {
                await access(path.join(assetsRoot, relativePath));
            } catch {
                errors.push(`${owner} references missing file: assets/${relativePath}`);
            }
        }
    }

    for (const [index, slide] of deck.slides.entries()) {
        const location = `slide ${index + 1} (${slide.id})`;
        const resolvedTheme = slide.theme ?? deck.theme;
        const themeColors = brandProfile.colors[resolvedTheme];
        if (slideIds.has(slide.id)) errors.push(`${location}: duplicate slide id.`);
        slideIds.add(slide.id);
        if (slide.number && slideNumbers.has(slide.number)) errors.push(`${location}: duplicate slide number.`);
        if (slide.number) slideNumbers.add(slide.number);

        if (wordCount(slide.title) > designContract.contentBudgets.titleWords) {
            errors.push(`${location}: title exceeds ${designContract.contentBudgets.titleWords} words.`);
        }
        const visibleTitle = slide.elements.some((item) => item.type === 'text' && ['display', 'title'].includes(item.role ?? item.typography));
        if (!visibleTitle) errors.push(`${location}: add a visible text element with the display or title role.`);

        const bodyWords = slide.elements
            .filter((item) => item.type === 'text' && !['display', 'title'].includes(item.role ?? item.typography))
            .reduce((sum, item) => sum + wordCount(item.text), 0);
        if (bodyWords > designContract.contentBudgets.bodyWords) {
            const message = `${location}: body copy uses ${bodyWords} words; budget is ${designContract.contentBudgets.bodyWords}.`;
            if (slide.sourceImageFidelity?.verbatim) {
                warnings.push(`${message} Accepted for declared verbatim source-image fidelity.`);
            } else {
                errors.push(message);
            }
        }

        const elementIds = new Set();
        for (const item of slide.elements) {
            if (reservedElementIds.has(item.id)) errors.push(`${location}: element id is reserved: ${item.id}.`);
            if (elementIds.has(item.id)) errors.push(`${location}: duplicate element id: ${item.id}.`);
            elementIds.add(item.id);

            if (item.type === 'line') {
                if (item.start.x === item.end.x && item.start.y === item.end.y) errors.push(`${location}: line ${item.id} has identical endpoints.`);
                for (const [label, point] of [['start', item.start], ['end', item.end]]) {
                    if (point.x > canvas.width || point.y > canvas.height) errors.push(`${location}: line ${item.id} ${label} is outside the ${canvas.width}x${canvas.height} canvas.`);
                }
                if (item.role === 'connector') {
                    const style = item.style ?? {};
                    const connectorDefaults = designContract.authoringDefaults.connectors;
                    const colorIsDefault = style.color === undefined || style.color === connectorDefaults.color || style.color.toUpperCase?.() === themeColors.secondary.toUpperCase();
                    const departsFromDefault = !colorIsDefault
                        || (style.width !== undefined && style.width !== connectorDefaults.width)
                        || style.endArrow === false
                        || style.beginArrow === true
                        || (style.dashType !== undefined && style.dashType !== 'solid');
                    if (departsFromDefault && !item.metadata?.connectorIntent?.trim()) {
                        errors.push(`${location}: connector ${item.id} departs from the primary flow style; add metadata.connectorIntent for an explicit user or semantic exception.`);
                    }
                }
            } else if (item.box.x + item.box.width > canvas.width || item.box.y + item.box.height > canvas.height) {
                errors.push(`${location}: element ${item.id} is outside the ${canvas.width}x${canvas.height} canvas.`);
            }

            if (item.type === 'shape' && item.shape === 'roundRect') {
                const fill = item.style?.fill;
                const usesNeutralGrey = fill === '$subtle' || fill?.toUpperCase?.() === themeColors.subtle.toUpperCase();
                if (usesNeutralGrey && !item.metadata?.fillIntent?.trim()) {
                    errors.push(`${location}: neutral box ${item.id} must use $surface; add metadata.fillIntent for an explicit user or semantic exception.`);
                }
                if (item.metadata?.contentAlignment === 'center') {
                    const groupedText = slide.elements.filter((candidate) => candidate.type === 'text' && candidate.group === item.group);
                    const containerCenter = item.box.x + item.box.width / 2;
                    const tolerance = designContract.authoringDefaults.focalContent.centerTolerance;
                    if (!item.group || groupedText.length === 0) {
                        errors.push(`${location}: centered focal container ${item.id} requires grouped text elements.`);
                    }
                    for (const text of groupedText) {
                        if (text.id === item.metadata?.focalHeadingId && item.metadata?.focalIconId) continue;
                        const textCenter = text.box.x + text.box.width / 2;
                        if (text.style?.align !== 'center' || Math.abs(textCenter - containerCenter) > tolerance) {
                            errors.push(`${location}: focal text ${text.id} must use center alignment and share the horizontal centerline of ${item.id}.`);
                        }
                    }
                    if (item.metadata?.focalIconId || item.metadata?.focalHeadingId) {
                        const icon = slide.elements.find((candidate) => candidate.id === item.metadata?.focalIconId && candidate.group === item.group);
                        const heading = slide.elements.find((candidate) => candidate.id === item.metadata?.focalHeadingId && candidate.type === 'text' && candidate.group === item.group);
                        if (!icon || !heading) {
                            errors.push(`${location}: centered focal container ${item.id} requires valid focalIconId and focalHeadingId elements in group ${item.group}.`);
                        } else {
                            const unionLeft = Math.min(icon.box.x, heading.box.x);
                            const unionRight = Math.max(icon.box.x + icon.box.width, heading.box.x + heading.box.width);
                            if (Math.abs((unionLeft + unionRight) / 2 - containerCenter) > tolerance) {
                                errors.push(`${location}: focal icon ${icon.id} and heading ${heading.id} must form a group centered on ${item.id}.`);
                            }
                        }
                    }
                }
            }

            if (item.type === 'text' && item.style?.fontSize && item.style.fontSize < designContract.diagramQuality.minimumEffectiveFontSize) {
                errors.push(`${location}: text ${item.id} is below the ${designContract.diagramQuality.minimumEffectiveFontSize}px minimum.`);
            }

            if (item.type === 'diagram') {
                try {
                    const diagramPath = resolveDiagramPath(item.diagramPath);
                    await access(diagramPath);
                    const diagram = await loadDiagram(diagramPath);
                    if (diagram.theme !== resolvedTheme) {
                        errors.push(`${location}: diagram ${item.id} theme ${diagram.theme} does not match resolved slide theme ${resolvedTheme}.`);
                    }
                    const diagramResult = await validateDiagram(diagram);
                    errors.push(...diagramResult.errors.map((error) => `${location}: diagram ${item.id}: ${error}`));
                    warnings.push(...diagramResult.warnings.map((warning) => `${location}: diagram ${item.id}: ${warning}`));
                } catch (error) {
                    errors.push(`${location}: diagram ${item.id} could not be loaded: ${error.message}`);
                }
                continue;
            }

            if (item.type !== 'image') continue;
            const absoluteAssetPath = path.resolve(kitRoot, item.path);
            if (!absoluteAssetPath.startsWith(`${assetsRoot}${path.sep}`)) {
                errors.push(`${location}: asset escapes assets/: ${item.path}`);
                continue;
            }
            try {
                await access(absoluteAssetPath);
            } catch {
                errors.push(`${location}: asset does not exist: ${item.path}`);
            }
            if (!['.svg', '.png', '.jpg', '.jpeg'].includes(path.extname(absoluteAssetPath).toLowerCase())) {
                errors.push(`${location}: unsupported asset format; use SVG, PNG, or JPEG: ${item.path}`);
            }
            if (item.assetKind === 'fluent' && !fluentCatalogPaths.has(item.path)) {
                errors.push(`${location}: Fluent asset is not an exact local catalog entry: ${item.path}. Resolve it with npm run assets:search.`);
            }
            if (item.assetKind === 'azure' && !azureCatalogPaths.has(item.path)) {
                errors.push(`${location}: Azure asset is not an exact local catalog entry: ${item.path}. Resolve it with npm run assets:search.`);
            }
            if (item.assetKind === 'external' && !externalCatalogPaths.has(item.path)) {
                errors.push(`${location}: external asset is not an exact approved external catalog entry: ${item.path}. Add it under assets/external-icons with source and license metadata.`);
            }
            if (['fluent', 'azure'].includes(item.assetKind) && item.provenance !== 'local-catalog') {
                errors.push(`${location}: ${item.assetKind} assets must use local-catalog provenance: ${item.path}`);
            }
            if (item.assetKind === 'external' && item.provenance !== 'external-catalog') {
                errors.push(`${location}: external assets must use external-catalog provenance: ${item.path}`);
            }
            if (item.provenance === 'local-catalog' && !['fluent', 'azure'].includes(item.assetKind)) {
                errors.push(`${location}: local-catalog provenance is reserved for Fluent and Azure catalog assets: ${item.path}`);
            }
            if (item.provenance === 'external-catalog' && item.assetKind !== 'external') {
                errors.push(`${location}: external-catalog provenance is reserved for approved external assets: ${item.path}`);
            }
            if (item.assetKind !== 'fluent' && !item.alt.trim()) {
                errors.push(`${location}: ${item.assetKind} assets require useful alt text: ${item.path}`);
            }
            if (item.assetKind === 'azure') {
                const hasGroupedLabel = item.group && slide.elements.some((candidate) => candidate.type === 'text' && candidate.group === item.group);
                if (!hasGroupedLabel) warnings.push(`${location}: Azure asset ${item.id} should share a logical group with its visible label.`);
            }
            if (item.assetKind === 'azure' && !brandProfile.assetPolicy.allowProductIcons) {
                errors.push(`${location}: brand profile ${brandProfile.id} does not allow Microsoft product icons.`);
            }
            if (item.assetKind === 'external' && !brandProfile.assetPolicy.allowProductIcons) {
                errors.push(`${location}: brand profile ${brandProfile.id} does not allow external product icons.`);
            }
            if (item.provenance === 'ai-generated') {
                if (item.assetKind !== 'image') {
                    errors.push(`${location}: AI-generated assets must use kind "image"; icons and product artwork cannot be generated.`);
                }
                if (!item.path.startsWith('assets/generated/')) {
                    errors.push(`${location}: AI-generated assets must remain under assets/generated/: ${item.path}`);
                }
                const fallback = item.metadata?.assetFallback;
                if (!Array.isArray(fallback?.searchQueries) || fallback.searchQueries.length === 0 || !fallback?.reason?.trim()) {
                    errors.push(`${location}: AI-generated fallback ${item.id} must record metadata.assetFallback.searchQueries and reason after catalog search.`);
                }
            }
        }

        const boundaries = slide.elements.filter((item) => item.type === 'shape' && item.role === 'boundary');
        const connectors = slide.elements.filter((item) => item.type === 'line' && item.role === 'connector');
        const inside = (point, box) => point.x >= box.x && point.x <= box.x + box.width
            && point.y >= box.y && point.y <= box.y + box.height;
        for (const boundary of boundaries) {
            for (const connector of connectors) {
                const midpoint = {
                    x: (connector.start.x + connector.end.x) / 2,
                    y: (connector.start.y + connector.end.y) / 2,
                };
                if ([connector.start, midpoint, connector.end].some((point) => inside(point, boundary.box)) && boundary.z >= connector.z) {
                    errors.push(`${location}: boundary ${boundary.id} at z ${boundary.z} can obscure connector ${connector.id} at z ${connector.z}; boundaries must render behind connectors.`);
                }
            }
        }
    }

    return { errors, warnings };
};

const inspectPage = async (page, diagramQuality) => {
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate((quality) => {
        const slide = document.querySelector('.scene-slide, .slide');
        const slideBounds = slide.getBoundingClientRect();
        const tolerance = 1;
        const outside = [];
        const clippedText = [];
        const sharpSceneCorners = [...document.querySelectorAll('.scene-shape[data-scene-element]:not([data-scene-element="background"])')]
            .filter((element) => Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) < quality.minimumCornerRadius)
            .map((element) => element.getAttribute('data-scene-element'));
        const overlapCandidates = [...document.querySelectorAll('[data-scene-element]')]
            .filter((element) => !['background', 'footer-confidentiality'].includes(element.getAttribute('data-scene-element')))
            .filter((element) => !element.classList.contains('scene-line'))
            .filter((element) => !element.classList.contains('role-decorative'));
        const groupedBounds = new Map();
        for (const element of overlapCandidates) {
            const id = element.getAttribute('data-scene-element');
            const group = element.getAttribute('data-scene-group') || id;
            const rect = element.getBoundingClientRect();
            const current = groupedBounds.get(group);
            groupedBounds.set(group, current ? {
                left: Math.min(current.left, rect.left),
                top: Math.min(current.top, rect.top),
                right: Math.max(current.right, rect.right),
                bottom: Math.max(current.bottom, rect.bottom),
            } : { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
        }
        const itemBounds = [...groupedBounds].map(([label, rect]) => ({ label, rect }));
        const shapeBounds = [...document.querySelectorAll('.scene-shape[data-scene-element]:not([data-scene-element="background"])')]
            .map((element) => ({
                id: element.getAttribute('data-scene-element'),
                group: element.getAttribute('data-scene-group'),
                rect: element.getBoundingClientRect(),
            }));
        const contentPaddingViolations = [];
        for (const element of document.querySelectorAll('.scene-text[data-scene-element], .scene-image[data-scene-element]')) {
            const group = element.getAttribute('data-scene-group');
            if (!group) continue;
            let rect = element.getBoundingClientRect();
            if (element.classList.contains('scene-text') && element.firstChild) {
                const range = document.createRange();
                range.selectNodeContents(element);
                const contentRect = range.getBoundingClientRect();
                if (contentRect.width > 0 && contentRect.height > 0) rect = contentRect;
            }
            const container = shapeBounds
                .filter((shape) => shape.group === group
                    && rect.left >= shape.rect.left - tolerance
                    && rect.top >= shape.rect.top - tolerance
                    && rect.right <= shape.rect.right + tolerance
                    && rect.bottom <= shape.rect.bottom + tolerance)
                .sort((left, right) => left.rect.width * left.rect.height - right.rect.width * right.rect.height)[0];
            if (!container) continue;
            const padding = {
                left: rect.left - container.rect.left,
                top: rect.top - container.rect.top,
                right: container.rect.right - rect.right,
                bottom: container.rect.bottom - rect.bottom,
            };
            const minimum = Math.min(...Object.values(padding));
            if (minimum + tolerance < quality.minimumRenderedContentPadding) {
                contentPaddingViolations.push({
                    id: element.getAttribute('data-scene-element'),
                    container: container.id,
                    minimum,
                });
            }
        }

        for (const element of document.querySelectorAll('.scene-text, h1, h2, p, .caption, .eyebrow, .stat')) {
            const style = getComputedStyle(element);
            const clipsHorizontally = ['auto', 'clip', 'hidden', 'scroll'].includes(style.overflowX);
            const clipsVertically = ['auto', 'clip', 'hidden', 'scroll'].includes(style.overflowY);
            if (
                (clipsHorizontally && element.scrollWidth > element.clientWidth + tolerance) ||
                (clipsVertically && element.scrollHeight > element.clientHeight + tolerance)
            ) {
                clippedText.push(element.textContent.trim().slice(0, 80));
            }
        }

        for (const element of document.querySelectorAll('[data-scene-element]')) {
            const rect = element.getBoundingClientRect();
            if (
                rect.left < slideBounds.left - tolerance ||
                rect.top < slideBounds.top - tolerance ||
                rect.right > slideBounds.right + tolerance ||
                rect.bottom > slideBounds.bottom + tolerance
            ) {
                outside.push(element.getAttribute('data-scene-element'));
            }
        }

        const overlaps = [];
        for (let leftIndex = 0; leftIndex < itemBounds.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < itemBounds.length; rightIndex += 1) {
                const left = itemBounds[leftIndex];
                const right = itemBounds[rightIndex];
                const width = Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left);
                const height = Math.min(left.rect.bottom, right.rect.bottom) - Math.max(left.rect.top, right.rect.top);
                if (width > tolerance && height > tolerance) overlaps.push(`${left.label} / ${right.label}`);
            }
        }

        const diagrams = [...document.querySelectorAll('svg[data-diagram-type]')].map((svg) => {
            const svgBounds = svg.getBoundingClientRect();
            const viewBox = svg.viewBox.baseVal;
            const scale = Math.min(svgBounds.width / viewBox.width, svgBounds.height / viewBox.height);
            const readableSelector = '.node-label, .node-description, .lane-label, .group-label';
            const readableText = [...svg.querySelectorAll(readableSelector)].map((element) => {
                const rect = element.getBoundingClientRect();
                const container = element.closest('.diagram-node, .diagram-lane, .diagram-group');
                const shape = container?.querySelector(':scope > rect, :scope > polygon, :scope > path');
                const shapeBounds = shape?.getBoundingClientRect();
                return {
                    text: element.textContent.trim(),
                    effectiveFontSize: Number.parseFloat(getComputedStyle(element).fontSize) * scale,
                    outsideViewport: rect.left < svgBounds.left - tolerance || rect.top < svgBounds.top - tolerance || rect.right > svgBounds.right + tolerance || rect.bottom > svgBounds.bottom + tolerance,
                    outsideContainer: Boolean(shapeBounds) && (rect.left < shapeBounds.left - tolerance || rect.top < shapeBounds.top - tolerance || rect.right > shapeBounds.right + tolerance || rect.bottom > shapeBounds.bottom + tolerance),
                };
            });
            const diagramItems = [...svg.querySelectorAll('[data-diagram-node]')]
                .map((element) => ({
                    id: element.getAttribute('data-diagram-node'),
                    rect: element.getBoundingClientRect(),
                }));
            const itemCollisions = [];
            for (let leftIndex = 0; leftIndex < diagramItems.length; leftIndex += 1) {
                for (let rightIndex = leftIndex + 1; rightIndex < diagramItems.length; rightIndex += 1) {
                    const left = diagramItems[leftIndex];
                    const right = diagramItems[rightIndex];
                    const width = Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left);
                    const height = Math.min(left.rect.bottom, right.rect.bottom) - Math.max(left.rect.top, right.rect.top);
                    if (width > tolerance && height > tolerance) itemCollisions.push(`${left.id} / ${right.id}`);
                }
            }
            const nodeShapeBounds = [...svg.querySelectorAll('[data-diagram-node]')].map((element) => ({
                id: element.getAttribute('data-diagram-node'),
                rect: element.querySelector(':scope > .node-shape').getBoundingClientRect(),
            }));
            const edgeLabelBounds = [...svg.querySelectorAll('[data-diagram-edge-label]')].map((element) => ({
                id: element.getAttribute('data-diagram-edge-label'),
                rect: element.querySelector(':scope > rect').getBoundingClientRect(),
            }));
            const edgeLabelNodeCollisions = [];
            for (const label of edgeLabelBounds) {
                for (const node of nodeShapeBounds) {
                    const width = Math.min(label.rect.right, node.rect.right) - Math.max(label.rect.left, node.rect.left);
                    const height = Math.min(label.rect.bottom, node.rect.bottom) - Math.max(label.rect.top, node.rect.top);
                    if (width > tolerance && height > tolerance) edgeLabelNodeCollisions.push(`${label.id} / ${node.id}`);
                }
            }
            const nodeContentSpacingViolations = [];
            for (const node of svg.querySelectorAll('[data-diagram-node]')) {
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
                        if (verticalGap + 0.05 < quality.minimumNodeContentGap) {
                            nodeContentSpacingViolations.push({
                                id: node.getAttribute('data-diagram-node'),
                                parts: `${left.role} / ${right.role}`,
                                gap: verticalGap,
                            });
                        }
                    }
                }
            }
            const sharpCornerRectangles = [...svg.querySelectorAll('rect:not([data-canvas-background])')]
                .filter((element) => element.rx.baseVal.value < quality.minimumCornerRadius)
                .map((element) => element.getAttribute('class') ?? element.closest('[data-diagram-node]')?.getAttribute('data-diagram-node') ?? 'unnamed rectangle');

            const parseSegments = (pathElement) => {
                const values = [...pathElement.getAttribute('d').matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)]
                    .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
                return values.slice(1).map((point, index) => ({ start: values[index], end: point }));
            };
            const edgePaths = [...svg.querySelectorAll('[data-diagram-edge]')].map((element) => ({
                id: element.getAttribute('data-diagram-edge'),
                source: element.getAttribute('data-edge-source'),
                target: element.getAttribute('data-edge-target'),
                segments: parseSegments(element.querySelector('path')),
            }));
            const crossings = [];
            for (let leftIndex = 0; leftIndex < edgePaths.length; leftIndex += 1) {
                for (let rightIndex = leftIndex + 1; rightIndex < edgePaths.length; rightIndex += 1) {
                    const left = edgePaths[leftIndex];
                    const right = edgePaths[rightIndex];
                    if ([left.source, left.target].some((id) => id === right.source || id === right.target)) continue;
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
                type: svg.getAttribute('data-diagram-type'),
                viewBox: { width: viewBox.width, height: viewBox.height },
                scale,
                undersizedText: readableText.filter((text) => text.effectiveFontSize < quality.minimumEffectiveFontSize - 0.05),
                outsideText: readableText.filter((text) => text.outsideViewport),
                uncontainedText: readableText.filter((text) => text.outsideContainer),
                nodeContentSpacingViolations,
                sharpCornerRectangles,
                itemCollisions,
                edgeLabelNodeCollisions,
                crossings,
            };
        });

        return {
            documentOverflow: document.documentElement.scrollWidth > 1920 || document.documentElement.scrollHeight > 1080,
            outside,
            clippedText,
            sharpSceneCorners,
            overlaps,
            contentPaddingViolations,
            diagrams,
        };
    }, diagramQuality);

    const brokenImages = await page.locator('img').evaluateAll((images) =>
        images.filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.getAttribute('src')),
    );
    await page.addScriptTag({ content: axe.source });
    const accessibility = await page.evaluate(async () =>
        window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        }),
    );
    const accessibilityViolations = accessibility.violations
        .filter((violation) => ['critical', 'serious'].includes(violation.impact))
        .map((violation) => ({ id: violation.id, impact: violation.impact, help: violation.help }));

    return { geometry, brokenImages, accessibilityViolations };
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

const main = async () => {
    const options = parseArguments(process.argv.slice(2));
    const deck = JSON.parse(await readFile(options.input, 'utf8'));
    const designContract = JSON.parse(await readFile(path.join(kitRoot, 'design', 'design-contract.json'), 'utf8'));
    const report = {
        deck: options.input,
        output: options.output,
        errors: [],
        warnings: [],
        slides: [],
    };

    const contract = await validateDeckContract(deck);
    report.errors.push(...contract.errors);
    report.warnings.push(...contract.warnings);
    if (report.errors.length > 0) {
        console.error(report.errors.join('\n'));
        process.exitCode = 1;
        return;
    }

    await mkdir(options.output, { recursive: true });
    await execFileAsync(process.execPath, [path.join(kitRoot, 'tools', 'render-deck.mjs'), options.input, '--output', options.output]);
    const renderManifest = JSON.parse(await readFile(path.join(options.output, 'deck-manifest.json'), 'utf8'));
    const screenshotDirectory = path.join(options.output, 'screenshots');
    if (options.screenshots) await mkdir(screenshotDirectory, { recursive: true });

    const browser = await launchBrowser(options.browser, report.warnings);
    try {
        const context = await browser.newContext({
            viewport: designContract.canonicalCanvas,
            deviceScaleFactor: designContract.rasterQuality.deviceScaleFactor,
        });
        const page = await context.newPage();

        for (const slide of renderManifest.slides) {
            const htmlPath = path.join(options.output, slide.file);
            await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
            const inspection = await inspectPage(page, {
                ...designContract.diagramQuality,
                minimumRenderedContentPadding: designContract.layoutQuality.minimumRenderedContentPadding,
            });
            const slideErrors = [];
            if (inspection.geometry.documentOverflow) slideErrors.push('Document exceeds the 1920x1080 canvas.');
            if (inspection.geometry.outside.length) slideErrors.push(`Items outside slide: ${inspection.geometry.outside.join(', ')}`);
            if (inspection.geometry.clippedText.length) slideErrors.push(`Clipped text: ${inspection.geometry.clippedText.join(' | ')}`);
            if (inspection.geometry.sharpSceneCorners.length) slideErrors.push(`Scene shapes below the ${designContract.diagramQuality.minimumCornerRadius}px corner radius: ${inspection.geometry.sharpSceneCorners.join(', ')}`);
            if (inspection.geometry.overlaps.length) slideErrors.push(`Overlapping elements: ${inspection.geometry.overlaps.join(', ')}`);
            if (inspection.geometry.contentPaddingViolations.length) {
                slideErrors.push(`Rendered content padding below ${designContract.layoutQuality.minimumRenderedContentPadding}px: ${inspection.geometry.contentPaddingViolations.map((item) => `${item.id} in ${item.container} (${item.minimum.toFixed(1)}px)`).join(', ')}`);
            }
            for (const diagram of inspection.geometry.diagrams) {
                if (diagram.viewBox.width !== designContract.diagramQuality.canvas.width || diagram.viewBox.height !== designContract.diagramQuality.canvas.height) {
                    slideErrors.push(`Embedded diagram must use a fixed ${designContract.diagramQuality.canvas.width}x${designContract.diagramQuality.canvas.height} viewBox.`);
                }
                if (diagram.undersizedText.length) slideErrors.push(`Diagram text below ${designContract.diagramQuality.minimumEffectiveFontSize}px effective size: ${diagram.undersizedText.map((text) => `${text.text} (${text.effectiveFontSize.toFixed(1)}px)`).join(', ')}`);
                if (diagram.outsideText.length) slideErrors.push(`Diagram text outside viewport: ${diagram.outsideText.map((text) => text.text).join(', ')}`);
                if (diagram.uncontainedText.length) slideErrors.push(`Diagram text outside its container: ${diagram.uncontainedText.map((text) => text.text).join(', ')}`);
                if (diagram.nodeContentSpacingViolations.length) slideErrors.push(`Flow-node content overlaps or is too tightly spaced: ${diagram.nodeContentSpacingViolations.map((violation) => `${violation.id}: ${violation.parts} (${violation.gap.toFixed(1)}px)`).join(', ')}`);
                if (diagram.sharpCornerRectangles.length) slideErrors.push(`Diagram rectangles below the ${designContract.diagramQuality.minimumCornerRadius}px corner radius: ${diagram.sharpCornerRectangles.join(', ')}`);
                if (diagram.itemCollisions.length) slideErrors.push(`Overlapping diagram items: ${diagram.itemCollisions.join(', ')}`);
                if (diagram.edgeLabelNodeCollisions.length) slideErrors.push(`Diagram edge labels overlap nodes: ${diagram.edgeLabelNodeCollisions.join(', ')}`);
                if (diagram.crossings.length) slideErrors.push(`Crossing diagram connectors: ${diagram.crossings.join(', ')}`);
            }
            if (inspection.brokenImages.length) slideErrors.push(`Broken images: ${inspection.brokenImages.join(', ')}`);
            if (inspection.accessibilityViolations.length) {
                slideErrors.push(
                    `Accessibility: ${inspection.accessibilityViolations.map((violation) => `${violation.id} (${violation.impact})`).join(', ')}`,
                );
            }

            const screenshot = options.screenshots ? path.join(screenshotDirectory, slide.file.replace(/\.html$/, '.png')) : undefined;
            let screenshotDimensions;
            if (screenshot) {
                await page.screenshot({ path: screenshot, fullPage: false, scale: 'device' });
                screenshotDimensions = pngDimensions(await readFile(screenshot));
                const expected = designContract.rasterQuality.htmlScreenshot;
                if (screenshotDimensions.width !== expected.width || screenshotDimensions.height !== expected.height) {
                    slideErrors.push(`Screenshot is ${screenshotDimensions.width}x${screenshotDimensions.height}; expected ${expected.width}x${expected.height}.`);
                }
            }
            report.slides.push({ ...slide, screenshot, screenshotDimensions, inspection, errors: slideErrors });
            report.errors.push(...slideErrors.map((error) => `${slide.file}: ${error}`));
        }

        await context.close();
    } finally {
        await browser.close();
    }

    report.passed = report.errors.length === 0;
    await writeFile(path.join(options.output, 'validation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${report.passed ? 'PASS' : 'FAIL'}: ${report.slides.length} slides checked; ${report.errors.length} errors; ${report.warnings.length} warnings.`);
    if (!report.passed) {
        console.error(report.errors.join('\n'));
        process.exitCode = 1;
    }
};

main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
});