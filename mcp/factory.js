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
import { spawn, spawnSync } from 'node:child_process';
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
    const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-stage-token' };
    const stageClients = new Set();
    const heard = []; /* what the viewer typed at the actor, until the director listens */
    const broadcast = obj => {
      const b = typeof obj === 'string' ? obj : JSON.stringify(obj);
      for (const c of stageClients) { try { c.write('data: ' + b + '\n\n'); } catch (e) {} }
    };
    const srv = createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
      const tok = req.headers['x-stage-token'] || u.searchParams.get('t');
      if (tok !== token) { res.writeHead(403, CORS); return res.end(); }
      if (req.method === 'GET' && u.pathname === '/stage-events') {
        res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
        res.write('\n');
        stageClients.add(res);
        req.on('close', () => stageClients.delete(res));
        return;
      }
      if (req.method === 'POST' && u.pathname === '/heard') {
        let b = '';
        req.on('data', c => { b += c; if (b.length > 8192) req.destroy(); });
        req.on('end', () => {
          try {
            const { text } = JSON.parse(b || '{}');
            if (text && typeof text === 'string') {
              heard.push({ text: text.slice(0, 2000), ts: Date.now() });
              if (heard.length > 50) heard.shift();
            }
          } catch (e) {}
          res.writeHead(204, CORS); res.end();
        });
        return;
      }
      if (req.method === 'POST' && u.pathname === '/stage') {
        let b = '';
        req.on('data', c => { b += c; if (b.length > 8192) req.destroy(); });
        req.on('end', () => {
          broadcast(b);
          res.writeHead(204, CORS); res.end();
        });
        return;
      }
      if (req.method === 'GET' && u.pathname === '/stage-page') {
        let html = readFileSync(join(HERE, '..', 'ui', 'stage.html'), 'utf8');
        html = html.replace('__BRAIN__', String(brain.port)).replace('__TOKEN__', token);
        res.writeHead(200, { ...CORS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(html);
      }
      if (req.method === 'POST' && u.pathname === '/ask') {
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
    srv.listen(0, '127.0.0.1', () => { brain = { port: srv.address().port, token, broadcast, heard }; resolve(brain); });
  });
}

const HERE = dirname(fileURLToPath(import.meta.url));
const WIDGET_URI = 'ui://eap-stage/panel';
const WIDGET_HTML = readFileSync(join(HERE, '..', 'ui', 'widget.html'), 'utf8');
const SUMMON_URI = 'ui://eap-stage/summon';
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
const NATIVE_BIN = join(HERE, '..', 'overlay-native', 'stage-overlay');

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

/* The stage, surveyed: every ordinary window on this desktop, front to back,
   read from the window server (bounds and owners only; no pixels, no content).
   The overlay itself lives above the ordinary layer so it never lists itself. */
function listWindows() {
  const r = spawnSync(NATIVE_BIN, ['--list-windows'], { encoding: 'utf8', timeout: 5000 });
  if (r.status !== 0) throw new Error('window survey failed: ' + (r.stderr || 'binary did not answer'));
  const d = JSON.parse(r.stdout);
  return { screen: d.screen, windows: d.windows.filter(w => w.app !== 'stage-overlay') };
}

function axTrusted() {
  const r = spawnSync(NATIVE_BIN, ['--ax-check'], { encoding: 'utf8', timeout: 5000 });
  return r.status === 0 && r.stdout.trim() === 'trusted';
}

function resolveWindow(wins, app, title) {
  const a = (app || '').toLowerCase(), t = (title || '').toLowerCase();
  return wins.find(w =>
    (!a || w.app.toLowerCase().includes(a)) &&
    (!t || (w.title || '').toLowerCase().includes(t))) || null;
}

function overlayAlive() {
  try {
    const pid = parseInt(readFileSync(join(homedir(), '.eap-stage', 'overlay.pid'), 'utf8'), 10);
    process.kill(pid, 0);
    return true;
  } catch (e) { return false; }
}

