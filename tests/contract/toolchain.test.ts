import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { compile } from 'json-schema-to-typescript';
import ts from 'typescript';

// M1.1：真实验证 2020-12 运行时、引用、生成类型和判别联合，不靠工具名推断兼容性。
describe('Schema-first 工具链兼容性', () => {
  it('Ajv 2020 校验与生成 DTO 在状态分支、引用上保持一致', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://uxq.dev/schemas/probe/1.0.0',
      title: 'ProbeResult',
      $defs: { finiteValue: { type: 'number' } },
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: { status: { enum: ['MEASURED'] }, value: { $ref: '#/$defs/finiteValue' } },
          required: ['status', 'value'],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: { status: { enum: ['NOT_EVALUATED'] }, reason: { type: 'string' } },
          required: ['status', 'reason'],
        },
      ],
    } satisfies Parameters<typeof compile>[0];
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
    expect(validate({ status: 'MEASURED', value: 0 })).toBe(true);
    for (const invalid of [
      { status: 'MEASURED' },
      { status: 'MEASURED', value: Infinity },
      { status: 'NOT_EVALUATED', reason: '缺失', value: 0 },
      { status: 'UNKNOWN' },
      { status: 'MEASURED', value: 1, extra: true },
    ])
      expect(validate(invalid)).toBe(false);

    const generated = await compile(schema, 'ProbeResult', {
      bannerComment: '',
      additionalProperties: false,
    });
    const typeAssertions = `
      const measured: ProbeResult = {status: 'MEASURED', value: 0};
      const missing: ProbeResult = {status: 'NOT_EVALUATED', reason: '缺失'};
      // @ts-expect-error 非测量分支不能携带数值
      const invalidMissing: ProbeResult = {status: 'NOT_EVALUATED', reason: '缺失', value: 0};
      // @ts-expect-error 测量分支必须携带数值
      const invalidMeasured: ProbeResult = {status: 'MEASURED'};
      // @ts-expect-error 未知状态不得通过
      const invalidStatus: ProbeResult = {status: 'UNKNOWN'};
      function read(result: ProbeResult): number | string {
        return result.status === 'MEASURED' ? result.value : result.reason;
      }
      void [measured, missing, read];
    `;
    const filename = `${process.cwd()}/__schema_probe__.ts`;
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2023,
      types: [],
    };
    const host = ts.createCompilerHost(options);
    const originalGetSource = host.getSourceFile.bind(host);
    host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
      name === filename
        ? ts.createSourceFile(name, `${generated}\n${typeAssertions}`, languageVersion, true)
        : originalGetSource(name, languageVersion, onError, shouldCreateNewSourceFile);
    const program = ts.createProgram([filename], options, host);
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    expect(diagnostics).toEqual([]);
  });

  it('2020-12 的 unevaluatedProperties 在运行时实际生效', () => {
    const validate = new Ajv2020({ strict: true }).compile({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      allOf: [{ properties: { id: { type: 'string' } }, required: ['id'] }],
      unevaluatedProperties: false,
    });
    expect(validate({ id: 'x' })).toBe(true);
    expect(validate({ id: 'x', unwanted: true })).toBe(false);
  });
});
