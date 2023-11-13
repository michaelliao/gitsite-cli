#!/usr/bin/env node

import path from 'node:path';
import readline from 'node:readline/promises';
import * as fsSync from 'node:fs';

import { Command } from 'commander';
import mime from 'mime';
import Koa from 'koa';
import Router from '@koa/router';

import createMarkdown from './markdown.mjs';
import { generateBookIndex, findChapter, loadBinaryFile, loadYaml, createTemplateEngine, loadTextFile, flattenChapters } from './helper.mjs';

async function newGitSite() {
    console.log('prepare generate new git site...');
    const { stdin: input, stdout: output } = await import('node:process');
    const rl = readline.createInterface({ input, output });
    let gsDir = await rl.question('directory of GitSite (default to current directory): ');
    gsDir = gsDir.trim();
    if (gsDir === '') {
        gsDir = process.cwd();
    }
    let defaultName = path.basename(gsDir);
    let gsName = await rl.question(`name of GitSite (default to ${defaultName}): `);
    gsName = gsName.trim();
    if (gsName.trim() === '') {
        gsName = defaultName;
    }

    console.log(`new git site:
directory: ${gsDir}
name: ${gsName}
`);
    let gsYN = await rl.question('generate now? y/N: ');
    gsYN = gsYN.trim();
    await rl.close();

    if (gsYN.toLowerCase() !== 'y') {
        console.log('abort.');
        process.exit(1);
    }

    // test if directory is empty:

    // extract zip to directory:

    console.log('done.');
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

async function runGitSite(dir, port) {
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
    // create template engine:
    const templateContext = await loadYaml(siteDir, 'site.yml');
    const theme = templateContext.site && templateContext.site.theme || 'default';
    const templateEngine = createTemplateEngine(path.resolve(siteDir, 'layout', theme));

    // start koa http server:
    const app = new Koa();
    const router = new Router();
    app.use(router.routes())
        .use(router.allowedMethods());

    router.get('/', async ctx => {
        ctx.type = 'text/html; charset=utf-8';
        ctx.body = '<h1>Homepage</h1>';
    });

    router.get('/books/:book.html', async ctx => {
        try {
            let book = ctx.params.book;
            let root = await generateBookIndex(siteDir, 'books', book);
            if (root.children.length === 0) {
                throw `Book "${book} is empty.`;
            }
            let child = root.children[0];
            let redirect = '/books/' + child.uri;
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = `<html>
<head>
    <meta http-equiv="refresh" content="0;URL='${redirect}'" />
</head>
<body>
</body>
</html>
`;
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/books/:book/:chapters(.*).html', async ctx => {
        try {
            let book = ctx.params.book,
                chapters = ctx.params.chapters.split('/');
            const templateContext = await loadYaml(siteDir, 'site.yml');
            let root = await generateBookIndex(siteDir, book);
            // find chapter by uri:
            let uri = `${book}/` + chapters.join('/');
            let chapterList = flattenChapters(root);
            let node = chapterList.find(c => c.uri === uri);
            if (node === undefined) {
                throw `Chapter not found: ${ctx.params.chapters}`;
            }
            let prevChapter = null, nextChapter = null;
            let nodeIndex = chapterList.findIndex(c => c === node);
            if (nodeIndex > 0) {
                prevChapter = chapterList[nodeIndex - 1];
            }
            if (nodeIndex < chapterList.length - 1) {
                nextChapter = chapterList[nodeIndex + 1];
            }
            templateContext.__index__ = root;
            const mdFileContent = await loadTextFile(siteDir, 'books', node.dir, node.file);
            const markdown = await createMarkdown();
            node.content = markdown.render(mdFileContent);
            templateContext.chapter = node;
            templateContext.prevChapter = prevChapter;
            templateContext.nextChapter = nextChapter;
            const html = templateEngine.render('index.html', templateContext);
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = html;
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/books/:book/:chapters(.*).htm', async ctx => {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        await sleep(1000);
        try {
            let book = ctx.params.book,
                chapters = ctx.params.chapters.split('/');
            let root = await generateBookIndex(siteDir, book);
            // find chapter by uri:
            let uri = `${book}/` + chapters.join('/');
            let chapterList = flattenChapters(root);
            let node = chapterList.find(c => c.uri === uri);
            if (node === undefined) {
                throw `Chapter not found: ${ctx.params.chapters}`;
            }
            let prevChapter = null, nextChapter = null;
            let nodeIndex = chapterList.findIndex(c => c === node);
            if (nodeIndex > 0) {
                prevChapter = chapterList[nodeIndex - 1];
            }
            if (nodeIndex < chapterList.length - 1) {
                nextChapter = chapterList[nodeIndex + 1];
            }
            const templateContext = {};
            const mdFileContent = await loadTextFile(siteDir, 'books', node.dir, node.file);
            const markdown = await createMarkdown();
            node.content = markdown.render(mdFileContent);
            templateContext.chapter = node;
            templateContext.prevChapter = prevChapter;
            templateContext.nextChapter = nextChapter;
            const html = templateEngine.render('book_content.html', templateContext);
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = html;
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/(.*)', async ctx => {
        try {
            // global static file:
            const theme = templateContext.site && templateContext.site.theme || 'default';
            let staticFileContent = await loadBinaryFile(siteDir, 'layout', theme, ctx.request.path.substring(1));
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
        .action(async options => {
            await runGitSite(options.dir, parseInt(options.port));
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
