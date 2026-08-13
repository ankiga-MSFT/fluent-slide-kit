import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { kitRoot, loadDiagram, renderDiagramSvg, validateDiagram } from './diagram-core.mjs';

const parseArguments = (arguments_) => {
    const options = { input: undefined, output: undefined };
    for (let index = 0; index < arguments_.length; index += 1) {
        if (arguments_[index] === '--output') options.output = path.resolve(arguments_[index += 1]);
        else if (!options.input) options.input = path.resolve(arguments_[index]);
        else throw new Error(`Unexpected argument: ${arguments_[index]}`);
    }
    if (!options.input) throw new Error('Usage: npm run diagram:render -- <diagram.json> [--output <diagram.svg>]');
    const baseName = path.basename(options.input, path.extname(options.input));
    options.output ??= path.join(kitRoot, '.slide-artifacts', 'diagrams', baseName, `${baseName}.svg`);
    return options;
};

const main = async () => {
    const options = parseArguments(process.argv.slice(2));
    const diagram = await loadDiagram(options.input);
    const result = await validateDiagram(diagram);
    if (result.errors.length) throw new Error(result.errors.join('\n'));
    await mkdir(path.dirname(options.output), { recursive: true });
    await writeFile(options.output, `${await renderDiagramSvg(diagram)}\n`);
    for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
    console.log(`Rendered diagram to ${options.output}`);
};

main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
});
