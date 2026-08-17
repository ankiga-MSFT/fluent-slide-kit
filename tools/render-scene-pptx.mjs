import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import PptxGenJS from 'pptxgenjs';
import { renderDiagramFile, resolveDiagramPath } from './diagram-core.mjs';
import { kitRoot } from './composition-core.mjs';

const assetsRoot = path.join(kitRoot, 'assets');
const rasterQualityPromise = readFile(path.join(kitRoot, 'design', 'design-contract.json'), 'utf8')
    .then((source) => JSON.parse(source).rasterQuality);
const PX_PER_INCH = 144;
const PX_PER_POINT = 2;
const DEFAULT_CORNER_RADIUS = 8;

const inches = (value) => value / PX_PER_INCH;
const points = (value) => value / PX_PER_POINT;
const color = (value = '#000000') => String(value).replace('#', '').toUpperCase();
const objectName = (slide, element) => `fluent-slide-kit:${slide.id}:${element.id}`;

const position = (elementBox) => ({
    x: inches(elementBox.x),
    y: inches(elementBox.y),
    w: inches(elementBox.width),
    h: inches(elementBox.height),
});

const resolveAsset = (assetPath) => {
    const absolutePath = path.resolve(kitRoot, assetPath);
    if (!absolutePath.startsWith(`${assetsRoot}${path.sep}`)) {
        throw new Error(`Asset path must remain under assets/: ${assetPath}`);
    }
    return absolutePath;
};

const svgData = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const pngDimensions = (buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });

const rasterizeSvg = async (svg) => {
    let browser;
    try {
        const quality = await rasterQualityPromise;
        const target = quality.powerPointDiagramFallback;
        try {
            browser = await chromium.launch({ channel: 'msedge', headless: true });
        } catch {
            browser = await chromium.launch({ headless: true });
        }
        const page = await browser.newPage({
            viewport: {
                width: target.width / quality.deviceScaleFactor,
                height: target.height / quality.deviceScaleFactor,
            },
            deviceScaleFactor: quality.deviceScaleFactor,
        });
        await page.setContent(`<style>html,body{margin:0;width:1600px;height:720px;overflow:hidden}svg{display:block;width:1600px;height:720px}</style>${svg}`, { waitUntil: 'load' });
        const png = await page.locator('svg').screenshot({ type: 'png', scale: 'device' });
        const dimensions = pngDimensions(png);
        if (dimensions.width !== target.width || dimensions.height !== target.height) {
            throw new Error(`PowerPoint diagram fallback is ${dimensions.width}x${dimensions.height}; expected ${target.width}x${target.height}.`);
        }
        return `data:image/png;base64,${png.toString('base64')}`;
    } finally {
        await browser?.close();
    }
};

const addText = (pptxSlide, sceneSlide, element) => {
    const style = element.style ?? {};
    const requestedFace = style.fontFace ?? 'Segoe UI';
    const fontFace = (style.fontWeight ?? 400) === 600 && requestedFace === 'Segoe UI'
        ? 'Segoe UI Semibold'
        : requestedFace;
    pptxSlide.addText(element.text, {
        ...position(element.box),
        objectName: objectName(sceneSlide, element),
        fontFace,
        fontSize: points(style.fontSize ?? 24),
        bold: (style.fontWeight ?? 400) >= 700,
        italic: style.italic ?? false,
        color: color(style.color ?? '#242424'),
        transparency: style.opacity === undefined ? undefined : Math.round((1 - style.opacity) * 100),
        align: style.align ?? 'left',
        valign: style.verticalAlign ?? 'top',
        margin: 0,
        breakLine: false,
        fit: 'none',
        ...(style.lineSpacing ? { lineSpacing: style.lineSpacing } : { lineSpacingMultiple: style.lineHeight ?? 1.25 }),
        hyperlink: style.hyperlink ? { url: style.hyperlink } : undefined,
        rotate: style.rotation,
        isTextBox: true,
    });
};

const shapeName = (pptx, element) => {
    if (element.shape === 'rect') return pptx.ShapeType.rect;
    if (element.shape === 'ellipse') return pptx.ShapeType.ellipse;
    return pptx.ShapeType.roundRect;
};

const addShape = (pptx, pptxSlide, sceneSlide, element) => {
    const style = element.style ?? {};
    const lineWidth = style.strokeWidth ?? 0;
    const shape = shapeName(pptx, element);
    pptxSlide.addShape(shape, {
        ...position(element.box),
        objectName: objectName(sceneSlide, element),
        fill: style.fill && style.fill !== 'transparent'
            ? { color: color(style.fill), transparency: style.opacity === undefined ? 0 : Math.round((1 - style.opacity) * 100) }
            : { color: 'FFFFFF', transparency: 100 },
        line: lineWidth > 0
            ? { color: color(style.stroke ?? '#000000'), width: lineWidth, transparency: style.opacity === undefined ? 0 : Math.round((1 - style.opacity) * 100) }
            : { color: 'FFFFFF', transparency: 100, width: 0 },
        rectRadius: shape === pptx.ShapeType.roundRect
            ? inches(Math.max(DEFAULT_CORNER_RADIUS, style.radius ?? 0))
            : undefined,
        rotate: style.rotation,
    });
    if (style.accentTop) {
        pptxSlide.addShape(pptx.ShapeType.line, {
            x: inches(element.box.x),
            y: inches(element.box.y + style.accentTop.width / 2),
            w: inches(element.box.width),
            h: 0,
            objectName: `${objectName(sceneSlide, element)}:accent`,
            line: { color: color(style.accentTop.color), width: style.accentTop.width },
        });
    }
};

