import { describe, expect, it } from 'vitest';
import type { Clock, Timestamp } from '@uxq/core';
import type { ExecutionProfile, BrowserAction } from '@uxq/contracts';
import { defaultProfile } from '@uxq/contracts';
import { ReferenceBrowserAdapter, executeActions, checkConditions } from '@uxq/browser';
import type { ReferencePage } from '@uxq/browser';

const fixedTime = '2025-01-01T00:00:00Z' as Timestamp;
const clock: Clock = { now: () => fixedTime, monotonic: () => 0 };

function makeProfile(overrides?: Partial<ExecutionProfile>): ExecutionProfile {
  return { ...defaultProfile(), ...overrides };
}

describe('ReferenceBrowserAdapter', () => {
  it('启动和关闭会话', async () => {
    const adapter = new ReferenceBrowserAdapter();
    const session = await adapter.launch(makeProfile());
    await session.close();
  });

  it('导航到页面', async () => {
    const pages = new Map<string, ReferencePage>();
    pages.set('https://example.com', {
      url: 'https://example.com',
      elements: new Map(),
    });
    const adapter = new ReferenceBrowserAdapter(pages);
    const session = await adapter.launch(makeProfile());
    await session.navigate('https://example.com');
    await session.close();
  });

  it('采集文本观测', async () => {
    const elements = new Map<string, { text?: string }>();
    elements.set('#title', { text: 'Hello World' });
    const pages = new Map<string, ReferencePage>();
    pages.set('https://example.com', {
      url: 'https://example.com',
      elements: elements as Map<string, import('@uxq/browser').ReferenceElement>,
    });
    const adapter = new ReferenceBrowserAdapter(pages);
    const session = await adapter.launch(makeProfile());
    await session.navigate('https://example.com');
    const text = await session.captureText('#title');
    expect(text).toBe('Hello World');
    await session.close();
  });

  it('截图返回占位数据', async () => {
    const pages = new Map<string, ReferencePage>();
    pages.set('https://example.com', { url: 'https://example.com', elements: new Map() });
    const adapter = new ReferenceBrowserAdapter(pages);
    const session = await adapter.launch(makeProfile());
    await session.navigate('https://example.com');
    const screenshot = await session.screenshot('test');
    expect(screenshot).toBeInstanceOf(Uint8Array);
    expect(screenshot.length).toBeGreaterThan(0);
    await session.close();
  });

  it('关闭后操作拒绝', async () => {
    const adapter = new ReferenceBrowserAdapter();
    const session = await adapter.launch(makeProfile());
    await session.close();
    await expect(session.navigate('https://example.com')).rejects.toThrow('浏览器会话已关闭');
  });
});

describe('executeActions', () => {
  it('执行导航和采集动作', async () => {
    const elements = new Map<string, import('@uxq/browser').ReferenceElement>();
    elements.set('#count', { count: 5 });
    const pages = new Map<string, ReferencePage>();
    pages.set('https://example.com', { url: 'https://example.com', elements });
    const adapter = new ReferenceBrowserAdapter(pages);
    const profile = makeProfile();
    const session = await adapter.launch(profile);
    await session.navigate('https://example.com');

    const actions: BrowserAction[] = [
      { action: 'CAPTURE', selector: '#count', key: 'item-count', extractor: 'COUNT' },
    ];

    const result = await executeActions(session, actions, 'run-1', 'step-1', 'attempt-1', clock);
    expect(result.observations.length).toBe(1);
    expect(result.observations[0]!.value).toBe(5);
    await session.close();
  });

  it('截图动作生成证据', async () => {
    const pages = new Map<string, ReferencePage>();
    pages.set('https://example.com', { url: 'https://example.com', elements: new Map() });
    const adapter = new ReferenceBrowserAdapter(pages);
    const session = await adapter.launch(makeProfile());
    await session.navigate('https://example.com');

    const actions: BrowserAction[] = [{ action: 'SCREENSHOT', name: 'screenshot-1' }];
    const result = await executeActions(session, actions, 'run-1', 'step-1', 'attempt-1', clock);
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0]!.materialType).toBe('SCREENSHOT');
    await session.close();
  });

  it('FILL_SECRET 在 reference 适配器中拒绝', async () => {
    const adapter = new ReferenceBrowserAdapter();
    const session = await adapter.launch(makeProfile());
    await session.navigate('https://example.com');

    const actions: BrowserAction[] = [
      { action: 'FILL_SECRET', selector: '#password', secretRef: 'secret-1' },
    ];
    await expect(
      executeActions(session, actions, 'run-1', 'step-1', 'attempt-1', clock),
    ).rejects.toThrow('reference 适配器不支持秘密填充');
    await session.close();
  });
});

describe('checkConditions', () => {
  it('URL 条件匹配', () => {
    const page: ReferencePage = {
      url: 'https://example.com/success',
      elements: new Map(),
    };
    const result = checkConditions([{ kind: 'URL', equals: 'https://example.com/success' }], page);
    expect(result).toBe(true);
  });

  it('URL 条件不匹配', () => {
    const page: ReferencePage = {
      url: 'https://example.com/fail',
      elements: new Map(),
    };
    const result = checkConditions([{ kind: 'URL', equals: 'https://example.com/success' }], page);
    expect(result).toBe(false);
  });

  it('TEXT 条件匹配', () => {
    const elements = new Map<string, import('@uxq/browser').ReferenceElement>();
    elements.set('#message', { text: '操作成功' });
    const page: ReferencePage = { url: 'https://example.com', elements };
    const result = checkConditions(
      [{ kind: 'TEXT', selector: '#message', equals: '操作成功' }],
      page,
    );
    expect(result).toBe(true);
  });

  it('无页面时返回 false', () => {
    const result = checkConditions([{ kind: 'URL', equals: 'https://example.com' }], undefined);
    expect(result).toBe(false);
  });
});
