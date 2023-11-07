// helper functions:

import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import _ from 'lodash';

export async function loadYaml(siteDir, filePath) {
    let str = await loadTextFile(siteDir, filePath);
    return YAML.parse(str);
}

export async function loadTextFile(siteDir, filePath) {
    return await fs.readFile(path.resolve(siteDir, filePath), {
        encoding: 'utf8'
    });
}

export async function loadBinaryFile(siteDir, filePath) {
    return await fs.readFile(path.resolve(siteDir, filePath));
}

export async function loadLayout(siteDir) {
    let fileContent = await loadTextFile(siteDir, 'layout/index.html');
    // search for <!-- #include file="xxx" -->
    const re = /\<\!\-\-\s*\#include\s+(file|virtual)\s*\=\s*\"([^"]+)\"\s*--\>/g;
    let results = [], startIndex = 0, reResult;
    while ((reResult = re.exec(fileContent)) !== null) {
        let textPart = fileContent.substring(startIndex, reResult.index);
        results.push({
            type: 'text',
            value: textPart
        });
        results.push({
            type: reResult[1], // 'file' or 'virtual'
            value: reResult[2] // file name or virtual name
        });
        startIndex = re.lastIndex;
    }
    results.push({
        type: 'text',
        value: fileContent.substring(startIndex)
    });
    return results;
}

export function executeTemplate(templ, ctx) {
    // search for ${a.b.c}
    const re = /\$\{([\w\.]+)\}/g;
    let results = [], startIndex = 0, reResult;
    while ((reResult = re.exec(templ)) !== null) {
        let textPart = templ.substring(startIndex, reResult.index);
        results.push(textPart);
        // eval ${a.b.c}:
        let evalPath = reResult[1];
        let evalValue = _.get(ctx, evalPath);
        if (evalValue === undefined && evalPath.toLowerCase() !== evalPath) {
            // try: helloWorld => hello-world: 
            let evalPath2 = evalPath.replace(/([a-z0-9])([A-Z])/g, (h, a1, a2) => a1 + '-' + a2.toLowerCase());
            evalValue = _.get(ctx, evalPath2);
        }
        if (evalValue === undefined) {
            results.push('undefined');
        } else if (evalValue === null) {
            results.push('null');
        } else {
            results.push(evalValue.toString());
        }
        startIndex = re.lastIndex;
    }
    results.push(templ.substring(startIndex));
    return results.join('');
}