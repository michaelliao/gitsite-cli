#!/usr/bin/env node

import os from 'node:os';
import path from 'node:path';
import child_process from 'node:child_process';
import * as fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';

import _ from 'lodash';
import { Command } from 'commander';
import mime from 'mime';
import nunjucks from 'nunjucks';
import Koa from 'koa';
import Router from '@koa/router';

import { tokenizer, createIndex } from './search.js';
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
        language: 'en-US',
        rootPath: '',
        navigation: [],
        contact: {
            name: 'GitSite',
            github: 'https://github.com/michaelliao/gitsite'
        },
        git: {
            baseUrl: '',
            link: true
        },
        blogs: {
            title: 'Blogs'
        },
        books: {
            indexMarker: true
        },
        search: {
            type: 'browser'
        },
        integration: {}
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

function loadBlogInfo(sourceDir, tag, name) {
    let [title, content] = markdownTitleContent(path.join(sourceDir, 'blogs', tag, name, 'README.md'));
    return {
        dir: name,
        name: name,
        git: `/blogs/${tag}/${name}/README.md`,
        uri: `${tag}/${name}`,
        title: title,
        content: content,
        date: name.substring(0, 10) // ISO date format 'yyyy-MM-dd'
    };
}

function runSync(cmd) {
    console.log(`> ${cmd}`);
    try {
        let output = child_process.execSync(cmd).toString();
        console.log(output);
        return true;
    } catch (err) {
        console.error('command failed:');
        console.error(err.stderr.toString());
        console.error(err.stdout.toString());
        return false;
    }
}

async function initGitSite() {
    const abort = (msg) => {
        console.error(msg);
        process.exit(1);
    };
    console.log('prepare init new git site...');

    // check current dir:
    const gsDir = path.normalize(process.cwd());
    const existFiles = fsSync.readdirSync(gsDir, { withFileTypes: true });
    const ignoreFiles = ['.git', '.ds_store', 'desktop.ini', 'thumbs.db'];
    if (existFiles.filter(f => {
        if (ignoreFiles.indexOf(f.name.toLowerCase()) >= 0) {
            return false;
        }
        return true;
    }).length > 0) {
        return abort(`directory ${gsDir} is not empty. abort.`);
    }

    // check if git installed:
    if (os.platform() === 'win32') {
        // FIXME:
    } else if (os.platform() === 'linux' || os.platform() === 'darwin') {
        try {
            child_process.execSync('which git').toString();
        } catch (err) {
            console.error('git not found. please install git first.');
            process.exit(1);
        }
    } else {
        console.error(`unsupported platform: ${os.platform()}`);
        process.exit(1);
    }

    // download and unzip:
    let url = 'https://codeload.github.com/michaelliao/gitsite/zip/refs/heads/main';
    console.log(`downloading sample gitsite from ${url}...`);
    try {
        let resp = await fetch(url);
        if (!resp.ok) {
            throw new Error('response was not ok.');
        }
        const buffer = await resp.arrayBuffer();
        const unzipper = await import('unzipper');
        const { Readable } = await import('node:stream');
        new Readable({
            read() {
                this.push(new Uint8Array(buffer));
                this.push(null);
            }
        }).pipe(unzipper.Parse())
            .on('entry', (entry) => {
                const originPath = entry.path;
                const type = entry.type;
                // remove leading 'gitsite-main/':
                const targetPath = originPath.substring(originPath.indexOf('/') + 1);
                if (targetPath) {
                    if (type === 'Directory') {
                        fsSync.mkdirSync(path.join(gsDir, targetPath), {
                            recursive: true
                        });
                    } else if (type === 'File') {
                        const targetFile = path.join(gsDir, targetPath);
                        console.log(`unzip to: ${targetPath}`);
                        entry.pipe(fsSync.createWriteStream(targetFile));
                    }
                }
            })
            .on('finish', () => {
                console.log(`unzip ok.`);
                console.log('remove .gitmodules and themes/default...');
                fsSync.rmSync('.gitmodules');
                fsSync.rmdirSync('themes/default');
                console.log('init git repository:');
                runSync('git init');
                console.log('add default theme as submodule:');
                runSync('git submodule add https://github.com/michaelliao/gitsite-theme-default.git themes/default');
                console.log(`
----------------------------------------------------------------------

Your git site was initialized successfully!
Please edit source/site.yml to customize your site.

To start the server and preview your site on http://localhost:3000

    gitsite-cli serve -v

To build your site:

    gitsite-cli build -v

To get more information on GitSite please visit https://gitsite.org
`);
            });
    } catch (err) {
        return abort(err.message || err);
    }
}

