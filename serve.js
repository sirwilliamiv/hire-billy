#!/usr/bin/env node
/* Hosts the Hire Billy UI and gives its live socket a real backend.
   GET  /        the experience (ui/billy-1.html)
   POST /ask     {question} -> {lede, rest, sources} via the shared pipeline
                 (503 until ANTHROPIC_API_KEY is set: degrade loudly, never silently) */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runPipeline, CORPUS } from './core/pipeline.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4173;
const HTML = readFileSync(join(HERE, 'ui', 'hire-billy.html'));
const LIVE = !!process.env.ANTHROPIC_API_KEY;
/* access keys: BILLY1_KEYS="hb-rm-x7k2,hb-friend-9m3p". Empty = open.
   Invite links carry ?k=...; the page validates once and stores it. */
const KEYS = (process.env.BILLY1_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
const GATED = KEYS.length > 0;
const keyOf = req => String(req.headers['x-billy-key'] || new URL(req.url, 'http://x').searchParams.get('k') || '');

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(HTML);
  }
  if (req.method === 'GET' && path === '/auth') {
    res.writeHead(!GATED || KEYS.includes(keyOf(req)) ? 204 : 401);
    return res.end();
  }
  if (req.method === 'GET' && path === '/corpus.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(CORPUS, null, 2));
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
  console.log(`hire billy ui     http://localhost:${PORT}`);
  console.log(`live socket    ${LIVE ? 'wired (' + (process.env.BILLY1_MODEL || 'claude-sonnet-4-5') + ')' : 'not wired: set ANTHROPIC_API_KEY'}`);
  console.log(`access         ${GATED ? KEYS.length + ' key(s), invite links use ?k=' : 'open (set BILLY1_KEYS to gate)'}`);
});
