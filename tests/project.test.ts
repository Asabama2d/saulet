import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeBase, getBuildingType } from '../src/lib/knowledge/loader';
import { defaultParams, parseProject, parseProjectText } from '../src/lib/store/project-file';
import { createProjectStorage } from '../src/lib/store/project-storage';
import { useProjectStore } from '../src/lib/store/project-store';
import { ruleKey } from '../src/lib/engine/manual';

function project(buildingTypeId = 'kindergarten') {
  return { app: 'bubble-diagram', version: 2, knowledgeVersion: knowledgeBase.version,
    buildingTypeId, params: defaultParams(getBuildingType(buildingTypeId)) };
}

for (const type of knowledgeBase.buildingTypes) {
  test(`${type.id}: project and diagram preferences survive a JSON round trip`, () => {
    const data = parseProject({ ...project(type.id), layoutMode: 'floors', colorMode: 'zone',
      flowFilter: ['staff'], pinned: { example: { x: -120.5, y: 62 } },
      floorAssignment: { [type.rooms[0].id]: 1 }, collapsedGroups: [type.groups[0].id] });
    assert.deepEqual(parseProjectText(JSON.stringify(data)), data);
  });
}

test('legacy files receive current parameter and view defaults', () => {
  const data = parseProject({ ...project(), version: 1, params: { floors: 1 } });
  assert.equal(data.version, 2);
  assert.equal(data.params.floors, 1);
  assert.ok(Array.isArray(data.params.groupMatrix));
  assert.equal(data.layoutMode, 'free');
  assert.deepEqual(data.customRooms, []);
});

test('rejects malformed data rather than coercing it into a calculation', () => {
  const bad = [null, [], {}, { ...project(), version: 99 },
    { ...project(), buildingTypeId: 'missing' },
    { ...project(), params: { floors: '3' } },
    { ...project(), params: { floors: 1000000 } },
    { ...project(), params: { hasBasement: 'false' } },
    { ...project(), params: { kind: 'missing' } },
    { ...project(), params: { extras: ['missing'] } },
    { ...project(), params: { groupMatrix: [{ rowId: 'x', count: -1, capacity: 20 }] } },
    { ...project(), overrides: { 'room@-': { areaEach: -3 } } },
    { ...project(), overrides: { 'room@-': { count: 2.5 } } },
    { ...project(), pinned: { room: { x: Infinity, y: 0 } } },
    { ...project(), floorAssignment: { room: 1.5 } },
    { ...project(), flowFilter: ['missing'] },
  ];
  for (const input of bad) assert.throws(() => parseProject(input));
  assert.throws(() => parseProjectText('{'), /повреждённый JSON/);
  assert.throws(() => parseProjectText(' '.repeat(5 * 1024 * 1024 + 1)), /5 МБ/);
});

test('checks manual room identity and edge references', () => {
  const type = getBuildingType('kindergarten');
  const room = { id: 'custom.1', code: 'A', name: 'Серверная', group: type.groups[0].id,
    status: 'optional', count: 1, areaEach: 10, flows: ['staff'], zone: 'neutral' };
  assert.throws(() => parseProject({ ...project(), customRooms: [room, room] }), /Повторяется/);
  assert.throws(() => parseProject({ ...project(), customRooms: [{ ...room, group: 'missing' }] }), /группа/);
  assert.throws(() => parseProject({ ...project(), customEdges: [{ id: 'e', from: room.id,
    to: 'missing', type: 'near', strength: 2, reason: 'Test', basis: 'ergonomics' }] }), /помещения связи/);
});

test('normative edge protection also applies to imported files', () => {
  const rule = getBuildingType('kindergarten').adjacency.find((r) => r.basis === 'norm')!;
  const key = ruleKey(rule);
  assert.throws(() => parseProject({ ...project(), edgeOverrides: { [key]: { deleted: true } } }), /нельзя удалить/);
  const type = rule.type === 'near' ? 'direct' : 'near';
  assert.throws(() => parseProject({ ...project(), edgeOverrides: { [key]: { type } } }), /обоснование/);
  assert.doesNotThrow(() => parseProject({ ...project(), edgeOverrides: { [key]: { type, deviation: 'По заданию' } } }));
});

test('a rejected file leaves the current store intact; export includes view settings', () => {
  const store = useProjectStore.getState();
  store.loadProject({ ...project('mall'), layoutMode: 'floors', colorMode: 'zone', flowFilter: ['goods'] });
  const before = useProjectStore.getState().exportProject();
  assert.throws(() => store.loadProject({ ...project(), params: { floors: 'broken' } }));
  assert.deepEqual(useProjectStore.getState().exportProject(), before);
  assert.equal(before.layoutMode, 'floors');
  assert.equal(before.colorMode, 'zone');
  assert.deepEqual(before.flowFilter, ['goods']);
});

test('unreadable autosave remains intact until explicit resume', async () => {
  for (const raw of ['{broken', JSON.stringify({ version: 2, state: { buildingTypeId: 'missing' } }),
    JSON.stringify({ version: 99, state: project() })]) {
    let saved = raw;
    let recovery: string | null = null;
    const guard = createProjectStorage(() => ({ getItem: () => saved,
      setItem: (_key, value) => { saved = value; }, removeItem: () => {} }),
    (problem) => { if (problem) recovery = problem.recovery; });
    assert.equal(await guard.storage.getItem('test'), null);
    await guard.storage.setItem('test', 'replacement');
    assert.equal(saved, raw);
    assert.equal(recovery, raw);
    guard.resume();
    await guard.storage.setItem('test', 'replacement');
    assert.equal(saved, 'replacement');
  }
});

test('valid autosave is normalized and storage failures are reported without throwing', async () => {
  let problem = '';
  const guard = createProjectStorage(() => ({
    getItem: () => JSON.stringify({ version: 2, state: project() }),
    setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {},
  }), (p) => { problem = p?.message ?? ''; });
  const restored = JSON.parse((await guard.storage.getItem('test'))!);
  assert.equal(restored.state.layoutMode, 'free');
  await guard.storage.setItem('test', 'data');
  assert.match(problem, /Не удалось сохранить/);
  const blocked = createProjectStorage(() => { throw new Error('SecurityError'); }, (p) => { problem = p?.message ?? ''; });
  assert.equal(await blocked.storage.getItem('test'), null);
  assert.match(problem, /недоступно/);
});