const addLine = (pptx, pptxSlide, sceneSlide, element) => {
    const style = element.style ?? {};
    const start = element.start ?? { x: element.box.x, y: element.box.y + element.box.height / 2 };
    const authoredEnd = element.end ?? { x: element.box.x + element.box.width, y: element.box.y + element.box.height / 2 };
    const distance = Math.hypot(authoredEnd.x - start.x, authoredEnd.y - start.y);
    const inset = style.endArrow ? Math.min(style.endInset ?? 0, Math.max(0, distance - 1)) : 0;
    const end = distance > 0 ? {
        x: authoredEnd.x - ((authoredEnd.x - start.x) / distance) * inset,
        y: authoredEnd.y - ((authoredEnd.y - start.y) / distance) * inset,
    } : authoredEnd;
    pptxSlide.addShape(pptx.ShapeType.line, {
        x: inches(Math.min(start.x, end.x)),
        y: inches(Math.min(start.y, end.y)),
        w: inches(Math.max(0, Math.abs(end.x - start.x))),
        h: inches(Math.max(0, Math.abs(end.y - start.y))),
        flipH: start.x > end.x,
        flipV: start.y > end.y,
        objectName: objectName(sceneSlide, element),
        line: {
            color: color(style.color ?? '#424242'),
            width: style.width ?? 2,
            dashType: style.dashType ?? 'solid',
            transparency: style.opacity === undefined ? 0 : Math.round((1 - style.opacity) * 100),
            endArrowType: style.endArrow ? 'triangle' : 'none',
            beginArrowType: style.beginArrow ? 'triangle' : 'none',
        },
    });
};

const addAsset = async (pptxSlide, sceneSlide, element) => {
    const absolutePath = resolveAsset(element.path);
    const extension = path.extname(absolutePath).toLowerCase();
    const source = extension === '.svg'
        ? { data: svgData((await readFile(absolutePath, 'utf8')).replaceAll('currentColor', element.style?.color ?? '#0F6CBD')) }
        : { path: absolutePath };
    pptxSlide.addImage({
        ...source,
        ...position(element.box),
        objectName: objectName(sceneSlide, element),
        altText: element.alt || undefined,
        sizing: { type: element.style?.fit ?? 'contain', w: inches(element.box.width), h: inches(element.box.height) },
        transparency: element.style?.opacity === undefined ? undefined : Math.round((1 - element.style.opacity) * 100),
        rotate: element.style?.rotation,
    });
};

const addDiagram = async (pptxSlide, sceneSlide, element) => {
    const inputPath = resolveDiagramPath(element.diagramPath);
    const { svg } = await renderDiagramFile(inputPath, { theme: sceneSlide.theme });
    pptxSlide.addImage({
        data: await rasterizeSvg(svg),
        ...position(element.box),
        objectName: objectName(sceneSlide, element),
        altText: element.alt,
        sizing: { type: 'contain', w: inches(element.box.width), h: inches(element.box.height) },
    });
};

const addSceneElement = async (pptx, pptxSlide, sceneSlide, element) => {
    if (element.type === 'text') return addText(pptxSlide, sceneSlide, element);
    if (element.type === 'shape') return addShape(pptx, pptxSlide, sceneSlide, element);
    if (element.type === 'line') return addLine(pptx, pptxSlide, sceneSlide, element);
    if (element.type === 'image') return addAsset(pptxSlide, sceneSlide, element);
    if (element.type === 'diagram') return addDiagram(pptxSlide, sceneSlide, element);
    throw new Error(`Unsupported scene element type for PowerPoint: ${element.type}`);
};

export const renderSceneToPptx = async (scene, outputPath, options = {}) => {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = options.author ?? 'Fluent Slide Kit';
    pptx.company = options.company ?? '';
    pptx.subject = options.subject ?? 'AI-generated executive presentation';
    pptx.title = scene.title;
    pptx.lang = options.locale ?? 'en-US';
    pptx.theme = {
        headFontFace: options.headingFont ?? 'Segoe UI',
        bodyFontFace: options.bodyFont ?? 'Segoe UI',
        lang: options.locale ?? 'en-US',
    };
    pptx.defineLayout({ name: 'FLUENT_WIDE', width: inches(scene.canvas.width), height: inches(scene.canvas.height) });
    pptx.layout = 'FLUENT_WIDE';

    for (const sceneSlide of scene.slides) {
        const pptxSlide = pptx.addSlide();
        pptxSlide.background = { color: sceneSlide.theme === 'dark' ? '202020' : 'FFFFFF' };
        for (const element of [...sceneSlide.elements].sort((left, right) => left.z - right.z)) {
            await addSceneElement(pptx, pptxSlide, sceneSlide, element);
        }
        const sourceNotes = sceneSlide.sources
            .map((source) => `${source.label}${source.url ? `: ${source.url}` : ''}`)
            .join('\n');
        const notes = [
            `Takeaway: ${sceneSlide.takeaway}`,
            sceneSlide.notes,
            sourceNotes ? `Sources:\n${sourceNotes}` : '',
            `Semantic source: ${scene.source || '[not recorded]'}`,
            `Brand profile: ${scene.brandProfile} (${scene.brandStatus})`,
            `Scene: ${scene.deckId}/${sceneSlide.id}`,
        ].filter(Boolean).join('\n\n');
        pptxSlide.addNotes(notes);
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    await pptx.writeFile({ fileName: outputPath, compression: true });
    return outputPath;
};