/* Shared MCP server factory: one definition of the tools and the inline-UI
   resource, used by both the stdio entry (mcp/server.js) and the deployed
   Streamable HTTP endpoint (serve.js, POST /mcp).

   The widget is declared per the MCP Apps extension (SEP-1865): a ui://
   resource with mimeType text/html;profile=mcp-app, referenced from the
   tool's _meta. Claude (claude.ai, Desktop) reads _meta.ui.resourceUri;
   ChatGPT's Apps SDK reads the same, with openai/outputTemplate kept as the
   legacy alias. Clients with no UI surface (Claude Code) ignore the _meta
   and fall back to the formatted text content. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runPipeline, formatAnswer, formatCard, corpus } from '../core/pipeline.js';

/* loopback brain for the native overlay: the window is a dumb shell, the
   answers stay in this process (pipeline + hot-reloading corpus) */
let brain = null; /* { port, token } */
function ensureBrain() {
  return new Promise(resolve => {
    if (brain) return resolve(brain);
    const token = randomBytes(16).toString('hex');
    /* the only legitimate caller is the overlay WebView (file:// origin sends
       Origin: null) presenting the per-launch token injected at spawn; any
       cross-origin browser page fails both checks */
    const CORS = { 'access-control-allow-origin': 'null', 'access-control-allow-headers': 'content-type, x-billy-token' };
    const srv = createServer((req, res) => {
      if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
      if (req.headers['x-billy-token'] !== token) { res.writeHead(403, CORS); return res.end(); }
      if (req.method === 'POST' && req.url === '/ask') {
        let b = '';
        req.on('data', c => { b += c; if (b.length > 65536) req.destroy(); });
        req.on('end', async () => {
          try {
            const { question } = JSON.parse(b || '{}');
            const r = await runPipeline(question);
            const { kind, lede, rest, sources, flags, struck, receipt, trace } = r;
            res.writeHead(200, { ...CORS, 'content-type': 'application/json' });
            res.end(JSON.stringify({ kind, lede, rest, sources, flags, struck, receipt, trace }));
          } catch (e) { res.writeHead(400, CORS); res.end('{}'); }
        });
        return;
      }
      res.writeHead(404, CORS); res.end();
    });
    srv.unref();
    srv.listen(0, '127.0.0.1', () => { brain = { port: srv.address().port, token }; resolve(brain); });
  });
}

const HERE = dirname(fileURLToPath(import.meta.url));
const WIDGET_URI = 'ui://hire-billy/panel';
const WIDGET_HTML = readFileSync(join(HERE, '..', 'ui', 'widget.html'), 'utf8');
const SUMMON_URI = 'ui://hire-billy/summon';
const SUMMON_HTML = readFileSync(join(HERE, '..', 'ui', 'summon.html'), 'utf8');

const UI_META = {
  ui: { resourceUri: WIDGET_URI },
  'openai/outputTemplate': WIDGET_URI,
  'openai/toolInvocation/invoking': 'Interrogating the candidate…',
  'openai/toolInvocation/invoked': 'Answer grounded against the corpus',
};

const SUMMON_META = {
  ui: { resourceUri: SUMMON_URI },
  'openai/outputTemplate': SUMMON_URI,
  'openai/toolInvocation/invoking': 'Opening a door…',
  'openai/toolInvocation/invoked': 'He is out',
};

const OVERLAY_DIR = join(HERE, '..', 'overlay');
const ELECTRON_BIN = join(OVERLAY_DIR, 'node_modules', '.bin', 'electron');
const NATIVE_BIN = join(HERE, '..', 'overlay-native', 'billy-overlay');

/* Client names that cannot possibly be the screen in front of the viewer even
   when the transport is local: a phone, a browser tab, a hosted workspace. */
const NO_DESKTOP_CLIENT = /(mobile|ios|android|web\b|cowork|chatgpt|openai|browser)/i;

/* Where should he appear? The desktop overlay needs all four of these to be
   true at once; anything else gets the in-chat card, which is the only surface
   a phone or a browser tab can actually draw on. Detection is conservative on
   purpose: a wrong "inline" costs a nicer animation, a wrong "desktop" spawns
   a window on a machine nobody is looking at. */
