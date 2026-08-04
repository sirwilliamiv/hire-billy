#!/usr/bin/env node
/* Hosts the The Candidate UI and gives its live socket a real backend.
   GET  /        the experience (ui/candidate.html)
   POST /ask     {question} -> {lede, rest, sources} via the shared pipeline
                 (503 until ANTHROPIC_API_KEY is set: degrade loudly, never silently) */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { runPipeline, corpus } from './core/pipeline.js';
import { buildServer } from './mcp/factory.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4173;
const HTML = readFileSync(join(HERE, 'ui', 'candidate.html'));
const LIVE = !!process.env.ANTHROPIC_API_KEY;
/* access keys: STAGE_KEYS="hb-rm-x7k2,hb-friend-9m3p". Empty = open.
   Invite links carry ?k=...; the page validates once and stores it. */
const KEYS = (process.env.STAGE_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
const GATED = KEYS.length > 0;
const keyOf = req => String(req.headers['x-stage-key'] || new URL(req.url, 'http://x').searchParams.get('k') || '');

/* Remote MCP (Streamable HTTP, stateless): employers paste this URL into
   Claude or ChatGPT as a connector; claude.ai/Desktop and ChatGPT render the
   inline widget, Claude Code degrades to formatted text. Left keyless on
   purpose: connector UIs have no good place for a shared secret, so cost is
   contained by the pipeline's rate limit and the spend-capped API key. */
const MCP_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, mcp-session-id, mcp-protocol-version',
  'access-control-expose-headers': 'mcp-session-id',
};

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/mcp') {
    if (req.method === 'OPTIONS') { res.writeHead(204, MCP_CORS); return res.end(); }
    if (req.method !== 'POST') {
      res.writeHead(405, { ...MCP_CORS, allow: 'POST', 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'stateless transport: POST only' }));
    }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 262144) req.destroy(); });
    req.on('end', async () => {
      try {
        const mcp = buildServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        res.on('close', () => { transport.close(); mcp.close(); });
        for (const [k, v] of Object.entries(MCP_CORS)) res.setHeader(k, v);
        await mcp.connect(transport);
        await transport.handleRequest(req, res, JSON.parse(body || '{}'));
      } catch (e) {
        if (!res.headersSent) {
          res.writeHead(400, { ...MCP_CORS, 'content-type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'parse error' }, id: null }));
        }
      }
    });
    return;
  }
  if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(HTML);
  }
  if (req.method === 'GET' && path === '/widget') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(readFileSync(join(HERE, 'ui', 'widget.html')));
  }
  if (req.method === 'GET' && path === '/summon') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(readFileSync(join(HERE, 'ui', 'summon.html')));
  }
  if (req.method === 'GET' && path === '/dev/host') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(readFileSync(join(HERE, 'ui', 'dev', 'host.html')));
  }
  if (req.method === 'GET' && path === '/auth') {
    res.writeHead(!GATED || KEYS.includes(keyOf(req)) ? 204 : 401);
    return res.end();
  }
  if (req.method === 'GET' && path === '/corpus.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(corpus(), null, 2));
  }
  if (req.method === 'POST' && path === '/ask') {
    if (GATED && !KEYS.includes(keyOf(req))) {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid access key' }));
    }
    if (!LIVE) {
      res.writeHead(503, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'live socket not wired: set ANTHROPIC_API_KEY' }));
    }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 65536) req.destroy(); });
    req.on('end', async () => {
      try {
        const { question } = JSON.parse(body || '{}');
        const r = await runPipeline(question);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          lede: r.lede,
          rest: r.rest.replace(/~~(.+?)~~/g, '<del>$1</del>'),
          sources: r.sources,
          receipt: r.receipt,
        }));
      } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad request' }));
      }
    });
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`candidate ui     http://localhost:${PORT}`);
  console.log(`live socket    ${LIVE ? 'wired (' + (process.env.STAGE_MODEL || 'claude-sonnet-4-5') + ')' : 'not wired: set ANTHROPIC_API_KEY'}`);
  console.log(`access         ${GATED ? KEYS.length + ' key(s), invite links use ?k=' : 'open (set STAGE_KEYS to gate)'}`);
  console.log(`mcp            http://localhost:${PORT}/mcp (Streamable HTTP, add as a connector)`);
});
