import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

export const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SAFE_X = 112;
const SAFE_Y = 68;
const SAFE_WIDTH = 1696;
const FOOTER_Y = 1014;
const CONTENT_TOP = 258;
const CONTENT_BOTTOM = 858;
const TAKEAWAY_Y = 894;
const TAKEAWAY_HEIGHT = 72;

const slug = (value, fallback = 'deck') => String(value ?? fallback)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || fallback;

const box = (x, y, width, height) => ({ x, y, width, height });

const element = (id, type, elementBox, z, properties = {}) => ({ id: slug(id), type, box: elementBox, z, ...properties });

const textElement = (id, role, text, elementBox, z, style = {}) => element(id, 'text', elementBox, z, {
    role,
    text: String(text),
    style: { align: 'left', verticalAlign: 'top', ...style },
});

const shapeElement = (id, shape, elementBox, z, style = {}) => element(id, 'shape', elementBox, z, {
    shape,
    style,
});

const imageElement = (id, asset, elementBox, z) => element(id, 'image', elementBox, z, {
    role: 'visual',
    path: asset.path,
    assetKind: asset.kind,
    alt: asset.alt ?? '',
    style: { fit: 'contain' },
});

const toneColor = (colors, tone = 'neutral') => ({
    brand: colors.brand,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    neutral: colors.stroke,
}[tone] ?? colors.stroke);

const toneSurfaceColor = (colors, tone = 'neutral') => ({
    brand: colors.brandSubtle,
    success: colors.successSubtle,
    warning: colors.warningSubtle,
    danger: colors.dangerSubtle,
    neutral: colors.subtle,
}[tone] ?? colors.subtle);

const typeStyle = (profile, role, textColor, overrides = {}) => {
    const typography = profile.typography[role];
    return {
        fontFace: ['subtitle', 'body', 'caption'].includes(role) ? profile.fonts.body : profile.fonts.heading,
        fontSize: typography.size,
        fontWeight: typography.weight,
        lineHeight: typography.lineHeight,
        color: textColor,
        ...overrides,
    };
};

const CARD_PADDING = 32;
// Segoe UI averages just under half an em per character; erring wide keeps estimated blocks taller than the rendered text.
const AVERAGE_CHARACTER_RATIO = 0.52;

const estimateTextHeight = (profile, role, text, width) => {
    const { size, lineHeight } = profile.typography[role];
    const charactersPerLine = Math.max(8, Math.floor(width / (size * AVERAGE_CHARACTER_RATIO)));
    const lines = String(text ?? '')
        .split('\n')
        .reduce((total, paragraph) => total + Math.max(1, Math.ceil(paragraph.trim().length / charactersPerLine)), 0);
    return Math.ceil(lines * size * lineHeight);
};

const cardBlocks = (item, width, profile, options = {}) => {
    const contentWidth = width - CARD_PADDING * 2;
    const blocks = [];
    if (item.asset) blocks.push({ id: 'visual', height: item.asset.kind === 'azure' ? 72 : 56, gap: 20 });
    if (item.value) blocks.push({ id: 'value', height: estimateTextHeight(profile, 'stat', item.value, contentWidth), gap: 12 });
    if (item.label) blocks.push({ id: 'label', height: estimateTextHeight(profile, 'caption', item.label, contentWidth), gap: 10 });
    if (item.title) blocks.push({ id: 'title', height: estimateTextHeight(profile, 'itemTitle', item.title, contentWidth), gap: 16 });
    if (item.body) blocks.push({ id: 'body', height: estimateTextHeight(profile, options.caption ? 'caption' : 'body', item.body, contentWidth), gap: 0 });
    return blocks;
};

const cardHeight = (item, width, profile, options = {}) => cardBlocks(item, width, profile, options)
    .reduce((total, block, index, all) => total + block.height + (index < all.length - 1 ? block.gap : 0), CARD_PADDING * 2);

const rowCardHeight = (items, width, profile, options = {}) => Math.max(...items.map((item) => cardHeight(item, width, profile, options)));

