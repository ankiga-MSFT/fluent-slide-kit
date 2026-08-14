import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { loadDiagram, resolveDiagramPath } from './diagram-core.mjs';
import { compileDeckScene, kitRoot } from './scene-core.mjs';

const execFileAsync = promisify(execFile);

const parseArguments = (arguments_) => {
    const options = { input: undefined, deck: undefined, output: undefined, preview: false, requirePreview: false };
    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index];
        if (argument === '--deck') options.deck = path.resolve(arguments_[index += 1]);
        else if (argument === '--output') options.output = path.resolve(arguments_[index += 1]);
        else if (argument === '--preview') options.preview = true;
        else if (argument === '--require-preview') {
            options.preview = true;
            options.requirePreview = true;
        }
        else if (!options.input) options.input = path.resolve(argument);
        else throw new Error(`Unexpected argument: ${argument}`);
    }
    if (!options.input) throw new Error('Usage: npm run deck:validate:pptx -- <file.pptx> [--deck <deck.json>] [--require-preview]');
    options.output ??= path.join(kitRoot, '.slide-artifacts', 'validation-pptx', path.basename(options.input, '.pptx'));
    return options;
};

const pngDimensions = (buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });

const validateStructure = async (options, report) => {
    const { stdout } = await execFileAsync('pwsh', [
        '-NoProfile',
        '-File', path.join(kitRoot, 'tools', 'inspect-pptx.ps1'),
        options.input,
    ], { cwd: kitRoot });
    const inspection = JSON.parse(stdout.trim());
    if (!inspection.slides.length) report.errors.push('PPTX contains no presentation slides.');
    let expectedScene;
    if (options.deck) {
        const deck = JSON.parse(await readFile(options.deck, 'utf8'));
        expectedScene = await compileDeckScene(deck, { source: path.relative(kitRoot, options.deck).split(path.sep).join('/') });
        if (inspection.slides.length !== expectedScene.slides.length) {
            report.errors.push(`PPTX has ${inspection.slides.length} slides; expected ${expectedScene.slides.length}.`);
        }
    }

    for (const [index, slideInspection] of inspection.slides.entries()) {
        if (!report.quality.allowScreenshotOnlySlides && slideInspection.screenshotOnly) report.errors.push(`Slide ${index + 1} is a screenshot-only slide.`);
        if (!slideInspection.namedObjects.length) report.errors.push(`Slide ${index + 1} has no stable Fluent Slide Kit object names.`);
        const expectedSlide = expectedScene?.slides[index];
        if (expectedSlide && !slideInspection.namedObjects.some((name) => name.startsWith(`fluent-slide-kit:${expectedSlide.id}:`))) {
            report.errors.push(`Slide ${index + 1} is missing scene identity for ${expectedSlide.id}.`);
        }
        if (expectedSlide && report.quality.requireSceneElementCoverage) {
            const missingElements = expectedSlide.elements.filter((element) => {
                const expectedName = `fluent-slide-kit:${expectedSlide.id}:${element.id}`;
                if (slideInspection.namedObjects.includes(expectedName)) return false;
                return element.type !== 'diagram' || !slideInspection.namedObjects.some((name) => name.startsWith(`${expectedName}-`));
            });
            if (missingElements.length) {
                report.errors.push(`Slide ${index + 1} is missing Office objects for scene elements: ${missingElements.map((element) => element.id).join(', ')}.`);
            }
        }
        if (expectedSlide && report.quality.requireRoundedContainers) {
            const presets = new Map(slideInspection.shapeGeometries.map((shape) => [shape.name, shape.preset]));
            const requirePreset = (name, allowed) => {
                const preset = presets.get(name);
                if (!allowed.includes(preset)) report.errors.push(`Slide ${index + 1} container ${name} uses ${preset || 'no geometry'}; expected ${allowed.join(' or ')}.`);
            };
            for (const element of expectedSlide.elements.filter((element) => element.type === 'shape' && element.id !== 'background')) {
                requirePreset(`fluent-slide-kit:${expectedSlide.id}:${element.id}`, [element.shape === 'ellipse' ? 'ellipse' : 'roundRect']);
            }
            for (const element of expectedSlide.elements.filter((element) => element.type === 'diagram')) {
                const diagram = await loadDiagram(resolveDiagramPath(element.diagramPath));
                if (diagram.diagramType !== 'layered-architecture') continue;
                const prefix = `fluent-slide-kit:${expectedSlide.id}:diagram-`;
                for (const column of diagram.columns) requirePreset(`${prefix}column-${column.id}`, ['roundRect']);
                for (const layer of diagram.layers) {
                    requirePreset(`${prefix}layer-${layer.id}-band`, ['roundRect']);
                    requirePreset(`${prefix}layer-${layer.id}-surface`, ['roundRect']);
                    requirePreset(`${prefix}layer-${layer.id}-number`, ['ellipse']);
                    for (const component of layer.components) requirePreset(`${prefix}component-${component.id}`, ['roundRect']);
                }
                if (diagram.crossCuttingConcerns?.length) {
                    requirePreset(`${prefix}concern-rail`, ['roundRect']);
                    for (const concern of diagram.crossCuttingConcerns) requirePreset(`${prefix}concern-${concern.id}`, ['roundRect']);
                }
            }
        }
        report.slides.push({
            number: index + 1,
            id: expectedSlide?.id,
            shapes: slideInspection.shapes,
            pictures: slideInspection.pictures,
            namedObjects: slideInspection.namedObjects.length,
            screenshotOnly: slideInspection.screenshotOnly,
        });
    }
    if (report.quality.requireSpeakerNotes && inspection.notes.length < inspection.slides.length) report.errors.push(`PPTX has notes for ${inspection.notes.length} of ${inspection.slides.length} slides.`);
    for (const note of inspection.notes) {
        if (report.quality.requireSpeakerNotes && !note.hasTakeaway) report.errors.push(`Notes for slide ${note.number} do not contain the slide takeaway.`);
    }
};

