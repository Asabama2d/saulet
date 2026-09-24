import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeBase, getBuildingType } from '../src/lib/knowledge/loader';
import { defaultParams } from '../src/lib/store/project-file';
import { compute } from '../src/lib/engine/compute';
import { availableFloors } from '../src/lib/engine/floors';
import { buildGraph } from '../src/lib/diagram/build-graph';
import { buildRevitCsv } from '../src/lib/export/revit-csv';
import { buildWorkbook } from '../src/lib/export/workbook';
import { floorName } from '../src/lib/export/floors';
import * as XLSX from 'xlsx';

for (const type of knowledgeBase.buildingTypes) {
  test(`${type.id}: default calculation, graph and exports stay consistent`, () => {
    const result = compute({ type, params: defaultParams(type), overrides: {} });
    assert.ok(result.instances.length > 0);
    assert.ok(!result.issues.some((i) => i.id.startsWith('rule-error:')));
    for (const i of result.instances) {
      assert.ok(Number.isInteger(i.count) && i.count >= 0);
      assert.ok(i.areaTotal === null || (Number.isFinite(i.areaTotal) && i.areaTotal >= 0));
    }
    const sum = result.instances.reduce((n, i) => n + (i.confirmed ? i.areaTotal ?? 0 : 0), 0);
    assert.ok(Math.abs(result.totals.netConfirmed - sum) < 1e-6);
    const graph = buildGraph(result, true, { customEdges: [], edgeOverrides: {}, collapsedGroups: [] });
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const edge of graph.edges) assert.ok(ids.has(edge.source) && ids.has(edge.target));
    const csv = buildRevitCsv(result, {}, {});
    const book = XLSX.read(csv.slice(1), { type: 'string', raw: true });
    const rows = XLSX.utils.sheet_to_json<{ Number: string }>(book.Sheets[book.SheetNames[0]]);
    assert.equal(rows.length, result.instances.reduce((n, i) => n + i.count, 0));
    assert.equal(new Set(rows.map((r) => r.Number)).size, rows.length);
    assert.equal(buildWorkbook(result, {}, {}).SheetNames.length, 3);
  });
}

test('mall underground levels are available to both layout and placement validation', () => {
  assert.deepEqual(availableFloors({ floors: 3, undergroundFloors: 3 }), [-3, -2, -1, 1, 2, 3]);
  assert.deepEqual(availableFloors({ floors: 1, hasBasement: true, hasGroundFloor: true }), [-1, 0, 1]);
  assert.equal(floorName(-2), 'Подземный этаж -2');
  const type = getBuildingType('mall');
  const params = { ...defaultParams(type), undergroundFloors: 2 };
  const baseline = compute({ type, params, overrides: {} });
  const id = baseline.instances[0].room.id;
  const result = compute({ type, params, overrides: {}, floorAssignment: { [id]: -2 } });
  assert.ok(!result.issues.some((i) => i.id.startsWith('floor-missing-')));
  const reduced = compute({ type, params: { ...params, undergroundFloors: 1 }, overrides: {}, floorAssignment: { [id]: -2 } });
  assert.ok(reduced.issues.some((i) => i.id.startsWith('floor-missing-')));
});

test('Revit numbers are globally unique even when a literal code matches a repeated suffix', () => {
  const type = getBuildingType('school');
  const result = compute({ type, params: defaultParams(type), overrides: {} });
  const sample = result.instances[0];
  result.instances = ['A', 'A-1', 'A-2', '', 'ROOM-1'].map((code, index) => ({
    ...sample, variant: null, room: { ...sample.room, code, name: 'Имя, с "кавычками"\rпереносом' },
    count: index === 0 ? 3 : 1,
  }));
  const book = XLSX.read(buildRevitCsv(result, {}, {}).slice(1), { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json<{ Name: string; Number: string }>(book.Sheets[book.SheetNames[0]]);
  assert.equal(rows.length, 7);
  assert.equal(new Set(rows.map((r) => r.Number)).size, 7);
  assert.ok(rows.every((r) => r.Number));
  assert.equal(rows[0].Name, result.instances[0].room.name);
});
