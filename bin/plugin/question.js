/*
Render a code block as question form.

Source:

``` question radio
Who created Java?
---
    James Bond
[x] James Gosling
    James Simons
```

Rendered as:

<div class="question">
  <form ...>
  </form>
</div>
*/

function parseYesNo(s, index) {
    // '    Mr Bob' => { text: 'Mr Bob', value: 1, correct: false }
    // '[x] Mr Bob' => { text: 'Mr Bob', value: 2, correct: true }
    let correct = false;
    s = s.trim();
    if (s.startsWith('[x]') || s.startsWith('[X]')) {
        s = s.substring(3).trim();
        correct = true;
    }
    return {
        text: s,
        value: 1 << index,
        correct: correct
    };
}

function parseLines(s) {
    return s.split('\n').map(t => t.trim()).filter(t => t);
}

function parseDate(s) {
    let t = `${s}T00:00:00.000Z`;
    try {
        if (t === new Date(t).toISOString()) {
            return s;
        }
    } catch (e) {
    }
    return null;
}

function encodeString(s) {
    return s.replace('\'', '\\\'');
}

function parseError(msg, str) {
    console.error(`Error when parse question: ${msg}
Markdown source:
${str}`);
    return null;
}

function generateRadioOrCheckbox(yn) {
    return `<div><label class="question"><input type="${yn.type}" name="question" value="${yn.value}" class="question"> ${yn.text}</label></div>`
}

const span_correct = '<span class="question correct" style="display:none"><span>Correct</span></span>';
const span_wrong = '<span class="question wrong" style="display:none"><span>Wrong</span></span>';
const button_submit = '<button type="submit" class="question"><span>Submit</span></button>';

const js_input_sum = "Array.from(this.getElementsByTagName('input')).filter(i=>i.checked).reduce((acc,i)=>acc+parseInt(i.value),0)";
const js_input_value = "this.getElementsByTagName('input')[0].value.trim()";
const js_show_ok = "this.getElementsByClassName('question correct')[0].style.display=ok?null:'none'; this.getElementsByClassName('question wrong')[0].style.display=ok?'none':null;";

export default function (md, type, args, str) {
    if (type !== 'question') {
        return null;
    }
    console.debug(`type=${type}, args=${JSON.stringify(args)}`);
    let arg = args[0] || '';
    let arr = str.split(/\-{3,}/g);
    if (arr.length !== 2) {
        return parseError(`invalid markdown`, str);
    }
    let [q, a] = arr;
    q = q.trim()
    if (!q) {
        return parseError(`question not found`, str);
    }
    if (arg === 'radio' || arg === 'checkbox') {
        let ss = parseLines(a);
        if (ss.length <= 1) {
            return parseError(`answer must be at least 2`, str);
        }
        let yns = ss.map(parseYesNo).map(yn => {
            yn.type = arg;
            yn.text = md.renderInline(yn.text);
            return yn;
        });
        if (arg === 'radio' && yns.filter(yn => yn.correct).length !== 1) {
            return parseError(`correct answer must be 1`, str);
        }
        if (arg === 'checkbox' && yns.filter(yn => yn.correct).length === 0) {
            return parseError(`correct answer must be at least 1`, str);
        }
        let correct = yns.filter(yn => yn.correct).reduce((acc, yn) => acc + yn.value, 0);
        let inputs = yns.map(generateRadioOrCheckbox).join('\n');

        return `<div class="question">
<p>${md.renderInline(q)}</p>
<form class="question" onsubmit="let ok=${correct}===${js_input_sum}; ${js_show_ok} return false;">
${inputs}
<div class="question">${button_submit} ${span_correct} ${span_wrong}</div>
</form>
</div>
`;
    }
    if (arg === 'text' || arg === 'date') {
        a = a.trim();
        if (parseLines(a).length !== 1) {
            return parseError(`answer must be a single line`, str);
        }
        if (arg === 'date' && parseDate(a) === null) {
            return parseError(`date answer must be YYYY-MM-DD format`, str);
        }
        let ignorecase = arg === 'text' && args[1] === 'ignorecase';
        console.debug(`${ignorecase}: type=${type}, args=${JSON.stringify(args)}`);
        let ok_exp = `let ok='${encodeString(a)}'===${js_input_value}`;
        if (ignorecase) {
            ok_exp = `let ok='${encodeString(a.toLowerCase())}'===${js_input_value}.toLowerCase()`;
        }
        return `<div class="question">
<p>${md.renderInline(q)}</p>
<form class="question" onsubmit="${ok_exp}; ${js_show_ok} return false;">
<div><label class="question"><input type="${arg}" name="question" value="" class="question"></label></div>
<div class="question">${button_submit} ${span_correct} ${span_wrong}</div>
</form>
</div>
`;
    }
    return parseError(`invalid ${arg}`, str);
};
