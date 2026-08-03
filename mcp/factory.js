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
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runPipeline, formatAnswer, formatCard, CORPUS } from '../core/pipeline.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WIDGET_URI = 'ui://hire-billy/panel';
const WIDGET_HTML = readFileSync(join(HERE, '..', 'ui', 'widget.html'), 'utf8');

const UI_META = {
  ui: { resourceUri: WIDGET_URI },
  'openai/outputTemplate': WIDGET_URI,
  'openai/toolInvocation/invoking': 'Interrogating the candidate…',
  'openai/toolInvocation/invoked': 'Answer grounded against the corpus',
};

const traceShape = z.object({
  stage: z.string(),
  ms: z.number(),
  note: z.string(),
}).passthrough();

export function buildServer() {
  const server = new McpServer({ name: 'hire-billy', version: CORPUS.meta.version + '.0' });

  server.registerTool(
    'ask_billy',
    {
      title: 'Ask Billy',
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
      title: 'Get the model card',
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

  return server;
}
