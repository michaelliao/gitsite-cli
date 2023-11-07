#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs/promises';
import readline from 'node:readline/promises';
import * as fsSync from 'node:fs';

import { Command } from 'commander';
import mime from 'mime';
import Koa from 'koa';
import Router from '@koa/router';

import generateBookIndex from './book-index.mjs';
import { loadLayout, loadTextFile, loadBinaryFile, loadYaml, executeTemplate } from './helper.mjs';

const globalStatus = {

    bookWatchVersion: 1
};

generateBookIndex(path.resolve('books'), 'gitsite-guide');



async function getBookIndex(siteDir, book) {
    return '<h1>index</h1>';
}

async function getBookChapter(siteDir, book, chapter) {
    return '<h1>chapter hello</h1>';
}

async function newGitSite() {
    console.log('prepare generate new git site...');
    const { stdin: input, stdout: output } = require('node:process');
    const rl = readline.createInterface({ input, output });
    let siteDir = await rl.question('GitSite directory (default to current directory): ');
    if (siteDir.trim() === '') {
        siteDir = process.cwd();
    }
    let name = path.basename(siteDir);
    let gsName = await rl.question(`GitSite name (default to ${name}): `);

    console.log(`Prepare generating new git site:
Directory: ${siteDir}
`);
    await rl.close();
}

function sendError(code, ctx, err) {
    console.error(err);
    ctx.status = code;
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = `<html>
<head>
  <title>Error</title>
</head>
<body>
<pre><code style="color:red">${code} error when process request: ${ctx.request.method} ${ctx.request.path}

Error message:

${err.toString()}</code></pre>
</body>
</html>
`;
}

function runGitSite(dir, port) {
    // check site dir exists:
    const siteDir = path.resolve(dir);
    if (!fsSync.existsSync(siteDir)) {
        console.error(`dir not exist: ${dir}`);
        process.exit(1);
    }
    // check port:
    if (port < 1 || port > 65535) {
        console.error(`port is invalid: ${port}`);
        process.exit(1);
    }
    // start koa http server:
    const app = new Koa(); fsSync
    const router = new Router();
    app.use(router.routes())
        .use(router.allowedMethods());

    router.get('/books/:book/:chapter', async ctx => {
        try {
            let book = ctx.params.book,
                chapter = ctx.params.chapter;
            const templateContext = await loadYaml(siteDir, 'site.yml');
            await getBookIndex(siteDir, book);
            await getBookChapter(siteDir, book, chapter);
            let layouts = await loadLayout(siteDir);
            let outputs = [];
            for (let layout of layouts) {
                if (layout.type === 'text') {
                    let s = executeTemplate(layout.value, templateContext);
                    outputs.push(s);
                } else if (layout.type === 'file') {
                    let templ = await loadTextFile(siteDir, 'layout/' + layout.value);
                    let s = executeTemplate(templ, templateContext);
                    outputs.push(s);
                } else if (layout.type === 'virtual') {
                    //
                } else {
                    throw `Error: unsupported server-side-include instruction: ${layout.type}`;
                }
            }
            let html = outputs.join('');
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = html;
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/(.*)', async ctx => {
        try {
            // global static file:
            let staticFileContent = await loadBinaryFile(siteDir, 'layout/' + ctx.request.path);
            ctx.type = mime.getType(ctx.request.path) || 'application/octet-stream';
            ctx.body = staticFileContent;
        } catch (err) {
            sendError(404, ctx, err);
        }
    });

    app.on('error', err => {
        console.error('server error', err)
    });

    app.listen(port);
    console.log(`set gitsite directory: ${siteDir}`);
    console.log(`server is running at port ${port}...`);
    fsSync.watch(siteDir, { recursive: true }, (eventType, filename) => {
        console.log(eventType);
        // could be either 'rename' or 'change'. new file event and delete
        // also generally emit 'rename'
        console.log(filename);
    })
}

function main() {
    const program = new Command();

    program.name('gitsite-cli')
        .description('Tools for generate static web site from git repository.')
        .version('1.0.0');

    program.command('new')
        .description('Generate a new static web site.')
        .action(newGitSite);

    program.command('run')
        .description('Run as static web site in local environment.')
        .option('-d, --dir <directory>', 'local directory.', '.')
        .option('-p, --port <port>', 'local server port.', '3000')
        .action(options => {
            runGitSite(options.dir, parseInt(options.port));
        });

    program.command('build')
        .description('Build static web site.')
        .option('-o, --output <directory>', 'output directory.', 'docs')
        .option('-p, --port <port>', 'local server port.', '5000')
        .action((str, options) => {
            console.log(`new site ${JSON.stringify(str)}, ${JSON.stringify(options)}`);
        });

    program.parse();
}

main();
