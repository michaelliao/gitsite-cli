/*
Render a code block as math expression.

Source:

```math align=[left|center|right]
https://gitsite.org/
```

Rendered as:

<div style="text-align:left">
  <p class="katex">...</p>
</div>
*/
import katex from 'katex';
import('katex/contrib/mhchem');

import { checkEnumArg, parseArgs } from "../plugin_helper.js";

function wrap(html, align) {
    return `<div class="math-wrapper math-wrapper-${align}">${html}</div>`;
}

export default function (md, args, str) {
    console.debug(`generate math: args = ${JSON.stringify(args)}`);
    const kv = parseArgs(args);
    // default args:
    const align = checkEnumArg(kv['align'], ['left', 'center', 'right']);
    const html = katex.renderToString(str, {
        displayMode: true,
        mhchem: true,
        output: 'html',
        throwOnError: false
    });
    return wrap(html, align);
};
