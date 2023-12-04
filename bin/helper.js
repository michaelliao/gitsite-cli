// helper functions:

import fs from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import lunr from 'lunr';
import nunjucks from 'nunjucks';
import LineByLine from 'n-readlines';

function chapterURI(dir) {
    let base = path.basename(dir);
    let groups = /^(\d{1,8})[\-\.\_](.+)$/.exec(base);
    if (groups === null) {
        console.warn(`WARNING: folder will be sort at last for there is no order that can extract from name: ${dir}`);
        return [100_000_000, base];
    }
    return [parseInt(groups[1]), groups[2]];
}

export function isExists(...paths) {
    return existsSync(path.resolve(...paths));
}

// return ['title', 'summary', 'md-content']
export function markdownTitleSummaryContent(mdFilePath) {
    const liner = new LineByLine(mdFilePath);
    let line, title = '', summary = '';
    while (line = liner.next()) {
        let s = line.toString('utf8').trim();
        if (s) {
            if (s.startsWith('# ')) {
                if (title === '') {
                    title = s.substring(2).trim();
                } else {
                    break;
                }
            } else if (s.startsWith('> ')) {
                if (title !== '') { // title must be read first
                    summary = summary + ' ' + s.substring(2);
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }
    if (!title) {
        throw new Error(`Markdown file "${mdFilePath}" must have a title in first line defined as "# title".`);
    }
    let content = [];
    while (line = liner.next()) {
        content.push(line.toString('utf8'));
    }
    return [title, summary.trim(), content.join('\n')];
}

export function markdownTitleAndSummary(mdFilePath) {
    const liner = new LineByLine(mdFilePath);
    let line, title = '', summary = '';
    while (line = liner.next()) {
        let s = line.toString('utf8').trim();
        if (s) {
            if (s.startsWith('# ')) {
                if (title === '') {
                    title = s.substring(2).trim();
                } else {
                    break;
                }
            } else if (s.startsWith('> ')) {
                if (title !== '') { // title must be read first
                    summary = summary + ' ' + s.substring(2);
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }
    if (!title) {
        throw new Error(`Markdown file "${mdFilePath}" must have a title in first line defined as "# title".`);
    }
    return [title, summary.trim()];
}

async function markdownFileInfo(dir) {
    console.debug(`markdown file dir: ${dir}`)
    const mdFilePath = path.join(dir, 'README.md');
    if (!existsSync(mdFilePath)) {
        throw new Error(`Markdown file "README.md" not found in ${dir}.`);
    }
    let [title, summary] = markdownTitleAndSummary(mdFilePath);
    return ['README.md', title, summary];
}

export async function getSubDirs(dir) {
    return (await fs.readdir(dir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
}

export async function getFiles(dir, filterFn) {
    return (await fs.readdir(dir, { withFileTypes: true }))
        .filter(d => d.isFile())
        .map(d => d.name)
        .filter(filterFn);
}

function flatternNode(array, node) {
    array.push(node);
    if (node.children.length > 0) {
        for (let child of node.children) {
            flatternNode(array, child);
        }
    }
}

export function flattenChapters(root) {
    // depth-first search:
    let arr = [];
    for (let child of root.children) {
        flatternNode(arr, child);
    }
    return arr;
}

export function findChapter(node, uri) {
    if (node.uri === uri) {
        return node;
    }
    for (let child of node.children) {
        if (child.uri === uri) {
            return child;
        }
        if (uri.startsWith(child.uri + '/')) {
            return findChapter(child, uri);
        }
    }
    return null;
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

export async function loadBlogInfo(name) {
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

export function isValidDate(ds) {
    let dt = new Date(ds);
    return dt.toISOString().startsWith(ds);
}

// generate blog index as json, newest first:
export async function generateBlogIndex() {
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
export async function generateBookIndex(bookDirName) {
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
export function createTemplateEngine(dir) {
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

// load yaml file as object:
export async function loadYaml(...paths) {
    let str = await loadTextFile(process.env.siteDir, ...paths);
    let obj = YAML.parse(str);
    // copy key 'abc-xyz' to 'abcXyz' recursively:
    let dupKey = (obj) => {
        if (obj === null || Array.isArray(obj)) {
            return;
        }
        if (typeof (obj) === 'object') {
            let copy = {}
            for (let key in obj) {
                dupKey(obj[key]);
                if (key.indexOf('-') > 0) {
                    let key2 = key.replace(/\-([a-z])/g, (h, a) => a.toUpperCase());
                    if (copy[key2] === undefined) {
                        copy[key2] = obj[key];
                    }
                }
            }
            for (let key in copy) {
                obj[key] = copy[key];
            }
        }
    };
    dupKey(obj);
    console.debug(`loaded yaml:
`+ JSON.stringify(obj, null, '  '));
    return obj;
}

// load text file content using utf-8 encoding:
export async function loadTextFile(...paths) {
    return await fs.readFile(path.resolve(...paths), {
        encoding: 'utf8'
    });
}

// write text file content using utf-8 encoding:
export async function writeTextFile(fpath, content) {
    const dir = path.dirname(fpath);
    if (!existsSync(dir)) {
        console.log(`create dir: ${dir}`);
        await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(fpath, content, { encoding: 'utf8' })
}

// load binary file content as buffer:
export async function loadBinaryFile(...paths) {
    return await fs.readFile(path.resolve(...paths));
}

// create search index:
export async function createSearchIndex() {
    let idx = lunr(function () {
        this.field('title');
        this.field('content');
        this.metadataWhitelist = ['position'];
        this.add({
            'id': '/books/abc/xyz/hello-world',
            'title': 'A simple search example by Lunr',
            'content': 'If music be the food of love, play on: Give me excess of it…'
        });
    });
    let result = idx.search('food');
    console.log(JSON.stringify(result));
}
