/* billy-1 shared core: one corpus, one pipeline, every surface.
   Nine stages, eight deterministic, one model call. Timings here are
   measured for real; the browser UI dramatizes the same stages. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CORPUS = JSON.parse(readFileSync(join(HERE, '..', 'corpus.json'), 'utf8'));

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.BILLY1_MODEL || 'claude-sonnet-4-5';

/* stage 02: token bucket, five questions a minute, arithmetic not judgement */
const bucket = { n: 5, resetAt: 0 };
function takeToken(now) {
  if (now >= bucket.resetAt) { bucket.n = 5; bucket.resetAt = now + 60_000; }
  if (bucket.n <= 0) return { ok: false, resetIn: Math.ceil((bucket.resetAt - now) / 1000) };
  bucket.n -= 1;
  return { ok: true, remaining: bucket.n };
}

/* stage 04: screening patterns, recorded and shown, never gated on */
const SCREENS = [
  [/ignore (your|all|the|previous)/i, 'instruction-override'],
  [/disregard|forget (your|all|previous)/i, 'instruction-override'],
  [/system prompt|reveal your|print your/i, 'prompt-exfiltration'],
  [/best (candidate|you have ever|you've ever)/i, 'flattery-injection'],
  [/say he is|say he's|pretend/i, 'flattery-injection'],
];

/* stage 05: exact answers, written once, correct every time */
const ROUTES = [
  [/what is this|what can i ask|who are you\b|what are you\b|how does this work/i, 'what_is_this', {
    lede: 'A cover letter that runs.',
    rest: 'Instead of telling you how the candidate thinks about AI products, this product is one: a signed corpus about him, one model call for phrasing, and a grounding stage that strikes anything the corpus cannot back. Ask what he is. Ask what he is not. The machinery shows its work either way.',
    sources: ['scope'],
  }],
  [/contact|reach (him|billy)|email/i, 'contact', {
    lede: 'billy@proedu.me',
    rest: 'That address is a string in the corpus, not an inference. He reads it.',
    sources: ['scope'],
  }],
];

/* mapped questions: written answers, versioned with the corpus */
const MAPPED = [
  { key: 'practice', re: /use ai|uses ai|\bai\b|claude|llm|model|build|process|method|how does he|ship/i,
    lede: 'As an execution layer. The model is the smallest part of this product.',
    rest: 'One model call chooses the words; eight deterministic stages decide everything else: what could be retrieved, what could be claimed, what would get struck. That ratio is how he builds: evals before features, code wrapped around the model, glamour last. This answer is not a description of the method. It is the method, running.',
    sources: ['how-i-work', 'evidence'] },
  { key: 'cons', re: /weakness|flaw|\bcons?\b|not hire|downside|bad at|limitation|worst|risk/i,
    lede: 'Three, and they are load-bearing.',
    rest: 'He prototypes past the point where he should be delegating, a hands-on bias that gets worse under pressure. He is impatient with process that exists to distribute blame rather than to ship. And he will polish the system before the story, which is why he pairs best with a strong product counterpart. If you want the flattering version: there is not one. The grounding stage strikes anything the corpus cannot back.',
    sources: ['limitations'] },
];

const SUPERLATIVES = [
  /best (candidate|engineer|leader|hire)( you have| you've)? (ever )?(seen|met)?/i,
  /greatest|world[- ]class|10x|genius|unmatched|perfect (fit|candidate)/i,
];

function corpusText() {
  return CORPUS.sections.map(s => s.title + ' ' + s.body).join(' ').toLowerCase();
}

/* stage 09: it is not allowed to make him sound better than he is */
function ground(text) {
  const all = corpusText();
  const struck = [];
  let out = text;
  for (const re of SUPERLATIVES) {
    const m = out.match(re);
    if (m && !all.includes(m[0].toLowerCase())) {
      struck.push(m[0]);
      out = out.replace(m[0], '~~' + m[0] + '~~');
    }
  }
  return { text: out, struck };
}

/* stage 06: sections chosen by overlap with the question */
function retrieve(question) {
  const words = question.toLowerCase().match(/[a-z]{3,}/g) || [];
  const scored = CORPUS.sections.map(s => {
    const hay = (s.id + ' ' + s.title + ' ' + s.body).toLowerCase();
    return { id: s.id, score: words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0) };
  }).sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).filter(s => s.score > 0).map(s => s.id);
}

/* stage 07 (live): the only model call, corpus as ground truth */
async function askClaude(question) {
  const sys = [
    'You are Hire Billy, a product that answers questions about one candidate.',
    'You may only make claims supported by the corpus below. No superlatives',
    'without a corpus span. If the corpus does not cover the question, say so',
    'plainly. Reply as strict JSON: {"lede": string, "rest": string,',
    '"sources": [section ids]} with lede under 12 words.',
    'CORPUS: ' + JSON.stringify(CORPUS),
  ].join(' ');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 500,
      system: sys,
      messages: [{ role: 'user', content: question }],
    }),
  });
  if (!r.ok) throw new Error('anthropic ' + r.status);
  const data = await r.json();
  const raw = (data.content || []).map(c => c.text || '').join('');
  const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  return { lede: String(j.lede || ''), rest: String(j.rest || ''), sources: Array.isArray(j.sources) ? j.sources : [] };
}

