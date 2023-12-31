import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import MarkdownIt from 'markdown-it';
import MarkdownItContainer from 'markdown-it-container';
import footnote_plugin from 'markdown-it-footnote';
import hljs from 'highlight.js';
import { katex } from '@mdit/plugin-katex';

function getAttr(tokens, idx, attrName) {
    let index = tokens[idx].attrIndex(attrName);
    if (index >= 0) {
        return tokens[idx].attrs[index][1];
    }
    return null;
}

function setAttr(tokens, idx, attrName, attrValue) {
    let index = tokens[idx].attrIndex(attrName);
    if (index < 0) {
        tokens[idx].attrPush([attrName, attrValue]);
    } else {
        tokens[idx].attrs[index][1] = attrValue;
    }
}

const unescapeAll = MarkdownIt().utils.unescapeAll;
const escapeHtml = MarkdownIt().utils.escapeHtml;

async function createMarkdown(opt) {
    if (opt === undefined) {
        // default options:
        opt = {
            html: true, // enable HTML tags in source
            linkify: true, // autoconvert URL-like text to links
            external_link: true, // add target="_blank" for external link
            lazy_image: true, // add loading="lazy" for image
            math: true, // enable mathematical expressions
            footnote: true, // enable footnate
        };
    }
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const plugin_dir = path.join(__dirname, 'markdown-plugin');
    const plugin_names = await readdir(plugin_dir);
    plugin_names.sort();
    const codeBlockPlugins = new Map();
    for (let name of plugin_names) {
        if (name.endsWith('.js')) {
            console.debug(`auto import markdown plugin: ${name}`);
            const mod = await import(`./markdown-plugin/${name}`);
            const pName = name.substring(0, name.length - 3);
            codeBlockPlugins.set(pName, mod.default);
        }
    }
    let md = new MarkdownIt({
        html: opt.html,
        linkify: opt.linkify,
        highlight: (str, lang) => {
            if (!lang) {
                lang = 'text';
            }
            lang = lang.toLowerCase();
            if (hljs.getLanguage(lang)) {
                try {
                    return `<pre class="hljs"><code class="language-${lang}">` +
                        hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                        '</code></pre>';
                } catch (e) { }
            }
            return `<pre class="hljs"><code class="language-${lang}">${escapeHtml(str)}</code></pre>`;
        }
    });

    if (codeBlockPlugins.size > 0) {
        const defaultFence = md.renderer.rules.fence;
        md.renderer.rules.fence = function (tokens, idx, options, env, self) {
            let token = tokens[idx],
                info = token.info ? unescapeAll(token.info).trim() : '';

            if (info) {
                let arr = info.toLowerCase().split(/\s+/g);
                let type = arr.shift();
                if (codeBlockPlugins.has(type)) {
                    console.log(`use markdown plugin ${type}.`);
                    let plugin = codeBlockPlugins.get(type);
                    let result = plugin(md, arr, token.content);
                    if (result) {
                        return result;
                    }
                }
            }

            // pass token to default renderer:
            return defaultFence(tokens, idx, options, env, self);
        };
    }

    if (opt.external_link) {
        // add target="_blank" for external link:
        const defaultLinkRender = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
            return self.renderToken(tokens, idx, options);
        };
        md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
            // check if relative url:
            let isRelative = false;
            let href = getAttr(tokens, idx, 'href');
            if (href) {
                try {
                    new URL(href);
                } catch (e) {
                    // relative url:
                    isRelative = true;
                }
            }
            if (!isRelative) {
                setAttr(tokens, idx, 'target', '_blank');
            }
            // pass token to default renderer:
            return defaultLinkRender(tokens, idx, options, env, self);
        };
    }

    if (opt.lazy_image) {
        // add loading="lazy" for image:
        const defaultImgRender = md.renderer.rules.image || function (tokens, idx, options, env, self) {
            return self.renderToken(tokens, idx, options);
        };
        md.renderer.rules.image = function (tokens, idx, options, env, self) {
            // get src:
            let src = getAttr(tokens, idx, 'src');
            if (src && !src.trim().startsWith('data:')) {
                setAttr(tokens, idx, 'loading', 'lazy');
            }
            // pass token to default renderer:
            return defaultImgRender(tokens, idx, options, env, self);
        };
    }

    if (opt.math) {
        md.use(katex, { mhchem: true });
    }

    if (opt.footnote) {
        md.use(footnote_plugin);
    }

    return {
        instance: md,
        render: (str) => {
            return md.render(str);
        },
        addContainer: (type) => {
            console.debug(`add container support: type = ${type}.`);
            let regex = RegExp(`^\\s*${type}\\s+(.*)\\s*$`);
            md.use(MarkdownItContainer, type, {
                validate: (params) => {
                    return params.trim().match(regex);
                },
                render: (tokens, idx) => {
                    let m = tokens[idx].info.trim().match(regex);
                    if (tokens[idx].nesting === 1) {
                        let subtype = m[1].trim();
                        return subtype ? `<div class="${type} ${type}-${subtype}">` : `<div class="${type}">`;
                    } else {
                        return '</div>\n';
                    }
                }
            });
        }
    };
}

export default createMarkdown;