// render template by view name and context, then send html by ctx:
async function renderTemplate(ctx, templateEngine, viewName, templateContext) {
    templateContext.__uri__ = ctx.request.path;
    console.debug(`render "${viewName}", context:
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
    let buildJs = path.join(themeDir, jsFile);
    if (fsSync.existsSync(buildJs)) {
        if (process.platform === 'win32') {
            buildJs = `file://${buildJs}`;
        }
        console.log(`run ${buildJs}...`);
        const build = await import(buildJs);
        const cwd = process.cwd();
        process.chdir(themeDir);
        await build.default(templateContext, outputDir);
        process.chdir(cwd);
    }
}

// generate blog index as array, newest first:
async function generateBlogIndex(tag) {
    const sourceDir = process.env.sourceDir;
    const blogsDir = path.join(sourceDir, 'blogs', tag);
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
        blogs.push(loadBlogInfo(sourceDir, tag, name));
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
            git: `/books/${dir}/README.md`,
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
    let docId = 0;
    // books:
    const books = await getSubDirs(path.join(sourceDir, 'books'));
    for (let book of books) {
        console.log(`generate search index for book: ${book}`);
        const root = await generateBookIndex(book);
        if (root.children.length === 0) {
            throw `Empty book ${book}`;
        }
        const chapterList = flattenChapters(root);
        for (let node of chapterList) {
            docs.push({
                id: docId,
                uri: `/books/${node.uri}/index.html`,
                title: node.title,
                content: markdownToTxt(node.content)
            });
            docId++;
        }
    }
    // blogs:
    const tags = await getSubDirs(path.join(sourceDir, 'blogs'));
    for (let tag of tags) {
        const blogs = await generateBlogIndex(tag);
        for (let blog of blogs) {
            console.log(`generate search index for blog: ${blog.title}`);
            docs.push({
                id: docId,
                uri: `/blogs/${blog.uri}/index.html`,
                title: blog.title,
                content: markdownToTxt(blog.content)
            });
            docId++;
        }
    }
    // pages:
    const pages = await getSubDirs(path.join(sourceDir, 'pages'));
    for (let pageName of pages) {
        console.log(`generate search index for page: ${pageName}`);
        const pageMdFile = path.join(sourceDir, 'pages', pageName, 'README.md');
        const [title, content] = markdownTitleContent(pageMdFile);
        docs.push({
            id: docId,
            uri: `/pages/${pageName}/index.html`,
            title: title,
            content: markdownToTxt(content)
        });
        docId++;
    }

    const index = createIndex(docs);

    // dump index:
    let kvs = [];
    await index.export((key, data) => {
        console.log(`export index: ${typeof (key)} / ${key}: ${typeof (data)}`)
        if (data !== undefined) {
            kvs.push([key, data]);
        }
    });
    // NOTE: have to wait for async export (await not works for flexsearch export):
    while (true) {
        console.log('waiting for export index...');
        await sleep(100);
        if (kvs.length === 4) {
            break;
        }
    }
    let js_code = ['// search in browser:'];
    js_code.push('(function () {'); // begin function
    js_code.push(tokenizer.toString());
    js_code.push('const _searcher_ = new FlexSearch.Index({ encode: tokenizer });');
    for (let kv of kvs) {
        js_code.push(`_searcher_.import('${kv[0]}', '${kv[1]}');`);
    }
    // dump docs url, title and content:
    const shorten = (s) => {
        if (s.length > 300) {
            return s.substring(0, 300) + '...';
        }
        return s;
    };
    const uris = docs.map(doc => doc.uri);
    const titles = docs.map(doc => doc.title);
    const contents = docs.map(doc => shorten(doc.content));
    js_code.push(`const uris=${JSON.stringify(uris)};`);
    js_code.push(`const titles=${JSON.stringify(titles)};`);
    js_code.push(`const contents=${JSON.stringify(contents)};`);
    js_code.push(`const searchFn = (q,limit=20) => {
   let rs = _searcher_.search(q,limit);
   return rs.map((id)=>{return {uri: uris[id], title: titles[id], content: contents[id]};});
};`);
    js_code.push('window.onsearchready && window.onsearchready(searchFn);');
    js_code.push('})();'); // end function and execute
    let js = js_code.join('\n');
    let size = js.length / 1024;
    let unit = 'kb';
    if (size > 1024) {
        size = size / 1024;
        unit = 'mb';
    }
    console.log(`generated search index: ${size.toFixed(1)} ${unit}`);
    return js;
}

