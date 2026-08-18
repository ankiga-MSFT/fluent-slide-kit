import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { compileDeckScene, kitRoot } from './composition-core.mjs';

const execFileAsync = promisify(execFile);

const parseArguments = (arguments_) => {
    const options = { input: undefined, output: undefined };
    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index];
        if (argument === '--output') options.output = path.resolve(arguments_[index += 1]);
        else if (['--preview', '--require-preview'].includes(argument)) continue;
        else if (!options.input) options.input = path.resolve(argument);
        else throw new Error(`Unexpected argument: ${argument}`);
    }
    if (!options.input) throw new Error('Usage: npm run deck:build -- <deck.json> [--output <directory>]');
    options.output ??= path.join(kitRoot, 'deliverables', path.basename(options.input, path.extname(options.input)));
    return options;
};

const runNode = async (script, arguments_) => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [path.join(kitRoot, 'tools', script), ...arguments_], { cwd: kitRoot });
    if (stdout.trim()) console.log(stdout.trim());
    if (stderr.trim()) console.error(stderr.trim());
};

const main = async () => {
    const options = parseArguments(process.argv.slice(2));
    const [designContract, externalCatalog] = await Promise.all([
        readFile(path.join(kitRoot, 'design', 'design-contract.json'), 'utf8').then(JSON.parse),
        readFile(path.join(kitRoot, 'assets', 'external-icons', 'catalog.json'), 'utf8').then(JSON.parse),
    ]);
    const htmlDirectory = path.join(options.output, 'html');
    await rm(options.output, { recursive: true, force: true });
    await mkdir(options.output, { recursive: true });

    await runNode('validate-deck.mjs', [options.input, '--output', htmlDirectory]);

    const deck = JSON.parse(await readFile(options.input, 'utf8'));
    const scene = await compileDeckScene(deck, { source: path.relative(kitRoot, options.input).split(path.sep).join('/') });
    const [htmlManifest, htmlValidation] = await Promise.all([
        readFile(path.join(htmlDirectory, 'deck-manifest.json'), 'utf8').then(JSON.parse),
        readFile(path.join(htmlDirectory, 'validation-report.json'), 'utf8').then(JSON.parse),
    ]);
    const expectedPng = designContract.rasterQuality.deliveryPng;
    const slides = htmlManifest.slides.map((slide, index) => {
        const validation = htmlValidation.slides[index];
        if (!validation?.screenshot || validation.screenshotDimensions?.width !== expectedPng.width || validation.screenshotDimensions?.height !== expectedPng.height) {
            throw new Error(`Slide ${slide.id} is missing its validated ${expectedPng.width}x${expectedPng.height} PNG.`);
        }
        return {
            id: slide.id,
            html: `html/${slide.file}`,
            png: `html/screenshots/${path.basename(validation.screenshot)}`,
            pngDimensions: validation.screenshotDimensions,
        };
    });
    const externalCatalogByPath = new Map(externalCatalog.icons.map((icon) => [`assets/${icon.path}`, icon]));
    const externalAssets = [...new Set(scene.slides
        .flatMap((slide) => slide.elements)
        .filter((element) => element.type === 'image' && element.assetKind === 'external')
        .map((element) => element.path))]
        .map((assetPath) => {
            const icon = externalCatalogByPath.get(assetPath);
            return {
                id: icon.id,
                name: icon.name,
                vendor: icon.vendor,
                path: assetPath,
                source: icon.source,
                sourceRevision: icon.sourceRevision,
                license: icon.license,
                trademarkNotice: icon.trademarkNotice,
            };
        });
    const manifest = {
        schemaVersion: 1,
        title: deck.title,
        source: scene.source,
        brandProfile: scene.brandProfile,
        brandStatus: scene.brandStatus,
        outputs: {
            htmlDirectory: path.relative(options.output, htmlDirectory).split(path.sep).join('/'),
            pngDirectory: 'html/screenshots',
            scene: 'html/deck.scene.json',
            htmlValidation: 'html/validation-report.json',
        },
        quality: {
            png: {
                ...expectedPng,
                deviceScaleFactor: designContract.rasterQuality.deviceScaleFactor,
            },
            layout: designContract.layoutQuality,
            repositoryHygiene: {
                postBuildCheck: true,
                approvedScratchPrefixes: ['.tmp/', '.slide-artifacts/'],
            },
        },
        assetResolution: {
            componentInventoryRequired: designContract.assetResolution.componentInventoryRequired,
            exactCatalogMembership: true,
            structuralNativeRoles: Object.keys(designContract.assetResolution.structuralNativeRoles),
            fallbackMetadata: designContract.assetResolution.fallback.metadata,
            externalAssets,
        },
        slides,
    };
    await writeFile(path.join(options.output, 'delivery-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await runNode('check-repo-hygiene.mjs', []);
    console.log(`Built validated HTML and lossless ${expectedPng.width}x${expectedPng.height} PNG deliverables in ${options.output}`);
};

main().catch((error) => {
    console.error(error.stderr || error.stack || error.message);
    process.exitCode = 1;
});