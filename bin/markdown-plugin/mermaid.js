/*
Render a code block as mermaid diagram.

Source:

```mermaid [left|center|right]
flowchart LR
    mddocs(Markdown Docs)
    themes(HTML Templates)
    site(Static HTML Pages)
    gh_pages(GitHub Pages)
    cf_pages(CloudFlare Pages)
    web_server(Web Server)

    mddocs --> |build| site
    themes --> site
    site --> |deploy| gh_pages
    site --> |deploy| cf_pages
    site --> |deploy| web_server
```

Rendered as:

<svg id="ua1b2c3d" class="mermaid mermaid-flowchart">
  <g><path>...</path></g>
</svg>
*/
import path from 'node:path';
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';

import { deleteAllByRange, getByRange, uniqueId, parseArgs, checkEnumArg } from '../plugin_helper.js';

function getDiagramType(svg) {
    let type = getByRange(svg, 'aria-roledescription="', '"');
    let n = type.indexOf('-');
    if (n >= 0) {
        type = type.substring(0, n);
    }
    return type.toLowerCase();
}

function wrap(svg, align) {
    return `<div class="mermaid-wrapper" style="text-align:${align}">${svg}</div>`;
}

const preProcessByType = {
    statediagram: (s) => {
        s = s.replace('class="statediagram"', '');
        return s;
    }
};

const postProcessByType = {
    pie: (s) => {
        // append color 'svg-mermaid-fill-color-#' for each <path class="pieCircle" ...>
        for (let n = 0; ; n++) {
            const search = 'class="pieCircle"';
            const repl = `class="pieCircle svg-mermaid-fill-color-${n & 7}"`;
            if (s.indexOf(search) < 0) {
                break;
            }
            s = s.replace(search, repl);
        }
        // append color for each <g class="legend" ...>
        for (let n = 0; ; n++) {
            const search = 'class="legend"';
            const repl = `class="legend svg-mermaid-fill-color-${n & 7}"`;
            if (s.indexOf(search) < 0) {
                break;
            }
            s = s.replace(search, repl);
        }
        return s;
    }
};

export default function (md, args, str) {
    console.debug(`mermaid args=${JSON.stringify(args)}`);
    const kv = parseArgs(args);
    // align=left|center|right:
    const align = checkEnumArg(kv['align'], ['left', 'center', 'right']);

    // because it is very slow to generate diagrams to svg,
    // we cache the generated svg by hash:
    const uid = uniqueId(str);
    const outputFile = path.join(process.env.cacheDir, `${uid}.svg`);
    if (!process.env.disableCache && existsSync(outputFile)) {
        console.log(`load svg from cache: ${outputFile}`);
        let svg = readFileSync(outputFile, { encoding: 'utf8' });
        return wrap(svg, align);
    }
    const inputFile = path.join(process.env.cacheDir, `${uid}.mmd`);
    const outputOriginFile = path.join(process.env.cacheDir, `${uid}-ori.svg`);
    const puppeteerCfgFile = path.join(process.env.cacheDir, 'puppeteer-config.json');
    const isRoot = process.getuid && process.getuid() === 0;
    const puppeteerCfgJson = {
        args: []
    };
    if (process.getuid && process.getuid() === 0) {
        puppeteerCfgJson.args.push('--no-sandbox');
    }
    writeFileSync(puppeteerCfgFile, JSON.stringify(puppeteerCfgJson), { encoding: 'utf8' });
    writeFileSync(inputFile, str, { encoding: 'utf8' });
    const cmd = `npx -p @mermaid-js/mermaid-cli@10.6.1 mmdc -b transparent -p "${puppeteerCfgFile}" -i "${inputFile}" -o "${outputOriginFile}"`;
    console.log(`exec: ${cmd}`);
    execSync(cmd);
    let svg = readFileSync(outputOriginFile, { encoding: 'utf8' });
    // get diagram type:
    const type = getDiagramType(svg);

    // pre process:
    const preProcessFn = preProcessByType[type];
    if (preProcessFn) {
        svg = preProcessFn(svg);
    }

    // remove <style>...</style>:
    svg = deleteAllByRange(svg, '<style>', '</style>');
    // insert class="mermaid":
    svg = svg.replace('id="my-svg"', `id="my-svg" class="mermaid mermaid-${type}"`);
    // replace id 'my-svg' to uid:
    svg = svg.replace(/my\-svg/g, uid);
    // remove hardcoded color like: fill="#000", stroke="#000"
    svg = deleteAllByRange(svg, 'fill="#', '"');
    svg = deleteAllByRange(svg, 'stroke="#', '"');
    svg = deleteAllByRange(svg, 'fill="hsl(', ')"');
    svg = deleteAllByRange(svg, 'stroke="hsl(', ')"');
    svg = deleteAllByRange(svg, 'fill: rgb(', ');');
    svg = deleteAllByRange(svg, 'stroke: rgb(', ');');

    // post process:
    const postProcessFn = postProcessByType[type];
    if (postProcessFn) {
        svg = postProcessFn(svg);
    }
    // update output file:
    writeFileSync(outputFile, svg, { encoding: 'utf8' });
    console.log(`generate mermaid ok. type = ${type}`);
    return wrap(svg, align);
};
