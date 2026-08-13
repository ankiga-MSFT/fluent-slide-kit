import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import PptxGenJS from 'pptxgenjs';
import { compileLayeredArchitectureDiagram, loadDiagram, renderDiagramFile, resolveDiagramPath } from './diagram-core.mjs';
import { kitRoot } from './scene-core.mjs';

const assetsRoot = path.join(kitRoot, 'assets');
const PX_PER_INCH = 144;
const PX_PER_POINT = 2;

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

const rasterizeSvg = async (svg) => {
    let browser;
    try {
        try {
            browser = await chromium.launch({ channel: 'msedge', headless: true });
        } catch {
            browser = await chromium.launch({ headless: true });
        }
        const page = await browser.newPage({ viewport: { width: 1600, height: 720 }, deviceScaleFactor: 1 });
        await page.setContent(`<style>html,body{margin:0;width:1600px;height:720px;overflow:hidden}svg{display:block;width:1600px;height:720px}</style>${svg}`, { waitUntil: 'load' });
        const png = await page.locator('svg').screenshot({ type: 'png' });
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
        color: color(style.color ?? '#242424'),
        align: style.align ?? 'left',
        valign: style.verticalAlign ?? 'top',
        margin: 0,
        breakLine: false,
        fit: 'none',
        lineSpacingMultiple: style.lineHeight ?? 1.25,
        hyperlink: style.hyperlink ? { url: style.hyperlink } : undefined,
        isTextBox: true,
    });
};

const shapeName = (pptx, element) => ({
    rect: pptx.ShapeType.rect,
    roundRect: pptx.ShapeType.rect,
    ellipse: pptx.ShapeType.ellipse,
    diamond: pptx.ShapeType.diamond,
}[element.shape] ?? pptx.ShapeType.rect);

