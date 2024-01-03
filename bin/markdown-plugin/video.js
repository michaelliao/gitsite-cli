/*
Render a video url as player.

Source:

```video ratio=16:9
https://www.youtube.com/watch?v=RcnksOUugcA
```

Rendered as:

<div class="gsc-video-container">
    <iframe class="gsc-video" src="https://www.youtube.com/embed/RcnksOUugcA" allowfullscreen></iframe>
</div>
*/

import { checkEnumArg, checkIntArg, parseArgs, escapeHtml } from "../plugin_helper.js";

const VIDEOS = {
    youtube: {
        urlPatterns: [/https\:\/\/www\.youtube\.com\/watch\?v\=(\w+).*/, /https\:\/\/www\.youtube\.com\/embed\/(\w+).*/],
        embed: 'https://www.youtube.com/embed/${key}'
    },
    bilibili: {
        urlPatterns: [/https\:\/\/www\.bilibili\.com\/video\/(BV\w+).*/],
        embed: 'https://player.bilibili.com/player.html?bvid=${key}&autoplay=0'
    }
}

const DEFAULT_RATIO = [4, 3];

// 'https://www.youtube.com/watch?v=RcnksOUugcA' => ['youtube', 'RcnksOUugcA']
function parseTypeAndKey(url) {
    for (let key in VIDEOS) {
        let urlPatterns = VIDEOS[key].urlPatterns;
        for (let urlPattern of urlPatterns) {
            let r = urlPattern.exec(url);
            if (r !== null) {
                return [key, r[1]];
            }
        }
    }
    return [null, null];
}

function parseRatio(s) {
    let ss = s.split(':');
    if (ss.length !== 2) {
        console.error(`parse ratio failed: ${s}`);
        return DEFAULT_RATIO;
    }
    let w = parseInt(ss[0], 10);
    let h = parseInt(ss[1], 10);
    if (isNaN(w) || isNaN(h) || w <= 0 || w > 100 || h <= 0 || h > 100) {
        console.error(`parse ratio failed: ${s}`);
        return DEFAULT_RATIO;
    }
    return [w, h];
}

const alignStyles = {
    left: 'margin-left:0;margin-right:auto;',
    center: 'margin-left:auto;margin-right:auto;',
    right: 'margin-left:auto;margin-right:0;'
}

export default function (md, args, str) {
    console.debug(`alert args=${JSON.stringify(args)}`);
    const kv = parseArgs(args);
    const align = checkEnumArg(kv['align'], ['left', 'center', 'right']);
    const autoplay = !!kv['autoplay'];
    const maxWidth = checkIntArg(kv['max-width'], 0, x => x >= 10 && x <= 10000);
    const ratio = parseRatio(kv['ratio'] || '4:3');

    const [type, key] = parseTypeAndKey(str.trim());
    if (type === null) {
        return '<p>ERROR parse video url: ' + escapeHtml(str) + '</p>';
    }
    const [w, h] = ratio;
    const padding = 100 * h / w;
    const src = VIDEOS[type].embed.replace('${key}', key);
    let html = `<div class="gsc-video-container gsc-video-container-${type}" style="padding-bottom: ${padding.toFixed(4)}%">
    <iframe class="gsc-video gsc-video-${type}" src="${src}" allowfullscreen></iframe>
</div>`;
    let style = alignStyles[align];
    if (maxWidth > 0) {
        style = style + `max-width:${maxWidth}px;`;
    }
    html = `<div class="gsc-video-wrapper" style="${style}">` + html + '</div>';
    return html;
};
