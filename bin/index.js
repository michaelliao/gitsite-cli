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
import { copyStaticFiles, isExists, loadBinaryFile, loadYaml, loadTextFile, flattenChapters, getSubDirs, markdownTitleContent, writeTextFile, isValidDate } from './helper.js';

// default config:
const DEFAULT_CONFIG = {
    site: {
        title: 'GitSite',
        description: 'Powered by GitSite',
        keywords: 'gitsite, git',
        theme: 'default',
        navigation: [],
        contact: {
            name: 'GitSite',
            github: 'https://github.com/michaelliao/gitsite'
        },
        blogs: {
            title: 'Blogs'
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

// use JSON.stringify but avoid recursive reference:
function jsonify(obj) {
    return JSON.stringify(obj, (k, v) => {
        if (k === 'prev' || k === 'next') {
            return v === null ? null : '<object>';
        }
        if (typeof (v) === 'string') {
            const n = v.length;
            if (n > 128) {
                const dec = n > 1024000 ? 0 : (n > 1024 ? 1 : 2);
                return v.substring(0, 128) + '...(' + (n / 1024).toFixed(dec) + ' kB)';
            }
        }
        return v;
    }, '  ');
}

// sleep in ms:
async function sleep(t = 200) {
    const sleepFn = () => new Promise(resolve => setTimeout(resolve, t));
    await sleepFn();
}

// load config and merge with defaults:
async function loadConfig() {
    const sourceDir = process.env.sourceDir;
    let config = await loadYaml(sourceDir, 'site.yml');
    _.defaultsDeep(config, DEFAULT_CONFIG);
    return config;
}

// convert '20-hello-world' to [20, 'hello-world'] by trim the leading number:
function chapterURI(dir) {
    let base = path.basename(dir);
    let groups = /^(\d{1,8})[\-\.\_](.+)$/.exec(base);
    if (groups === null) {
        console.warn(`WARNING: folder will be sort at last for there is no order that can extract from name: ${dir}`);
        return [100_000_000, base];
    }
    return [parseInt(groups[1]), groups[2]];
}

function loadBlogInfo(sourceDir, name, locale) {
    let [title, content] = markdownTitleContent(path.join(sourceDir, 'blogs', name, 'README.md'));
    return {
        dir: name,
        name: name,
        uri: `/blogs/${name}/index.html`,
        title: title,
        content: content,
        date: new Date(name.substring(0, 10)).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
    };
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

// render template by view name and context, then send html by ctx:
async function renderTemplate(ctx, templateEngine, viewName, templateContext) {
    console.debug(`render ${viewName}, context:
${jsonify(templateContext)}
`);
    const html = templateEngine.render(viewName, templateContext);
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = html;
}

// send error with http code and error object:
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

// generate redirect html:
function redirectHtml(redirect) {
    return `<html>
<head><meta http-equiv="refresh" content="0;URL='${redirect}'" /></head>
<body></body>
</html>`
}

// init template context by loading config:
async function initTemplateContext() {
    const templateContext = await loadConfig();
    templateContext.__mode__ = process.env.mode;
    templateContext.__timestamp__ = process.env.timestamp;
    return templateContext;
}

// load 'BEFORE.md' and 'AFTER.md' in specified dir, return markdown contents as array[2]:
async function loadBeforeAndAfter(sourceDir, ...dirs) {
    let beforeMD = '', afterMD = '';
    const
        beforePath = dirs.slice(),
        afterPath = dirs.slice();
    beforePath.unshift(sourceDir);
    beforePath.push('BEFORE.md');
    afterPath.unshift(sourceDir);
    afterPath.push('AFTER.md');
    if (isExists(...beforePath)) {
        beforeMD = await loadTextFile(...beforePath);
        beforeMD = beforeMD + '\n\n';
    }
    if (isExists(...afterPath)) {
        afterMD = await loadTextFile(...afterPath);
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

// generate blog index as array, newest first:
async function generateBlogIndex(locale) {
    const sourceDir = process.env.sourceDir;
    const blogsDir = path.join(sourceDir, 'blogs');
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
        blogs.push(loadBlogInfo(sourceDir, name, locale));
    });
    blogs.reverse();
    // attach prev, next:
    for (let i = 0; i < blogs.length; i++) {
        let blog = blogs[i];
        blog.prev = i > 0 ? blogs[i - 1] : null;
        blog.next = i < blogs.length - 1 ? blogs[i + 1] : null;
    }
    console.debug(`blogs index:
`+ jsonify(blogs));
    return blogs;
}

// generate book index as tree:
async function generateBookIndex(bookDirName) {
    const sourceDir = process.env.sourceDir;
    const booksDir = path.join(sourceDir, 'books');
    let bookUrlBase = `/books/${bookDirName}`;
    let bookInfo = await loadYaml(booksDir, bookDirName, 'book.yml');
    let listDir = async (parent, dir, index) => {
        let fullDir = path.join(booksDir, dir);
        console.debug(`scan dir: ${dir}, full: ${fullDir}`);
        let [order, uri] = parent === null ? [0, dir] : chapterURI(dir);
        console.debug(`set order: ${order}, uri: ${uri}`);
        let [title, content] = parent === null ? ['', ''] : await markdownTitleContent(path.join(fullDir, 'README.md'));
        let item = {
            level: parent === null ? 0 : parent.level + 1,
            marker: parent === null ? '' : parent.marker ? parent.marker + '.' + (index + 1) : (index + 1).toString(),
            dir: dir,
            order: order,
            title: title,
            content: content,
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
    // append 'title', 'authro', 'description':
    root.title = bookInfo.title || bookDirName;
    root.author = bookInfo.author || '';
    root.description = bookInfo.description || '';
    console.debug(`${bookDirName} book index:
` + jsonify(root));
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
    const sourceDir = process.env.sourceDir;
    const books = await getSubDirs(path.join(sourceDir, 'books'));
    for (let book of books) {
        console.log(`generate search index for book: ${book}`);
        const root = await generateBookIndex(book);
        if (root.children.length === 0) {
            throw `Empty book ${book}`;
        }
        const [beforeMD, afterMD] = await loadBeforeAndAfter(sourceDir, 'books', book);
        const chapterList = flattenChapters(root);
        for (let node of chapterList) {
            const mdFile = path.join(sourceDir, 'books', node.dir, 'README.md');
            const [title, mdContent] = markdownTitleContent(mdFile);
            const uri = path.join('/books', node.uri, 'index.html');
            const content = markdownToTxt(mdContent);
            console.log(`build index for ${uri}...`);
            docs.push({
                uri: uri,
                title: title,
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
` + dump.substring(0, 128) + '...');
    return 'window.__search__=' + dump;
}

async function buildGitSite() {
    const sourceDir = process.env.sourceDir;
    const layoutDir = process.env.layoutDir;
    const outputDir = process.env.outputDir;
    console.log(`build git site: ${sourceDir} to: ${outputDir}`);
    if (fsSync.existsSync(outputDir)) {
        console.warn(`clean exist output dir: ${outputDir}`);
        fsSync.rmSync(outputDir, { recursive: true });
    }
    fsSync.mkdirSync(outputDir);
    // create template engine:
    const config = await loadConfig();
    const theme = config.site.theme;
    // theme dir:
    const themeDir = path.join(layoutDir, theme);
    const templateEngine = createTemplateEngine(themeDir);
    const markdown = await createMarkdown();
    // run pre-build.js:
    await runBuildScript(themeDir, 'pre-build.mjs', config, outputDir);
    // generate books:
    {
        const books = await getSubDirs(path.join(sourceDir, 'books'));
        for (let book of books) {
            console.log(`generate book: ${book}`);
            const root = await generateBookIndex(book);
            if (root.children.length === 0) {
                throw `Empty book ${book}`;
            }
            const [beforeMD, afterMD] = await loadBeforeAndAfter(sourceDir, 'books', book);
            const first = root.children[0];
            const redirect = `/books/${first.uri}/index.html`;
            await writeTextFile(
                path.join(outputDir, 'books', `${book}`, 'index.html'),
                redirectHtml(redirect)
            );
            const chapterList = flattenChapters(root);
            for (let node of chapterList) {
                const nodeDir = path.join(sourceDir, 'books', `${node.dir}`);
                const htmlFile = path.join(outputDir, 'books', `${node.uri}`, 'index.html');
                const contentHtmlFile = path.join(outputDir, 'books', `${node.uri}`, 'content.html');
                console.debug(`generate file from chapter '${node.dir}': ${htmlFile}, ${contentHtmlFile}`);
                node.htmlContent = markdown.render(beforeMD + node.content + afterMD);

                const templateContext = await initTemplateContext();
                templateContext.sidebar = true;
                templateContext.book = root;
                templateContext.chapter = node;
                await writeTextFile(htmlFile, templateEngine.render('book.html', templateContext));
                await writeTextFile(contentHtmlFile, templateEngine.render('book_content.html', templateContext));
                await copyStaticFiles(nodeDir, path.join(outputDir, 'books', `${node.uri}`));
            }
        }
    }
    // generate blogs:
    {
        const blogs = await generateBlogIndex();
        if (blogs.length > 0) {
            const [beforeMD, afterMD] = await loadBeforeAndAfter(sourceDir, 'blogs');
            const templateContext = await initTemplateContext();
            templateContext.sidebar = true;
            templateContext.blogs = blogs;
            for (let blog of blogs) {
                console.log(`generate blog: ${blog.dir}`);
                const blogFile = path.join(outputDir, 'blogs', blog.dir, 'index.html');
                const blogContentFile = path.join(outputDir, 'blogs', blog.dir, 'content.html');
                blog.htmlContent = markdown.render(beforeMD + blog.content + afterMD);
                templateContext.blog = blog;
                await writeTextFile(blogFile, templateEngine.render('blog.html', templateContext));
                await writeTextFile(blogContentFile, templateEngine.render('blog_content.html', templateContext));
                await copyStaticFiles(path.join(sourceDir, 'blogs', blog.dir), path.join(outputDir, 'blogs', blog.dir));
            }
            await writeTextFile(
                path.join(outputDir, 'blogs', 'index.html'),
                redirectHtml(blogs[0].uri)
            );
        }
    }
    // generate search index:
    {
        const searchIndex = await generateSearchIndex();
        const jsFile = path.join(outputDir, 'static', 'search-index.js');
        await writeTextFile(jsFile, searchIndex);
    }
    // generate pages:
    {
        const pages = await getSubDirs(path.join(sourceDir, 'pages'));
        const templateContext = await initTemplateContext();
        for (let pageName of pages) {
            console.log(`generate page: ${pageName}`);
            const pageMdFile = path.join(sourceDir, 'pages', pageName, 'README.md');
            const pageHtmlFile = path.join(outputDir, 'pages', pageName, 'index.html');
            const page = {};
            [page.title, page.content] = markdownTitleContent(pageMdFile);
            page.htmlContent = markdown.render(page.content);
            templateContext.page = page;
            await writeTextFile(pageHtmlFile, templateEngine.render('page.html', templateContext));
            await copyStaticFiles(path.join(sourceDir, 'pages', pageName), path.join(outputDir, 'pages', pageName));
        }
    }
    // generate index, 404 page:
    {
        const mapping = {
            'README.md': 'index.html',
            '404.md': '404.html',
        };
        const templateContext = await initTemplateContext();
        for (let mdName in mapping) {
            const htmlName = mapping[mdName];
            console.log(`generate: ${mdName} => ${htmlName}`);
            const mdFile = path.join(sourceDir, mdName);
            const htmlFile = path.join(outputDir, htmlName);
            const page = {};
            [page.title, page.content] = markdownTitleContent(mdFile);
            page.htmlContent = markdown.render(page.content);
            templateContext.page = page;
            await writeTextFile(htmlFile, templateEngine.render('page.html', templateContext));
        }
    }
    // copy static resources:
    {
        const srcStatic = path.join(sourceDir, 'static');
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
            const srcFile = path.join(sourceDir, specialFile);
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
    const sourceDir = process.env.sourceDir;
    const layoutDir = process.env.layoutDir;
    // check port:
    if (port < 1 || port > 65535) {
        console.error(`port is invalid: ${port}`);
        process.exit(1);
    }
    // create template engine:
    const config = await loadConfig();
    const theme = config.site.theme;
    const templateEngine = createTemplateEngine(path.join(layoutDir, theme));
    const markdown = await createMarkdown();

    const searchIndex = await generateSearchIndex();

    // start koa http server:
    const app = new Koa();
    const router = new Router();
    // log url and handle errors:
    app.use(async (ctx, next) => {
        console.log(`${ctx.request.method}: ${ctx.request.path}`);
        try {
            await next();
        } catch (err) {
            sendError(400, ctx, err);
        }
    });
    app.use(router.routes()).use(router.allowedMethods());

    router.get('/error', async ctx => {
        throw 'error';
    });

    // for the next three routers:
    const processSimplePage = async function (ctx, templateEngine, mdFile) {
        const templateContext = await initTemplateContext();
        const page = {};
        [page.title, page.content] = markdownTitleContent(mdFile);
        page.htmlContent = markdown.render(page.content);
        templateContext.page = page;
        renderTemplate(ctx, templateEngine, 'page.html', templateContext);
    };

    router.get('/', async ctx => {
        const mdFile = path.join(sourceDir, 'README.md');
        await processSimplePage(ctx, templateEngine, mdFile);
    });

    router.get('/404', async ctx => {
        const mdFile = path.join(sourceDir, '404.md');
        await processSimplePage(ctx, templateEngine, mdFile);
    });

    router.get('/pages/:page/index.html', async ctx => {
        const mdFile = path.join(sourceDir, 'pages', `${ctx.params.page}`, 'README.md');
        await processSimplePage(ctx, templateEngine, mdFile);
    });

    router.get('/static/search-index.js', async ctx => {
        ctx.type = 'text/javascript; charset=utf-8';
        ctx.body = searchIndex;
    });

    router.get('/blogs/index.html', async ctx => {
        console.debug('process blog index.');
        const blogs = await generateBlogIndex();
        if (blogs.length === 0) {
            throw 'Blogs is empty';
        }
        ctx.type = 'text/html; charset=utf-8';
        ctx.body = redirectHtml(blogs[0].uri);
    });

    // for the next two routers:
    const processBlog = async function (ctx, templateEngine, name, viewName) {
        const sourceDir = process.env.sourceDir;
        const templateContext = await initTemplateContext();
        const blogs = await generateBlogIndex(templateContext.site.locale);
        if (blogs.length === 0) {
            throw 'No blog posted.';
        }
        const blog = blogs.find(b => b.name === name);
        if (!blog) {
            return sendError(404, ctx, `Blog not found: ${name}`);
        }
        let [beforeMD, afterMD] = await loadBeforeAndAfter(sourceDir, 'blogs');
        blog.htmlContent = markdown.render(beforeMD + blog.content + afterMD);
        templateContext.sidebar = true;
        templateContext.blogs = blogs;
        templateContext.blog = blog;
        renderTemplate(ctx, templateEngine, viewName, templateContext);
    };

    router.get('/blogs/:name/index.html', async ctx => {
        await processBlog(ctx, templateEngine, ctx.params.name, 'blog.html');
    });

    router.get('/blogs/:name/content.html', async ctx => {
        await sleep();
        await processBlog(ctx, templateEngine, ctx.params.name, 'blog_content.html');
    });

    router.get('/books/:book/index.html', async ctx => {
        let book = ctx.params.book;
        let root = await generateBookIndex(book);
        if (root.children.length === 0) {
            throw `Book "${book} is empty.`;
        }
        let child = root.children[0];
        let redirect = `/books/${child.uri}/index.html`;
        ctx.type = 'text/html; charset=utf-8';
        ctx.body = redirectHtml(redirect);
    });

    // for the next two routers:
    const processChapter = async function (ctx, templateEngine, viewName) {
        let book = ctx.params.book,
            chapters = ctx.params.chapters.split('/');
        let root = await generateBookIndex(book);
        // find chapter by uri:
        let uri = `${book}/` + chapters.join('/');
        let chapterList = flattenChapters(root);
        let node = chapterList.find(c => c.uri === uri);
        if (node === undefined) {
            return sendError(404, ctx, `Chapter not found: ${ctx.params.chapters}`);
        }
        let [beforeMD, afterMD] = await loadBeforeAndAfter(sourceDir, 'books', book);
        node.htmlContent = markdown.render(beforeMD + node.content + afterMD);
        const templateContext = await initTemplateContext();
        templateContext.book = root;
        templateContext.sidebar = true;
        templateContext.chapter = node;
        renderTemplate(ctx, templateEngine, viewName, templateContext);
    };

    router.get('/books/:book/:chapters(.*)/index.html', async ctx => {
        await processChapter(ctx, templateEngine, 'book.html');
    });

    router.get('/books/:book/:chapters(.*)/content.html', async ctx => {
        await sleep();
        await processChapter(ctx, templateEngine, 'book_content.html');
    });

    router.get('/books/:book/:chapters(.*)/:file', async ctx => {
        let book = ctx.params.book,
            chapters = ctx.params.chapters.split('/');
        let root = await generateBookIndex(book);
        // find chapter by uri:
        let uri = `${book}/` + chapters.join('/');
        let chapterList = flattenChapters(root);
        let node = chapterList.find(c => c.uri === uri);
        if (node === undefined) {
            return sendError(404, ctx, `Chapter not found: ${ctx.params.chapters}`);
        }
        let file = path.join(sourceDir, 'books', node.dir, ctx.params.file);
        console.debug(`try file: ${file}`);
        if (isExists(file)) {
            ctx.type = mime.getType(ctx.request.path) || 'application/octet-stream';
            ctx.body = await loadBinaryFile(file);
        } else {
            sendError(404, ctx, `File not found: ${file}`);
        }
    });

    router.get('/(.*)', async ctx => {
        let file, p = ctx.request.path.substring(1);
        if (p.startsWith('blogs/')
            || p.startsWith('pages/')) {
            file = path.join(sourceDir, p);
            console.debug(`try file: ${file}`);
            if (!isExists(file)) {
                return sendError(404, ctx, `File not found: ${file}`);
            }
        } else if (p.startsWith('static/')) {
            file = path.join(sourceDir, p);
            console.debug(`try file: ${file}`);
            if (!isExists(file)) {
                file = path.join(layoutDir, theme, p);
                console.debug(`try file: ${file}`);
            }
            if (!isExists(file)) {
                return sendError(404, ctx, `File not found: ${file}`);
            }
        } else if (p === 'favicon.ico') {
            file = path.join(sourceDir, p);
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
    console.log(`set gitsite directory: ${sourceDir}`);
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
        .option('-s, --source <directory>', 'source directory.', 'source')
        .option('-l, --layout <directory>', 'layout directory.', 'layout')
        .option('-p, --port <port>', 'local server port.', '3000')
        .option('-v, --verbose', 'make more logs for debugging.')
        .action(async options => {
            setVerbose(options.verbose);
            process.env.timestamp = Date.now();
            process.env.mode = 'serve';
            process.env.sourceDir = normalizeAndCheckDir(options.source);
            process.env.layoutDir = normalizeAndCheckDir(options.layout);
            process.env.cacheDir = normalizeAndMkDir('.cache');
            process.chdir(process.env.sourceDir);
            console.log(`site dir: ${process.env.sourceDir}`);
            console.log(`layout dir: ${process.env.layoutDir}`);
            console.log(`cache dir: ${process.env.cacheDir}`);
            await serveGitSite(parseInt(options.port));
        });

    program.command('build')
        .description('Build static web site.')
        .option('-s, --source <directory>', 'source directory.', 'source')
        .option('-l, --layout <directory>', 'layout directory.', 'layout')
        .option('-o, --output <directory>', 'output directory.', 'dist')
        .option('-v, --verbose', 'make more logs for debugging.')
        .action(async options => {
            setVerbose(options.verbose);
            process.env.timestamp = Date.now();
            process.env.mode = 'build';
            process.env.sourceDir = normalizeAndCheckDir(options.source);
            process.env.layoutDir = normalizeAndCheckDir(options.layout);
            process.env.cacheDir = normalizeAndMkDir('.cache');
            process.env.outputDir = path.resolve(options.output);
            process.chdir(process.env.sourceDir);
            console.log(`site dir: ${process.env.sourceDir}`);
            console.log(`layout dir: ${process.env.layoutDir}`);
            console.log(`cache dir: ${process.env.cacheDir}`);
            console.log(`output dir: ${process.env.outputDir}`);
            await buildGitSite();
        });

    program.parse();
}

main();
