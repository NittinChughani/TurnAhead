import {test} from 'node:test';import assert from 'node:assert/strict';import {commercialEnabled} from '../public/commercial-config.js';
test('production interface rollout leaves commercial backend disabled',()=>assert.equal(commercialEnabled,false));
