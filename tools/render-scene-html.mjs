import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderDiagramFile, resolveDiagramPath } from './diagram-core.mjs';
import { kitRoot } from './scene-core.mjs';

const assetsRoot = path.join(kitRoot, 'assets');

const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const toPosix = (value) => value.split(path.sep).join('/');

const resolveAsset = (assetPath) => {
    const absolutePath = path.resolve(kitRoot, assetPath);
    if (!absolutePath.startsWith(`${assetsRoot}${path.sep}`)) {
        throw new Error(`Asset path must remain under assets/: ${assetPath}`);
    }
    return absolutePath;
};

const boxStyle = (elementBox, z) => [
    `left:${elementBox.x}px`,
    `top:${elementBox.y}px`,
    `width:${elementBox.width}px`,
    `height:${elementBox.height}px`,
    `z-index:${z}`,
].join(';');

const renderText = (element) => {
    const style = element.style ?? {};
    const fontFace = String(style.fontFace ?? 'Segoe UI').replaceAll("'", '');
    const textStyle = [
        boxStyle(element.box, element.z),
        `font-family:'${fontFace}', Aptos, sans-serif`,
        `font-size:${style.fontSize ?? 24}px`,
        `font-weight:${style.fontWeight ?? 400}`,
        `line-height:${style.lineHeight ?? 1.25}`,
        `color:${style.color ?? '#242424'}`,
        `text-align:${style.align ?? 'left'}`,
        `justify-content:${style.verticalAlign === 'middle' ? 'center' : style.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start'}`,
    ].join(';');
    const content = escapeHtml(element.text);
    const body = style.hyperlink
        ? `<a href="${escapeHtml(style.hyperlink)}">${content}</a>`
        : content;
    return `<div class="scene-element scene-text role-${escapeHtml(element.role ?? 'text')}" data-scene-element="${escapeHtml(element.id)}" style="${textStyle}">${body}</div>`;
};

const renderShape = (element) => {
    const style = element.style ?? {};
    const radius = element.shape === 'ellipse' ? '50%' : `${style.radius ?? (element.shape === 'roundRect' ? 8 : 0)}px`;
    const shapeStyle = [
        boxStyle(element.box, element.z),
        `background:${style.fill ?? 'transparent'}`,
        `border:${style.strokeWidth ?? 0}px solid ${style.stroke ?? 'transparent'}`,
        `border-radius:${radius}`,
        style.accentTop ? `border-top:${style.accentTop.width}px solid ${style.accentTop.color}` : '',
    ].filter(Boolean).join(';');
    return `<div class="scene-element scene-shape" data-scene-element="${escapeHtml(element.id)}" aria-hidden="true" style="${shapeStyle}"></div>`;
};

const renderLine = (element) => {
    const style = element.style ?? {};
    const markerId = `${element.id}-arrow`;
    const width = Math.max(1, element.box.width);
    const height = Math.max(1, element.box.height);
    const horizontal = width >= height;
    const x2 = horizontal ? width - (style.endArrow ? 10 : 0) : width / 2;
    const y2 = horizontal ? height / 2 : height - (style.endArrow ? 10 : 0);
    return `<svg class="scene-element scene-line" data-scene-element="${escapeHtml(element.id)}" style="${boxStyle(element.box, element.z)};overflow:visible" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
  ${style.endArrow ? `<defs><marker id="${escapeHtml(markerId)}" markerWidth="12" markerHeight="12" refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L0,8 L10,4 z" fill="${escapeHtml(style.color ?? '#424242')}" /></marker></defs>` : ''}
  <line x1="${horizontal ? 0 : width / 2}" y1="${horizontal ? height / 2 : 0}" x2="${x2}" y2="${y2}" stroke="${escapeHtml(style.color ?? '#424242')}" stroke-width="${style.width ?? 2}" stroke-linecap="round"${style.endArrow ? ` marker-end="url(#${escapeHtml(markerId)})"` : ''} />
</svg>`;
};

const renderImage = async (element, outputDirectory) => {
    const absolutePath = resolveAsset(element.path);
    const style = `${boxStyle(element.box, element.z)};color:#0F6CBD`;
    if (element.assetKind === 'fluent') {
        const svg = await readFile(absolutePath, 'utf8');
        const accessibility = element.alt
            ? `role="img" aria-label="${escapeHtml(element.alt)}"`
            : 'aria-hidden="true" focusable="false"';
        const inlineSvg = svg.replace(/<svg\b/, `<svg ${accessibility}`);
        return `<div class="scene-element scene-image" data-scene-element="${escapeHtml(element.id)}" style="${style}">${inlineSvg}</div>`;
    }
    const source = toPosix(path.relative(outputDirectory, absolutePath));
    return `<div class="scene-element scene-image" data-scene-element="${escapeHtml(element.id)}" style="${style}"><img src="${escapeHtml(source)}" alt="${escapeHtml(element.alt)}" /></div>`;
};

