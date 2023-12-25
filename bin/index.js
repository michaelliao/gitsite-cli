#!/usr/bin/env node

import path from 'node:path';
import readline from 'node:readline/promises';
import * as fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';

import _ from 'lodash';
import { Command } from 'commander';
import mime from 'mime';
import nunjucks from 'nunjucks';
import Koa from 'koa';
import Router from '@koa/router';
import lunr from 'lunr';

import createMarkdown from './markdown.js';
import { markdownToTxt } from 'markdown-to-txt';
import { copyStaticFiles, isExists, loadBinaryFile, loadYaml, loadTextFile, flattenChapters, getSubDirs, markdownFileInfo, writeTextFile, isValidDate, markdownTitleSummaryContent } from './helper.js';

const DEFAULT_CONFIG = {
    site: {
        title: 'GitSite',
        description: 'Powered by GitSite',
        keywords: 'gitsite, git',
        theme: 'default',
        navigation: [],
        contact: {
            name: 'Git Site',
            github: 'https://github.com/michaelliao/gitsite'
        },
        blogs: {
            title: 'Latest Updates'
        },
        books: {
            indexMarker: true
        },
        search: {
            languages: []
        }
    },
    build: {
        copy: ['favicon.ico', 'robots.txt', 'ads.txt']
    }
};

async function loadConfig() {
    let config = await loadYaml('site.yml');
    _.defaultsDeep(config, DEFAULT_CONFIG);
    return config;
}

function chapterURI(dir) {
    let base = path.basename(dir);
    let groups = /^(\d{1,8})[\-\.\_](.+)$/.exec(base);
    if (groups === null) {
        console.warn(`WARNING: folder will be sort at last for there is no order that can extract from name: ${dir}`);
        return [100_000_000, base];
    }
    return [parseInt(groups[1]), groups[2]];
}

function blogInfo(siteDir, name) {
    const blogsDir = path.join(siteDir, 'blogs');
    let cover = null;
    for (let img of ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp', 'cover.gif', 'cover.svg']) {
        if (isExists(path.join(blogsDir, name, img))) {
            cover = img;
            break;
        }
    }
    if (!cover) {
        throw `ERROR: blog ${name} does not contains a cover image (e.g. cover.jpg).`;
    }
    let [title, summary, content] = markdownTitleSummaryContent(path.join(blogsDir, name, 'README.md'));
    return {
        dir: name,
        uri: `/blogs/${name}/index.html`,
        coverUri: `/blogs/${name}/${cover}`,
        title: title,
        summary: summary,
        content: content,
        date: name.substring(0, 10)
    };
}

async function loadBlogInfo(name) {
    const siteDir = process.env.siteDir;
    const blogsDir = path.join(siteDir, 'blogs');
    let subDirs = await getSubDirs(blogsDir);
    let index = subDirs.findIndex(n => n === name);
    if (index < 0) {
        throw `ERROR: blog ${name} does not exist.`;
    }
    let blogDir = subDirs[index];
    let prev = null, next = null;
    if (index > 0) {
        next = blogInfo(siteDir, subDirs[index - 1]);
    }
    if (index < subDirs.length - 1) {
        prev = blogInfo(siteDir, subDirs[index + 1]);
    }
    let info = [blogInfo(siteDir, subDirs[index]), prev, next];
    console.debug(`blog ${name}:
` + JSON.stringify(info, null, '  '));
    return info;
}

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
    const templateContext = await loadConfig();
    templateContext.__mode__ = process.env.mode;
    templateContext.__timestamp__ = process.env.timestamp;
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

// generate blog index as json, newest first:
async function generateBlogIndex() {
    const blogsDir = path.join(process.env.siteDir, 'blogs');
    let subDirs = await getSubDirs(blogsDir);
    let blogs = [];
    subDirs.sort().forEach(name => {
        let groups = /^(\d{4}\-\d{2}\-\d{2})([\-\.\_].+)?$/.exec(name);
        if (groups === null) {
            throw `ERROR: invalid blog folder name: ${name}`;
        }
        if (!isValidDate(groups[1])) {
            throw `ERROR: invalid blog folder name: ${name}`;
        }
        blogs.push(blogInfo(process.env.siteDir, name));
    });
    blogs.reverse();
    console.debug(`blogs index:
`+ JSON.stringify(blogs, null, '  '));
    return blogs;
}

