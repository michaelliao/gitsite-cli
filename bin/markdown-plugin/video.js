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
        embed: 'https://player.bilibili.com/player.html?bvid=${key}'
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
    console.debug(`video args=${JSON.stringify(args)}`);
    const kv = parseArgs(args);
    const align = checkEnumArg(kv['align'], ['left', 'center', 'right']);
    const autoplay = !!kv['autoplay'];
    const controls = !!kv['controls'];
    const maxWidth = checkIntArg(kv['max-width'], 0, x => x >= 10 && x <= 10000);
    const ratio = parseRatio(kv['ratio'] || '4:3');
    const [w, h] = ratio;
    const padding = 100 * h / w;
    let style = alignStyles[align];
    if (maxWidth > 0) {
        style = style + `max-width:${maxWidth}px;`;
    }
    str = str.trim();
    const pdfOnly = `<p class="pdf-only"><a href="${str}">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" style="width:4em;height:4em;" fill="currentColor" viewBox="0 0 16 16">
        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
        <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445"/>
    </svg>
</a></p>`;
    if (str.endsWith('.mp4') || str.endsWith('.webm')) {
        /*
         * <video controls>
         *     <source src="xxx.mp4" />
         * </video>
         */
        let type = 'file';
        let html = `<div class="gsc-video-container gsc-video-container-${type}" style="padding-bottom: ${padding.toFixed(4)}%">
    <video ${controls ? 'controls ' : ''}${autoplay ? 'autoplay ' : ''}class="gsc-video gsc-video-${type}"><source src="${str}" /></video>
</div>`;
        html = `<div class="gsc-video-wrapper pdf-hidden" style="${style}">` + html + '</div>\n';
        return html + pdfOnly;
    } else {
        const [type, key] = parseTypeAndKey(str);
        if (type === null) {
            return '<p>ERROR parse video url: ' + escapeHtml(str) + '</p>';
        }
        const src = VIDEOS[type].embed.replace('${key}', key);
        let html = `<div class="gsc-video-container gsc-video-container-${type}" style="padding-bottom: ${padding.toFixed(4)}%">
    <iframe class="gsc-video gsc-video-${type}" src="${src}&${autoplay ? 'autoplay=1' : 'autoplay=0'}" ${autoplay ? 'allow="autoplay" ' : ''}allowfullscreen></iframe>
</div>`;
        html = `<div class="gsc-video-wrapper pdf-hidden" style="${style}">` + html + '</div>\n';
        return html + pdfOnly;
    }
};
