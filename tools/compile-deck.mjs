import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { compileDeckScene, kitRoot } from './scene-core.mjs';

const arguments_ = process.argv.slice(2);
const input = arguments_.find((argument) => !argument.startsWith('--'));
const outputIndex = arguments_.indexOf('--output');
if (!input) throw new Error('Usage: node tools/compile-deck.mjs <deck.json> [--output <scene.json>]');
const inputPath = path.resolve(input);
const outputPath = outputIndex >= 0
    ? path.resolve(arguments_[outputIndex + 1])
    : path.join(kitRoot, '.slide-artifacts', 'scenes', `${path.basename(inputPath, path.extname(inputPath))}.scene.json`);
const deck = JSON.parse(await readFile(inputPath, 'utf8'));
const scene = await compileDeckScene(deck, { source: path.relative(kitRoot, inputPath).split(path.sep).join('/') });
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(scene, null, 2)}\n`);
console.log(`Compiled ${scene.slides.length} slides to ${outputPath}`);