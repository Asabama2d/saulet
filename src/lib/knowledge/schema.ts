import { z } from 'zod';
import type { RuleExpr } from '@/types/knowledge';

/**
 * Zod-схемы нормативной базы. База не загружается, если не проходит валидацию:
 * молча работать на битых данных для инструмента выпуска ПД недопустимо.
 */

export const normSourceSchema = z.enum(['norm', 'sanpin', 'gost', 'practice', 'assignment']);

export const normRefSchema = z.object({
  doc: z.string().min(1),
  clause: z.string().min(1),
  edition: z.string().optional(),
  quote: z.string().optional(),
  source: normSourceSchema,
  verified: z.boolean(),
});

export const statusSchema = z.enum(['required', 'conditional', 'recommended', 'optional']);

export const flowTypeSchema = z.enum([
  'visitors',
  'children',
  'staff',
  'food',
  'linen',
  'waste',
  'goods',
  'medical',
]);

export const unitKindSchema = z.enum(['group', 'class', 'section', 'floor', 'building', 'place']);

export const ruleExprSchema: z.ZodType<RuleExpr> = z.lazy(() =>
  z.union([
    z.object({ eq: z.tuple([z.string(), z.unknown()]) }),
    z.object({ neq: z.tuple([z.string(), z.unknown()]) }),
    z.object({ gt: z.tuple([z.string(), z.number()]) }),
    z.object({ gte: z.tuple([z.string(), z.number()]) }),
    z.object({ lt: z.tuple([z.string(), z.number()]) }),
    z.object({ in: z.tuple([z.string(), z.array(z.unknown())]) }),
    z.object({ and: z.array(ruleExprSchema) }),
    z.object({ or: z.array(ruleExprSchema) }),
    z.object({ not: ruleExprSchema }),
  ]),
) as z.ZodType<RuleExpr>;

export const countRuleSchema = z
  .object({
    kind: z.enum(['fixed', 'perUnit', 'formula']),
    value: z.number().optional(),
    per: unitKindSchema.optional(),
    divisor: z.number().positive().optional(),
    expr: z.string().optional(),
    round: z.enum(['up', 'down', 'nearest']),
  })
  .refine((r) => r.kind !== 'fixed' || typeof r.value === 'number', {
    message: 'count.kind="fixed" требует value',
  })
  .refine((r) => r.kind !== 'perUnit' || r.per !== undefined, {
    message: 'count.kind="perUnit" требует per',
  })
  .refine((r) => r.kind !== 'formula' || typeof r.expr === 'string', {
    message: 'count.kind="formula" требует expr',
  });

export const areaLookupSchema = z
  .object({
    mode: z.enum(['interpolate', 'match']),
    by: z.string().optional(),
    points: z.array(z.object({ at: z.number(), value: z.number().nonnegative() })).optional(),
    cases: z
      .array(z.object({ when: ruleExprSchema, value: z.number().nonnegative(), label: z.string().optional() }))
      .optional(),
  })
  .refine((l) => l.mode !== 'interpolate' || (typeof l.by === 'string' && (l.points?.length ?? 0) > 0), {
    message: 'lookup.mode="interpolate" требует by и непустой points',
  })
  .refine((l) => l.mode !== 'match' || (l.cases?.length ?? 0) > 0, {
    message: 'lookup.mode="match" требует непустой cases',
  });

export const areaRuleSchema = z
  .object({
    kind: z.enum(['fixed', 'perPlace', 'perUnit', 'range', 'percentOfNet', 'formula', 'lookup']),
    value: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    unit: z.enum(['м²', 'м²/место', 'м²/учащегося', 'м²/группу', 'м²/класс']),
    expr: z.string().optional(),
    lookup: areaLookupSchema.optional(),
    norm: normRefSchema.nullable(),
    sourceHint: z.string().optional(),
  })
  .refine((r) => r.kind !== 'range' || (typeof r.min === 'number' && typeof r.max === 'number'), {
    message: 'area.kind="range" требует min и max',
  })
  .refine((r) => r.kind !== 'formula' || typeof r.expr === 'string', {
    message: 'area.kind="formula" требует expr',
  })
  .refine((r) => r.kind !== 'lookup' || r.lookup !== undefined, {
    message: 'area.kind="lookup" требует lookup',
  })
  .refine((r) => r.norm !== null || typeof r.sourceHint === 'string', {
    message: 'площадь без нормы обязана нести sourceHint — откуда брать число (п. 10.5)',
  })
  .refine((r) => r.norm === null || r.norm.verified || typeof r.sourceHint === 'string', {
    message: 'непроверенная норма обязана нести sourceHint',
  });

