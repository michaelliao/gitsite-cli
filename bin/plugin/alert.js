/*
Render a code block as alert.

Source:

``` alert info
NOTE: this is an **info** message.
```

Rendered as:

<div class="alert alert-info">
  <p>NOTE: This is an <strong>info</strong> message.</p>
</div>
*/

export default function (md, type, args, str) {
  if (type !== 'alert') {
    return null;
  }
  let arg = args[0] || 'info';
  return `<div class="alert alert-${arg}"><p>` + md.renderInline(str) + '</p></div>\n';
};
