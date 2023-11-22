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

export function isFileExists(...paths) {
    return existsSync(path.resolve(...paths));
}

async function markdownFileInfo(dir) {
    console.log(`markdown file dir: ${dir}`)
    let mdFile;
    const e1 = existsSync(path.resolve(dir, 'index.md'));
    const e2 = existsSync(path.resolve(dir, 'README.md'));
    if (e1 && e2) {
        throw new Error(`Both "index.md" and "README.md" found in ${dir}.`);
    }
    if (!e1 && !e2) {
        throw new Error(`Markdown file "index.md" or "README.md" not found in ${dir}.`);
    }
    if (e1) {
        mdFile = 'index.md';
    }
    if (e2) {
        mdFile = 'README.md';
    }
    const mdFilePath = path.resolve(dir, mdFile);
    const liner = new LineByLine(mdFilePath);
    let line, title = '';
    while (line = liner.next()) {
        let s = line.toString('utf8').trim();
        if (s) {
            if (s.startsWith('# ')) {
                title = s.substring(2).trim();
                break;
            } else {
                throw new Error(`Markdown file "${mdFilePath}" must have a title in first line defined as "# Heading".`);
            }
        }
    }
    if (!title) {
        throw new Error(`Markdown file "${mdFilePath}" must have a title in first line defined as "# Heading".`);
    }
    return [mdFile, title];
}

export async function getSubDirs(dir) {
    let subDirs = (await fs.readdir(dir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
    return subDirs;
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

// generate book index tree as json:
export async function generateBookIndex(siteDir, bookDirName) {
    const booksDir = path.resolve(siteDir, 'books');
    let bookUrlBase = `/books/${bookDirName}`;
    let listDir = async (parent, dir, index) => {
        let fullDir = path.resolve(booksDir, dir);
        console.log(`scan dir: ${dir}, full: ${fullDir}`);
        let [order, uri] = parent === null ? [0, dir] : chapterURI(dir);
        console.log(`set order: ${order}, uri: ${uri}`);
        let [file, title] = parent === null ? ['', bookDirName] : await markdownFileInfo(fullDir);
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
    let str = await loadTextFile(...paths);
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