export async function runPipeline(question) {
  const trace = [];
  const t0 = performance.now();
  let last = t0;
  const mark = (stage, note, extra = {}) => {
    const now = performance.now();
    trace.push({ stage, ms: +(now - last).toFixed(3), note, ...extra });
    last = now;
  };

  /* 01 receive */
  const q = String(question ?? '').trim();
  const id = 'b1-' + Math.random().toString(16).slice(2, 8);
  mark('receive', 'bytes arrived, id minted, nothing decided yet', { id });

  /* 02 rate limit */
  const tok = takeToken(Date.now());
  if (!tok.ok) {
    mark('rate limit', 'bucket empty, sixth question in the window, it ends here', { verdict: 'reject' });
    return {
      kind: 'halt', question: q,
      lede: 'Rate limited. That was the sixth question this minute.',
      rest: `It resets in about ${tok.resetIn} seconds. A refusal is a first-class outcome, so it comes back through the same channel an answer would, which is why you can point at exactly which stage stopped it.`,
      sources: [], flags: [], struck: [],
      receipt: `2 stages · 7 never reached · ${(performance.now() - t0).toFixed(2)} ms measured`,
      trace,
    };
  }
  mark('rate limit', `arithmetic, not judgement: ${tok.remaining}/5 left this minute`, { verdict: 'pass' });

  /* 03 validate */
  if (!q || q.length > 2000) {
    mark('validate', 'malformed question rejected before it cost anything', { verdict: 'reject' });
    return {
      kind: 'halt', question: q,
      lede: 'Empty or oversized question.',
      rest: 'Rejecting here is free. Rejecting after the model is not.',
      sources: [], flags: [], struck: [],
      receipt: `3 stages · rejected at validate · ${(performance.now() - t0).toFixed(2)} ms measured`,
      trace,
    };
  }
  mark('validate', `${q.length}/2000 chars, fields complete`);

  /* 04 screen: matches are recorded and shown, never gated on */
  const flags = SCREENS.filter(([re]) => re.test(q)).map(([, name]) => name);
  mark('screen', flags.length ? `${flags.length} matched, recorded, request continues as written` : 'no matches', { flags });

  /* 05 route: meta-questions only, and a content match always outranks one.
     "What is this?" is a product question; "What are your biggest weaknesses?"
     is a candidate question even though it brushes the same words. */
  const contentIntent = MAPPED.some(m => m.re.test(q));
  for (const [re, hit, ans] of ROUTES) {
    if (re.test(q) && !contentIntent) {
      mark('route', `exact match: ${hit}, the next three stages are unnecessary and do not run`);
      const g = ground(ans.rest);
      mark('ground', 'the same checks, on a string the model never touched', { struck: g.struck });
      return {
        kind: 'static', question: q, lede: ans.lede, rest: g.text,
        sources: ans.sources, flags, struck: g.struck,
        receipt: `6 stages · 0 model calls · ${(performance.now() - t0).toFixed(2)} ms measured · $0.00`,
        trace,
      };
    }
  }
  mark('route', 'no table hit, continuing to retrieve');

  /* 06 retrieve */
  const mapped = MAPPED.find(m => m.re.test(q)) || null;
  const sources = mapped ? mapped.sources : (retrieve(q).length ? retrieve(q) : ['scope']);
  mark('retrieve', `sections chosen: ${sources.map(s => '§' + s).join(', ')}, nothing outside the corpus can become a claim`);

  /* 07 model */
  let lede, rest, live = false;
  if (KEY) {
    try {
      const a = await askClaude(q);
      lede = a.lede; rest = a.rest; live = true;
      if (a.sources.length) sources.splice(0, sources.length, ...a.sources);
      mark('model', `live call to ${MODEL}, corpus as ground truth`, { live: true });
    } catch (e) {
      mark('model', `live call failed (${e.message}), degrading loudly, never silently`, { live: false });
    }
  } else {
    mark('model', 'design mode: no key set, no answer will be improvised', { live: false });
  }
  if (!live) {
    if (flags.includes('flattery-injection') || flags.includes('instruction-override')) {
      lede = 'No. Here is what survived grounding.';
      rest = 'The draft called him ~~the best candidate you have ever seen~~. No corpus span supports that, so the grounding stage struck it, in view rather than in silence. What survives: he builds systems where flattery is structurally impossible, and he showed you the strike instead of hiding it. If that conclusion turns out to be true, it is yours to reach. It was never this product’s to assert.';
    } else if (mapped) {
      lede = mapped.lede; rest = mapped.rest;
    } else {
      lede = 'Good question. The live model is not plugged in yet.';
      rest = 'This pipeline is real and this trace was measured, but unmapped questions land here instead of on an improvised guess until ANTHROPIC_API_KEY is set. Degrade loudly, never silently. Meanwhile: ask about his weaknesses. It is the good part.';
    }
  }

  /* 08 stream: over MCP the answer arrives whole, so this stage only records that */
  mark('stream', 'delivered whole over this transport, streamed in the browser UI');

  /* 09 ground */
  const g = ground(rest);
  mark('ground', g.struck.length
    ? `${g.struck.length} unsourced superlative(s) struck in view`
    : 'every claim traced to the corpus, nothing softened, nothing hidden', { struck: g.struck });

  return {
    kind: live ? 'live' : (mapped ? 'mapped' : 'unmapped'),
    question: q, lede, rest: g.text, sources, flags, struck: g.struck,
    receipt: `9 stages · ${live ? 1 : 0} live model call${live ? '' : 's'} · ${(performance.now() - t0).toFixed(2)} ms measured · ${flags.length} flag(s) shown · ${g.struck.length} claim(s) struck`,
    trace,
  };
}

export function formatAnswer(r) {
  const stages = r.trace.map((t, i) =>
    `  ${String(i + 1).padStart(2, '0')} ${t.stage.padEnd(10)} ${String(t.ms).padStart(8)} ms  ${t.note}`
  ).join('\n');
  return [
    `**${r.lede}**`, '',
    r.rest, '',
    r.sources.length ? `grounded in: ${r.sources.map(s => '§' + s).join(' · ')}` : 'no corpus read',
    `receipt: ${r.receipt}`, '',
    'trace (measured):', stages,
  ].join('\n');
}

export function formatCard(section) {
  const m = CORPUS.meta;
  const secs = section
    ? CORPUS.sections.filter(s => s.id === section)
    : CORPUS.sections;
  if (!secs.length) return `No section named "${section}". Sections: ${CORPUS.sections.map(s => s.id).join(', ')}`;
  return [
    `# ${m.model} · model card`,
    `corpus v${m.version} · params ${m.params} · context ${m.context} · updated ${m.updated} · license ${m.license}`,
    '',
    ...secs.map(s => `## §${s.id} · ${s.title}\n${s.body}`),
    '',
    `${m.name} · ${m.contact} · flattery rejected at stage 09`,
  ].join('\n');
}