const INLINE_LEDE = "Hey. No desktop here, so I came to the message.";
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
  const server = new McpServer({ name: 'eap-stage', version: corpus().meta.version + '.0' });

  server.registerTool(
    'ask_candidate',
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
    'eap-stage-panel',
    WIDGET_URI,
    {
      title: 'Interrogation panel',
      description: 'Inline UI for interrogating the candidate: grounded answers, struck claims, measured trace.',
      mimeType: 'text/html;profile=mcp-app',
      _meta: { ui: { prefersBorder: false } },
    },
    async () => ({
      contents: [{ uri: WIDGET_URI, mimeType: 'text/html;profile=mcp-app', text: WIDGET_HTML }],
    })
  );

  server.registerResource(
    'eap-stage-summon',
    SUMMON_URI,
    {
      title: 'Summon card',
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
    'stage_summon',
    {
      title: 'Let him out',
      description:
        'Summons an animated figure of the candidate: he walks in, sits down, and answers questions ' +
        'in a speech bubble. On a local macOS client he walks onto the actual desktop as a transparent ' +
        'click-through overlay and sits on the Claude window; on every other surface (mobile, web, ' +
        'remote connector) the same entrance renders as a card inside the conversation. The surface is ' +
        'detected automatically. Use when the user wants the full embodied experience.',
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
      const stateDir = join(homedir(), '.eap-stage');
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

  /* The Desk Tour verbs (EAP: point and a window-edge sit). Local stdio only:
     these direct a body on the machine in front of the viewer, and the summon
     tool's approval is the consent gate they all sit behind. The one rule is
     normative and enforced by construction: the overlay is click-through, so
     the actor cannot actuate anything even by accident. He points; you click. */
  if (local && process.platform === 'darwin') {
    const windowShape = z.object({
      app: z.string(),
      title: z.string().optional(),
      pid: z.number(),
      x: z.number(), y: z.number(), w: z.number(), h: z.number(),
    });

    const heardNote = () => (brain && brain.heard.length)
      ? `\n\n(The viewer has typed ${brain.heard.length} thing(s) into the actor's bubble — call stage_listen to hear them.)`
      : '';

    const notOnStage = {
      content: [{ type: 'text', text:
        'Nobody is on stage. Summon him first (stage_summon) — the door is the consent gate, ' +
        'and a stage direction without a body is just a strongly worded opinion.' }],
      isError: true,
    };
    const verbReady = () => existsSync(NATIVE_BIN) && brain && overlayAlive();

    server.registerTool(
      'list_windows',
      {
        title: 'Survey the stage',
        description:
          'List the ordinary windows on this desktop: owning app, title where available, and screen bounds. ' +
          'Geometry only — no pixels, no content. Use it to choose a target for stage_point or stage_sit.',
        inputSchema: {},
        outputSchema: { screen: z.object({ w: z.number(), h: z.number() }), windows: z.array(windowShape) },
      },
      async () => {
        const { screen, windows } = listWindows();
        const lines = windows.map(w =>
          `${w.app}${w.title ? ' — ' + w.title : ''}  [${w.x},${w.y} ${w.w}x${w.h}]`);
        return {
          content: [{ type: 'text', text: `The stage is ${screen.w}x${screen.h}. On it, front to back:\n` + lines.join('\n') }],
          structuredContent: { screen, windows },
        };
      }
    );

    server.registerTool(
      'stage_point',
      {
        title: 'Point at a window',
        description:
          'The summoned figure walks across the desktop to a real window, draws a wand, and points at it; ' +
          'the window lights up with a spotlight outline. He may deliver a line. He indicates; the human acts. He never clicks — ' +
          'the overlay is click-through by construction. Requires a prior stage_summon.',
        inputSchema: {
          app: z.string().describe('App owning the target window, matched as a case-insensitive substring (e.g. "chrome", "iterm")'),
          title: z.string().optional().describe('Optional title substring to disambiguate between windows of the same app'),
          say: z.string().optional().describe('A line for him to deliver while pointing'),
        },
        outputSchema: { verb: z.string(), target: windowShape },
      },
      async ({ app, title, say }) => {
        if (!verbReady()) return notOnStage;
        const wins = listWindows().windows;
        const target = resolveWindow(wins, app, title);
        if (!target) {
          const cast = [...new Set(wins.map(w => w.app))].join(', ');
          return { content: [{ type: 'text', text: `No window matches "${app}${title ? ' / ' + title : ''}". On stage right now: ${cast}.` }], isError: true };
        }
        brain.broadcast({ type: 'verb.point', target, say: say || null });
        return {
          content: [{ type: 'text', text:
            `He is walking over to ${target.app}${target.title ? ' (' + target.title + ')' : ''} to point at it` +
            `${say ? ' and deliver the line' : ''}. He will not click it. He never clicks.` + heardNote() }],
          structuredContent: { verb: 'point', target },
        };
      }
    );

    server.registerTool(
      'stage_sit',
      {
        title: 'Sit on a window edge',
        description:
          'The summoned figure walks to a real window and sits down on its top edge, feet dangling over ' +
          'someone else\'s title bar, optionally saying a line. Purely presentational: the window ' +
          'underneath keeps working and never receives a single event. Requires a prior stage_summon.',
        inputSchema: {
          app: z.string().describe('App owning the window to sit on, case-insensitive substring'),
          title: z.string().optional().describe('Optional title substring to disambiguate'),
          say: z.string().optional().describe('A line for him to deliver once seated'),
        },
        outputSchema: { verb: z.string(), target: windowShape },
      },
      async ({ app, title, say }) => {
        if (!verbReady()) return notOnStage;
        const wins = listWindows().windows;
        const target = resolveWindow(wins, app, title);
        if (!target) {
          const cast = [...new Set(wins.map(w => w.app))].join(', ');
          return { content: [{ type: 'text', text: `No window matches "${app}${title ? ' / ' + title : ''}". On stage right now: ${cast}.` }], isError: true };
        }
        brain.broadcast({ type: 'verb.sit', target, say: say || null });
        return {
          content: [{ type: 'text', text:
            `He is heading for the top edge of ${target.app}${target.title ? ' (' + target.title + ')' : ''} to sit down on it. ` +
            'The window will not notice. Nothing he does registers as input.' + heardNote() }],
          structuredContent: { verb: 'sit', target },
        };
      }
    );

    server.registerTool(
      'stage_move',
      {
        title: 'Rearrange a window (presentation only)',
        description:
          'The summoned figure walks to a real window, draws a wand, spotlights the window, and glides it ' +
          'to a new position on screen. This is stage arrangement, not actuation: the window frame moves, ' +
          'but no click, keystroke, or event of any kind enters the app — the sanctioned presentation ' +
          'exception, like scroll-into-view. Needs macOS Accessibility permission for the overlay; the ' +
          'tool says exactly what to grant if it is missing. Requires a prior stage_summon.',
        inputSchema: {
          app: z.string().describe('App owning the window to move, case-insensitive substring'),
          title: z.string().optional().describe('Optional title substring to disambiguate'),
          x: z.number().describe('New top-left x of the window, in screen coordinates'),
          y: z.number().describe('New top-left y of the window, in screen coordinates'),
          say: z.string().optional().describe('A line for him to deliver as the window settles'),
        },
        outputSchema: { verb: z.string(), target: windowShape, to: z.object({ x: z.number(), y: z.number() }) },
      },
      async ({ app, title, x, y, say }) => {
        if (!verbReady()) return notOnStage;
        if (!axTrusted()) {
          return { content: [{ type: 'text', text:
            'The OS will not let him touch the furniture yet. Grant Accessibility permission to the overlay: ' +
            'System Settings > Privacy & Security > Accessibility > add ' + NATIVE_BIN + ' (or the app hosting ' +
            'this MCP server). Until then he can point at windows but not move them.' }], isError: true };
        }
        const { screen, windows } = listWindows();
        const target = resolveWindow(windows, app, title);
        if (!target) {
          const cast = [...new Set(windows.map(w => w.app))].join(', ');
          return { content: [{ type: 'text', text: `No window matches "${app}${title ? ' / ' + title : ''}". On stage right now: ${cast}.` }], isError: true };
        }
        const to = {
          x: Math.max(0, Math.min(Math.round(x), screen.w - 80)),
          y: Math.max(0, Math.min(Math.round(y), screen.h - 80)),
        };
        brain.broadcast({ type: 'verb.move', target, to, say: say || null });
        return {
          content: [{ type: 'text', text:
            `He is walking over to ${target.app}${target.title ? ' (' + target.title + ')' : ''} with the wand out. ` +
            `The window glides to ${to.x},${to.y}. Its contents never feel a thing.` + heardNote() }],
          structuredContent: { verb: 'move', target, to },
        };
      }
    );

    server.registerTool(
      'stage_lasers',
      {
        title: 'Light up the whole stage',
        description:
          'The summoned figure raises a finger and fires a beam of light at every open window in turn; ' +
          'each beam lands as a pulsing spotlight on its window until the whole stage is lit. Deixis at ' +
          'stage scale: pure light, no window receives any input of any kind. Optionally restrict to a ' +
          'subset of apps. Requires a prior stage_summon.',
        inputSchema: {
          apps: z.array(z.string()).optional()
            .describe('Optional app-name substrings to target; default is every window on stage'),
          say: z.string().optional().describe('A line for him to deliver once everything is lit'),
        },
        outputSchema: { verb: z.string(), targets: z.array(windowShape) },
      },
      async ({ apps, say }) => {
        if (!verbReady()) return notOnStage;
        const { windows } = listWindows();
        let targets = windows;
        if (apps && apps.length) {
          const pats = apps.map(a => a.toLowerCase());
          targets = windows.filter(w => pats.some(a => w.app.toLowerCase().includes(a)));
        }
        targets = targets.slice(0, 10);
        if (!targets.length) {
          const cast = [...new Set(windows.map(w => w.app))].join(', ');
          return { content: [{ type: 'text', text: `Nothing to hit. On stage right now: ${cast}.` }], isError: true };
        }
        brain.broadcast({ type: 'verb.lasers', targets, say: say || null });
        return {
          content: [{ type: 'text', text:
            `${targets.length} beam(s) incoming: ${targets.map(w => w.app).join(', ')}. ` +
            'Each window lights up as it is hit. Light only — no window receives any input.' + heardNote() }],
          structuredContent: { verb: 'lasers', targets },
        };
      }
    );

    server.registerTool(
      'stage_bubble',
      {
        title: 'Redress the bubble',
        description:
          'Rewrite the actor\'s speech-bubble UI: the headline, the body text, the chip buttons under it, ' +
          'and the input placeholder. Each chip needs a label; give it a `say` and the actor delivers that ' +
          'answer on click, omit `say` and the click is relayed to you via stage_listen instead. Use this ' +
          'to build a custom menu of questions, a guided tour, or CTAs for whatever scene you are running. ' +
          'Requires a prior stage_summon.',
        inputSchema: {
          lede: z.string().optional().describe('New bubble headline'),
          text: z.string().optional().describe('New bubble body text'),
          chips: z.array(z.object({
            label: z.string().describe('Button label'),
            say: z.string().optional().describe('Canned answer the actor speaks when clicked; omit to relay the click to the director'),
            lede: z.string().optional().describe('Optional headline shown with the canned answer'),
          })).max(6).optional().describe('Replacement chip buttons (max 6)'),
          placeholder: z.string().optional().describe('New placeholder for the free-text field'),
        },
        outputSchema: { verb: z.string() },
      },
      async ({ lede, text, chips, placeholder }) => {
        if (!verbReady()) return notOnStage;
        brain.broadcast({ type: 'verb.bubble', lede: lede || null, text: text || null, chips: chips || null, placeholder: placeholder || null });
        return {
          content: [{ type: 'text', text: 'The bubble is redressed.' + heardNote() }],
          structuredContent: { verb: 'bubble' },
        };
      }
    );

    server.registerTool(
      'stage_speak',
      {
        title: 'Speak through the actor',
        description:
          'Put your own words in the actor\'s speech bubble. This is how the director answers what ' +
          'stage_listen heard — the viewer types at the actor, you reply through him, and no separate ' +
          'API key is ever needed because you are the model. Keep it grounded: the body lends your ' +
          'words presence, not authority. Requires a prior stage_summon.',
        inputSchema: {
          say: z.string().describe('What the actor should say'),
          lede: z.string().optional().describe('Optional short opening line shown as the bubble headline'),
        },
        outputSchema: { verb: z.string() },
      },
      async ({ say, lede }) => {
        if (!verbReady()) return notOnStage;
        brain.broadcast({ type: 'verb.speak', say, lede: lede || null });
        return {
          content: [{ type: 'text', text: 'He is saying it now.' + heardNote() }],
          structuredContent: { verb: 'speak' },
        };
      }
    );

    server.registerTool(
      'stage_listen',
      {
        title: 'Hear the viewer',
        description:
          'Returns whatever the viewer has typed into the actor\'s speech bubble since you last listened. ' +
          'The corpus pipeline already answered them in-bubble; treat these as the viewer talking to YOU, ' +
          'the director — respond with stage directions or conversation. Empty when nothing was said.',
        inputSchema: {},
        outputSchema: { utterances: z.array(z.object({ text: z.string(), ts: z.number() })) },
      },
      async () => {
        if (!brain) return notOnStage;
        const utterances = brain.heard.splice(0, brain.heard.length);
        const text = utterances.length
          ? 'From the stage, in order:\n' + utterances.map(u => `- "${u.text}"`).join('\n')
          : 'Silence. Nothing new from the stage.';
        return { content: [{ type: 'text', text }], structuredContent: { utterances } };
      }
    );
  }

  return server;
}