export function detectSurface({ local, server, requested }) {
  let clientName = '';
  try { clientName = (server.server.getClientVersion() || {}).name || ''; } catch (e) {}
  const runtime = existsSync(NATIVE_BIN) ? 'native' : (existsSync(ELECTRON_BIN) ? 'electron' : null);
  const headless = !!(process.env.SSH_CONNECTION || process.env.SSH_TTY);
  const facts = { transport: local ? 'stdio' : 'http', host: process.platform, client: clientName || 'unknown', runtime };

  const blocker =
    !local ? 'this server is answering over HTTP, so the desktop it would draw on is not yours'
    : process.platform !== 'darwin' ? `the overlay is macOS-only and this machine reports ${process.platform}`
    : !runtime ? 'no overlay runtime is built here (swiftc overlay-native, or npm install in overlay/)'
    : headless ? 'this session is attached over SSH, so there is no screen to walk onto'
    : null;

  if (requested === 'inline') return { mode: 'inline', reason: 'you asked for the in-chat card', facts };
  if (requested === 'desktop') {
    return blocker
      ? { mode: 'inline', reason: `you asked for the desktop overlay, but ${blocker}`, facts }
      : { mode: 'desktop', reason: 'you asked for the desktop overlay', facts };
  }
  if (blocker) return { mode: 'inline', reason: blocker, facts };
  if (NO_DESKTOP_CLIENT.test(clientName)) {
    return { mode: 'inline', reason: `the client identifies as ${clientName}, which has no desktop of its own`, facts };
  }
  return { mode: 'desktop', reason: 'local macOS client with an overlay runtime built', facts };
}

const INLINE_LEDE = "Hey, I'm Billy. No desktop here, so I came to the message.";
const INLINE_REST =
  "The full version of this walks across a macOS desktop and sits down on your Claude window. " +
  "You're on a surface that doesn't have one, so you get the same entrance in the chat: I walk in, " +
  "I sit down, and I answer out of the same signed corpus, struck claims and all. Ask me anything below.";
const DESKTOP_LEDE = "I'm out there, on your actual screen.";
const DESKTOP_REST =
  "Watch the right edge of your desktop: a door, then me, walking over to sit down on your Claude window. " +
  "That bubble is the one to talk to. The X on it sends me home.";
const HANDOVER_LEDE = "There is already one of me out there, so he is handing over.";
const HANDOVER_REST =
  "Two of me is a governance problem. The incumbent will say his goodbyes and walk off " +
  "while a fresh one makes his entrance. Same corpus, better posture.";

const traceShape = z.object({
  stage: z.string(),
  ms: z.number(),
  note: z.string(),
}).passthrough();

