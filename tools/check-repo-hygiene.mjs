import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const approvedScratchPrefixes = ['.tmp/', '.slide-artifacts/'];
const requiredIgnoreRules = ['.tmp/', '.slide-artifacts/'];
const temporaryBasenamePatterns = [
    /^run[_-]?searches?(?:[_-].*)?\.(?:cjs|mjs|js|ts|py|ps1|sh|cmd|bat|txt|json)$/i,
    /^(?:tmp|temp|scratch|probe)(?:[_-].*)?\.(?:cjs|mjs|js|ts|py|ps1|sh|cmd|bat|txt|json)$/i,
    /\.(?:tmp|temp|bak|orig|rej|swp|swo)$/i,
    /^~.+$/,
];

const normalizePath = (filePath) => filePath.replaceAll('\\', '/').replace(/^\.\//, '');

export const isTemporaryArtifactPath = (filePath) => {
    const normalized = normalizePath(filePath);
    if (approvedScratchPrefixes.some((prefix) => normalized.startsWith(prefix))) return false;
    const basename = path.posix.basename(normalized);
    return temporaryBasenamePatterns.some((pattern) => pattern.test(basename));
};

export const findTemporaryArtifactPaths = (paths) => [...new Set(paths
    .map(normalizePath)
    .filter(isTemporaryArtifactPath))].sort();

const listTrackedAndUntrackedPaths = () => execFileSync('git', [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
], {
    cwd: kitRoot,
    encoding: 'utf8',
}).split('\0').filter(Boolean);

const findMissingIgnoreRules = () => {
    const rules = new Set(readFileSync(path.join(kitRoot, '.gitignore'), 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#')));
    return requiredIgnoreRules.filter((rule) => !rules.has(rule));
};

export const checkRepositoryHygiene = () => ({
    missingIgnoreRules: findMissingIgnoreRules(),
    temporaryArtifacts: findTemporaryArtifactPaths(listTrackedAndUntrackedPaths()),
});

const run = () => {
    const hookMode = process.argv.includes('--hook');
    const report = checkRepositoryHygiene();
    const failures = [];
    if (report.missingIgnoreRules.length > 0) {
        failures.push(`Missing required .gitignore rules: ${report.missingIgnoreRules.join(', ')}`);
    }
    if (report.temporaryArtifacts.length > 0) {
        failures.push(`Temporary artifacts must move under .tmp/ or .slide-artifacts/: ${report.temporaryArtifacts.join(', ')}`);
    }
    if (failures.length > 0) {
        console.error(`Repository hygiene check failed.\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
        process.exitCode = hookMode ? 2 : 1;
        return;
    }
    if (!hookMode) console.log('PASS: repository temporary-file policy.');
};

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) run();