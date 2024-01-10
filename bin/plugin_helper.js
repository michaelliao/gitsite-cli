const { createHash } = await import('node:crypto');
import MarkdownIt from "markdown-it";

function unquote(str) {
    if (str.startsWith('"') && str.endsWith('"')) {
        str = str.substring(1, str.length - 1);
    }
    return str;
}

export function escapeHtml(html) {
    return MarkdownIt().utils.escapeHtml(html);
}

const ARG_KEY_VALUE = /^([\w\-]*)\=(.*)$/;
const ARG_KEY_PRESENT = /^([\w\-]*)$/;

/*
  parse args like ['WIDTH=123', 'autoplay', 'Max-Width=640', 'title="Hello, World"'] to:

  {
    width: '123', // if key=value
    autoplay: true, // if key present
    'max-width': '640', // key is 'max-width'
    title: 'Hello, World' // quoted value
  }

  all keys are lowercased, but value are case-sensitive.
*/
export function parseArgs(args) {
    let kv = {};
    for (let arg of args) {
        let results = ARG_KEY_PRESENT.exec(arg);
        if (results) {
            kv[results[1].toLowerCase()] = true;
            continue;
        }
        results = ARG_KEY_VALUE.exec(arg);
        if (results) {
            kv[results[1].toLowerCase()] = unquote(results[2]);
        }
    }
    return kv;
}

// check ignore case:
// checkEnumArg('center', ['left', 'center', 'right']) => 'center'
// checkEnumArg('CENTER', ['left', 'center', 'right']) => 'center'
//
// return first if invalid:
// checkEnumArg('top', ['left', 'center', 'right']) => 'left'
export function checkEnumArg(argValue, allowedValues) {
    for (let allowed of allowedValues) {
        if (typeof (argValue) === 'string' && argValue.toLowerCase() === allowed.toLowerCase()) {
            return allowed;
        }
    }
    return allowedValues[0];
}

export function checkIntArg(argValue, defaultValue = 0, checkFn) {
    let n = parseInt(argValue, 10);
    if (isNaN(n)) {
        return defaultValue;
    }
    if (checkFn && !checkFn(n)) {
        return defaultValue;
    }
    return n;
}

// getByRange('<b>strong</b>', '<b>', '</b>') => 'strong'
export function getByRange(str, start, end) {
    let n1 = str.indexOf(start);
    if (n1 < 0) {
        throw `substring ${start} not found.`;
    }
    let n2 = str.indexOf(end, n1 + start.length);
    if (n2 < 0) {
        throw `substring ${end} not found.`;
    }
    return str.substring(n1 + start.length, n2);
}

// deleteAllByRange('Hello, <b>x</b>World<b>y</b>!', '<b>', '</b>') => 'Hello, World!'
export function deleteAllByRange(str, start, end) {
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

// hexHash('any\ntext') => '0xa1b2c3d';
export function hexHash(str) {
    const hash = createHash('sha1');
    hash.update(str);
    return hash.digest('hex');
}

// uniqueId('any\ntext') => 'ua1b2c3d';
export function uniqueId(str) {
    return 'u' + hexHash(str).substring(0, 7);
}
