/*
Render a code block as qrcode.

Source:

```qrcode ecl=m width=256 padding=2 align=[left|center|right] info link
https://gitsite.org/
```

Rendered as:

<div style="text-align:left">
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" version="1.1" width="256" height="256">
    <rect x="0" y="0" width="256" height="256" style="fill:transparent;shape-rendering:crispEdges;"></rect>
    <rect x="17.655172413793103" y="17.655172413793103" width="8.827586206896552" height="8.827586206896552" style="shape-rendering:crispEdges;"></rect>
    <rect x="26.482758620689655" y="17.655172413793103" width="8.827586206896552" height="8.827586206896552" style="shape-rendering:crispEdges;"></rect>
    <rect x="35.310344827586206" y="17.655172413793103" width="8.827586206896552" height="8.827586206896552" style="shape-rendering:crispEdges;"></rect>
    ...
  </svg>
</div>

instruction: qrcode
arguments:
  ecl=[l|m|h|q]: error correction level, e.g. 'ecl=q', default to 'ecl=l'.
  width=[200]: width in pixel, e.g. 'width=200', default to 'width=256'.
  padding=[0]: padding in line-width, e.g. 'padding=4', default to 'padding=0'.
  info: display qrcode information, default to none if not specified.
  link: auto link if qrcode is an URL and info is specified.
*/
import QRCode from "qrcode-svg";
import { checkEnumArg, checkIntArg, deleteAllByRange, parseArgs } from "../plugin_helper.js";

function wrap(svg, align) {
    return `<div class="qrcode-wrapper" style="text-align:${align}">${svg}</div>`;
}

export default function (md, args, str) {
    console.debug(`generate qrcode: args = ${JSON.stringify(args)}`);
    const kv = parseArgs(args);
    // default args:
    const align = checkEnumArg(kv['align'], ['left', 'center', 'right']);
    const ecl = checkEnumArg(kv['ecl'], ['l', 'm', 'h', 'q']);
    const info = !!kv['info'];
    const link = info && kv['link'];
    const width = checkIntArg(kv['width'], 200, x => x >= 10 && x <= 10000);
    const padding = checkIntArg(kv['padding'], 0, x => x >= 0 && x <= 8);

    const qrcode = new QRCode({
        content: str.trim(),
        width: width,
        height: width,
        padding: padding,
        color: '#123456',
        background: 'transparent',
        ecl: ecl.toUpperCase(),
        join: true
    });
    let svg = qrcode.svg();
    // remove <?xml ...?>:
    svg = deleteAllByRange(svg, '<?xml', '?>');
    // set fill=currentColor:
    svg = svg.replace('<svg xmlns="http://www.w3.org/2000/svg"', '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor"');
    // remove fill:#123456:
    svg = svg.replace(/fill\:\#123456\;/g, '');
    if (info) {
        let s = str;
        if (link) {
            try {
                new URL(s);
                s = `<a href="${s}" target="_blank">${s}</a>`;
            } catch (err) {
                // not a link
            }
        }
        svg = svg + `
        <p>${s}</p>
        `;
    }
    return wrap(svg, align);
};
