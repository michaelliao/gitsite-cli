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
    const pdfOnly = `<div class="pdf-only" style="margin:10px"><a href="${str}" style="display:block; width:64px; height:64px;">
    <img style="width:100%;" src="data:image/svg+xml;base64,   PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgZmlsbD0icmdiKDIsMTMyLDE5OSkiIGNsYXNzPSJiaSBiaS1wbGF5LWNpcmNsZSIgdmlld0JveD0iMCAwIDE2IDE2Ij4KICA8cGF0aCBkPSJNOCAxNUE3IDcgMCAxIDEgOCAxYTcgNyAwIDAgMSAwIDE0bTAgMUE4IDggMCAxIDAgOCAwYTggOCAwIDAgMCAwIDE2Ii8+CiAgICA8cGF0aCBkPSJNNi4yNzEgNS4wNTVhLjUuNSAwIDAgMSAuNTIuMDM4bDMuNSAyLjVhLjUuNSAwIDAgMSAwIC44MTRsLTMuNSAyLjVBLjUuNSAwIDAgMSA2IDEwLjV2LTVhLjUuNSAwIDAgMSAuMjcxLS40NDUiLz4KICAgIDwvc3ZnPg==" />
</a></div>`;
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