async function buildGitSite() {
    const sourceDir = process.env.sourceDir;
    const outputDir = process.env.outputDir;
    console.log(`build git site: ${sourceDir} to: ${outputDir}`);
    removeDir(outputDir);
    fsSync.mkdirSync(outputDir);
    // create template engine:
    const config = await loadConfig();
    // theme dir:
    const themeDir = path.join(process.env.themesDir, config.site.theme);
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
            await writeTextFile(
                path.join(outputDir, 'books', `${book}`, 'index.html'),
                redirectHtml(`${config.site.rootPath}/books/${first.uri}/index.html`)
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
                templateContext.__uri__ = `/books/${node.uri}/index.html`;
                await writeTextFile(htmlFile, templateEngine.render('book.html', templateContext));
                templateContext.__uri__ = `/books/${node.uri}/content.html`;
                await writeTextFile(contentHtmlFile, templateEngine.render('book_content.html', templateContext));
                await copyStaticFiles(nodeDir, path.join(outputDir, 'books', `${node.uri}`));
            }
        }
    }
    // generate blogs:
    {
        const tags = await getSubDirs(path.join(sourceDir, 'blogs'));
        for (let tag of tags) {
            const blogs = await generateBlogIndex(tag);
            if (blogs.length > 0) {
                const [beforeMD, afterMD] = await loadBeforeAndAfter(sourceDir, 'blogs', tag);
                const templateContext = await initTemplateContext();
                templateContext.sidebar = true;
                templateContext.blogs = blogs;
                for (let blog of blogs) {
                    console.log(`generate blog: ${blog.dir}`);
                    const blogFile = path.join(outputDir, 'blogs', tag, blog.dir, 'index.html');
                    const blogContentFile = path.join(outputDir, 'blogs', tag, blog.dir, 'content.html');
                    blog.htmlContent = markdown.render(beforeMD + blog.content + afterMD);
                    templateContext.blog = blog;
                    templateContext.__uri__ = `/blogs/${blog.uri}/index.html`;
                    await writeTextFile(blogFile, templateEngine.render('blog.html', templateContext));
                    templateContext.__uri__ = `/blogs/${blog.uri}/content.html`;
                    await writeTextFile(blogContentFile, templateEngine.render('blog_content.html', templateContext));
                    await copyStaticFiles(path.join(sourceDir, 'blogs', tag, blog.dir), path.join(outputDir, 'blogs', tag, blog.dir));
                }
                await writeTextFile(
                    path.join(outputDir, 'blogs', tag, 'index.html'),
                    redirectHtml(`${config.site.rootPath}/blogs/${blogs[0].uri}/index.html`)
                );
                await writeTextFile(
                    path.join(outputDir, 'blogs', tag, 'index.json'),
                    JSON.stringify(blogs.map(blog => {
                        return {
                            date: blog.date,
                            uri: `/blogs/${blog.uri}/index.html`,
                            title: blog.title
                        }
                    }))
                )
            }
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
            page.git = `/pages/${pageName}/README.md`;
            page.htmlContent = markdown.render(page.content);
            templateContext.page = page;
            templateContext.__uri__ = `/pages/${pageName}/index.html`;
            await writeTextFile(pageHtmlFile, templateEngine.render('page.html', templateContext));
            await copyStaticFiles(path.join(sourceDir, 'pages', pageName), path.join(outputDir, 'pages', pageName));
        }
    }
    // generate index, 404 page:
    {
        const mapping = {
            // markdownDoc -> [uri, targetFile]:
            'README.md': ['/', 'index.html'],
            '404.md': ['/404', '404.html'],
        };
        const templateContext = await initTemplateContext();
        for (let mdName in mapping) {
            const [uri, htmlName] = mapping[mdName];
            console.log(`generate ${uri}: ${mdName} => ${htmlName}`);
            const mdFile = path.join(sourceDir, mdName);
            const htmlFile = path.join(outputDir, htmlName);
            const [title, content] = markdownTitleContent(mdFile);
            templateContext.title = title;
            templateContext.htmlContent = markdown.render(content);
            templateContext.__uri__ = uri;
            await writeTextFile(htmlFile, templateEngine.render('index.html', templateContext));
        }
    }
    // copy static resources:
    {
        const srcStatic = path.join(sourceDir, 'static');
        if (isExists(srcStatic)) {
            const destStatic = path.join(outputDir, 'static');
            console.log(`copy static resources from ${srcStatic} to ${destStatic}`);
            const cwd = process.cwd();
            process.chdir(sourceDir);
            child_process.execSync(`cp -r static ${outputDir}`);
            process.chdir(cwd);
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
    console.log('Build ok.');
    console.log(`Run nginx:`);
    console.log(`docker run --rm -p 8000:80 -v ${outputDir}:/usr/share/nginx/html${config.site.rootPath} nginx:latest`);
    console.log(`Visit http://localhost:8000${config.site.rootPath}/`);
    process.exit(0);
}

async function serveGitSite(port) {
    const sourceDir = process.env.sourceDir;
    // check port:
    if (port < 1 || port > 65535) {
        console.error(`port is invalid: ${port}`);
        process.exit(1);
    }
    // create template engine:
    const config = await loadConfig();
    const rootPath = config.site.rootPath;
    const themeDir = path.join(process.env.themesDir, config.site.theme);
    const templateEngine = createTemplateEngine(themeDir);
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

    router.get(`${rootPath}/error`, async ctx => {
        throw 'error';
    });

    // for next two routes:
    const processSpecialPage = async (ctx, templateEngine, mdFile) => {
        const templateContext = await initTemplateContext();
        [templateContext.title, templateContext.content] = markdownTitleContent(mdFile);
        templateContext.htmlContent = markdown.render(templateContext.content);
        renderTemplate(ctx, templateEngine, 'index.html', templateContext);
    };

    router.get(`${rootPath}/`, async ctx => {
        const mdFile = path.join(sourceDir, 'README.md');
        await processSpecialPage(ctx, templateEngine, mdFile);
    });

    router.get(`${rootPath}/404`, async ctx => {
        const mdFile = path.join(sourceDir, '404.md');
        await processSpecialPage(ctx, templateEngine, mdFile);
    });

    router.get(`${rootPath}/pages/:page/index.html`, async ctx => {
        const pageName = ctx.params.page;
        const mdFile = path.join(sourceDir, 'pages', pageName, 'README.md');
        const templateContext = await initTemplateContext();
        const page = {};
        [page.title, page.content] = markdownTitleContent(mdFile);
        page.git = `/pages/${pageName}/README.md`;
        page.htmlContent = markdown.render(page.content);
        templateContext.page = page;
        renderTemplate(ctx, templateEngine, 'page.html', templateContext);
    });

    router.get(`${rootPath}/static/search-index.js`, async ctx => {
        ctx.type = 'text/javascript; charset=utf-8';
        ctx.body = searchIndex;
    });

    router.get(`${rootPath}/blogs/:tag/index.html`, async ctx => {
        console.debug('process blog index.');
        const blogs = await generateBlogIndex(ctx.params.tag);
        if (blogs.length === 0) {
            throw 'Blogs is empty';
        }
        ctx.type = 'text/html; charset=utf-8';
        ctx.body = redirectHtml(`${rootPath}/blogs/${blogs[0].uri}/index.html`);
    });

    // for the next two routers:
    const processBlog = async function (ctx, templateEngine, tag, name, viewName) {
        const sourceDir = process.env.sourceDir;
        const templateContext = await initTemplateContext();
        const blogs = await generateBlogIndex(tag);
        if (blogs.length === 0) {
            throw 'No blog posted.';
        }
        const blog = blogs.find(b => b.name === name);
        if (!blog) {
            return sendError(404, ctx, `Blog not found: ${name}`);
        }
        let [beforeMD, afterMD] = await loadBeforeAndAfter(sourceDir, 'blogs', tag);
        blog.htmlContent = markdown.render(beforeMD + blog.content + afterMD);
        templateContext.sidebar = true;
        templateContext.blogs = blogs;
        templateContext.blog = blog;
        renderTemplate(ctx, templateEngine, viewName, templateContext);
    };

    router.get(`${rootPath}/blogs/:tag/:name/index.html`, async ctx => {
        await processBlog(ctx, templateEngine, ctx.params.tag, ctx.params.name, 'blog.html');
    });

    router.get(`${rootPath}/blogs/:tag/:name/content.html`, async ctx => {
        await processBlog(ctx, templateEngine, ctx.params.tag, ctx.params.name, 'blog_content.html');
    });

    router.get(`${rootPath}/blogs/:tag/index.json`, async ctx => {
        const blogs = await generateBlogIndex(ctx.params.tag);
        const blogItems = blogs.map(blog => {
            return {
                date: blog.date,
                uri: `/blogs/${blog.uri}/index.html`,
                title: blog.title
            }
        });
        ctx.type = 'application/json; charset=utf-8';
        ctx.body = JSON.stringify(blogItems);
    });

    router.get(`${rootPath}/books/:book/index.html`, async ctx => {
        let book = ctx.params.book;
        let root = await generateBookIndex(book);
        if (root.children.length === 0) {
            throw `Book "${book} is empty.`;
        }
        let child = root.children[0];
        let redirect = `${rootPath}/books/${child.uri}/index.html`;
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

    router.get(`${rootPath}/books/:book/:chapters(.*)/index.html`, async ctx => {
        await processChapter(ctx, templateEngine, 'book.html');
    });

    router.get(`${rootPath}/books/:book/:chapters(.*)/content.html`, async ctx => {
        await processChapter(ctx, templateEngine, 'book_content.html');
    });

    router.get(`${rootPath}/books/:book/:chapters(.*)/:file`, async ctx => {
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

    router.get(`${rootPath}/(.*)`, async ctx => {
        let file, p = ctx.request.path.substring(rootPath.length + 1);
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
                file = path.join(themeDir, p);
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
    let url = 'http://localhost';
    let start = (process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open');
    child_process.exec(start + ` http://localhost:${port}${rootPath}/`);
}

function normalizeAndCheckDir(dir) {
    const d = path.resolve(dir);
    if (!fsSync.existsSync(d)) {
        console.error(`dir not exist: ${dir}`);
        process.exit(1);
    }
    return d;
}

function removeDir(dir) {
    if (fsSync.existsSync(dir)) {
        console.warn(`remove dir: ${dir}`);
        fsSync.rmSync(dir, { recursive: true });
    }
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

    program.command('init')
        .description('Initialize a new git site.')
        .action(initGitSite);

    program.command('serve')
        .description('Run a web server to preview the site in local environment.')
        .option('-s, --source <directory>', 'source directory.', 'source')
        .option('-t, --themes <directory>', 'themes directory.', 'themes')
        .option('-p, --port <port>', 'local server port.', '3000')
        .option('-v, --verbose', 'make more logs for debugging.')
        .action(async options => {
            setVerbose(options.verbose);
            process.env.timestamp = Date.now();
            process.env.mode = 'serve';
            process.env.sourceDir = normalizeAndCheckDir(options.source);
            process.env.themesDir = normalizeAndCheckDir(options.themes);
            process.env.cacheDir = normalizeAndMkDir('.cache');
            process.chdir(process.env.sourceDir);
            console.log(`source dir: ${process.env.sourceDir}`);
            console.log(`themes dir: ${process.env.themesDir}`);
            console.log(`cache dir: ${process.env.cacheDir}`);
            await serveGitSite(parseInt(options.port));
        });

    program.command('build')
        .description('Build static web site.')
        .option('-s, --source <directory>', 'source directory.', 'source')
        .option('-t, --themes <directory>', 'themes directory.', 'themes')
        .option('-o, --output <directory>', 'output directory.', 'dist')
        .option('-v, --verbose', 'make more logs for debugging.')
        .action(async options => {
            setVerbose(options.verbose);
            process.env.timestamp = Date.now();
            process.env.mode = 'build';
            process.env.sourceDir = normalizeAndCheckDir(options.source);
            process.env.themesDir = normalizeAndCheckDir(options.themes);
            // remove cache to force rebuild:
            removeDir('.cache');
            process.env.cacheDir = normalizeAndMkDir('.cache');
            process.env.outputDir = path.resolve(options.output);
            process.chdir(process.env.sourceDir);
            console.log(`source dir: ${process.env.sourceDir}`);
            console.log(`themes dir: ${process.env.themesDir}`);
            console.log(`cache dir: ${process.env.cacheDir}`);
            console.log(`output dir: ${process.env.outputDir}`);
            await buildGitSite();
        });

    program.parse();
}

main();
