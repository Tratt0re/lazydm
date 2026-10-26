import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { isAllowedHost, isTokenValid, startMcpServer } = require('../mcp/mcp-server');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { z } = require('zod');

const TOKEN = 'test-token-123';

function createStubMcp() {
  const server = new McpServer({ name: 'stub', version: '0.0.0' });
  server.registerTool(
    'echo',
    { description: 'Echoes the text.', inputSchema: { text: z.string() } },
    async ({ text }) => ({ content: [{ type: 'text', text }] }),
  );
  return server;
}

let running = null;

async function start(options = {}) {
  running = await startMcpServer({ port: 0, token: TOKEN, createMcp: createStubMcp, ...options });
  return running;
}

afterEach(async () => {
  await running?.stop();
  running = null;
});

describe('isTokenValid', () => {
  it('accepts only the exact bearer token', () => {
    expect(isTokenValid(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(isTokenValid(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(isTokenValid(TOKEN, TOKEN)).toBe(false);
    expect(isTokenValid(undefined, TOKEN)).toBe(false);
    expect(isTokenValid('Bearer ', TOKEN)).toBe(false);
    expect(isTokenValid(`Bearer ${TOKEN}`, '')).toBe(false);
  });
});

describe('isAllowedHost', () => {
  it('allows only the loopback names with this port', () => {
    expect(isAllowedHost('127.0.0.1:4000', 4000)).toBe(true);
    expect(isAllowedHost('localhost:4000', 4000)).toBe(true);
    expect(isAllowedHost('localhost:4001', 4000)).toBe(false);
    expect(isAllowedHost('evil.example:4000', 4000)).toBe(false);
    expect(isAllowedHost(undefined, 4000)).toBe(false);
  });
});

describe('startMcpServer', () => {
  it('serves tools to an MCP client that sends the token', async () => {
    const { port } = await start();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
      }),
    );

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['echo']);
    const result = await client.callTool({ name: 'echo', arguments: { text: 'hello' } });
    expect(result.content[0].text).toBe('hello');
    await client.close();
  });

  it('rejects a missing or wrong token with 401', async () => {
    const { port } = await start();
    const url = `http://127.0.0.1:${port}/mcp`;
    const init = { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } };

    expect((await fetch(url, init)).status).toBe(401);
    const wrong = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: 'Bearer nope' },
    });
    expect(wrong.status).toBe(401);
  });

  it('rejects a browser origin even with the token', async () => {
    const { port } = await start();
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      body: '{}',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
        Origin: 'https://evil.example',
      },
    });

    expect(response.status).toBe(403);
  });

  it('only answers POST on /mcp', async () => {
    const { port } = await start();
    const headers = { Authorization: `Bearer ${TOKEN}` };

    expect(
      (await fetch(`http://127.0.0.1:${port}/other`, { method: 'POST', headers })).status,
    ).toBe(404);
    expect((await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'GET', headers })).status).toBe(
      405,
    );
  });

  it('refuses an oversized body', async () => {
    const { port } = await start();
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ pad: 'x'.repeat(1024 * 1024 + 10) }),
    }).catch(() => null);

    // Either a 413 or the connection is cut while the body is still being sent.
    expect(response === null || response.status === 413).toBe(true);
  });

  it('reports a busy port', async () => {
    const first = await start();
    await expect(
      startMcpServer({ port: first.port, token: TOKEN, createMcp: createStubMcp }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  it('stops listening when stopped', async () => {
    const { port, stop } = await start();
    await stop();
    running = null;
    await expect(
      fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', body: '{}' }),
    ).rejects.toThrow();
  });
});
