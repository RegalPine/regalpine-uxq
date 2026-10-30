#!/usr/bin/env node
/**
 * UXQ 静态服务器参考实现
 *
 * 用途：为 UXQ 评估提供静态文件托管，替代 Python http.server（后者在 Playwright 并发请求下会 ECONNREFUSED）。
 *
 * 特性：
 * - SPA fallback：所有未匹配路径返回 index.html
 * - 可选 /api 反代到后端
 * - 仅监听 127.0.0.1（本地回环，不暴露到网络）
 * - 并发连接无限制
 *
 * 用法：
 *   node serve-static.mjs --dir <static-dir> --port <port> [--api-target <backend-url>]
 *
 * 示例：
 *   node serve-static.mjs --dir dist --port 8090
 *   node serve-static.mjs --dir dist --port 8090 --api-target http://127.0.0.1:3000
 *
 * 安全约束：
 * - 仅监听 127.0.0.1
 * - 不使用生产账号
 * - token 用后删除
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dir: 'dist', port: 8090, apiTarget: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && i + 1 < args.length) opts.dir = args[++i];
    else if (args[i] === '--port' && i + 1 < args.length) opts.port = parseInt(args[++i], 10);
    else if (args[i] === '--api-target' && i + 1 < args.length) opts.apiTarget = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('用法：node serve-static.mjs --dir <static-dir> --port <port> [--api-target <backend-url>]');
      process.exit(0);
    }
  }
  return opts;
}

async function tryReadFile(filePath) {
  try {
    const stats = await stat(filePath);
    if (stats.isFile()) return await readFile(filePath);
  } catch { /* ignore */ }
  return null;
}

async function proxyRequest(targetUrl, req, res) {
  const url = new URL(req.url, targetUrl);
  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: req.method,
    headers: { ...req.headers, host: url.host },
  };
  const http = await import('node:http');
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    console.error('[proxy error]', err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway');
  });
  req.pipe(proxyReq);
}

async function main() {
  const opts = parseArgs();
  const rootDir = join(process.cwd(), opts.dir);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);

    // API 反代
    if (opts.apiTarget && pathname.startsWith('/api')) {
      return await proxyRequest(opts.apiTarget, req, res);
    }

    // 尝试读取静态文件
    let filePath = join(rootDir, pathname);
    let content = await tryReadFile(filePath);

    // SPA fallback：如果文件不存在，返回 index.html
    if (!content) {
      filePath = join(rootDir, 'index.html');
      content = await tryReadFile(filePath);
    }

    if (!content) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  });

  server.listen(opts.port, '127.0.0.1', () => {
    console.log(`[uxq-serve] 静态服务器已启动`);
    console.log(`  目录：${rootDir}`);
    console.log(`  地址：http://127.0.0.1:${opts.port}`);
    if (opts.apiTarget) console.log(`  API 反代：${opts.apiTarget}`);
    console.log(`  按 Ctrl+C 停止`);
  });

  server.on('error', (err) => {
    console.error('[uxq-serve] 服务器错误：', err.message);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('[uxq-serve] 启动失败：', err);
  process.exit(1);
});
