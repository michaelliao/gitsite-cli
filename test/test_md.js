import test from 'node:test';
import assert from 'node:assert/strict';

import { readdirSync } from 'node:fs';
import createMarkdown from '../bin/markdown.js';
import { readFile } from 'node:fs/promises';

async function check_file(name) {
    const src = await readFile(`test/resources/${name}.md`, { encoding: 'utf-8' });
    const html = await readFile(`test/resources/${name}.html`, { encoding: 'utf-8' });
    const md = await createMarkdown();
    assert.equal(md.render(src), html);
}

process.env.disableCache = true;
process.env.cacheDir = path.join(process.cwd(), '.cache');
if (!existsSync(process.env.cacheDir)) {
    mkdirSync(process.env.cacheDir);
}

const tests = readdirSync('test/resources').filter(name => name.endsWith('.md')).map(name => name.substring(0, name.length - 3));

for (let name of tests) {
    test(`test ${name}.md <=> ${name}.html`, async (t) => {
        await check_file(name);
    });
}
