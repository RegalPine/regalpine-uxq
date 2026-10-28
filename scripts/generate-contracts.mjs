import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(await readFile(path.join(root, 'schemas/uxq.schema.json'), 'utf8'));
const names = Object.keys(source.$defs);
const typedSchema = {
  ...structuredClone(source),
  title: 'ContractMap',
  type: 'object',
  properties: Object.fromEntries(names.map((name) => [name, { $ref: `#/$defs/${name}` }])),
  required: names,
  additionalProperties: false,
};
// 生成器 15.x 会忽略 allOf 同级 properties；仅对生成输入做等价交集展开，运行时仍使用原始 2020-12 Schema。
function normalizeForTypes(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach(normalizeForTypes);
    return;
  }
  if (node.$ref) delete node.default;
  if (node.allOf && (node.properties || node.oneOf || node.anyOf)) {
    const sibling = {};
    for (const key of [
      'type',
      'properties',
      'required',
      'oneOf',
      'anyOf',
      'additionalProperties',
    ]) {
      if (key in node) {
        sibling[key] = node[key];
        delete node[key];
      }
    }
    node.allOf.push(sibling);
  }
  Object.values(node).forEach(normalizeForTypes);
}
normalizeForTypes(typedSchema);
for (const [name, definition] of Object.entries(typedSchema.$defs)) definition.title = name;
const banner = '/** 由 schemas/uxq.schema.json 自动生成，请勿手工修改。 */';
const generated = await compile(typedSchema, 'ContractMap', {
  bannerComment: banner,
  additionalProperties: false,
  maxItems: 0,
  style: { singleQuote: true, printWidth: 100 },
});
const bundle = `${banner}\nexport const schemaData = ${JSON.stringify(source)};\n`;
const output = path.join(root, 'packages/contracts/src');
await mkdir(output, { recursive: true });
for (const [name, content] of [
  ['generated.ts', generated],
  ['schema-bundle.generated.ts', bundle],
]) {
  const target = path.join(output, name);
  if (process.argv.includes('--check')) {
    const existing = await readFile(target, 'utf8').catch(() => '');
    if (existing !== content) throw new Error(`${name} 与权威 Schema 不一致，请运行 pnpm generate`);
  } else {
    await writeFile(target, content);
  }
}
console.log(`已${process.argv.includes('--check') ? '验证' : '生成'} ${names.length} 个公共契约`);
