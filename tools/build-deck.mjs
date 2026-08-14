import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { loadDiagram, resolveDiagramPath } from './diagram-core.mjs';
import { compileDeckScene, kitRoot } from './scene-core.mjs';

const execFileAsync = promisify(execFile);

const parseArguments = (arguments_) => {
    const options = { input: undefined, output: undefined, preview: false, requirePreview: false };
    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index];
        if (argument === '--output') options.output = path.resolve(arguments_[index += 1]);
        else if (argument === '--preview') options.preview = true;
        else if (argument === '--require-preview') {
            options.preview = true;
            options.requirePreview = true;
        } else if (!options.input) options.input = path.resolve(argument);
        else throw new Error(`Unexpected argument: ${argument}`);
    }
    if (!options.input) throw new Error('Usage: npm run deck:build -- <deck.json> [--output <directory>] [--preview]');
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
    const htmlDirectory = path.join(options.output, 'html');
    const pptxPath = path.join(options.output, `${path.basename(options.input, path.extname(options.input))}.pptx`);
    const pptxValidationDirectory = path.join(options.output, 'pptx-validation');
    await mkdir(options.output, { recursive: true });

    await runNode('validate-deck.mjs', [options.input, '--output', htmlDirectory]);
    await runNode('export-deck-pptx.mjs', [options.input, '--output', pptxPath]);
    const pptxArguments = [pptxPath, '--deck', options.input, '--output', pptxValidationDirectory];
    if (options.requirePreview) pptxArguments.push('--require-preview');
    else if (options.preview) pptxArguments.push('--preview');
    await runNode('validate-pptx.mjs', pptxArguments);

    const deck = JSON.parse(await readFile(options.input, 'utf8'));
    const scene = await compileDeckScene(deck, { source: path.relative(kitRoot, options.input).split(path.sep).join('/') });
    const slides = [];
    for (const slide of deck.slides) {
        let powerPointMode = 'native-shapes';
        if (slide.diagram) {
            const diagram = await loadDiagram(resolveDiagramPath(slide.diagram.path));
            powerPointMode = diagram.diagramType === 'layered-architecture' ? 'native-shapes' : 'validated-graphic';
        }
        slides.push({ id: slide.id, layout: slide.layout, powerPointMode });
    }
    const manifest = {
        schemaVersion: 1,
        title: deck.title,
        source: scene.source,
        brandProfile: scene.brandProfile,
        brandStatus: scene.brandStatus,
        outputs: {
            editablePowerPoint: path.relative(options.output, pptxPath).split(path.sep).join('/'),
            htmlDirectory: path.relative(options.output, htmlDirectory).split(path.sep).join('/'),
            scene: 'html/deck.scene.json',
            htmlValidation: 'html/validation-report.json',
            powerPointValidation: 'pptx-validation/validation-report.json',
            powerPointPreviews: options.preview ? 'pptx-validation/previews/' : undefined,
        },
        slides,
        limitations: slides.some((slide) => slide.powerPointMode === 'validated-graphic')
            ? ['Complex flow diagrams are embedded as validated graphics; surrounding slide content remains editable.']
            : [],
    };
    await writeFile(path.join(options.output, 'delivery-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Built validated HTML and editable PowerPoint deliverables in ${options.output}`);
};

main().catch((error) => {
    console.error(error.stderr || error.stack || error.message);
    process.exitCode = 1;
});