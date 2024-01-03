/*
Render a code block as sheet music.

Source:

```abcjs max-width=600
X: 1
T: Cooley's
M: 4/4
L: 1/8
R: reel
K: Emin
|:D2|EB{c}BA B2 EB|~B2 AB dBAG|FDAD BDAD|FDAD dAFD|
EBBA B2 EB|B2 AB defg|afe^c dBAF|DEFD E2:|
|:gf|eB B2 efge|eB B2 gedB|A2 FA DAFA|A2 FA defg|
eB B2 eBgB|eB B2 defg|afe^c dBAF|DEFD E2:|
```

Rendered as:

<div class="abcjs-wrapper" style="max-width:600px">
    ...
</div>
*/

import { parseArgs, uniqueId, checkEnumArg, checkIntArg } from '../plugin_helper.js';

const alignStyles = {
    left: 'margin-left:0;margin-right:auto;',
    center: 'margin-left:auto;margin-right:auto;',
    right: 'margin-left:auto;margin-right:0;'
}

export default function (md, args, str) {
    console.debug(`abcjs args=${JSON.stringify(args)}`);
    const kv = parseArgs(args);
    const controls = !!kv['controls'];
    const align = checkEnumArg(kv['align'], ['left', 'center', 'right']);
    const maxWidth = checkIntArg(kv['max-width'], 0, x => x >= 10 && x <= 10000);
    let style = alignStyles[align];
    if (maxWidth > 0) {
        style = style + `max-width:${maxWidth}px;`;
    }
    const uid = uniqueId(str + '\n' + args.join(' '));
    const pid = 'p' + uid;
    const aid = controls ? uid : '';
    const adiv = aid ? `<div id="${aid}" ></div >` : '';

    let html = `<div class="abcjs-wrapper" style="${style}">
    <div id="${pid}" class="abcjs-container"></div>
    ${adiv}
</div>
<script>
    ABCJS_initSheetMusic(${JSON.stringify(str)}, "${pid}", "${aid}");
</script>
`;
    return html;
};
