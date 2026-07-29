import type { RuleExpr } from '@/types/knowledge';

/**
 * Вычисление выражений базы знаний.
 *
 * Два независимых механизма:
 *  • `evaluateArithmetic` — арифметика в полях `CountRule.expr` / `AreaRule.expr`.
 *    Рекурсивный спуск, без `eval` и без доступа к чему-либо кроме переданной
 *    области видимости.
 *  • `evaluateRule` — предикат `RuleExpr` для `condition` и `visibleIf`.
 */

export type Scope = Record<string, unknown>;

export class ExpressionError extends Error {
  constructor(message: string, readonly expression: string) {
    super(`${message} — в выражении «${expression}»`);
    this.name = 'ExpressionError';
  }
}

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  ceil: ([a]) => Math.ceil(a),
  floor: ([a]) => Math.floor(a),
  round: ([a]) => Math.round(a),
  abs: ([a]) => Math.abs(a),
  sqrt: ([a]) => Math.sqrt(a),
};

type Token =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j += 1;
      const raw = input.slice(i, j);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new ExpressionError(`Не число: ${raw}`, input);
      tokens.push({ t: 'num', v: value });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j += 1;
      tokens.push({ t: 'id', v: input.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/(),'.includes(ch)) {
      tokens.push({ t: 'op', v: ch });
      i += 1;
      continue;
    }
    throw new ExpressionError(`Недопустимый символ «${ch}»`, input);
  }
  return tokens;
}

/** Приводит значение области видимости к числу. Булево — 1/0. */
function toNumber(name: string, value: unknown, source: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  throw new ExpressionError(`Переменная «${name}» не числовая`, source);
}

export function evaluateArithmetic(expression: string, scope: Scope): number {
  const tokens = tokenize(expression);
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = (op: string) => {
    const token = tokens[pos];
    if (!token || token.t !== 'op' || token.v !== op) {
      throw new ExpressionError(`Ожидался «${op}»`, expression);
    }
    pos += 1;
  };

  function parseExpression(): number {
    let value = parseTerm();
    for (;;) {
      const token = peek();
      if (token?.t === 'op' && (token.v === '+' || token.v === '-')) {
        pos += 1;
        const right = parseTerm();
        value = token.v === '+' ? value + right : value - right;
      } else break;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    for (;;) {
      const token = peek();
      if (token?.t === 'op' && (token.v === '*' || token.v === '/')) {
        pos += 1;
        const right = parseFactor();
        if (token.v === '/' && right === 0) throw new ExpressionError('Деление на ноль', expression);
        value = token.v === '*' ? value * right : value / right;
      } else break;
    }
    return value;
  }

  function parseFactor(): number {
    const token = peek();
    if (token?.t === 'op' && token.v === '-') {
      pos += 1;
      return -parseFactor();
    }
    if (token?.t === 'op' && token.v === '+') {
      pos += 1;
      return parseFactor();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const token = peek();
    if (!token) throw new ExpressionError('Выражение оборвано', expression);
    if (token.t === 'num') {
      pos += 1;
      return token.v;
    }
    if (token.t === 'id') {
      pos += 1;
      const next = peek();
      if (next?.t === 'op' && next.v === '(') {
        const fn = FUNCTIONS[token.v];
        if (!fn) throw new ExpressionError(`Неизвестная функция «${token.v}»`, expression);
        eat('(');
        const args: number[] = [];
        if (!(peek()?.t === 'op' && peek()?.v === ')')) {
          args.push(parseExpression());
          while (peek()?.t === 'op' && peek()?.v === ',') {
            pos += 1;
            args.push(parseExpression());
          }
        }
        eat(')');
        if (args.length === 0) throw new ExpressionError(`Функция «${token.v}» без аргументов`, expression);
        return fn(args);
      }
      if (!(token.v in scope)) {
        throw new ExpressionError(`Неизвестная переменная «${token.v}»`, expression);
      }
      return toNumber(token.v, scope[token.v], expression);
    }
    if (token.v === '(') {
      eat('(');
      const value = parseExpression();
      eat(')');
      return value;
    }
    throw new ExpressionError(`Неожиданный символ «${token.v}»`, expression);
  }

  const result = parseExpression();
  if (pos !== tokens.length) throw new ExpressionError('Лишние символы в конце', expression);
  if (!Number.isFinite(result)) throw new ExpressionError('Результат не является числом', expression);
  return result;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return null;
}

/**
 * Предикат по значениям параметров.
 *
 * Оператор `in` расширен по сравнению с ТЗ: если значение параметра —
 * массив (контрол `multiselect`), проверяется непустое пересечение со списком.
 * Иначе — обычное вхождение значения в список. Отдельный оператор `contains`
 * не вводится, чтобы не размножать сущности.
 */
export function evaluateRule(rule: RuleExpr | undefined, scope: Scope): boolean {
  if (!rule) return true;

  if ('and' in rule) return rule.and.every((r) => evaluateRule(r, scope));
  if ('or' in rule) return rule.or.some((r) => evaluateRule(r, scope));
  if ('not' in rule) return !evaluateRule(rule.not, scope);

  if ('eq' in rule) {
    const [key, expected] = rule.eq;
    return Object.is(scope[key], expected) || scope[key] === expected;
  }
  if ('neq' in rule) {
    const [key, expected] = rule.neq;
    return scope[key] !== expected;
  }
  if ('in' in rule) {
    const [key, list] = rule.in;
    const value = scope[key];
    if (Array.isArray(value)) return value.some((v) => list.includes(v));
    return list.includes(value);
  }

  const [key, threshold] = 'gt' in rule ? rule.gt : 'gte' in rule ? rule.gte : rule.lt;
  const value = asNumber(scope[key]);
  if (value === null) return false;
  if ('gt' in rule) return value > threshold;
  if ('gte' in rule) return value >= threshold;
  return value < threshold;
}
