import { z } from 'zod';
import type { BuildingType } from '@/types/knowledge';
import { getBuildingType } from '@/lib/knowledge/loader';
import { normalizeMatrix } from '@/lib/engine/compute';
import { ruleKey } from '@/lib/engine/manual';
import { adjacencyRuleSchema, flowTypeSchema, normRefSchema, statusSchema } from '@/lib/knowledge/schema';

export const MAX_PROJECT_BYTES = 5 * 1024 * 1024;
const key = z.string().min(1).refine((s) => !['__proto__', 'constructor', 'prototype'].includes(s));
const record = <T extends z.ZodType>(value: T) => z.record(key, value);
const area = z.number().nonnegative();
const count = z.number().int().nonnegative();

const projectSchema = z.object({
  app: z.literal('bubble-diagram'),
  version: z.union([z.literal(1), z.literal(2)]),
  knowledgeVersion: z.string().default('не указана'),
  buildingTypeId: z.string().min(1),
  params: record(z.unknown()),
  overrides: record(z.object({
    areaEach: area.optional(), count: count.optional(), note: z.string().optional(),
    norm: normRefSchema.optional(),
  })).default({}),
  customRooms: z.array(z.object({
    id: key, code: z.string(), name: z.string().trim().min(1), group: key,
    status: statusSchema, count: count.min(1), areaEach: area.nullable(),
    flows: z.array(flowTypeSchema), zone: z.enum(['clean', 'dirty', 'neutral']),
    note: z.string().optional(),
  })).default([]),
  customEdges: z.array(adjacencyRuleSchema.omit({ norm: true }).extend({
    id: key, reason: z.string().trim().min(1), basis: z.enum(['technology', 'ergonomics']),
  })).default([]),
  edgeOverrides: record(z.object({
    type: adjacencyRuleSchema.shape.type.optional(),
    strength: adjacencyRuleSchema.shape.strength.optional(),
    deleted: z.boolean().optional(), deviation: z.string().optional(),
  })).default({}),
  floorAssignment: record(z.number().int()).default({}),
  pinned: record(z.object({ x: z.number(), y: z.number() })).default({}),
  collapseRepeats: z.boolean().default(true),
  collapsedGroups: z.array(z.string()).default([]),
  layoutMode: z.enum(['free', 'floors']).default('free'),
  colorMode: z.enum(['group', 'zone']).default('group'),
  flowFilter: z.array(flowTypeSchema).default([]),
});

export type SerializedProject = Omit<z.infer<typeof projectSchema>, 'version'> & { version: 2 };

export function defaultParams(type: BuildingType): Record<string, unknown> {
  return Object.fromEntries(type.parameters.map((param) => [param.id,
    param.control === 'group-matrix' ? normalizeMatrix(param, param.default) : param.default,
  ]));
}

/** Validate first; the caller only replaces the current project after success. */
export function parseProject(input: unknown): SerializedProject {
  const result = projectSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Некорректный проект: ${issue.path.join('.') || 'файл'} — ${issue.message}`);
  }
  const data = result.data;
  const type = getBuildingType(data.buildingTypeId);
  const params = defaultParams(type);
  for (const param of type.parameters) {
    if (!Object.hasOwn(data.params, param.id)) continue;
    const value = data.params[param.id];
    let valid = true;
    switch (param.control) {
      case 'number':
        valid = typeof value === 'number' && Number.isFinite(value)
          && (param.min === undefined || value >= param.min)
          && (param.max === undefined || value <= param.max);
        break;
      case 'toggle': valid = typeof value === 'boolean'; break;
      case 'select': valid = param.options?.some((o) => o.value === value) ?? false; break;
      case 'multiselect':
        valid = Array.isArray(value) && value.every((v) => param.options?.some((o) => o.value === v));
        break;
      case 'group-matrix': {
        // Early projects stored null for matrices whose defaults come from the knowledge base.
        const rows = z.array(z.object({ rowId: key, count, capacity: count })).safeParse(value ?? []);
        valid = rows.success && new Set(rows.data.map((r) => r.rowId)).size === rows.data.length;
        if (valid) params[param.id] = normalizeMatrix(param, rows.data);
        break;
      }
    }
    if (!valid) throw new Error(`Некорректное значение параметра «${param.label}»`);
    if (param.control !== 'group-matrix') params[param.id] = value;
  }

  const groupIds = new Set(type.groups.map((g) => g.id));
  const roomIds = new Set(type.rooms.map((r) => r.id));
  for (const room of data.customRooms) {
    if (roomIds.has(room.id)) throw new Error(`Повторяется id помещения: ${room.id}`);
    if (!groupIds.has(room.group)) throw new Error(`Неизвестная группа помещения: ${room.group}`);
    roomIds.add(room.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of data.customEdges) {
    if (edgeIds.has(edge.id)) throw new Error(`Повторяется id связи: ${edge.id}`);
    if (edge.from === edge.to || !roomIds.has(edge.from) || !roomIds.has(edge.to)) {
      throw new Error(`Некорректные помещения связи: ${edge.id}`);
    }
    edgeIds.add(edge.id);
  }
  for (const rule of type.adjacency) {
    const override = data.edgeOverrides[ruleKey(rule)];
    if (rule.basis !== 'norm' || !override) continue;
    if (override.deleted) throw new Error('Нормативную связь нельзя удалить');
    if (override.type && override.type !== rule.type && !override.deviation?.trim()) {
      throw new Error('Для изменения нормативной связи нужно обоснование отступления');
    }
  }
  return { ...data, version: 2, params };
}

export function parseProjectText(text: string): SerializedProject {
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES) {
    throw new Error('Файл проекта больше 5 МБ');
  }
  try {
    return parseProject(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Файл содержит повреждённый JSON');
    throw error;
  }
}