const addShape = (pptx, pptxSlide, sceneSlide, element) => {
    const style = element.style ?? {};
    const lineWidth = style.strokeWidth ?? 0;
    pptxSlide.addShape(shapeName(pptx, element), {
        ...position(element.box),
        objectName: objectName(sceneSlide, element),
        fill: style.fill && style.fill !== 'transparent'
            ? { color: color(style.fill) }
            : { color: 'FFFFFF', transparency: 100 },
        line: lineWidth > 0
            ? { color: color(style.stroke ?? '#000000'), width: lineWidth }
            : { color: 'FFFFFF', transparency: 100, width: 0 },
        radius: style.radius,
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
    pptxSlide.addShape(pptx.ShapeType.line, {
        ...position(element.box),
        objectName: objectName(sceneSlide, element),
        line: {
            color: color(style.color ?? '#424242'),
            width: style.width ?? 2,
            dashType: style.dashType ?? 'solid',
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
        sizing: { type: 'contain', w: inches(element.box.width), h: inches(element.box.height) },
    });
};

const mapDiagramBox = (hostBox, compiled, diagramBox) => {
    const scale = Math.min(hostBox.width / compiled.width, hostBox.height / compiled.height);
    const offsetX = hostBox.x + (hostBox.width - compiled.width * scale) / 2;
    const offsetY = hostBox.y + (hostBox.height - compiled.height * scale) / 2;
    return {
        x: offsetX + diagramBox.x * scale,
        y: offsetY + diagramBox.y * scale,
        width: diagramBox.width * scale,
        height: diagramBox.height * scale,
        scale,
    };
};

const diagramToneColor = (compiled, tone = 'neutral') => ({
    brand: '#0F6CBD',
    success: '#107C10',
    warning: '#8A6D00',
    danger: '#C50F1F',
    neutral: compiled.colors.stroke,
}[tone] ?? compiled.colors.stroke);

const addDiagramText = (pptxSlide, sceneSlide, hostElement, compiled, id, text, diagramBox, style = {}) => {
    const mapped = mapDiagramBox(hostElement.box, compiled, diagramBox);
    addText(pptxSlide, sceneSlide, {
        id: `diagram-${id}`,
        type: 'text',
        role: style.role ?? 'diagram-text',
        box: mapped,
        z: hostElement.z + 4,
        text,
        style: {
            fontFace: style.fontFace ?? 'Segoe UI',
            fontSize: (style.fontSize ?? 18) * mapped.scale,
            fontWeight: style.fontWeight ?? 400,
            color: style.color,
            align: style.align ?? 'left',
            verticalAlign: style.verticalAlign ?? 'top',
            lineHeight: style.lineHeight ?? 1.15,
        },
    });
};

const addLayeredArchitecture = async (pptx, pptxSlide, sceneSlide, hostElement, diagram) => {
    const compiled = compileLayeredArchitectureDiagram(diagram, { theme: sceneSlide.theme });
    const addNativeShape = (id, diagramBox, shape, fill, stroke, strokeWidth = 1) => {
        const mapped = mapDiagramBox(hostElement.box, compiled, diagramBox);
        addShape(pptx, pptxSlide, sceneSlide, {
            id: `diagram-${id}`,
            type: 'shape',
            shape,
            box: mapped,
            z: hostElement.z + 1,
            style: { fill, stroke, strokeWidth },
        });
    };

    for (const column of compiled.columns) {
        addNativeShape(`column-${column.id}`, column.box, 'roundRect', compiled.colors.lane, compiled.colors.stroke, 1);
        addDiagramText(pptxSlide, sceneSlide, hostElement, compiled, `column-${column.id}-label`, column.label, {
            x: column.box.x + 8,
            y: column.box.y + 9,
            width: column.box.width - 16,
            height: column.box.height - 12,
        }, { fontSize: 18, fontWeight: 600, color: compiled.colors.secondary, align: 'center', verticalAlign: 'middle' });
    }

    for (const layer of compiled.layers) {
        addNativeShape(`layer-${layer.id}-band`, layer.bandBox, 'roundRect', compiled.colors.lane, diagramToneColor(compiled, layer.tone), 1.5);
        addNativeShape(`layer-${layer.id}-surface`, layer.surfaceBox, 'roundRect', compiled.colors.group, compiled.colors.stroke, 1.25);
        addNativeShape(`layer-${layer.id}-number`, {
            x: layer.numberCircle.cx - layer.numberCircle.radius,
            y: layer.numberCircle.cy - layer.numberCircle.radius,
            width: layer.numberCircle.radius * 2,
            height: layer.numberCircle.radius * 2,
        }, 'ellipse', '#0F6CBD', '#0F6CBD', 0);
        addDiagramText(pptxSlide, sceneSlide, hostElement, compiled, `layer-${layer.id}-number-label`, String(layer.number), {
            x: layer.numberCircle.cx - layer.numberCircle.radius,
            y: layer.numberCircle.cy - 12,
            width: layer.numberCircle.radius * 2,
            height: 24,
        }, { fontSize: 18, fontWeight: 700, color: '#FFFFFF', align: 'center', verticalAlign: 'middle' });
        addDiagramText(pptxSlide, sceneSlide, hostElement, compiled, `layer-${layer.id}-label`, layer.labelLines.join('\n'), {
            x: compiled.layout.padding + 52,
            y: layer.labelY - 18,
            width: compiled.layout.layerRailWidth - 60,
            height: layer.labelLines.length * 23 + 4,
        }, { fontSize: 19, fontWeight: 600, color: compiled.colors.text, verticalAlign: 'middle' });

        for (const component of layer.components) {
            addNativeShape(`component-${component.id}`, component.box, 'roundRect', compiled.colors.surface, diagramToneColor(compiled, component.tone), component.emphasis ? 3 : 1.5);
            if (component.asset) {
                const mappedAsset = mapDiagramBox(hostElement.box, compiled, component.imageBox);
                await addAsset(pptxSlide, sceneSlide, {
                    id: `diagram-component-${component.id}-asset`,
                    type: 'image',
                    box: mappedAsset,
                    path: component.asset.path,
                    assetKind: component.asset.kind,
                    alt: component.asset.alt,
                    style: { color: compiled.colors.text },
                });
            }
            addDiagramText(pptxSlide, sceneSlide, hostElement, compiled, `component-${component.id}-label`, component.labelLines.join('\n'), {
                x: component.textX,
                y: component.labelY - 17,
                width: component.textWidth,
                height: component.labelLines.length * 22 + 3,
            }, { fontSize: 19, fontWeight: 600, color: compiled.colors.text, verticalAlign: 'middle' });
            if (component.descriptionLines.length) {
                addDiagramText(pptxSlide, sceneSlide, hostElement, compiled, `component-${component.id}-description`, component.descriptionLines.join('\n'), {
                    x: component.textX,
                    y: component.descriptionY - 16,
                    width: component.textWidth,
                    height: component.descriptionLines.length * 20 + 3,
                }, { fontSize: 18, color: compiled.colors.muted, verticalAlign: 'middle' });
            }
        }
    }

    for (const flow of compiled.flows) {
        const start = mapDiagramBox(hostElement.box, compiled, { x: flow.x1, y: flow.y1, width: 1, height: 1 });
        const end = mapDiagramBox(hostElement.box, compiled, { x: flow.x2, y: flow.y2, width: 1, height: 1 });
        addLine(pptx, pptxSlide, sceneSlide, {
            id: `diagram-layer-flow-${flow.id}`,
            type: 'line',
            box: { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y },
            z: hostElement.z + 3,
            style: { color: '#0F6CBD', width: 3, endArrow: 'triangle' },
        });
    }

    if (compiled.concernRail) {
        const rail = compiled.concernRail;
        addNativeShape('concern-rail', rail.box, 'roundRect', compiled.colors.lane, '#0F6CBD', 1.5);
        addDiagramText(pptxSlide, sceneSlide, hostElement, compiled, 'concern-title', rail.title, {
            x: rail.box.x + 18,
            y: rail.box.y + 10,
            width: rail.box.width - 36,
            height: 30,
        }, { fontSize: 18, fontWeight: 700, color: compiled.colors.text, verticalAlign: 'middle' });
        for (const concern of rail.items) {
            addNativeShape(`concern-${concern.id}`, concern.box, 'roundRect', compiled.colors.surface, diagramToneColor(compiled, concern.tone), 1.5);
            addDiagramText(pptxSlide, sceneSlide, hostElement, compiled, `concern-${concern.id}-label`, concern.labelLines.join('\n'), {
                x: concern.box.x + 16,
                y: concern.textPosition.y - 17,
                width: concern.box.width - 32,
                height: concern.labelLines.length * 22 + 4,
            }, { fontSize: 18, fontWeight: 600, color: compiled.colors.secondary, verticalAlign: 'middle' });
        }
    }
};

const addDiagram = async (pptxSlide, sceneSlide, element) => {
    const inputPath = resolveDiagramPath(element.diagramPath);
    const diagram = await loadDiagram(inputPath);
    if (diagram.diagramType === 'layered-architecture') {
        return addLayeredArchitecture(pptxSlide._pptx, pptxSlide, sceneSlide, element, diagram);
    }
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
    if (element.type === 'diagram') {
        const inputPath = resolveDiagramPath(element.diagramPath);
        const diagram = await loadDiagram(inputPath);
        if (diagram.diagramType === 'layered-architecture') {
            return addLayeredArchitecture(pptx, pptxSlide, sceneSlide, element, diagram);
        }
        return addDiagram(pptxSlide, sceneSlide, element);
    }
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