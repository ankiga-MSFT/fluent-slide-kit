import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

export const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FOOTER_X = 112;
const FOOTER_Y = 1014;
const FOOTER_WIDTH = 360;
const FOOTER_HEIGHT = 24;
const CONFIDENTIALITY_LABEL = 'Microsoft Confidential';
const RESERVED_ELEMENT_IDS = new Set(['background', 'footer-confidentiality']);

const slug = (value, fallback = 'deck') => String(value ?? fallback)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || fallback;

const resolveToken = (value, tokens, tokenType) => {
    if (typeof value !== 'string' || !value.startsWith('$')) return value;
    const name = value.slice(1);
    if (!(name in tokens)) throw new Error(`Unknown ${tokenType} token: ${value}`);
    return tokens[name];
};

const resolveStyle = (style = {}, colors, fonts) => {
    const resolved = { ...style };
    for (const property of ['color', 'fill', 'stroke']) {
        if (property in resolved) resolved[property] = resolveToken(resolved[property], colors, 'color');
    }
    if ('fontFace' in resolved) resolved.fontFace = resolveToken(resolved.fontFace, fonts, 'font');
    return resolved;
};

const lineBox = (start, end) => ({
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.max(1, Math.abs(end.x - start.x)),
    height: Math.max(1, Math.abs(end.y - start.y)),
});

const compileElement = (source, profile, theme, designContract) => {
    const colors = profile.colors[theme];
    const fonts = {
        heading: profile.fonts.heading,
        body: profile.fonts.body,
        fallback: profile.fonts.fallback,
    };
    const common = {
        id: source.id,
        type: source.type,
        box: source.type === 'line' ? lineBox(source.start, source.end) : source.box,
        z: source.z,
        ...(source.role ? { role: source.role } : {}),
        ...(source.group ? { group: source.group } : {}),
        ...(source.metadata ? { metadata: source.metadata } : {}),
    };

    if (source.type === 'text') {
        const typography = profile.typography[source.typography];
        const defaultFont = ['subtitle', 'body', 'caption'].includes(source.typography) ? fonts.body : fonts.heading;
        return {
            ...common,
            role: source.role ?? source.typography,
            text: source.text,
            style: {
                fontFace: defaultFont,
                fontSize: typography.size,
                fontWeight: typography.weight,
                lineHeight: typography.lineHeight,
                color: colors.foreground,
                align: 'left',
                verticalAlign: 'top',
                ...resolveStyle(source.style, colors, fonts),
            },
        };
    }

    if (source.type === 'shape') {
        const containerDefaults = source.role === 'container'
            ? {
                stroke: resolveToken(designContract.authoringDefaults.containers.stroke, colors, 'color'),
                strokeWidth: designContract.authoringDefaults.containers.strokeWidth,
            }
            : {};
        return {
            ...common,
            shape: source.shape,
            style: {
                fill: colors.surface,
                strokeWidth: 0,
                ...containerDefaults,
                ...resolveStyle(source.style, colors, fonts),
            },
        };
    }

    if (source.type === 'line') {
        const isConnector = source.role === 'connector';
        return {
            ...common,
            role: source.role ?? 'connector',
            start: source.start,
            end: source.end,
            style: {
                color: isConnector ? colors.secondary : colors.strokeStrong,
                width: isConnector ? 2.5 : 2,
                dashType: 'solid',
                ...(isConnector ? {
                    endArrow: true,
                    endInset: designContract.authoringDefaults.connectors.targetClearance,
                } : {}),
                ...resolveStyle(source.style, colors, fonts),
            },
        };
    }

    if (source.type === 'diagram') {
        return {
            ...common,
            role: source.role ?? 'diagram',
            diagramPath: source.diagramPath,
            alt: source.alt,
            style: {
                fit: 'contain',
                ...resolveStyle(source.style, colors, fonts),
            },
        };
    }

    return {
        ...common,
        role: source.role ?? 'visual',
        path: source.path,
        assetKind: source.assetKind,
        alt: source.alt,
        style: {
            fit: 'contain',
            color: colors.brand,
            ...resolveStyle(source.style, colors, fonts),
        },
        metadata: {
            ...(source.metadata ?? {}),
            provenance: source.provenance,
        },
    };
};

const compileSlide = (deck, sourceSlide, slideNumber, profile, designContract) => {
    const theme = sourceSlide.theme ?? deck.theme;
    const colors = profile.colors[theme];
    const ids = new Set();
    for (const sourceElement of sourceSlide.elements) {
        if (RESERVED_ELEMENT_IDS.has(sourceElement.id)) throw new Error(`Element id is reserved: ${sourceElement.id}`);
        if (ids.has(sourceElement.id)) throw new Error(`Duplicate element id on slide ${sourceSlide.id}: ${sourceElement.id}`);
        ids.add(sourceElement.id);
    }

    return {
        id: sourceSlide.id,
        number: slideNumber,
        title: sourceSlide.title,
        takeaway: sourceSlide.takeaway,
        theme,
        elements: [
            {
                id: 'background',
                type: 'shape',
                shape: 'rect',
                role: 'background',
                box: { x: 0, y: 0, width: profile.canvas.width, height: profile.canvas.height },
                z: 0,
                style: {
                    fill: resolveToken(sourceSlide.background ?? '$background', colors, 'color'),
                    strokeWidth: 0,
                },
            },
            ...sourceSlide.elements.map((source) => compileElement(source, profile, theme, designContract)),
            {
                id: 'footer-confidentiality',
                type: 'text',
                role: 'footer',
                text: CONFIDENTIALITY_LABEL,
                box: { x: FOOTER_X, y: FOOTER_Y, width: FOOTER_WIDTH, height: FOOTER_HEIGHT },
                z: 1000,
                style: {
                    fontFace: profile.fonts.body,
                    fontSize: profile.typography.caption.size,
                    fontWeight: profile.typography.caption.weight,
                    lineHeight: profile.typography.caption.lineHeight,
                    color: resolveToken(sourceSlide.footerColor ?? '$muted', colors, 'color'),
                    align: 'left',
                    verticalAlign: 'top',
                },
            },
        ],
        notes: sourceSlide.notes ?? '',
        sources: sourceSlide.sources ?? [],
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
    const [profile, designContract] = await Promise.all([
        options.brandProfile ?? loadBrandProfile(profilePath),
        readFile(path.join(kitRoot, 'design', 'design-contract.json'), 'utf8').then(JSON.parse),
    ]);
    return {
        schemaVersion: 1,
        deckId: options.deckId ?? slug(deck.title),
        title: deck.title,
        brandProfile: profile.id,
        brandStatus: profile.brandStatus,
        source: options.source ?? '',
        canvas: { width: profile.canvas.width, height: profile.canvas.height },
        slides: deck.slides.map((slide, index) => compileSlide(deck, slide, slide.number ?? index + 1, profile, designContract)),
    };
};