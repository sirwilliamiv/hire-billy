#!/usr/bin/env node
/* Hire Billy MCP server: interrogate the candidate from any MCP client.
   Same corpus, same nine stages as the browser UI. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runPipeline, formatAnswer, formatCard, CORPUS } from '../core/pipeline.js';

const server = new McpServer({ name: 'hire-billy', version: CORPUS.meta.version + '.0' });

server.tool(
  'ask_billy',
  'Interrogate the candidate. Ask anything: strengths, weaknesses, how he works, why not to hire him. ' +
  'Every answer is grounded in a signed corpus and returns a measured nine-stage trace. ' +
  'Unsourced superlatives are struck in view; flattery is structurally impossible.',
  { question: z.string().describe('The question to put to the candidate') },
  async ({ question }) => {
    const r = await runPipeline(question);
    return { content: [{ type: 'text', text: formatAnswer(r) }] };
  }
);

server.tool(
  'get_model_card',
  'Read the candidate\'s model card: overview, how he works, reported strengths, known limitations, ' +
  'evidence, scope. Limitations ship in the same corpus as strengths, retrieved by the same machinery.',
  { section: z.string().optional().describe('Optional section id: overview, how-i-work, strengths, limitations, evidence, scope') },
  async ({ section }) => {
    return { content: [{ type: 'text', text: formatCard(section) }] };
  }
);

await server.connect(new StdioServerTransport());
