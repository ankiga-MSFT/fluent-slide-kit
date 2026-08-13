import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { compileDeckScene, kitRoot } from './scene-core.mjs';
import { renderSceneToPptx } from './render-scene-pptx.mjs';

const parseArguments = (arguments_) => {
    const options = { input: undefined, output: undefined, brandProfilePath: undefined };
    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index];
        if (argument === '--output') options.output = path.resolve(arguments_[index += 1]);
        else if (argument === '--brand-profile') options.brandProfilePath = path.resolve(arguments_[index += 1]);
        else if (!options.input) options.input = path.resolve(argument);
        else throw new Error(`Unexpected argument: ${argument}`);
    }
    if (!options.input) throw new Error('Usage: npm run deck:export:pptx -- <deck.json> [--output <file.pptx>]');
    options.output ??= path.join(kitRoot, '.slide-artifacts', 'pptx', `${path.basename(options.input, path.extname(options.input))}.pptx`);
    return options;
};

const options = parseArguments(process.argv.slice(2));
const deck = JSON.parse(await readFile(options.input, 'utf8'));
const scene = await compileDeckScene(deck, {
    source: path.relative(kitRoot, options.input).split(path.sep).join('/'),
    brandProfilePath: options.brandProfilePath,
});
await renderSceneToPptx(scene, options.output);
console.log(`Exported ${scene.slides.length} editable slides to ${options.output}`);