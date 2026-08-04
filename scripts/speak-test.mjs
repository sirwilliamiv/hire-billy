import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execSync } from 'node:child_process';
const t = new StdioClientTransport({ command: 'node', args: ['/Users/b/Desktop/code/eap-stage/mcp/server.js'] });
const c = new Client({ name: 'speak-test', version: '0.1' });
await c.connect(t);
const wait = ms => new Promise(r => setTimeout(r, ms));
await c.callTool({ name: 'stage_summon', arguments: {} });
await wait(12500);
const r = await c.callTool({ name: 'stage_speak', arguments: {
  lede: 'The director is on the line.',
  say: 'These words came from the model you are chatting with, not from a corpus and not from an API key. You typed at the body; the director answered through it.' } });
console.log(r.content[0].text);
await wait(2500);
execSync(`screencapture -x ${process.env.SP}/speak.png`);
await c.close(); process.exit(0);
