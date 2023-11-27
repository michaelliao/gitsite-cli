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
import { generateBookIndex, generateBlogIndex, isExists, markdownTitleAndSummary, loadBlogInfo, loadBinaryFile, loadYaml, createTemplateEngine, loadTextFile, flattenChapters, getSubDirs, getFiles, writeTextFile, isValidDate } from './helper.js';

async function newGitSite() {
    console.log('prepare generate new git site...');
    const { stdin: input, stdout: output } = await import('node:process');
    const rl = readline.createInterface({ input, output });
    let gsDir = await rl.question('directory of GitSite (default to current directory): ');
    gsDir = gsDir.trim();
    if (gsDir === '') {
        gsDir = process.cwd();
    }
    const defaultName = path.basename(gsDir);
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

function redirectHtml(redirect) {
    return `<html><head><meta http-equiv="refresh" content="0;URL='${redirect}'" /></head><body></body></html>`
}

async function initTemplateContext() {
    const templateContext = await loadYaml('site.yml');
    templateContext.mode = process.env.mode;
    return templateContext;
}

function findPrevNextChapter(chapterList, node) {
    let prevChapter = null, nextChapter = null;
    const nodeIndex = chapterList.findIndex(c => c === node);
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
    if (isExists(siteDir, 'books', book, 'BEFORE.md')) {
        beforeMD = await loadTextFile(siteDir, 'books', book, 'BEFORE.md');
        beforeMD = beforeMD + '\n\n';
    }
    if (isExists(siteDir, 'books', book, 'AFTER.md')) {
        afterMD = await loadTextFile(siteDir, 'books', book, 'AFTER.md');
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
    const files = await getFiles(src, name => !name.startsWith('.') && name !== 'README.md' && name !== 'index.html');
    for (let f of files) {
        const sFile = path.join(src, f);
        const dFile = path.join(dest, f);
        console.log(`copy: ${sFile} to: ${dFile}`);
        fsSync.copyFileSync(sFile, dFile);
    }
}

async function generateHtmlForChapterContent(node, beforeMD, afterMD) {
    const siteDir = process.env.siteDir;
    const mdFileContent = await loadTextFile(siteDir, 'books', node.dir, node.file);
    const markdown = await createMarkdown();
    return markdown.render(beforeMD + mdFileContent + afterMD);
}

async function generateHtmlForPage(templateEngine, mdFilePath) {
    const templateContext = await initTemplateContext();
    templateContext.title = markdownTitleAndSummary(mdFilePath)[0];
    templateContext.htmlContent = (await createMarkdown()).render(await loadTextFile(mdFilePath));
    return templateEngine.render('page.html', templateContext);
}

async function generateHtmlForBlogIndex(templateEngine) {
    const blogs = await generateBlogIndex();
    if (blogs.length === 0) {
        throw 'No blog posted.';
    }
    const templateContext = await initTemplateContext();
    templateContext.blogs = blogs;
    if (!templateContext.blogs.title) {
        templateContext.blogs.title = 'Latest Updates'
    }
    // render blog summary:
    const markdown = await createMarkdown();
    for (let blog of templateContext.blogs) {
        blog.summaryContent = markdown.render(blog.summary);
    }
    return templateEngine.render('blog_list.html', templateContext);
}

async function generateHtmlForBlog(name, templateEngine) {
    const siteDir = process.env.siteDir;
    const [blogInfo, prev, next] = await loadBlogInfo(name);
    const markdown = await createMarkdown();
    const mdFileContent = await loadTextFile(siteDir, 'blogs', name, 'README.md');
    const templateContext = await initTemplateContext();
    templateContext.blog = blogInfo;
    templateContext.blog.content = markdown.render(mdFileContent);
    templateContext.prevBlog = prev;
    templateContext.nextBlog = next;
    return templateEngine.render('blog.html', templateContext);
}

async function buildGitSite(output) {
    const siteDir = process.env.siteDir;
    const outputDir = path.resolve(output);
    console.log(`build git site: ${siteDir} to: ${outputDir}`);
    if (fsSync.existsSync(outputDir)) {
        console.warn(`clean exist output dir: ${outputDir}`);
        fsSync.rmSync(outputDir, { recursive: true });
    }
    fsSync.mkdirSync(outputDir);
    // create template engine:
    const siteInfo = await loadYaml('site.yml');
    const theme = siteInfo.site && siteInfo.site.theme || 'default';
    const templateEngine = createTemplateEngine(path.join(siteDir, 'layout', theme));
    // theme dir:
    const themeDir = path.join(siteDir, 'layout', theme);
    // run pre-build.js:
    await runBuildScript(themeDir, 'pre-build.mjs', siteInfo, outputDir);
    // generate books:
    {
        const books = await getSubDirs(path.join(siteDir, 'books'));
        for (let book of books) {
            console.log(`generate book: ${book}`);
            const root = await generateBookIndex(book);
            if (root.children.length === 0) {
                throw `Empty book ${book}`;
            }
            const [beforeMD, afterMD] = await loadBeforeAndAfter(siteDir, book);
            const first = root.children[0];
            const redirect = `/books/${first.uri}/index.html`;
            await writeTextFile(
                path.join(outputDir, 'books', `${book}`, 'index.html'),
                redirectHtml(redirect)
            );
            const chapterList = flattenChapters(root);
            console.debug(`${book} flattern chapters:
` + JSON.stringify(chapterList, null, '  '));
            for (let node of chapterList) {
                const nodeDir = path.join(siteDir, 'books', `${node.dir}`);
                const htmlFile = path.join(outputDir, 'books', `${node.uri}`, 'index.html');
                const contentHtmlFile = path.join(outputDir, 'books', `${node.uri}`, 'content.html');
                console.debug(`generate file from chapter '${node.dir}': ${htmlFile}, ${contentHtmlFile}`);

                const [prevChapter, nextChapter] = findPrevNextChapter(chapterList, node);
                const templateContext = await initTemplateContext();
                templateContext.book_index = root;
                node.content = await generateHtmlForChapterContent(node, beforeMD, afterMD);
                templateContext.chapter = node;
                templateContext.prevChapter = prevChapter;
                templateContext.nextChapter = nextChapter;
                await writeTextFile(htmlFile, templateEngine.render('book.html', templateContext));
                await writeTextFile(contentHtmlFile, templateEngine.render('book_content.html', templateContext));
                await copyStaticFiles(nodeDir, path.join(outputDir, 'books', `${node.uri}`));
            }
        }
    }
    // generate pages:
    {
        const pages = await getSubDirs(path.join(siteDir, 'pages'));
        for (let page of pages) {
            console.log(`generate page: ${page}`);
            const htmlFile = path.join(outputDir, 'pages', page, 'index.html');
            const mdFilePath = path.join(siteDir, 'pages', page, 'README.md');
            await writeTextFile(htmlFile,
                await generateHtmlForPage(templateEngine, mdFilePath));
            await copyStaticFiles(path.join(siteDir, 'pages'), path.join(outputDir, 'pages'));
        }
    }
    // generate blog index:
    {
        console.log('generate blog index');
        const htmlFile = path.join(outputDir, 'blogs', 'index.html');
        await writeTextFile(htmlFile, await generateHtmlForBlogIndex(templateEngine));
    }
    // generate blogs:
    {
        const blogs = await generateBlogIndex();
        if (blogs.length === 0) {
            throw 'No blog posted.';
        }
        for (let blog of blogs) {
            console.log(`generate blog: ${blog.dir}`);
            const htmlFile = path.join(outputDir, 'blogs', blog.dir, 'index.html');
            await writeTextFile(htmlFile, await generateHtmlForBlog(blog.dir, templateEngine));
            await copyStaticFiles(path.join(siteDir, 'blogs', blog.dir), path.join(outputDir, 'blogs', blog.dir));
        }
    }
    // generate index, 404 page:
    {
        const mapping = {
            'README.md': 'index.html',
            '404.md': '404.html',
        };
        for (let md in mapping) {
            const html = mapping[md];
            console.log(`generate: ${md} => ${html}`);
            const mdFilePath = path.join(siteDir, md);
            const htmlFile = path.join(outputDir, html);
            await writeTextFile(htmlFile, await generateHtmlForPage(templateEngine, mdFilePath));
        }
    }
    // copy static resources:
    {
        const srcStatic = path.join(siteDir, 'static');
        if (isExists(srcStatic)) {
            const destStatic = path.join(outputDir, 'static');
            console.log(`copy static resources from ${srcStatic} to ${destStatic}`);
            fsSync.mkdirSync(destStatic);
            await copyStaticFiles(srcStatic, destStatic);
        }
    }
    // copy special files like favicon.ico:
    {
        const specialFiles = siteInfo.build && siteInfo.build.copy || ['favicon.ico', 'robots.txt'];
        for (let specialFile of specialFiles) {
            const srcFile = path.join(siteDir, specialFile);
            if (isExists(srcFile)) {
                const destFile = path.join(outputDir, specialFile);
                console.log(`copy: ${srcFile} to: ${destFile}`);
                fsSync.copyFileSync(srcFile, destFile);
            } else {
                console.warn(`skipped: file not found: ${specialFile}`);
            }
        }
    }
    // run post-build.js:
    await runBuildScript(themeDir, 'post-build.mjs', siteInfo, outputDir);
    console.log(`Run nginx and visit http://localhost:8000\ndocker run --rm -p 8000:80 -v ${outputDir}:/usr/share/nginx/html nginx:latest`);
    console.log('done.');
    process.exit(0);
}

async function runGitSite(port) {
    const siteDir = process.env.siteDir;
    // check port:
    if (port < 1 || port > 65535) {
        console.error(`port is invalid: ${port}`);
        process.exit(1);
    }
    // create template engine:
    const siteInfo = await loadYaml('site.yml');
    const theme = siteInfo.site && siteInfo.site.theme || 'default';
    const templateEngine = createTemplateEngine(path.join(siteDir, 'layout', theme));

    // start koa http server:
    const app = new Koa();
    const router = new Router();
    app.use(async (ctx, next) => {
        console.log(`${ctx.request.method}: ${ctx.request.path}`);
        await next();
    });
    app.use(router.routes()).use(router.allowedMethods());

    router.get('/', async ctx => {
        try {
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = await generateHtmlForPage(templateEngine, 'README.md');
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/pages/:page/index.html', async ctx => {
        try {
            let page = ctx.params.page;
            let mdFilePath = path.join('pages', `${page}`, 'README.md');
            if (!isExists(siteDir, mdFilePath)) {
                mdFilePath = '404.md';
            }
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = await generateHtmlForPage(templateEngine, mdFilePath);
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/blogs/index.html', async ctx => {
        console.debug('process blog list');
        try {
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = await generateHtmlForBlogIndex(templateEngine);
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/blogs/:name/index.html', async ctx => {
        console.debug(`process blog: name = ${ctx.params.name}`);
        try {
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = await generateHtmlForBlog(ctx.params.name, templateEngine);
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/books/:book/index.html', async ctx => {
        try {
            let book = ctx.params.book;
            let root = await generateBookIndex(book);
            if (root.children.length === 0) {
                throw `Book "${book} is empty.`;
            }
            let child = root.children[0];
            let redirect = `/books/${child.uri}/index.html`;
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = redirectHtml(redirect);
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/books/:book/:chapters(.*)/index.html', async ctx => {
        try {
            let book = ctx.params.book,
                chapters = ctx.params.chapters.split('/');
            const templateContext = await initTemplateContext();
            let root = await generateBookIndex(book);
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
            node.content = await generateHtmlForChapterContent(node, beforeMD, afterMD);
            templateContext.chapter = node;
            templateContext.prevChapter = prevChapter;
            templateContext.nextChapter = nextChapter;
            console.debug(`template context production: ${templateContext.production}`);
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
            let root = await generateBookIndex(book);
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
            const templateContext = await initTemplateContext();
            let [beforeMD, afterMD] = await loadBeforeAndAfter(siteDir, book);
            node.content = await generateHtmlForChapterContent(node, beforeMD, afterMD);
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
            let root = await generateBookIndex(book);
            // find chapter by uri:
            let uri = `${book}/` + chapters.join('/');
            let chapterList = flattenChapters(root);
            let node = chapterList.find(c => c.uri === uri);
            if (node === undefined) {
                throw `Chapter not found: ${ctx.params.chapters}`;
            }
            let file = path.join(siteDir, 'books', node.dir, ctx.params.file);
            console.debug(`try file: ${file}`);
            if (isExists(file)) {
                ctx.type = mime.getType(ctx.request.path) || 'application/octet-stream';
                ctx.body = await loadBinaryFile(file);
            } else {
                sendError(404, ctx, `File not found: ${file}`);
            }
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/(.*)', async ctx => {
        let file, p = ctx.request.path.substring(1);
        if (p.startsWith('blogs/')
            || p.startsWith('pages/')) {
            file = path.join(siteDir, p);
            console.debug(`try file: ${file}`);
            if (!isExists(file)) {
                return sendError(404, ctx, `File not found: ${file}`);
            }
        } else if (p.startsWith('static/')) {
            file = path.join(siteDir, p);
            console.debug(`try file: ${file}`);
            if (!isExists(file)) {
                file = path.join(siteDir, 'layout', theme, p);
                console.debug(`try file: ${file}`);
            }
            if (!isExists(file)) {
                return sendError(404, ctx, `File not found: ${file}`);
            }
        } else if (p === 'favicon.ico') {
            file = path.join(siteDir, p);
            console.debug(`try file: ${file}`);
            if (!isExists(file)) {
                return sendError(404, ctx, `File not found: ${file}`);
            }
        }
        else {
            return sendError(404, ctx, `File not found: ${file}`);
        }
        ctx.type = mime.getType(ctx.request.path) || 'application/octet-stream';
        ctx.body = await loadBinaryFile(file);
    });

    app.on('error', err => {
        console.error('server error', err)
    });

    app.listen(port);
    console.log(`set gitsite directory: ${siteDir}`);
    console.log(`server is running at port ${port}...`);
}

function normalizeAndCheckSiteDir(dir) {
    const siteDir = path.resolve(dir);
    if (!fsSync.existsSync(siteDir)) {
        console.error(`dir not exist: ${dir}`);
        process.exit(1);
    }
    return siteDir;
}

function main() {
    const program = new Command();
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const packageJsonFile = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fsSync.readFileSync(packageJsonFile, { encoding: 'utf8' }));

    const setVerbose = (isVerbose) => {
        if (!isVerbose) {
            console.debug = () => { };
        }
    }

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
        .option('-v, --verbose', 'make more logs for debugging.')
        .action(async options => {
            setVerbose(options.verbose);
            process.env.mode = 'run';
            process.env.siteDir = normalizeAndCheckSiteDir(options.dir);
            await runGitSite(parseInt(options.port));
        });

    program.command('build')
        .description('Build static web site.')
        .option('-d, --dir <directory>', 'source directory.', '.')
        .option('-o, --output <directory>', 'output directory.', 'dist')
        .option('-v, --verbose', 'make more logs for debugging.')
        .action(async options => {
            setVerbose(options.verbose);
            process.env.mode = 'build';
            process.env.siteDir = normalizeAndCheckSiteDir(options.dir);
            await buildGitSite(options.output);
        });

    program.parse();
}

main();
