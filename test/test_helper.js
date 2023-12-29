import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { loadYaml } from '../bin/helper.js';

test(`load yaml`, async (t) => {
    process.env.sourceDir = path.resolve('.');
    let obj = await loadYaml('test/resources/sample.yml');
    assert.equal(obj.site.name, 'GitSite');
    assert.equal(obj.site.version, 1);
    assert.equal(obj.site.author['full-name'], 'Crypto Michael');
    assert.equal(obj.site.author.fullName, 'Crypto Michael');
    assert.equal(obj.site['last-updated-at'].date, '2023-11-07');
    assert.equal(obj.site.lastUpdatedAt.date, '2023-11-07');
});
