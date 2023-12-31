/*
Render a code block as ascii.

Source:

```ascii
┌───────┐
│ Hello │
├───────┤
│ World │
└───────┘
```

Rendered as:

<pre class="ascii"><code>
┌───────┐
│ Hello │
├───────┤
│ World │
└───────┘
</code></pre>
*/

import MarkdownIt from "markdown-it";

const escapeHtml = MarkdownIt().utils.escapeHtml;

export default function (md, args, str) {
    return '<pre class="ascii"><code>' + escapeHtml(str) + '</code></pre>\n';
};
