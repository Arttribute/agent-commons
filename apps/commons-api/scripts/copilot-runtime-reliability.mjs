import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Run the built CommonJS module without Jest's alias mapper or ts-node. This
// exercises the same lazy service imports used after accepting a proposal.
const { CopilotService } = require('../dist/nest/src/agent/copilot.service.js');
const calls = [];
const skills = {
  create: async (data) => { calls.push(['create', data]); return { skillId: 'owned-skill', ...data }; },
  update: async (id, data) => { calls.push(['update', id, data]); return { skillId: id, ...data }; },
  delete: async (id) => { calls.push(['delete', id]); return { deleted: true }; },
};
const service = Object.create(CopilotService.prototype);
service.moduleRef = { get(token) { assert.equal(token.name, 'SkillService'); return skills; } };
service.getOwnedResourceSummary = async (owner, kind, id) => { assert.equal(owner, 'fixture-owner'); assert.equal(kind, 'skill'); assert.equal(id, 'owned-skill'); return { skillId: id }; };
const created = await service.applyResourcePayload('skill', 'create', null, 'fixture-owner', { name: 'Export reports', slug: 'export-reports', instructions: 'Read, filter and verify the exported data.', isPublic: false });
assert.equal(created.ownerId, 'fixture-owner'); assert.equal(created.ownerType, 'user'); assert.equal(created.isPublic, false);
assert.equal((await service.applyResourcePayload('skill', 'update', 'owned-skill', 'fixture-owner', { instructions: 'Updated replay checks' })).instructions, 'Updated replay checks');
assert.deepEqual(await service.deleteCreatedResource('skill', 'owned-skill', 'fixture-owner'), { deleted: true });
assert.deepEqual(calls.map(([action]) => action), ['create', 'update', 'delete']);
console.log('Built Copilot skill creation, update and deletion resolve services and preserve owner/private fields.');
