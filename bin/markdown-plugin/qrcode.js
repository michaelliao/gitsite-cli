/*
Render a code block as ascii.

Source:

```qrcode ecl-m w-256 p-2 info link
https://gitsite.org/
```

Rendered as:

<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" version="1.1" width="256" height="256">
  <rect x="0" y="0" width="256" height="256" style="fill:transparent;shape-rendering:crispEdges;"></rect>
  <rect x="17.655172413793103" y="17.655172413793103" width="8.827586206896552" height="8.827586206896552" style="shape-rendering:crispEdges;"></rect>
  <rect x="26.482758620689655" y="17.655172413793103" width="8.827586206896552" height="8.827586206896552" style="shape-rendering:crispEdges;"></rect>
  <rect x="35.310344827586206" y="17.655172413793103" width="8.827586206896552" height="8.827586206896552" style="shape-rendering:crispEdges;"></rect>
  ...
</svg>

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

export default function (md, type, args, str) {
    if (type !== 'qrcode') {
        return null;
    }
    console.log(`generate qrcode: args = ${JSON.stringify(args)}`);
    // default args:
    let ecl = 'm';
    let width = 256;
    let padding = 0;
    let info = false;
    let link = false;
    // parse args:
    for (let arg of args) {
        // ecl like 'ecl-m':
        if (arg.startsWith('ecl-')) {
            ecl = arg.substring(4);
            if (!ECL_SET.has(ecl)) {
                console.warn(`invalid qrcode ecl: ${arg}`);
                ecl = 'm';
            }
        } else if (arg.startsWith('w-')) {
            // width like 'w-256':
            width = parseInt(arg.substring(2));
            if (isNaN(width) || width < 10) {
                console.warn(`invalid qrcode width: ${arg}`);
                width = 256;
            }
        } else if (arg.startsWith('p-')) {
            // padding like 'p-4':
            padding = parseInt(arg.substring(2));
            if (isNaN(padding) || padding < 0) {
                console.warn(`invalid qrcode padding: ${arg}`);
                padding = 0;
            }
        } else if (arg === 'info') {
            info = true;
        } else if (arg === 'link') {
            link = true;
        } else {
            console.warn(`invalid qrcode argument: ${arg}`);
        }
    }

    let qrcode = new QRCode({
        content: str,
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
        <p><svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="gsc-icon" viewBox="0 0 16 16">
        <path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5M.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5M4 4h1v1H4z"/>
        <path d="M7 2H2v5h5zM3 3h3v3H3zm2 8H4v1h1z"/>
        <path d="M7 9H2v5h5zm-4 1h3v3H3zm8-6h1v1h-1z"/>
        <path d="M9 2h5v5H9zm1 1v3h3V3zM8 8v2h1v1H8v1h2v-2h1v2h1v-1h2v-1h-3V8zm2 2H9V9h1zm4 2h-1v1h-2v1h3zm-4 2v-1H8v1z"/>
        <path d="M12 9h2V8h-2z"/>
        </svg> ${s}</p>
        `;
    }
    return svg;
};