const addHeader = (elements, slide, profile, compact = false) => {
    const colors = profile.colors[slide.theme];
    // A diagram slide gives its whole band to the graphic, so it carries one title and no supporting header text.
    if (compact) {
        elements.push(textElement('title', 'title', slide.title, box(SAFE_X, SAFE_Y, SAFE_WIDTH, 70), 20, {
            ...typeStyle(profile, 'title', colors.foreground),
        }));
        return;
    }
    if (slide.eyebrow) {
        elements.push(textElement('eyebrow', 'eyebrow', slide.eyebrow, box(SAFE_X, SAFE_Y, SAFE_WIDTH, 28), 20, {
            ...typeStyle(profile, 'caption', colors.brand, { fontWeight: 600 }),
        }));
    }
    elements.push(textElement('title', 'title', slide.title, box(SAFE_X, slide.eyebrow ? 102 : SAFE_Y, compact ? 990 : SAFE_WIDTH, compact ? 62 : 70), 20, {
        ...typeStyle(profile, 'title', colors.foreground, { fontSize: compact ? profile.typography.title.size - 4 : profile.typography.title.size }),
    }));
    if (slide.subtitle) {
        elements.push(textElement('subtitle', 'subtitle', slide.subtitle, compact
            ? box(1130, 102, 678, 86)
            : box(SAFE_X, slide.eyebrow ? 174 : 142, 1430, 78), 20, {
            ...typeStyle(profile, 'subtitle', colors.secondary, { fontSize: compact ? Math.max(18, profile.typography.subtitle.size * 0.7) : profile.typography.subtitle.size }),
        }));
    }
};

// The takeaway carries the executive "so what"; a diagram slide uses its full band and states it in the subtitle instead.
const addTakeaway = (elements, slide, profile) => {
    if (!slide.takeaway || slide.layout === 'diagram') return;
    const colors = profile.colors[slide.theme];
    elements.push(shapeElement('takeaway-rule', 'rect', box(SAFE_X, TAKEAWAY_Y, 4, TAKEAWAY_HEIGHT), 10, {
        fill: colors.brand,
        strokeWidth: 0,
    }));
    elements.push(textElement('takeaway', 'takeaway', slide.takeaway, box(SAFE_X + 24, TAKEAWAY_Y, SAFE_WIDTH - 24, TAKEAWAY_HEIGHT), 10, {
        ...typeStyle(profile, 'body', colors.foreground, { fontWeight: 600, verticalAlign: 'middle' }),
    }));
};

const addFooter = (elements, deck, slide, slideNumber, profile) => {
    const colors = profile.colors[slide.theme];
    const source = slide.sources?.[0]?.label;
    const metadata = [deck.footer, deck.confidentiality, deck.date, `Slide ${slideNumber}`].filter(Boolean).join(' · ');
    if (source) {
        elements.push(textElement('footer-source', 'footer', `Source: ${source}`, box(SAFE_X, FOOTER_Y, 680, 24), 20, {
            ...typeStyle(profile, 'caption', colors.muted),
        }));
    }
    elements.push(textElement('footer-meta', 'footer', metadata, box(820, FOOTER_Y, 988, 24), 20, {
        ...typeStyle(profile, 'caption', colors.muted, { align: 'right' }),
    }));
};

const addCardContent = (elements, item, itemBox, index, profile, theme, options = {}) => {
    const colors = profile.colors[theme];
    const prefix = `item-${index + 1}`;
    const contentWidth = itemBox.width - CARD_PADDING * 2;
    const bordered = options.border !== false;
    const tone = item.tone && item.tone !== 'neutral' ? item.tone : 'neutral';
    elements.push(shapeElement(`${prefix}-surface`, 'roundRect', itemBox, 5, {
        fill: bordered ? toneSurfaceColor(colors, tone) : colors.surface,
        stroke: bordered ? toneColor(colors, tone) : colors.surface,
        strokeWidth: bordered ? (tone === 'neutral' ? 1 : 2) : 0,
        radius: 8,
    }));
    let cursorY = itemBox.y + CARD_PADDING;
    for (const block of cardBlocks(item, itemBox.width, profile, options)) {
        const remaining = itemBox.y + itemBox.height - CARD_PADDING - cursorY;
        if (block.id === 'visual') {
            elements.push(imageElement(`${prefix}-visual`, item.asset, box(itemBox.x + CARD_PADDING, cursorY, block.height, block.height), 10));
        } else if (block.id === 'value') {
            elements.push(textElement(`${prefix}-value`, 'stat', item.value, box(itemBox.x + CARD_PADDING, cursorY, contentWidth, block.height), 10, {
                ...typeStyle(profile, 'stat', colors.brand),
            }));
        } else if (block.id === 'label') {
            elements.push(textElement(`${prefix}-label`, 'eyebrow', item.label, box(itemBox.x + CARD_PADDING, cursorY, contentWidth, block.height), 10, {
                ...typeStyle(profile, 'caption', colors.brand, { fontWeight: 600 }),
            }));
        } else if (block.id === 'title') {
            elements.push(textElement(`${prefix}-title`, 'itemTitle', item.title, box(itemBox.x + CARD_PADDING, cursorY, contentWidth, block.height), 10, {
                ...typeStyle(profile, 'itemTitle', colors.foreground),
            }));
        } else if (block.id === 'body') {
            elements.push(textElement(`${prefix}-body`, 'body', item.body, box(itemBox.x + CARD_PADDING, cursorY, contentWidth, Math.max(block.height, remaining)), 10, {
                ...typeStyle(profile, options.caption ? 'caption' : 'body', colors.secondary),
            }));
        }
        cursorY += block.height + block.gap;
    }
};

