// helper functions:

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import LineByLine from 'n-readlines';

export function isExists(...paths) {
    return existsSync(path.resolve(...paths));
}

// return ['title', 'md-content']
export function markdownTitleContent(mdFilePath) {
    const liner = new LineByLine(mdFilePath);
    let line, title = '', content = [];
    while (line = liner.next()) {
        let s = line.toString('utf8').trim();
        if (s) {
            if (s.startsWith('# ')) {
                if (title === '') {
                    title = s.substring(2).trim();
                }
            }
            break;
        }
    }
    if (!title) {
        throw new Error(`Markdown file "${mdFilePath}" must have a title in first line defined as "# title".`);
    }
    while (line = liner.next()) {
        content.push(line.toString('utf8'));
    }
    return [title, content.join('\n')];
}

export async function getSubDirs(dir, filterFn) {
    if (!isExists(dir)) {
        return [];
    }
    let names = (await fs.readdir(dir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
    if (filterFn) {
        names = names.filter(filterFn);
    }
    return names;
}

export async function getFiles(dir, filterFn) {
    return (await fs.readdir(dir, { withFileTypes: true }))
        .filter(d => d.isFile())
        .map(d => d.name)
        .filter(filterFn);
}

export async function copyStaticFiles(src, dest) {
    const files = await getFiles(src, name => !name.startsWith('.') && name !== 'README.md' && name !== 'index.html');
    for (let f of files) {
        const sFile = path.join(src, f);
        const dFile = path.join(dest, f);
        console.log(`copy: ${sFile} to: ${dFile}`);
        await fs.copyFile(sFile, dFile);
    }
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
    const arr = [];
    for (let child of root.children) {
        flatternNode(arr, child);
    }
    if (arr.length === 0) {
        throw 'empty chapters';
    }
    const len = arr.length;
    for (let i = 0; i < len; i++) {
        const element = arr[i];
        element.prev = i === 0 ? null : arr[i - 1];
        element.next = i < len - 1 ? arr[i + 1] : null;
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

export function isValidDate(ds) {
    let dt = new Date(ds);
    return dt.toISOString().startsWith(ds);
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

export function encodeHtml(str) {
    return str.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