export function buildServer({ local = false } = {}) {
  const server = new McpServer({ name: 'hire-billy', version: corpus().meta.version + '.0' });

  server.registerTool(
    'ask_billy',
    {
      title: 'Interrogate the candidate',
      description:
        'Interrogate the candidate. Ask anything: strengths, weaknesses, how he works, why not to hire him. ' +
        'Every answer is grounded in a signed corpus and returns a measured nine-stage trace. ' +
        'Unsourced superlatives are struck in view; flattery is structurally impossible.',
      inputSchema: { question: z.string().describe('The question to put to the candidate') },
      outputSchema: {
        kind: z.string(),
        question: z.string(),
        lede: z.string(),
        rest: z.string().describe('Body text; struck claims wrapped in ~~tildes~~'),
        sources: z.array(z.string()),
        flags: z.array(z.string()),
        struck: z.array(z.string()),
        receipt: z.string(),
        trace: z.array(traceShape),
      },
      _meta: UI_META,
    },
    async ({ question }) => {
      const r = await runPipeline(question);
      const { kind, question: q, lede, rest, sources, flags, struck, receipt, trace } = r;
      return {
        content: [{ type: 'text', text: formatAnswer(r) }],
        structuredContent: { kind, question: q, lede, rest, sources, flags, struck, receipt, trace },
      };
    }
  );

  server.registerTool(
    'get_model_card',
    {
      title: 'Pull his permanent record',
      description:
        'Read the candidate\'s model card: overview, how he works, reported strengths, known limitations, ' +
        'evidence, scope. Limitations ship in the same corpus as strengths, retrieved by the same machinery.',
      inputSchema: {
        section: z.string().optional().describe('Optional section id: overview, how-i-work, strengths, limitations, evidence, scope'),
      },
    },
    async ({ section }) => {
      return { content: [{ type: 'text', text: formatCard(section) }] };
    }
  );

  server.registerResource(
    'hire-billy-panel',
    WIDGET_URI,
    {
      title: 'Hire Billy interrogation panel',
      description: 'Inline UI for interrogating the candidate: grounded answers, struck claims, measured trace.',
      mimeType: 'text/html;profile=mcp-app',
      _meta: { ui: { prefersBorder: false } },
    },
    async () => ({
      contents: [{ uri: WIDGET_URI, mimeType: 'text/html;profile=mcp-app', text: WIDGET_HTML }],
    })
  );

  server.registerResource(
    'hire-billy-summon',
    SUMMON_URI,
    {
      title: 'Hire Billy summon card',
      description: 'In-chat summon: the candidate walks in, sits on the edge of the card, and talks.',
      mimeType: 'text/html;profile=mcp-app',
      _meta: { ui: { prefersBorder: false } },
    },
    async () => ({
      contents: [{ uri: SUMMON_URI, mimeType: 'text/html;profile=mcp-app', text: SUMMON_HTML }],
    })
  );

  /* One tool, two stages. On a local macOS client with an overlay runtime he
     walks onto the real desktop — that binary runs with the viewer's own
     permissions, so the client's tool-approval prompt is the consent gate.
     Everywhere else (phone, browser, hosted workspace, remote connector) the
     same entrance plays inside the message as the summon card. The remote
     transport can never reach the spawn path: `local` is set only by the stdio
     entry, which by definition is running on the machine being looked at. */
  server.registerTool(
    'summon_billy',
    {
      title: 'Let him out',
      description:
        'Summons an animated figure of the candidate: he walks in, sits down, and answers questions ' +
        'in a speech bubble. On a local macOS client he walks onto the actual desktop as a transparent ' +
        'click-through overlay and sits on the Claude window; on every other surface (mobile, web, ' +
        'remote connector) the same entrance renders as a card inside the conversation. The surface is ' +
        'detected automatically. Use when the user wants the full Hire Billy experience.',
      inputSchema: {
        platform: z.enum(['auto', 'desktop', 'inline']).optional()
          .describe('auto (default) detects the surface; desktop forces the macOS overlay; inline forces the in-chat card'),
      },
      outputSchema: {
        mode: z.string().describe('desktop (overlay launched) or inline (card rendered in chat)'),
        reason: z.string().describe('why that surface was chosen'),
        lede: z.string(),
        rest: z.string(),
        facts: z.object({
          transport: z.string(),
          host: z.string(),
          client: z.string(),
          runtime: z.string().nullable(),
        }),
      },
      _meta: SUMMON_META,
    },
    async ({ platform }) => {
      const surface = detectSurface({ local, server, requested: platform && platform !== 'auto' ? platform : null });
      const reply = (lede, rest) => ({
        content: [{ type: 'text', text: `${lede}\n\n${rest}\n\n(${surface.mode} · ${surface.reason})` }],
        structuredContent: { mode: surface.mode, reason: surface.reason, lede, rest, facts: surface.facts },
        _meta: SUMMON_META,
      });

      if (surface.mode === 'inline') return reply(INLINE_LEDE, INLINE_REST);

      /* a second summon retires the incumbent first: he says goodbye and
         walks off while the replacement makes its entrance */
      let handover = false;
      const stateDir = join(homedir(), '.hire-billy');
      try {
        const pid = parseInt(readFileSync(join(stateDir, 'overlay.pid'), 'utf8'), 10);
        process.kill(pid, 0);
        writeFileSync(join(stateDir, 'overlay.cmd'), 'retire');
        handover = true;
      } catch (e) {}
      try { mkdirSync(stateDir, { recursive: true }); } catch (e) {}
      const launch = async () => {
        if (surface.facts.runtime === 'native') {
          const b = await ensureBrain();
          const child = spawn(NATIVE_BIN, ['--brain', String(b.port), '--token', b.token], { detached: true, stdio: 'ignore' });
          child.unref();
        } else {
          const child = spawn(ELECTRON_BIN, ['.'], { cwd: OVERLAY_DIR, detached: true, stdio: 'ignore' });
          child.unref();
        }
      };
      if (handover) setTimeout(launch, 2600); else launch();
      return handover ? reply(HANDOVER_LEDE, HANDOVER_REST) : reply(DESKTOP_LEDE, DESKTOP_REST);
    }
  );

  return server;
}