const compileLayout = (deck, sourceSlide, slideNumber, profile) => {
    const theme = sourceSlide.theme ?? deck.theme ?? 'light';
    const slide = { ...sourceSlide, theme };
    const colors = profile.colors[theme];
    const elements = [shapeElement('background', 'rect', box(0, 0, profile.canvas.width, profile.canvas.height), 0, { fill: colors.background, strokeWidth: 0 })];
    const items = slide.items ?? [];

    if (slide.layout === 'title') {
        elements[0].style.fill = colors.brand;
        if (slide.eyebrow) elements.push(textElement('eyebrow', 'eyebrow', slide.eyebrow, box(SAFE_X, 332, 1400, 32), 10, {
            ...typeStyle(profile, 'caption', colors.onBrand, { fontWeight: 600 }),
        }));
        elements.push(textElement('title', 'display', slide.title, box(SAFE_X, 386, 1500, 180), 10, {
            ...typeStyle(profile, 'display', colors.onBrand),
        }));
        if (slide.subtitle) elements.push(textElement('subtitle', 'subtitle', slide.subtitle, box(SAFE_X, 580, 1400, 116), 10, {
            ...typeStyle(profile, 'subtitle', colors.onBrand),
        }));
    } else if (['cards', 'comparison', 'metrics'].includes(slide.layout)) {
        addHeader(elements, slide, profile);
        const count = items.length;
        const gap = 32;
        const cardWidth = (SAFE_WIDTH - gap * (count - 1)) / count;
        const height = rowCardHeight(items, cardWidth, profile);
        const cardY = CONTENT_TOP + (CONTENT_BOTTOM - CONTENT_TOP - height) / 2;
        items.forEach((item, index) => addCardContent(elements, item, box(SAFE_X + index * (cardWidth + gap), cardY, cardWidth, height), index, profile, theme));
    } else if (slide.layout === 'split') {
        addHeader(elements, slide, profile);
        const gap = 64;
        const leftWidth = 1000;
        addCardContent(elements, items[0], box(SAFE_X, CONTENT_TOP, leftWidth, CONTENT_BOTTOM - CONTENT_TOP), 0, profile, theme, { border: false });
        addCardContent(elements, items[1], box(SAFE_X + leftWidth + gap, CONTENT_TOP, SAFE_WIDTH - leftWidth - gap, CONTENT_BOTTOM - CONTENT_TOP), 1, profile, theme);
    } else if (slide.layout === 'architecture') {
        addHeader(elements, slide, profile);
        const count = items.length;
        const connectorWidth = 72;
        const gap = 20;
        const nodeWidth = Math.min(300, (SAFE_WIDTH - (count - 1) * (connectorWidth + gap * 2)) / count);
        const nodeHeight = rowCardHeight(items, nodeWidth, profile, { caption: true });
        const nodeY = CONTENT_TOP + (CONTENT_BOTTOM - CONTENT_TOP - nodeHeight) / 2;
        const totalWidth = count * nodeWidth + (count - 1) * (connectorWidth + gap * 2);
        let cursorX = SAFE_X + (SAFE_WIDTH - totalWidth) / 2;
        items.forEach((item, index) => {
            const nodeBox = box(cursorX, nodeY, nodeWidth, nodeHeight);
            addCardContent(elements, item, nodeBox, index, profile, theme, { caption: true });
            cursorX += nodeWidth;
            if (index < count - 1) {
                elements.push(element(`connector-${index + 1}`, 'line', box(cursorX + gap, nodeY + nodeHeight / 2, connectorWidth, 3), 8, {
                    role: 'connector',
                    style: { color: colors.strokeStrong, width: 3, endArrow: 'triangle' },
                }));
                cursorX += connectorWidth + gap * 2;
            }
        });
    } else if (slide.layout === 'diagram') {
        const compact = true;
        addHeader(elements, slide, profile, compact);
        elements.push(element('diagram', 'diagram', box(SAFE_X, 186, SAFE_WIDTH, 792), 5, {
            role: 'diagram',
            diagramPath: slide.diagram.path,
            alt: slide.diagram.alt,
            style: { fit: 'contain' },
        }));
    } else if (slide.layout === 'timeline') {
        addHeader(elements, slide, profile);
        const count = items.length;
        const columnWidth = SAFE_WIDTH / count;
        elements.push(element('timeline-rule', 'line', box(SAFE_X, 570, SAFE_WIDTH, 3), 4, {
            role: 'timeline', style: { color: colors.strokeStrong, width: 3 },
        }));
        items.forEach((item, index) => {
            const x = SAFE_X + index * columnWidth;
            elements.push(textElement(`item-${index + 1}-date`, 'caption', item.date ?? item.label ?? '', box(x, 475, columnWidth - 24, 40), 10, {
                ...typeStyle(profile, 'caption', colors.brand, { fontWeight: 600 }),
            }));
            elements.push(shapeElement(`item-${index + 1}-dot`, 'ellipse', box(x, 561, 20, 20), 10, { fill: colors.brand, stroke: colors.background, strokeWidth: 4 }));
            if (item.title) elements.push(textElement(`item-${index + 1}-title`, 'itemTitle', item.title, box(x, 615, columnWidth - 24, 80), 10, {
                ...typeStyle(profile, 'itemTitle', colors.foreground),
            }));
            if (item.body) elements.push(textElement(`item-${index + 1}-body`, 'body', item.body, box(x, 704, columnWidth - 24, 170), 10, {
                ...typeStyle(profile, 'body', colors.secondary),
            }));
        });
    } else if (slide.layout === 'sources') {
        addHeader(elements, slide, profile);
        (slide.sources ?? []).forEach((source, index) => elements.push(textElement(`source-${index + 1}`, 'body', `${index + 1}. ${source.label}${source.accessed ? ` (accessed ${source.accessed})` : ''}`, box(SAFE_X, CONTENT_TOP + index * 62, SAFE_WIDTH, 52), 10, {
            ...typeStyle(profile, 'body', colors.secondary, { hyperlink: source.url }),
        })));
    } else {
        addHeader(elements, slide, profile);
        if (slide.layout === 'quote') elements.push(textElement('quote-mark', 'decorative', '“', box(SAFE_X, 300, 100, 120), 4, {
            ...typeStyle(profile, 'display', colors.brand, { fontSize: 110 }),
        }));
        if (items[0]) addCardContent(elements, items[0], box(SAFE_X, 390, 1540, 430), 0, profile, theme, { border: false });
    }

    if (slide.layout !== 'title') {
        addTakeaway(elements, slide, profile);
        addFooter(elements, deck, slide, slideNumber, profile);
    }
    return {
        id: slide.id,
        number: slideNumber,
        layout: slide.layout,
        title: slide.title,
        takeaway: slide.takeaway,
        theme,
        elements,
        notes: slide.notes ?? '',
        sources: slide.sources ?? [],
    };
};

