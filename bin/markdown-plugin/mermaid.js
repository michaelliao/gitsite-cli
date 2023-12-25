/*
Render a code block as mermaid diagram.

Source:

``` mermaid
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

<svg id="SVG1a2b3c" class="mermaid">
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
    let dtype = getRange(svg, 'aria-roledescription="', '"');
    let n = dtype.indexOf('-');
    if (n >= 0) {
        dtype = dtype.substring(0, n);
    }
    return dtype.toLowerCase();
}

function sha1(str) {
    const hash = createHash('sha1');
    hash.update(str);
    return hash.digest('hex');
}

export default function (md, type, args, str) {
    if (type !== 'mermaid') {
        return null;
    }
    console.log(`generate mermaid svg:
${str}`);
    // because it is very slow to generate diagrams to svg,
    // we cache the generated svg by hash:
    const hash = sha1(str);
    const output = path.join(process.env.cacheDir, `${hash}.svg`);
    if (!process.env.disableCache && existsSync(output)) {
        console.log(`load svg from cache: ${output}`);
        return readFileSync(output, { encoding: 'utf8' });
    }
    const input = path.join(process.env.cacheDir, `${hash}.mmd`);
    const outputOrigin = path.join(process.env.cacheDir, `${hash}-ori.svg`);
    writeFileSync(input, str, { encoding: 'utf8' });
    const cmd = `npx -p @mermaid-js/mermaid-cli mmdc -b transparent -i ${input} -o ${outputOrigin}`;
    console.log(`exec: ${cmd}`);
    execSync(cmd);
    let svg = readFileSync(outputOrigin, { encoding: 'utf8' });
    // get diagram type:
    const dtype = getDiagramType(svg);

    // remove <style>...</style>:
    svg = deleteRange(svg, '<style>', '</style>');
    // insert class="mermaid":
    svg = svg.replace('id="my-svg"', `id="my-svg" class="mermaid mermaid-${dtype}"`);
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
    writeFileSync(output, svg, { encoding: 'utf8' });
    return svg + '\n';
};
