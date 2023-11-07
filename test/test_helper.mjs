import test from 'node:test';
import assert from 'node:assert/strict';

import { loadLayout, loadTextFile, loadBinaryFile, loadYaml, executeTemplate } from '../bin/helper.mjs';

test(`test executeTemplate`, (t) => {
    let obj = {
        site: {
            name: 'GitSite',
            description: 'A website tool',
            author: {
                'full-name': 'Crypto Michael',
                email: '***@example.com'
            }
        },
        version: 1
    };
    let templ = 'Welcome to ${site.name} v${version} by ${site.author.fullName} at ${site.release.date}';
    let actual = executeTemplate(templ, obj);
    assert.equal(actual, 'Welcome to GitSite v1 by Crypto Michael at undefined');
});

test(`load yaml`, async (t) => {
    let obj = await loadYaml('.', 'test/resources/sample.yml');
    assert.equal(obj.site.name, 'GitSite');
    assert.equal(obj.site.version, 1);
    assert.equal(obj.site.author['full-name'], 'Crypto Michael');
});
