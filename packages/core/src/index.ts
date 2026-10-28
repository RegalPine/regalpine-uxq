import { createHash, randomUUID } from 'node:crypto';

export type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type Id<Name extends string = string> = Brand<string, Name>;
export type Timestamp = Brand<string, 'Timestamp'>;
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type ErrorCategory =
  'INPUT' | 'ENVIRONMENT' | 'EXECUTION' | 'CONTRACT' | 'ARTIFACT' | 'CANCELLED' | 'QUALITY';

export class UxqError extends Error {
  override readonly name = 'UxqError';

  constructor(
    readonly code: string,
    message: string,
    readonly category: ErrorCategory = 'CONTRACT',
    readonly issues: readonly ValidationIssue[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function invariant(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new UxqError(code, message);
}

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
export const ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';

export function parseId<Name extends string = string>(value: unknown): Id<Name> {
  invariant(
    typeof value === 'string' && new RegExp(ID_PATTERN).test(value) && !forbiddenKeys.has(value),
    'INVALID_ID',
    '标识符必须为 1–128 位受控 ASCII 字符，且不能包含路径或原型危险名称',
  );
  return value as Id<Name>;
}

export function newId<Name extends string = string>(prefix: string): Id<Name> {
  parseId(prefix);
  return parseId<Name>(`${prefix}-${randomUUID()}`);
}

export function parseTimestamp(value: unknown): Timestamp {
  invariant(typeof value === 'string', 'INVALID_TIMESTAMP', '时间必须为带时区的字符串');
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  invariant(match, 'INVALID_TIMESTAMP', '时间必须为带时区的 ISO 8601 格式');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  invariant(
    month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= (days[month - 1] ?? 0) &&
      Number(match[4]) <= 23 &&
      Number(match[5]) <= 59 &&
      Number(match[6]) <= 59,
    'INVALID_TIMESTAMP',
    '时间包含无效的日历日期或时刻',
  );
  const zone = match[7]!;
  invariant(
    zone === 'Z' || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4)) <= 59),
    'INVALID_TIMESTAMP',
    '时间包含无效的时区偏移',
  );
  invariant(Number.isFinite(Date.parse(value)), 'INVALID_TIMESTAMP', '时间无法解析');
  return value as Timestamp;
}

export function assertTimeOrder(start: string, end: string): void {
  parseTimestamp(start);
  parseTimestamp(end);
  invariant(Date.parse(end) >= Date.parse(start), 'TIME_ORDER', '结束时间不能早于开始时间');
}

export interface Clock {
  now(): Timestamp;
  monotonic(): number;
}

export const systemClock: Clock = Object.freeze({
  now: () => parseTimestamp(new Date().toISOString()),
  monotonic: () => performance.now(),
});

export function elapsedMs(start: number, end: number): number {
  invariant(
    Number.isFinite(start) && Number.isFinite(end) && end >= start,
    'INVALID_DURATION',
    '持续时间必须来自有序的有限单调时钟值',
  );
  return end - start;
}

/** 严格的规范化 JSON：不调用 getter/toJSON，不静默丢弃缺失值或非有限数。 */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  const visit = (input: unknown, path: string, depth: number): string => {
    const reject = (reason: string): never => {
      throw new UxqError('NON_JSON_VALUE', '数据不能安全序列化为 JSON', 'CONTRACT', [
        { path, code: 'NON_JSON_VALUE', message: reason },
      ]);
    };
    if (depth > 100) return reject('嵌套深度超过 100');
    if (input === null) return 'null';
    if (typeof input === 'string' || typeof input === 'boolean') return JSON.stringify(input);
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) return reject('不允许 NaN 或 Infinity');
      return JSON.stringify(input);
    }
    if (typeof input !== 'object') return reject('不允许 undefined、函数、Symbol 或 BigInt');
    if (ancestors.has(input)) return reject('不允许循环引用');
    const prototype = Object.getPrototypeOf(input);
    if (!Array.isArray(input) && prototype !== Object.prototype && prototype !== null) {
      return reject('只允许普通对象，不能使用 Date、Map 或自定义实例');
    }
    if (Object.getOwnPropertySymbols(input).length > 0) return reject('不允许 Symbol 键');
    ancestors.add(input);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(input);
      const read = (key: string): unknown => {
        const descriptor = descriptors[key];
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
          return reject('不允许访问器、隐藏属性或稀疏数组');
        }
        return descriptor.value as unknown;
      };
      if (Array.isArray(input)) {
        if (Object.getOwnPropertyNames(input).length !== input.length + 1) {
          return reject('数组必须连续且不能含附加属性');
        }
        const parts: string[] = [];
        for (let i = 0; i < input.length; i++)
          parts.push(visit(read(String(i)), `${path}/${i}`, depth + 1));
        return `[${parts.join(',')}]`;
      }
      const parts: string[] = [];
      for (const key of Object.keys(descriptors).sort()) {
        if (forbiddenKeys.has(key)) return reject('不允许原型危险键');
        const escaped = key.replaceAll('~', '~0').replaceAll('/', '~1');
        parts.push(`${JSON.stringify(key)}:${visit(read(key), `${path}/${escaped}`, depth + 1)}`);
      }
      return `{${parts.join(',')}}`;
    } finally {
      ancestors.delete(input);
    }
  };
  return visit(value, '', 0);
}

export function digest(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function sha256(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** 创建独立快照，不冻结调用方对象；先验证 JSON，避免循环递归与访问器副作用。 */
export function immutableSnapshot<T>(value: T): DeepReadonly<T> {
  const copy = cloneJson(value);
  const freeze = (entry: unknown): void => {
    if (entry !== null && typeof entry === 'object') {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
  };
  freeze(copy);
  return copy as DeepReadonly<T>;
}