export const loadBrandProfile = async (profilePath = path.join(kitRoot, 'design', 'brand-profiles', 'fluent-aligned.json')) => {
    const profilesRoot = path.join(kitRoot, 'design', 'brand-profiles');
    const absolutePath = path.resolve(profilePath);
    if (!absolutePath.startsWith(`${profilesRoot}${path.sep}`)) {
        throw new Error(`Brand profile must remain under design/brand-profiles/: ${profilePath}`);
    }
    const [profile, schema] = await Promise.all([
        readFile(absolutePath, 'utf8').then(JSON.parse),
        readFile(path.join(kitRoot, 'schemas', 'brand-profile.schema.json'), 'utf8').then(JSON.parse),
    ]);
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    if (!validate(profile)) {
        throw new Error(`Brand profile is invalid: ${validate.errors.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ')}`);
    }
    return profile;
};

export const compileDeckScene = async (deck, options = {}) => {
    const profilePath = options.brandProfilePath ?? (deck.brandProfile ? path.resolve(kitRoot, deck.brandProfile) : undefined);
    const profile = options.brandProfile ?? await loadBrandProfile(profilePath);
    const deckId = options.deckId ?? slug(deck.title);
    return {
        schemaVersion: 1,
        deckId,
        title: deck.title,
        brandProfile: profile.id,
        brandStatus: profile.brandStatus,
        source: options.source ?? '',
        canvas: { width: profile.canvas.width, height: profile.canvas.height },
        slides: deck.slides.map((slide, index) => compileLayout(deck, slide, slide.number ?? index + 1, profile)),
    };
};