export const roomConstraintsSchema = z.object({
  floorsAllowed: z.array(z.number().int()).optional(),
  floorsForbidden: z.array(z.number().int()).optional(),
  daylight: z.enum(['required', 'desirable', 'not-required']),
  orientation: z.enum(['N', 'S', 'E', 'W', 'SE', 'SW', 'any']).optional(),
  minHeight: z.number().positive().optional(),
  notAbove: z.array(z.string()).optional(),
  notBelow: z.array(z.string()).optional(),
  separateEntrance: z.boolean().optional(),
  wetZone: z.boolean().optional(),
  fireHazardClass: z.string().optional(),
});

export const roomSchema = z.object({
  id: z.string().min(1),
  code: z.string(),
  name: z.string().min(1),
  nameKz: z.string().optional(),
  group: z.string().min(1),
  status: statusSchema,
  condition: ruleExprSchema.optional(),
  count: countRuleSchema,
  area: areaRuleSchema,
  constraints: roomConstraintsSchema,
  flows: z.array(flowTypeSchema),
  zone: z.enum(['clean', 'dirty', 'neutral']),
  notes: z.string().optional(),
  norms: z.array(normRefSchema),
});

export const roomGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'цвет группы — HEX вида #rrggbb'),
  order: z.number().int(),
  isCell: z.boolean().optional(),
  cellSource: z.string().optional(),
});

export const adjacencyRuleSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum([
    'direct',
    'near',
    'via-corridor',
    'via-airlock',
    'visual',
    'separated',
    'forbidden',
  ]),
  strength: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  reason: z.string().min(1),
  basis: z.enum(['norm', 'technology', 'ergonomics']),
  norm: normRefSchema.optional(),
  flow: flowTypeSchema.optional(),
});

export const matrixDefSchema = z.object({
  rowLabel: z.string(),
  countLabel: z.string(),
  capacityLabel: z.string(),
  rows: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      hint: z.string().optional(),
      defaultCount: z.number().int().min(0),
      defaultCapacity: z.number().int().min(0),
      capacityNorm: normRefSchema.nullable(),
      tags: z.array(z.string().regex(/^[a-z0-9_]+$/i, 'метка строки — только буквы, цифры и _')).optional(),
    }),
  ),
});

export const parameterDefSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  control: z.enum(['select', 'number', 'toggle', 'multiselect', 'group-matrix']),
  options: z
    .array(z.object({ value: z.string(), label: z.string(), hint: z.string().optional() }))
    .optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  unit: z.string().optional(),
  default: z.unknown(),
  visibleIf: ruleExprSchema.optional(),
  helpNorm: normRefSchema.optional(),
  help: z.string().optional(),
  section: z.string().optional(),
  matrix: matrixDefSchema.optional(),
});

export const buildingTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parameters: z.array(parameterDefSchema),
  groups: z.array(roomGroupSchema),
  rooms: z.array(roomSchema),
  adjacency: z.array(adjacencyRuleSchema),
  normBase: z.array(normRefSchema),
  unitCounts: z.partialRecord(unitKindSchema, z.string()),
  sections: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  validations: z
    .array(
      z.object({
        id: z.string().min(1),
        level: z.enum(['error', 'warning', 'info']),
        when: ruleExprSchema,
        title: z.string().min(1),
        detail: z.string().min(1),
      }),
    )
    .optional(),
  grossAreaLimit: z
    .object({
      by: z.string().min(1),
      points: z.array(z.object({ at: z.number(), value: z.number().positive() })).min(1),
      title: z.string().min(1),
      detail: z.string().min(1),
    })
    .optional(),
});

export const normDocumentSchema = z.object({
  id: z.string().min(1),
  doc: z.string().min(1),
  title: z.string().min(1),
  edition: z.string().optional(),
  status: z.enum(['active', 'superseded', 'unknown']),
  source: normSourceSchema,
  scope: z.array(z.string()),
  notes: z.string().optional(),
});

export const knowledgeBaseSchema = z.object({
  version: z.string(),
  updatedAt: z.string(),
  documents: z.array(normDocumentSchema),
  buildingTypes: z.array(buildingTypeSchema),
});
