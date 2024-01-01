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

<svg id="SVG1a2b3c" class="mermaid mermaid-flowchart">
  <g><path>...</path></g>
</svg>
*/
const { createHash } = await import('node:crypto');
import path from 'node:path';
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs';

// getRange('<b>strong</b>', '<b>', '</b>') => 'strong'
function getRange(str, start, end) {
    let n1 = str.indexOf(start);
    if (n1 < 0) {
        throw `substring ${start} not found.`;
    }
    let n2 = str.indexOf(end, n1 + start.length);
    if (n2 < 0) {
        throw `substring ${end} not found.`;
    }
    return str.substring(n1 + start.length, n2);
}

// deleteRange('Hello, <b>x</b>World<b>y</b>!', '<b>', '</b>') => 'Hello, World!'
function deleteRange(str, start, end) {
    for (; ;) {
        let n1 = str.indexOf(start);
        if (n1 < 0) {
            return str;
        }
        let n2 = str.indexOf(end, n1 + start.length);
        if (n2 < 0) {
            throw `substring ${end} not found.`;
        }
        str = str.substring(0, n1) + str.substring(n2 + end.length);
    }
}

function getDiagramType(svg) {
    let type = getRange(svg, 'aria-roledescription="', '"');
    let n = type.indexOf('-');
    if (n >= 0) {
        type = type.substring(0, n);
    }
    return type.toLowerCase();
}

function sha1(str) {
    const hash = createHash('sha1');
    hash.update(str);
    return hash.digest('hex');
}

function wrap(svg, align) {
    return `<div class="mermaid-wrapper" style="text-align:${align}">${svg}</div>`;
}

export default function (md, args, str) {
    console.debug(`mermaid args=${JSON.stringify(args)}`);
    let align = 'left';
    for (let arg of args) {
        let larg = arg.toLowerCase();
        if (larg === 'left' || larg === 'center' || larg === 'right') {
            align = larg;
        }
    }
    // because it is very slow to generate diagrams to svg,
    // we cache the generated svg by hash:
    const hash = sha1(str);
    const outputFile = path.join(process.env.cacheDir, `${hash}.svg`);
    if (!process.env.disableCache && existsSync(outputFile)) {
        console.log(`load svg from cache: ${outputFile}`);
        let svg = readFileSync(outputFile, { encoding: 'utf8' });
        return wrap(svg, align);
    }
    const inputFile = path.join(process.env.cacheDir, `${hash}.mmd`);
    const outputOriginFile = path.join(process.env.cacheDir, `${hash}-ori.svg`);
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
    const cmd = `npx -p @mermaid-js/mermaid-cli mmdc -b transparent -p "${puppeteerCfgFile}" -i "${inputFile}" -o "${outputOriginFile}"`;
    console.log(`exec: ${cmd}`);
    execSync(cmd);
    let svg = readFileSync(outputOriginFile, { encoding: 'utf8' });
    // get diagram type:
    const type = getDiagramType(svg);

    // remove <style>...</style>:
    svg = deleteRange(svg, '<style>', '</style>');
    // insert class="mermaid":
    svg = svg.replace('id="my-svg"', `id="my-svg" class="mermaid mermaid-${type}"`);
    // replace id 'my-svg' to 'svg-<hash>':
    svg = svg.replace(/my\-svg/g, 'SVG' + hash.substring(0, 10));
    // remove hardcoded color like: fill="#000", stroke="#000"
    svg = deleteRange(svg, 'fill="#', '"');
    svg = deleteRange(svg, 'stroke="#', '"');
    svg = deleteRange(svg, 'fill="hsl(', ')"');
    svg = deleteRange(svg, 'stroke="hsl(', ')"');
    svg = deleteRange(svg, 'fill: rgb(', ');');
    svg = deleteRange(svg, 'stroke: rgb(', ');');
    // update output file:
    writeFileSync(outputFile, svg, { encoding: 'utf8' });
    return wrap(svg, align);
};
