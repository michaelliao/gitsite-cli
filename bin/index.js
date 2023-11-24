#!/usr/bin/env node

import path from 'node:path';
import readline from 'node:readline/promises';
import * as fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import mime from 'mime';
import Koa from 'koa';
import Router from '@koa/router';

import createMarkdown from './markdown.js';
import { generateBookIndex, isFileExists, markdownTitle, loadBinaryFile, loadYaml, createTemplateEngine, loadTextFile, flattenChapters, getSubDirs, getMdFiles, getFiles, writeTextFile } from './helper.js';

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

function findPrevNextChapter(chapterList, node) {
    let prevChapter = null, nextChapter = null;
    let nodeIndex = chapterList.findIndex(c => c === node);
    if (nodeIndex > 0) {
        prevChapter = chapterList[nodeIndex - 1];
    }
    if (nodeIndex < chapterList.length - 1) {
        nextChapter = chapterList[nodeIndex + 1];
    }
    return [prevChapter, nextChapter];
}

async function loadBeforeAndAfter(siteDir, book) {
    let beforeMD = '', afterMD = '';
    if (isFileExists(siteDir, 'books', book, 'before.md')) {
        beforeMD = await loadTextFile(siteDir, 'books', book, 'before.md');
        beforeMD = beforeMD + '\n\n';
    }
    if (isFileExists(siteDir, 'books', book, 'after.md')) {
        afterMD = await loadTextFile(siteDir, 'books', book, 'after.md');
        afterMD = '\n\n' + afterMD;
    }
    return [beforeMD, afterMD];
}

async function runBuildScript(themeDir, jsFile, templateContext, outputDir) {
    const buildJs = path.join(themeDir, jsFile);
    if (fsSync.existsSync(buildJs)) {
        console.log(`run ${buildJs}...`);
        const build = await import(buildJs);
        const cwd = process.cwd();
        process.chdir(themeDir);
        await build.default(templateContext, outputDir);
        process.chdir(cwd);
    }
}

async function copyStaticFiles(src, dest) {
    let files = await getFiles(src, name => !name.startsWith('.') && name !== 'index.md' && name !== 'README.md');
    for (let f of files) {
        let sFile = path.join(src, f);
        let dFile = path.join(dest, f);
        console.log(`copy: ${sFile} to: ${dFile}`);
        fsSync.copyFileSync(sFile, dFile);
    }
}

async function buildContent(siteDir, node, beforeMD, afterMD) {
    const mdFileContent = await loadTextFile(siteDir, 'books', node.dir, node.file);
    const markdown = await createMarkdown();
    return markdown.render(beforeMD + mdFileContent + afterMD);
}

async function markdownToPage(siteDir, templateEngine, mdFilePath, viewPath, isProduction = false) {
    const templateContext = await loadYaml(siteDir, 'site.yml');
    templateContext.production = isProduction;
    templateContext.title = markdownTitle(mdFilePath);
    templateContext.htmlContent = (await createMarkdown()).render(await loadTextFile(mdFilePath));
    return templateEngine.render(viewPath, templateContext);
}

