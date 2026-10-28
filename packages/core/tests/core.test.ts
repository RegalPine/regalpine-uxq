import { describe, expect, it } from 'vitest';
import {
  assertTimeOrder,
  canonicalJson,
  cloneJson,
  digest,
  elapsedMs,
  immutableSnapshot,
  newId,
  parseId,
  parseTimestamp,
  sha256,
  systemClock,
  UxqError,
} from '../src/index.js';

// 依据 ARCH-005 第 5 章、架构第 5/6/7 章：基础标识、时间与确定性摘要。
describe('基础标识与时间', () => {
  it('品牌标识通过运行时校验且新 ID 唯一', () => {
    expect(parseId('UXQ-D01:task.success')).toBe('UXQ-D01:task.success');
    const ids = new Set(Array.from({ length: 100 }, () => newId('run')));
    expect(ids.size).toBe(100);
  });
  it.each([
    '',
    '.',
    '..',
    '../run',
    'a/b',
    'a\\b',
    ' a',
    'a\n',
    '__proto__',
    'constructor',
    'prototype',
    'a'.repeat(129),
    null,
  ])('拒绝不安全标识 %j', (value) => {
    expect(() => parseId(value)).toThrow(UxqError);
  });
  it('接受时区与闰日，按实际瞬时校验顺序', () => {
    expect(parseTimestamp('2024-02-29T23:59:59.123+08:00')).toContain('+08:00');
    expect(() =>
      assertTimeOrder('2024-01-01T08:00:00+08:00', '2024-01-01T00:00:00Z'),
    ).not.toThrow();
    expect(() => assertTimeOrder('2024-01-01T00:00:01Z', '2024-01-01T00:00:00Z')).toThrow(
      '结束时间',
    );
    expect(parseTimestamp(systemClock.now())).toBeTruthy();
  });
  it.each([
    '2023-02-29T00:00:00Z',
    '2024-04-31T00:00:00Z',
    '2024-13-01T00:00:00Z',
    '2024-01-01T24:00:00Z',
    '2024-01-01T00:00:60Z',
    '2024-01-01T00:00:00+99:00',
    '2024-01-01T00:00:00',
    '',
  ])('拒绝错误时间 %s', (value) => {
    expect(() => parseTimestamp(value)).toThrow(UxqError);
  });
  it('单调耗时允许零值，不允许倒序和非有限值', () => {
    expect(elapsedMs(0, 0)).toBe(0);
    expect(elapsedMs(10.5, 12)).toBe(1.5);
    expect(() => elapsedMs(2, 1)).toThrow();
    expect(() => elapsedMs(0, Infinity)).toThrow();
  });
});

describe('严格 JSON 与不可变快照', () => {
  it('字段顺序不影响摘要，零值不等于缺失，数组顺序具有语义', () => {
    expect(canonicalJson({ b: 2, a: { d: null, c: 0 } })).toBe('{"a":{"c":0,"d":null},"b":2}');
    expect(digest({ a: 1, b: 2 })).toBe(digest({ b: 2, a: 1 }));
    expect(digest({ value: 0 })).not.toBe(digest({}));
    expect(digest([1, 2])).not.toBe(digest([2, 1]));
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it.each([
    NaN,
    Infinity,
    -Infinity,
    undefined,
    1n,
    Symbol('x'),
    () => 0,
    new Date(),
    new Map(),
    { value: undefined },
  ])('拒绝 JSON 会丢失或改写的值 %#', (value) => {
    expect(() => canonicalJson(value)).toThrow(UxqError);
  });
  it('拒绝稀疏数组、附加属性、隐藏字段和 Symbol 键', () => {
    expect(() => canonicalJson(new Array(2))).toThrow();
    expect(() => canonicalJson(Object.assign([1], { extra: 2 }))).toThrow();
    expect(() => canonicalJson(Object.defineProperty({}, 'hidden', { value: 1 }))).toThrow();
    expect(() => canonicalJson({ [Symbol('key')]: 1 })).toThrow();
  });
  it('拒绝访问器且不执行 getter；拒绝原型污染键', () => {
    let calls = 0;
    expect(() =>
      canonicalJson({
        get value() {
          calls++;
          return 1;
        },
      }),
    ).toThrow();
    expect(calls).toBe(0);
    expect(() => canonicalJson(JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow();
  });
  it('拒绝循环引用和超深数据，但允许同一对象在不同分支被引用', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => canonicalJson(circular)).toThrow();
    const shared = { x: 1 };
    expect(canonicalJson([shared, shared])).toBe('[{"x":1},{"x":1}]');
    let nested: unknown = 0;
    for (let i = 0; i < 102; i++) nested = { value: nested };
    expect(() => canonicalJson(nested)).toThrow();
  });
  it('错误包含字段路径但不包含原始敏感数据', () => {
    try {
      canonicalJson({ 'a/b': { 'c~d': Infinity } });
      expect.fail('必须拒绝非有限值');
    } catch (error) {
      expect(error).toBeInstanceOf(UxqError);
      expect((error as UxqError).issues[0]?.path).toBe('/a~1b/c~0d');
    }
  });
  it('快照深度冻结且不改变调用方', () => {
    const input = { steps: [{ id: 'step-1' }] };
    const snapshot = immutableSnapshot(input);
    expect(Object.isFrozen(snapshot.steps[0])).toBe(true);
    input.steps[0]!.id = 'step-2';
    expect(snapshot.steps[0]?.id).toBe('step-1');
    expect(cloneJson(input)).toEqual(input);
    expect(cloneJson(input)).not.toBe(input);
  });
});
