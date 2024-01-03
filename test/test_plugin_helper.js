import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { checkEnumArg, checkIntArg, deleteAllByRange, getByRange, parseArgs, uniqueId } from '../bin/plugin_helper.js';

test('deleteAllByRange', () => {
    assert.equal('Hello, world', deleteAllByRange('Hello, world**', '*', '*'));
    assert.equal('Hello, world', deleteAllByRange('*!*Hello, world*!*', '*', '*'));
    assert.equal('Hello, world', deleteAllByRange('Hello, world<b></b>', '<b>', '</b>'));
    assert.equal('Hello, world', deleteAllByRange('<b>ignore</b>Hello, world<b>!</b>', '<b>', '</b>'));
    assert.equal('Hello, world!</b>', deleteAllByRange('<b>ignore</b>Hello, world!</b>', '<b>', '</b>'));
    assert.throws(() => deleteAllByRange('<b>ignore</b>Hello, world<b>!', '<b>', '</b>'));
});

test('getByRange', () => {
    assert.equal('world', getByRange('Hello, *world*!', '*', '*'));
    assert.equal('world', getByRange('Hello, *world* *bye*!', '*', '*'));
    assert.equal('world', getByRange('Hello, <b>world</b>', '<b>', '</b>'));
    assert.equal('world', getByRange('Hello, <b>world</b> <b>byte</b>', '<b>', '</b>'));
    assert.throws(() => getByRange('Hello, <b>world!', '<b>', '</b>'));
});

test('parseArgs', () => {
    let args = ['width=123', 'autoplay', 'Max-Width=640', 'invalid:value', 'empty=', 'title="Hello World"'];
    let kv = parseArgs(args);
    assert.equal('123', kv['width']);
    assert.equal(true, kv['autoplay']);
    assert.equal('640', kv['max-width']);
    assert.equal(undefined, kv['invalid']);
    assert.equal('', kv['empty']);
    assert.equal('Hello World', kv['title']);
});

test('checkEnumArg', () => {
    const enums = ['left', 'center', 'right'];
    assert.equal('left', checkEnumArg('left', enums));
    assert.equal('center', checkEnumArg('center', enums));
    assert.equal('right', checkEnumArg('RIGHT', enums));
    assert.equal('left', checkEnumArg('top', enums));
    assert.equal('left', checkEnumArg('', enums));
    assert.equal('left', checkEnumArg(true, enums));
    assert.equal('left', checkEnumArg(undefined, enums));
});

test('checkIntArg', () => {
    assert.equal(100, checkIntArg('100'));
    assert.equal(100, checkIntArg('100.0', 0));
    assert.equal(0, checkIntArg('x100.0', 0));
    // with check function:
    const fn = x => x >= 10 && x <= 100;
    assert.equal(20, checkIntArg('20', 0, fn));
    assert.equal(0, checkIntArg('-20', 0, fn));
    assert.equal(0, checkIntArg('200', 0, fn));
});

test('uniqueId', () => {
    assert.equal('uaaf4c61', uniqueId('hello'));
    assert.equal('u7db827c', uniqueId('hello\nworld'));
});