// generate book index tree as json:
async function generateBookIndex(bookDirName) {
    const siteDir = process.env.siteDir;
    const booksDir = path.resolve(siteDir, 'books');
    let bookUrlBase = `/books/${bookDirName}`;
    let bookInfo = await loadYaml('books', bookDirName, 'book.yml');
    let listDir = async (parent, dir, index) => {
        let fullDir = path.resolve(booksDir, dir);
        console.debug(`scan dir: ${dir}, full: ${fullDir}`);
        let [order, uri] = parent === null ? [0, dir] : chapterURI(dir);
        console.debug(`set order: ${order}, uri: ${uri}`);
        let [file, title] = parent === null ? ['', bookInfo.book.title] : await markdownFileInfo(fullDir);
        let item = {
            level: parent === null ? 0 : parent.level + 1,
            marker: parent === null ? '' : parent.marker ? parent.marker + '.' + (index + 1) : (index + 1).toString(),
            dir: dir,
            file: parent === null ? null : file,
            order: order,
            title: title,
            uri: parent === null ? uri : parent.uri + '/' + uri,
            children: []
        };
        let subDirs = await getSubDirs(fullDir);
        if (subDirs.length > 0) {
            subDirs.sort((s1, s2) => {
                let c1 = chapterURI(s1);
                let c2 = chapterURI(s2);
                if (c1[0] === c2[0]) {
                    if (c1[1] === c2[1]) {
                        return s1.localeCompare(s2);
                    }
                    return c1[1].localeCompare(c2[1]);
                }
                return c1[0] - c2[0];
            });
            let subIndex = 0;
            for (let subDir of subDirs) {
                let child = await listDir(item, path.join(dir, subDir), subIndex);
                item.children.push(child);
                subIndex++;
            }
            // check children's uri:
            let dup = item.children.map(c => c.uri).filter((item, index, arr) => arr.indexOf(item) !== index);
            if (dup.length > 0) {
                let err = new Error(`Duplicate chapter names "${dup[0]}" under "${dir}".`);
                throw err;
            }
        }
        return item;
    }
    let root = await listDir(null, bookDirName, 0);
    console.debug(`${bookDirName} book index:
` + JSON.stringify(root, null, ' '));
    return root;
}

// create nunjucks template engine:
function createTemplateEngine(dir) {
    let loader = new nunjucks.FileSystemLoader(dir, {
        watch: true
    });
    let env = new nunjucks.Environment(loader, {
        autoescape: true,
        lstripBlocks: true,
        throwOnUndefined: true
    });
    return env;
}

async function generateSearchIndex() {
    console.log(`generate search index...`);
    const docs = [];
    const siteDir = process.env.siteDir;
    const books = await getSubDirs(path.join(siteDir, 'books'));
    for (let book of books) {
        console.log(`generate search index for book: ${book}`);
        const root = await generateBookIndex(book);
        if (root.children.length === 0) {
            throw `Empty book ${book}`;
        }
        const [beforeMD, afterMD] = await loadBeforeAndAfter(siteDir, book);
        const chapterList = flattenChapters(root);
        for (let node of chapterList) {
            const mdFile = path.join(siteDir, 'books', node.dir, 'README.md');
            const [title, summary, mdContent] = markdownTitleSummaryContent(mdFile);
            const uri = path.join('/books', node.uri, 'index.html');
            const content = markdownToTxt(mdContent);
            console.log(`build index for ${uri}...`);
            docs.push({
                uri: uri,
                title: title,
                summary: summary,
                content: content
            });
        }
    }
    const config = await loadConfig();
    let languages = config.site.search.languages;
    console.log(`use languages for search: ${languages}`);
    if (languages.indexOf('jp') >= 0) {
        languages[languages.indexOf('jp')] = 'ja';
    }
    if (languages.indexOf('en') < 0) {
        languages.unshift('en');
    }
    if (languages.length > 1) {
        const stemmer = await import('lunr-languages/lunr.stemmer.support.js');
        stemmer.default(lunr);
        const multi = await import('lunr-languages/lunr.multi.js');
        multi.default(lunr);
        const tinyseg = await import('lunr-languages/tinyseg.js');
        tinyseg.default(lunr);
        for (let lang of languages) {
            if (lang !== 'en') {
                const language = await import(`lunr-languages/lunr.${lang}.js`);
                language.default(lunr);
            }
        }
    }
    const mapping = {};
    let index = 0;
    const searchIndex = lunr(function () {
        if (languages.length > 1) {
            this.use(lunr.multiLanguage(...languages));
        }
        if (languages.indexOf('zh') >= 0 || languages.indexOf('ja') >= 0) {
            this.tokenizer = function (x) {
                let t = lunr.tokenizer(x);
                if (languages.indexOf('zh') >= 0) {
                    t = t.concat(lunr.zh.tokenizer(x));
                }
                if (languages.indexOf('ja') >= 0) {
                    t = t.concat(lunr.ja.tokenizer(x));
                }
                return t;
            };
        }
        this.ref('id');
        this.field('title');
        this.field('summary');
        this.field('content');
        this.metadataWhitelist = ['position'];
        for (let doc of docs) {
            let id = index.toString(36);
            mapping[id] = doc.uri;
            index++;
            doc.id = id;
            this.add(doc);
        }
    });
    const dump = JSON.stringify({
        index: searchIndex,
        mapping: mapping
    });
    const kb = dump.length >> 10;
    console.log(`search index (${kb} kb):
` + dump);
    return 'window.__search__=' + dump;
}