async function buildGitSite(dir, output) {
    // check site dir exists:
    const siteDir = path.resolve(dir);
    if (!fsSync.existsSync(siteDir)) {
        console.error(`dir not exist: ${dir}`);
        process.exit(1);
    }
    const outputDir = path.resolve(output);
    console.log(`build git site: ${siteDir} to: ${outputDir}`);
    if (fsSync.existsSync(outputDir)) {
        console.warn(`clean exist output dir: ${outputDir}`);
        fsSync.rmSync(outputDir, { recursive: true });
    }
    fsSync.mkdirSync(outputDir);
    // create template engine:
    const siteInfo = await loadYaml(siteDir, 'site.yml');
    const theme = siteInfo.site && siteInfo.site.theme || 'default';
    const templateEngine = createTemplateEngine(path.resolve(siteDir, 'layout', theme));
    // theme dir:
    const themeDir = path.join(siteDir, 'layout', theme);
    // run pre-build.js:
    await runBuildScript(themeDir, 'pre-build.mjs', siteInfo, outputDir);
    // generate books:
    const books = await getSubDirs(path.join(siteDir, 'books'));
    for (let book of books) {
        console.log(`generate book: ${book}`);
        let root = await generateBookIndex(siteDir, book);
        if (root.children.length === 0) {
            throw `Empty book ${book}`;
        }
        let [beforeMD, afterMD] = await loadBeforeAndAfter(siteDir, book);
        let first = root.children[0];
        let redirect = `/books/${first.uri}/index.html`;
        await writeTextFile(
            path.join(outputDir, 'books', `${book}`, 'index.html'),
            templateEngine.render('book_home.html', { redirect: redirect })
        );
        let chapterList = flattenChapters(root);
        console.log(JSON.stringify(chapterList, null, '  '));
        for (let node of chapterList) {
            const nodeDir = path.join(siteDir, 'books', `${node.dir}`);
            const htmlFile = path.join(outputDir, 'books', `${node.uri}`, 'index.html');
            const contentHtmlFile = path.join(outputDir, 'books', `${node.uri}`, 'content.html');
            console.log(`> generate file: ${htmlFile}, ${contentHtmlFile}`);

            const [prevChapter, nextChapter] = findPrevNextChapter(chapterList, node);
            const templateContext = await loadYaml(siteDir, 'site.yml');
            // set production mode:
            templateContext.production = true;
            templateContext.book_index = root;
            node.content = await buildContent(siteDir, node, beforeMD, afterMD);
            templateContext.chapter = node;
            templateContext.prevChapter = prevChapter;
            templateContext.nextChapter = nextChapter;
            await writeTextFile(htmlFile, templateEngine.render('book.html', templateContext));
            await writeTextFile(contentHtmlFile, templateEngine.render('book_content.html', templateContext));
            await copyStaticFiles(nodeDir, path.join(outputDir, 'books', `${node.uri}`));
        }
    }
    // generate pages:
    const pages = await getMdFiles(path.join(siteDir, 'pages'));
    for (let page of pages) {
        console.log(`generate page: ${page}`);
        const htmlFile = path.join(outputDir, 'pages', `${page}.html`);
        const mdFilePath = path.join(siteDir, 'pages', `${page}.md`);
        await writeTextFile(htmlFile,
            await markdownToPage(siteDir, templateEngine, mdFilePath, 'page.html', true));
        await copyStaticFiles(path.join(siteDir, 'pages'), path.join(outputDir, 'pages'));
    }
    // generate index, 404 page:
    for (let name of ['index', '404']) {
        console.log(`generate ${name}.html`);
        const htmlFile = path.join(outputDir, `${name}.html`);
        const mdFilePath = path.join(siteDir, `${name}.md`);
        await writeTextFile(htmlFile,
            await markdownToPage(siteDir, templateEngine, mdFilePath, 'page.html', true));
        await copyStaticFiles(siteDir, outputDir);
    }

    // run post-build.js:
    await runBuildScript(themeDir, 'post-build.mjs', siteInfo, outputDir);
    console.log(`Run nginx and visit http://localhost:8000\ndocker run --rm -p 8000:80 -v ${outputDir}:/usr/share/nginx/html nginx:latest`);
    console.log('done.');
    process.exit(0);
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
    const siteInfo = await loadYaml(siteDir, 'site.yml');
    const theme = siteInfo.site && siteInfo.site.theme || 'default';
    const templateEngine = createTemplateEngine(path.resolve(siteDir, 'layout', theme));

    // start koa http server:
    const app = new Koa();
    const router = new Router();
    app.use(router.routes())
        .use(router.allowedMethods());

    router.get('/', async ctx => {
        try {
            const mdFilePath = path.join(siteDir, 'index.md');
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = await markdownToPage(siteDir, templateEngine, mdFilePath, 'page.html');
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/pages/:page.html', async ctx => {
        try {
            let page = ctx.params.page;
            let mdFilePath = path.join(siteDir, 'pages', `${page}.md`);
            if (!isFileExists(mdFilePath)) {
                mdFilePath = path.join(siteDir, '404.md');
            }
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = await markdownToPage(siteDir, templateEngine, mdFilePath, 'page.html');
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/books/:book/index.html', async ctx => {
        try {
            let book = ctx.params.book;
            let root = await generateBookIndex(siteDir, book);
            if (root.children.length === 0) {
                throw `Book "${book} is empty.`;
            }
            let child = root.children[0];
            let redirect = `/books/${child.uri}/index.html`;
            const html = templateEngine.render('book_home.html', {
                redirect: redirect
            });
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = html;
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/books/:book/:chapters(.*)/index.html', async ctx => {
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
            templateContext.book_index = root;
            let [prevChapter, nextChapter] = findPrevNextChapter(chapterList, node);
            let [beforeMD, afterMD] = await loadBeforeAndAfter(siteDir, book);
            node.content = await buildContent(siteDir, node, beforeMD, afterMD);
            templateContext.chapter = node;
            templateContext.prevChapter = prevChapter;
            templateContext.nextChapter = nextChapter;
            const html = templateEngine.render('book.html', templateContext);
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = html;
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/books/:book/:chapters(.*)/content.html', async ctx => {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        await sleep(200);
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
            let [beforeMD, afterMD] = await loadBeforeAndAfter(siteDir, book);
            node.content = await buildContent(siteDir, node, beforeMD, afterMD);
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

    router.get('/books/:book/:chapters(.*)/:file', async ctx => {
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
            let file = path.join(siteDir, 'books', node.dir, ctx.params.file);
            console.log(`try file: ${file}`);
            if (isFileExists(file)) {
                ctx.type = mime.getType(ctx.request.path) || 'application/octet-stream';
                ctx.body = await loadBinaryFile(file);
            } else {
                sendError(404, ctx, 'File not found.');
            }
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/(.*)', async ctx => {
        let file;
        if (ctx.request.path.startsWith('/blog/')
            || ctx.request.path.startsWith('/pages/')) {
            file = path.join(siteDir, ctx.request.path.substring(1));
        } else {
            file = path.join(siteDir, 'layout', theme, ctx.request.path.substring(1));
        }
        const type = mime.getType(ctx.request.path) || 'application/octet-stream';
        console.log(`try file: ${file}`);
        if (isFileExists(file)) {
            ctx.type = type;
            ctx.body = await loadBinaryFile(file);
        } else {
            sendError(404, ctx, 'File not found.');
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
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const packageJsonFile = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fsSync.readFileSync(packageJsonFile, { encoding: 'utf8' }));

    program.name(packageJson.name)
        .description(packageJson.description)
        .version(packageJson.version);

    program.command('new')
        .description('Generate a new static web site.')
        .action(newGitSite);

    program.command('run')
        .description('Run as static web site in local environment.')
        .option('-d, --dir <directory>', 'source directory.', '.')
        .option('-p, --port <port>', 'local server port.', '3000')
        .action(async options => {
            await runGitSite(options.dir, parseInt(options.port));
        });

    program.command('build')
        .description('Build static web site.')
        .option('-d, --dir <directory>', 'source directory.', '.')
        .option('-o, --output <directory>', 'output directory.', 'dist')
        .action(async options => {
            await buildGitSite(options.dir, options.output);
        });

    program.parse();
}

main();
