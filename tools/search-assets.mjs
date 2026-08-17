import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsRoot = path.join(kitRoot, 'assets');

const parseArguments = (arguments_) => {
    const options = { collection: 'all', style: 'regular', limit: 8, json: false, terms: [] };

    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index];
        if (argument === '--collection') options.collection = arguments_[index += 1];
        else if (argument === '--style') options.style = arguments_[index += 1];
        else if (argument === '--limit') options.limit = Number(arguments_[index += 1]);
        else if (argument === '--json') options.json = true;
        else options.terms.push(argument);
    }

    if (options.terms.length === 0) {
        throw new Error(
            'Usage: npm run assets:search -- <query> [--collection fluent|azure|external] [--style regular|filled] [--limit 8] [--json]',
        );
    }
    if (!['all', 'fluent', 'azure', 'external'].includes(options.collection)) {
        throw new Error('--collection must be all, fluent, azure, or external.');
    }
    if (!['regular', 'filled'].includes(options.style)) {
        throw new Error('--style must be regular or filled.');
    }
    if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 50) {
        throw new Error('--limit must be an integer from 1 through 50.');
    }

    return options;
};

const normalize = (value) =>
    String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const genericQueryTerms = new Set(['azure', 'microsoft', 'icon', 'icons', 'service', 'services']);

const scoreText = (query, queryTerms, fields) => {
    const normalizedFields = fields.map(normalize).filter(Boolean);
    const primary = normalizedFields[0] ?? '';
    let score = 0;

    if (primary === query) score += 240;
    if (primary.startsWith(query)) score += 120;
    if (primary.includes(query)) score += 80;

    for (const term of queryTerms) {
        const termWeight = genericQueryTerms.has(term) ? 0.12 : 1;
        if (primary.startsWith(`${term} `) || primary === term) score += 24 * termWeight;
        if (primary.split(' ').includes(term)) score += 36 * termWeight;
        else if (primary.includes(term)) score += 20 * termWeight;

        normalizedFields.slice(1).forEach((field, index) => {
            if (field.split(' ').includes(term)) score += Math.max(14 - index, 5) * termWeight;
            else if (field.includes(term)) score += Math.max(8 - index, 2) * termWeight;
        });
    }

    return score;
};

const loadJson = async (relativePath) =>
    JSON.parse(await readFile(path.join(assetsRoot, relativePath), 'utf8'));

const searchFluent = async (query, queryTerms, style) => {
    const catalog = await loadJson('fluent-system-icons/catalog.json');
    return catalog.icons
        .filter((icon) => icon.styles[style])
        .map((icon) => ({
            collection: 'fluent',
            id: icon.id,
            name: icon.name,
            style,
            path: `assets/${icon.styles[style].path}`,
            description: icon.description,
            score: scoreText(query, queryTerms, [icon.name, icon.description, ...icon.keywords, ...icon.metaphors]),
        }))
        .filter((icon) => icon.score > 0);
};

const searchAzure = async (query, queryTerms) => {
    const catalog = await loadJson('azure-public-service-icons/catalog.json');
    return catalog.icons
        .map((icon) => ({
            collection: 'azure',
            id: icon.id,
            name: icon.name,
            category: icon.category,
            path: `assets/${icon.path}`,
            score: scoreText(query, queryTerms, [icon.name, icon.category]),
        }))
        .filter((icon) => icon.score > 0);
};

const searchExternal = async (query, queryTerms) => {
    const catalog = await loadJson('external-icons/catalog.json');
    return catalog.icons
        .map((icon) => ({
            collection: 'external',
            id: icon.id,
            name: icon.name,
            vendor: icon.vendor,
            path: `assets/${icon.path}`,
            description: icon.description,
            source: icon.source,
            license: icon.license,
            score: scoreText(query, queryTerms, [icon.name, icon.vendor, icon.description, ...icon.keywords]),
        }))
        .filter((icon) => icon.score > 0);
};

const main = async () => {
    const options = parseArguments(process.argv.slice(2));
    const query = normalize(options.terms.join(' '));
    const queryTerms = [...new Set(query.split(' ').filter(Boolean))];
    const searches = [];

    if (['all', 'fluent'].includes(options.collection)) searches.push(searchFluent(query, queryTerms, options.style));
    if (['all', 'azure'].includes(options.collection)) searches.push(searchAzure(query, queryTerms));
    if (['all', 'external'].includes(options.collection)) searches.push(searchExternal(query, queryTerms));

    const results = (await Promise.all(searches))
        .flat()
        .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
        .slice(0, options.limit);

    if (options.json) {
        console.log(JSON.stringify({ query, results }, null, 2));
        return;
    }

    if (results.length === 0) {
        console.log(`No local assets matched "${query}".`);
        return;
    }

    for (const result of results) {
        const qualifier = result.collection === 'azure' ? result.category : result.collection === 'external' ? result.vendor : result.style;
        console.log(`${result.collection.padEnd(7)} ${result.name} (${qualifier})\n        ${result.path}`);
    }
};

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});