const renderDiagram = async (element, theme) => {
    const { svg } = await renderDiagramFile(resolveDiagramPath(element.diagramPath), { theme });
    return `<div class="scene-element scene-diagram" data-scene-element="${escapeHtml(element.id)}" style="${boxStyle(element.box, element.z)}" role="img" aria-label="${escapeHtml(element.alt)}">${svg}</div>`;
};

const renderElement = async (element, slide, outputDirectory) => {
    if (element.type === 'text') return renderText(element);
    if (element.type === 'shape') return renderShape(element);
    if (element.type === 'line') return renderLine(element);
    if (element.type === 'image') return renderImage(element, outputDirectory);
    if (element.type === 'diagram') return renderDiagram(element, slide.theme);
    throw new Error(`Unsupported scene element type: ${element.type}`);
};

const baseStyles = (scene) => `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${scene.canvas.width}px; height: ${scene.canvas.height}px; overflow: hidden; }
body { font-family: "Segoe UI", Aptos, sans-serif; font-synthesis: none; letter-spacing: 0; text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; }
.scene-slide { position: relative; width: ${scene.canvas.width}px; height: ${scene.canvas.height}px; overflow: hidden; }
.scene-element { position: absolute; min-width: 0; min-height: 0; }
.scene-text { display: flex; flex-direction: column; overflow: hidden; overflow-wrap: anywhere; white-space: pre-wrap; letter-spacing: 0; }
.scene-text a { color: inherit; text-decoration-thickness: 2px; text-underline-offset: 4px; }
.scene-image { display: flex; align-items: center; justify-content: center; }
.scene-image svg, .scene-image img { display: block; width: 100%; height: 100%; object-fit: contain; }
.scene-diagram { overflow: hidden; }
.scene-diagram > svg { display: block; width: 100%; height: 100%; }
@page { size: ${scene.canvas.width}px ${scene.canvas.height}px; margin: 0; }
@media print { html, body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;

export const renderSceneSlideHtml = async (scene, slide, outputDirectory) => {
    const elements = (await Promise.all([...slide.elements]
        .sort((left, right) => left.z - right.z)
        .map((item) => renderElement(item, slide, outputDirectory))))
        .join('\n');
    const notesPayload = JSON.stringify({ takeaway: slide.takeaway, notes: slide.notes, sources: slide.sources }).replaceAll('<', '\\u003c');
    return `<!doctype html>
<!-- Scene slide ${slide.number}. Takeaway: ${escapeHtml(slide.takeaway)}. Layout: ${escapeHtml(slide.layout)}. -->
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${scene.canvas.width}, initial-scale=1" />
  <title>${escapeHtml(scene.title)} — ${escapeHtml(slide.title)}</title>
  <style>${baseStyles(scene)}</style>
</head>
<body>
  <section class="scene-slide layout-${escapeHtml(slide.layout)} theme-${escapeHtml(slide.theme)}" role="group" aria-label="Slide ${slide.number}: ${escapeHtml(slide.title)}" data-scene-slide="${escapeHtml(slide.id)}">
${elements}
  </section>
  <script type="application/json" id="slide-metadata">${notesPayload}</script>
</body>
</html>
`;
};

export const renderSceneToDirectory = async (scene, outputDirectory) => {
    await mkdir(outputDirectory, { recursive: true });
    const manifest = { title: scene.title, source: scene.source, sceneVersion: scene.schemaVersion, slides: [] };
    for (const slide of scene.slides) {
        const fileName = `${String(slide.number).padStart(2, '0')}-${slide.id}.html`;
        await writeFile(path.join(outputDirectory, fileName), await renderSceneSlideHtml(scene, slide, outputDirectory));
        manifest.slides.push({ id: slide.id, number: slide.number, title: slide.title, file: fileName });
    }
    await writeFile(path.join(outputDirectory, 'deck-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
};