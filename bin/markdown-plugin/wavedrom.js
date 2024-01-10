/*
Render a code block as digital timing diagram.

Source:

```wavedrom align=[left|center|right]
{ signal: [
  { name: "clk",         wave: "p.....|..." },
  { name: "Data",        wave: "x.345x|=.x", data: ["head", "body", "tail", "data"] },
  { name: "Request",     wave: "0.1..0|1.0" },
  {},
  { name: "Acknowledge", wave: "1.....|01." }
]}
```

Rendered as:

<div style="text-align:left">
  <svg ...></svg>
</div>
*/
import json5 from 'json5';
import onml from 'onml';
import wavedrom from 'wavedrom';
import def from 'wavedrom/skins/default.js';
import narrow from 'wavedrom/skins/narrow.js';
import lowkey from 'wavedrom/skins/lowkey.js';

import { checkEnumArg, hexHash, deleteAllByRange, parseArgs } from "../plugin_helper.js";

const skins = Object.assign({}, def, narrow, lowkey);

function wrap(html, align) {
    return `<div class="wavedrom-wrapper wavedrom-wrapper-${align}">${html}</div>`;
}

export default function (md, args, str) {
    console.debug(`generate wavedrom: args = ${JSON.stringify(args)}`);
    const kv = parseArgs(args);
    // default args:
    const align = checkEnumArg(kv['align'], ['left', 'center', 'right']);
    const source = json5.parse(str);
    const id = parseInt(hexHash(str).substring(0, 4), 16) & 0xffff;
    console.debug(`set wavedrom id = ${id}`);
    const res = wavedrom.renderAny(id, source, skins);
    let svg = onml.s(res);
    svg = svg.replace('class="WaveDrom"', 'class="svg-wavedrom"');
    svg = svg.replace(';fill:white', ';fill:transparent');
    svg = svg.replace('style="stroke:#888;', 'class="dot" style="');
    svg = deleteAllByRange(svg, '<style type="text/css">', '</style>');
    console.debug(svg);
    return wrap(svg, align);
};
