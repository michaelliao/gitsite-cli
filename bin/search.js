import fs from 'node:fs';
import flexsearch from 'flexsearch';

const { Index } = flexsearch;

// the following code BEGIN...END will be copied to browser side js:

// BEGIN tokenizer

export function tokenizer(str) {
    // unicode character ranges:
    // https://jrgraphix.net/r/Unicode/

    const ALPHABETS = [
        [0x30, 0x39], // 0-9
        [0x41, 0x5a], // A-Z
        [0x61, 0x7a], // a-z
        [0xc0, 0x2af], // part of Latin-1 supplement / Latin extended A/B / IPA
        [0x370, 0x52f], // Greek / Cyrillic / Cyrillic supplement
    ];

    const SINGLE_CHARS = [
        [0xe00, 0x0e5b], // Thai
        [0x3040, 0x309f], // Hiragana
        [0x4e00, 0x9fff], // CJK
        [0xac00, 0xd7af], // Hangul syllables
    ];

    function isAlphabet(n) {
        for (let range of ALPHABETS) {
            if (n >= range[0] && n <= range[1]) {
                return true;
            }
        }
        return false;
    }

    function isSingleChar(n) {
        for (let range of SINGLE_CHARS) {
            if (n >= range[0] && n <= range[1]) {
                return true;
            }
        }
        return false;
    }

    const length = str.length;
    const tokens = [];
    let last = '';
    for (let i = 0; i < length; i++) {
        let code = str.charCodeAt(i);
        if (isSingleChar(code)) {
            if (last) {
                if (last.length > 1) {
                    tokens.push(last.toLowerCase());
                }
                last = '';
            }
            tokens.push(str[i]);
        } else if (isAlphabet(code)) {
            last = last + str[i];
        } else {
            if (last) {
                if (last.length > 1) {
                    tokens.push(last.toLowerCase());
                }
                last = '';
            }
        }
    }
    if (last) {
        if (last.length > 1) {
            tokens.push(last.toLowerCase());
        }
        last = '';
    }
    return tokens;
}

// END tokenizer

/*
 docs: [
    { id: 0, title:'doc1', content:'a1 b1 c1' },
    { id: 1, title:'doc2', content:'a2 b2 c2' },
    ...
 ]
 */
export function createIndex(docs) {
    const index = new Index({
        encode: tokenizer
    });
    for (let doc of docs) {
        let text = doc.title + '\n' + doc.content;
        console.debug(`add doc ${doc.id}: ${doc.title}`);
        index.add(doc.id, text);
    }
    return index;
}

export function search(index, q, limit = 20) {
    return index.search(q, 20);
}

export async function exportIndex(index, fpath) {
    fs.writeFileSync(fpath, `// flexsearch:
${tokenizer.toString()}
window.__searcher__ = new Index({
    encode: tokenizer
});
`);
    return index.export((key, data) => {
        console.log(`export index: ${typeof (key)} / ${key}: ${typeof (data)}`)
        if (data !== undefined) {
            fs.appendFileSync(`window.__searcher__.import('${key}', '${data}');\n`);
        }
    });
}
