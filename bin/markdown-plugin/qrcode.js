/*
Render a code block as ascii.

Source:

```qrcode ecl-m w-256 p-2 [left|center|right] info link
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
  ecl-[l|m|h|q]: error correction level, e.g. 'ecl-q', default to 'ecl-m'.
  w-[200]: width in pixel, e.g. 'w-200', default to 'w-256'.
  p-[4]: padding in line-width, e.g. 'p-4', default to 'p-0'.
  info: display qrcode information, default to none if not specified.
  link: auto link if qrcode is an URL and info is specified.
*/
import QRCode from "qrcode-svg";

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

const ECL_SET = new Set(['l', 'm', 'h', 'q']);

function wrap(svg, align) {
    return `<div class="qrcode-wrapper" style="text-align:${align}">${svg}</div>`;
}

export default function (md, args, str) {
    console.debug(`generate qrcode: args = ${JSON.stringify(args)}`);
    // default args:
    let ecl = 'm';
    let width = 256;
    let padding = 0;
    let align = 'left';
    let info = false;
    let link = false;
    // parse args:
    for (let arg of args) {
        let larg = arg.toLowerCase();
        // ecl like 'ecl-m':
        if (larg.startsWith('ecl-')) {
            ecl = larg.substring(4);
            if (!ECL_SET.has(ecl)) {
                console.warn(`invalid qrcode ecl: ${arg}`);
                ecl = 'm';
            }
        } else if (larg.startsWith('w-')) {
            // width like 'w-256':
            width = parseInt(larg.substring(2));
            if (isNaN(width) || width < 10) {
                console.warn(`invalid qrcode width: ${arg}`);
                width = 256;
            }
        } else if (larg.startsWith('p-')) {
            // padding like 'p-4':
            padding = parseInt(larg.substring(2));
            if (isNaN(padding) || padding < 0) {
                console.warn(`invalid qrcode padding: ${arg}`);
                padding = 0;
            }
        } else if (larg === 'left' || larg === 'center' || larg === 'right') {
            align = larg;
        } else if (larg === 'info') {
            info = true;
        } else if (larg === 'link') {
            link = true;
        } else {
            console.warn(`invalid qrcode argument: ${arg}`);
        }
    }

    let qrcode = new QRCode({
        content: str.trim(),
        width: width,
        height: width,
        padding: padding,
        color: '#000000',
        background: 'transparent',
        ecl: ecl.toUpperCase(),
        join: true
    });
    let svg = qrcode.svg();
    // remove <?xml ...?>:
    svg = deleteRange(svg, '<?xml', '?>');
    // set fill=currentColor:
    svg = svg.replace('<svg xmlns="http://www.w3.org/2000/svg"', '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor"');
    // remove fill:#000000:
    svg = svg.replace(/fill\:\#000000\;/g, '');
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
