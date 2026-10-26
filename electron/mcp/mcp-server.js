const crypto = require('node:crypto');
const http = require('node:http');
const {
  StreamableHTTPServerTransport,
} = require('@modelcontextprotocol/sdk/server/streamableHttp.js');

const MCP_PATH = '/mcp';
const MAX_BODY_BYTES = 1024 * 1024;
const LOOPBACK_HOST = '127.0.0.1';

/** Constant-time check of an `Authorization: Bearer <token>` header. */
function isTokenValid(authorizationHeader, token) {
  const match = /^Bearer (.+)$/.exec(authorizationHeader ?? '');
  if (!match || typeof token !== 'string' || token.length === 0) {
    return false;
  }

  const received = crypto.createHash('sha256').update(match[1]).digest();
  const expected = crypto.createHash('sha256').update(token).digest();
  return crypto.timingSafeEqual(received, expected);
}

/** Only the loopback names of this very port: a page on another host name cannot reach the server (DNS rebinding). */
function isAllowedHost(hostHeader, port) {
  return hostHeader === `${LOOPBACK_HOST}:${port}` || hostHeader === `localhost:${port}`;
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Request body is not valid JSON.'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Starts the MCP endpoint on 127.0.0.1 (never on another interface). Stateless: every request gets its own
 * MCP server from `createMcp`, so there are no sessions to leak and a stop is immediate.
 *
 * @param {{ port: number, token: string, createMcp: () => import('@modelcontextprotocol/sdk/server/mcp.js').McpServer }} options
 * @returns {Promise<{ port: number, stop: () => Promise<void> }>}
 */
function startMcpServer({ port, token, createMcp }) {
  let boundPort = port;

  async function handle(req, res) {
    if (!isAllowedHost(req.headers.host, boundPort)) {
      sendJson(res, 403, { error: 'Forbidden host.' });
      return;
    }
    // Browsers always send an Origin on cross-site requests; MCP clients are not browsers and send none.
    if (req.headers.origin) {
      sendJson(res, 403, { error: 'Browser origins are not allowed.' });
      return;
    }
    if (!isTokenValid(req.headers.authorization, token)) {
      sendJson(res, 401, { error: 'Unauthorized.' }, { 'WWW-Authenticate': 'Bearer' });
      return;
    }
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== MCP_PATH) {
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
      return;
    }

    const body = await readJsonBody(req);
    const mcp = createMcp();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      const status = error?.statusCode ?? 500;
      sendJson(res, status, { error: status === 500 ? 'Internal error.' : error.message });
      if (status === 500) {
        console.error('[mcp] Request failed:', error);
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', (error) => {
      reject(
        error.code === 'EADDRINUSE'
          ? Object.assign(new Error(`Port ${port} is already in use.`), { code: 'EADDRINUSE' })
          : error,
      );
    });
    server.listen(port, LOOPBACK_HOST, () => {
      boundPort = server.address().port;
      resolve({
        port: boundPort,
        stop: () =>
          new Promise((resolveStop) => {
            server.close(() => resolveStop());
            server.closeAllConnections();
          }),
      });
    });
  });
}

module.exports = {
  LOOPBACK_HOST,
  MCP_PATH,
  isAllowedHost,
  isTokenValid,
  startMcpServer,
};
