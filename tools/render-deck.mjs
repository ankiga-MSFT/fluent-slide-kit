import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { compileDeckScene, kitRoot } from './composition-core.mjs';
import { renderSceneToDirectory } from './render-scene-html.mjs';

const parseArguments = (arguments_) => {
    const options = {
        input: undefined,
        output: path.join(kitRoot, 'slides'),
        brandProfilePath: undefined,
    };
    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index];
        if (argument === '--output') options.output = path.resolve(arguments_[index += 1]);
        else if (argument === '--brand-profile') options.brandProfilePath = path.resolve(arguments_[index += 1]);
        else if (!options.input) options.input = path.resolve(argument);
        else throw new Error(`Unexpected argument: ${argument}`);
    }
    if (!options.input) {
        throw new Error('Usage: npm run deck:render -- <deck.json> [--output <directory>] [--brand-profile <profile.json>]');
    }
    return options;
};

const main = async () => {
    const options = parseArguments(process.argv.slice(2));
    const deck = JSON.parse(await readFile(options.input, 'utf8'));
    const source = path.relative(kitRoot, options.input).split(path.sep).join('/');
    const scene = await compileDeckScene(deck, {
        source,
        brandProfilePath: options.brandProfilePath,
    });
    const manifest = await renderSceneToDirectory(scene, options.output);
    await writeFile(path.join(options.output, 'deck.scene.json'), `${JSON.stringify(scene, null, 2)}\n`);
    console.log(`Rendered ${manifest.slides.length} scene-driven slides to ${options.output}`);
};

main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
});
