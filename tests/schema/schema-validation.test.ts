import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('Schema 验证测试', () => {
  it('应该验证主 Schema 文件存在且有效', async () => {
    const schemaPath = join(process.cwd(), 'schemas', 'uxq.schema.json');
    const content = await readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(content);

    expect(schema).toBeDefined();
    expect(schema.$schema).toBeDefined();
  });

  it('应该验证 evaluation-result schema 结构', async () => {
    const schemaPath = join(process.cwd(), 'schemas', 'result', 'evaluation-result.schema.json');
    const content = await readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(content);

    expect(schema).toBeDefined();
    expect(schema.type).toBe('object');
    expect(schema.properties).toBeDefined();
  });

  it('应该验证 evidence schema 结构', async () => {
    const schemaPath = join(process.cwd(), 'schemas', 'evidence', 'evidence.schema.json');
    const content = await readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(content);

    expect(schema).toBeDefined();
    expect(schema.type).toBe('object');
  });

  it('应该验证 metric-result schema 结构', async () => {
    const schemaPath = join(process.cwd(), 'schemas', 'measurement', 'metric-result.schema.json');
    const content = await readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(content);

    expect(schema).toBeDefined();
    expect(schema.type).toBe('object');
  });

  it('应该验证 finding schema 结构', async () => {
    const schemaPath = join(process.cwd(), 'schemas', 'diagnostic', 'finding.schema.json');
    const content = await readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(content);

    expect(schema).toBeDefined();
    expect(schema.type).toBe('object');
  });
});