const inspectPreviewPixels = async (imagePaths) => {
    let browser;
    try {
        try {
            browser = await chromium.launch({ channel: 'msedge', headless: true });
        } catch {
            browser = await chromium.launch({ headless: true });
        }
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        const inspections = [];
        for (const imagePath of imagePaths) {
            await page.goto(pathToFileURL(imagePath).href, { waitUntil: 'load' });
            const inspection = await page.evaluate(() => {
                const image = document.querySelector('img');
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                context.drawImage(image, 0, 0);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                let sampled = 0;
                let nonWhite = 0;
                const colors = new Set();
                for (let y = 0; y < canvas.height; y += 12) {
                    for (let x = 0; x < canvas.width; x += 12) {
                        const index = (y * canvas.width + x) * 4;
                        const red = pixels[index];
                        const green = pixels[index + 1];
                        const blue = pixels[index + 2];
                        sampled += 1;
                        if (red < 248 || green < 248 || blue < 248) nonWhite += 1;
                        colors.add(`${Math.round(red / 16)},${Math.round(green / 16)},${Math.round(blue / 16)}`);
                    }
                }
                return { nonWhiteRatio: nonWhite / sampled, sampledColors: colors.size };
            });
            inspections.push({ image: imagePath, ...inspection });
        }
        return inspections;
    } finally {
        await browser?.close();
    }
};

const renderPreview = async (options, report) => {
    const previewDirectory = path.join(options.output, 'previews');
    await mkdir(previewDirectory, { recursive: true });
    try {
        const { stdout } = await execFileAsync('pwsh', [
            '-NoProfile',
            '-File', path.join(kitRoot, 'tools', 'render-pptx-preview.ps1'),
            options.input,
            '-OutputDirectory', previewDirectory,
        ], { cwd: kitRoot });
        const preview = JSON.parse(stdout);
        report.preview = preview;
        if (preview.slides !== report.slides.length) report.errors.push(`PowerPoint rendered ${preview.slides} of ${report.slides.length} slides.`);
        for (const imagePath of preview.images) {
            const dimensions = pngDimensions(await readFile(imagePath));
            if (dimensions.width !== report.quality.canvas.width || dimensions.height !== report.quality.canvas.height) {
                report.errors.push(`${path.basename(imagePath)} is ${dimensions.width}x${dimensions.height}; expected ${report.quality.canvas.width}x${report.quality.canvas.height}.`);
            }
        }
        report.preview.inspections = await inspectPreviewPixels(preview.images);
        for (const inspection of report.preview.inspections) {
            if (inspection.nonWhiteRatio < report.quality.minimumPreviewNonWhiteRatio || inspection.sampledColors < report.quality.minimumPreviewSampledColors) {
                report.errors.push(`${path.basename(inspection.image)} appears blank or visually empty (${(inspection.nonWhiteRatio * 100).toFixed(2)}% non-white, ${inspection.sampledColors} sampled colors).`);
            }
        }
    } catch (error) {
        const message = `Desktop PowerPoint preview unavailable: ${error.stderr || error.message}`.trim();
        if (options.requirePreview) report.errors.push(message);
        else report.warnings.push(message);
    }
};

const main = async () => {
    const options = parseArguments(process.argv.slice(2));
    const designContract = JSON.parse(await readFile(path.join(kitRoot, 'design', 'design-contract.json'), 'utf8'));
    const report = { input: options.input, deck: options.deck, output: options.output, quality: designContract.powerPointQuality, errors: [], warnings: [], slides: [] };
    await mkdir(options.output, { recursive: true });
    await validateStructure(options, report);
    if (options.preview) await renderPreview(options, report);
    report.passed = report.errors.length === 0;
    await writeFile(path.join(options.output, 'validation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${report.passed ? 'PASS' : 'FAIL'}: ${report.slides.length} native slides checked; ${report.errors.length} errors; ${report.warnings.length} warnings.`);
    if (!report.passed) {
        console.error(report.errors.join('\n'));
        process.exitCode = 1;
    }
};

main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
});