async function generateHtmlForChapterContent(node, beforeMD, afterMD) {
    const siteDir = process.env.siteDir;
    const mdFileContent = await loadTextFile(siteDir, 'books', node.dir, node.file);
    const markdown = await createMarkdown();
    return markdown.render(beforeMD + mdFileContent + afterMD);
}

async function generateHtmlForPage(templateEngine, mdFile) {
    const mdFilePath = path.join(process.env.siteDir, mdFile);
    const templateContext = await initTemplateContext();
    templateContext.title = markdownTitleSummaryContent(mdFilePath)[0];
    templateContext.htmlContent = (await createMarkdown()).render(await loadTextFile(mdFilePath));
    return templateEngine.render('page.html', templateContext);
}

async function generateHtmlForIndexPage(templateEngine, mdFile) {
    const mdFilePath = path.join(process.env.siteDir, mdFile);
    const templateContext = await initTemplateContext();
    templateContext.title = markdownTitleSummaryContent(mdFilePath)[0];
    templateContext.htmlContent = (await createMarkdown()).render(await loadTextFile(mdFilePath));
    return templateEngine.render('index.html', templateContext);
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

async function buildGitSite() {
    const siteDir = process.env.siteDir;
    const outputDir = process.env.outputDir;
    console.log(`build git site: ${siteDir} to: ${outputDir}`);
    if (fsSync.existsSync(outputDir)) {
        console.warn(`clean exist output dir: ${outputDir}`);
        fsSync.rmSync(outputDir, { recursive: true });
    }
    fsSync.mkdirSync(outputDir);
    // create template engine:
    const config = await loadConfig();
    const theme = config.site.theme;
    const templateEngine = createTemplateEngine(path.join(siteDir, 'layout', theme));
    // theme dir:
    const themeDir = path.join(siteDir, 'layout', theme);
    // run pre-build.js:
    await runBuildScript(themeDir, 'pre-build.mjs', config, outputDir);
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
            await writeTextFile(htmlFile,
                await generateHtmlForPage(templateEngine, path.join('pages', page, 'README.md')));
            await copyStaticFiles(path.join(siteDir, 'pages', page), path.join(outputDir, 'pages', page));
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
    // generate search index:
    {
        const searchIndex = await generateSearchIndex();
        const jsFile = path.join(outputDir, 'static', 'search-index.js');
        await writeTextFile(jsFile, searchIndex);
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
            const htmlFile = path.join(outputDir, html);
            await writeTextFile(htmlFile,
                md === 'README.md' ?
                    await generateHtmlForIndexPage(templateEngine, md) :
                    await generateHtmlForPage(templateEngine, md));
        }
    }
    // copy static resources:
    {
        const srcStatic = path.join(siteDir, 'static');
        if (isExists(srcStatic)) {
            const destStatic = path.join(outputDir, 'static');
            console.log(`copy static resources from ${srcStatic} to ${destStatic}`);
            if (!isExists(destStatic)) {
                fsSync.mkdirSync(destStatic);
            }
            await copyStaticFiles(srcStatic, destStatic);
        }
    }
    // copy special files like favicon.ico:
    {
        const specialFiles = config.build.copy;
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
    await runBuildScript(themeDir, 'post-build.mjs', config, outputDir);
    console.log(`Run nginx and visit http://localhost:8000\ndocker run --rm -p 8000:80 -v ${outputDir}:/usr/share/nginx/html nginx:latest`);
    console.log('done.');
    process.exit(0);
}

async function serveGitSite(port) {
    const siteDir = process.env.siteDir;
    // check port:
    if (port < 1 || port > 65535) {
        console.error(`port is invalid: ${port}`);
        process.exit(1);
    }
    // create template engine:
    const config = await loadConfig();
    const theme = config.site.theme;
    const templateEngine = createTemplateEngine(path.join(siteDir, 'layout', theme));

    const searchIndex = await generateSearchIndex();

    // start koa http server:
    const app = new Koa();
    const router = new Router();
    app.use(async (ctx, next) => {
        console.log(`${ctx.request.method}: ${ctx.request.path}`);
        try {
            await next();
        } catch (err) {
            sendError(400, ctx, err);
        }
    });
    app.use(router.routes()).use(router.allowedMethods());

    router.get('/', async ctx => {
        ctx.type = 'text/html; charset=utf-8';
        ctx.body = await generateHtmlForIndexPage(templateEngine, 'README.md');
    });

    router.get('/404', async ctx => {
        try {
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = await generateHtmlForPage(templateEngine, '404.md');
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/static/search-index.js', async ctx => {
        try {
            ctx.type = 'text/javascript; charset=utf-8';
            ctx.body = searchIndex;
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    router.get('/pages/:page/index.html', async ctx => {
        try {
            const mdFilePath = path.join('pages', `${ctx.params.page}`, 'README.md');
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
        try {
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
        } catch (err) {
            sendError(400, ctx, err);
        }
    });

    app.on('error', err => {
        console.error('server error', err)
    });

    app.listen(port);
    console.log(`set gitsite directory: ${siteDir}`);
    console.log(`server is running at port ${port}...`);
}

function normalizeAndCheckDir(dir) {
    const d = path.resolve(dir);
    if (!fsSync.existsSync(d)) {
        console.error(`dir not exist: ${dir}`);
        process.exit(1);
    }
    return d;
}

function normalizeAndMkDir(dir) {
    const d = path.resolve(dir);
    if (!fsSync.existsSync(d)) {
        fsSync.mkdirSync(d);
    }
    return d;
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

    program.command('serve')
        .description('Run a web server to preview the site in local environment.')
        .option('-d, --dir <directory>', 'source directory.', '.')
        .option('-p, --port <port>', 'local server port.', '3000')
        .option('-v, --verbose', 'make more logs for debugging.')
        .action(async options => {
            setVerbose(options.verbose);
            process.env.timestamp = Date.now();
            process.env.mode = 'serve';
            process.env.siteDir = normalizeAndCheckDir(options.dir);
            process.env.cacheDir = normalizeAndMkDir('.cache');
            process.chdir(process.env.siteDir);
            console.log(`site dir: ${process.env.siteDir}`);
            console.log(`cache dir: ${process.env.cacheDir}`);
            await serveGitSite(parseInt(options.port));
        });

    program.command('build')
        .description('Build static web site.')
        .option('-d, --dir <directory>', 'source directory.', '.')
        .option('-o, --output <directory>', 'output directory.', 'dist')
        .option('-v, --verbose', 'make more logs for debugging.')
        .action(async options => {
            setVerbose(options.verbose);
            process.env.timestamp = Date.now();
            process.env.mode = 'build';
            process.env.siteDir = normalizeAndCheckDir(options.dir);
            process.env.cacheDir = normalizeAndMkDir('.cache');
            process.env.outputDir = path.resolve(options.output);
            process.chdir(process.env.siteDir);
            console.log(`site dir: ${process.env.siteDir}`);
            console.log(`cache dir: ${process.env.cacheDir}`);
            console.log(`output dir: ${process.env.outputDir}`);
            await buildGitSite();
        });

    program.parse();
}

main();
