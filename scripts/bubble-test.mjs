import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execSync } from 'node:child_process';
const t = new StdioClientTransport({ command: 'node', args: [new URL('../mcp/server.js', import.meta.url).pathname] });
const c = new Client({ name: 'bubble-test', version: '0.1' });
await c.connect(t);
const wait = ms => new Promise(r => setTimeout(r, ms));
await c.callTool({ name: 'stage_summon', arguments: {} });
await wait(12500);
const r = await c.callTool({ name: 'stage_bubble', arguments: {
  lede: 'The director redecorated.',
  text: 'Everything in this bubble — headline, body, these buttons, even the placeholder below — was just rewritten live by a tool call. The buttons are mine now.',
  placeholder: 'type here and the director will hear it',
  chips: [
    { label: 'What is EAP?', say: 'An open protocol for embodied agents: summoned by consent, pointing at real windows, never clicking. The spec lives at github.com/sirwilliamiv/embodied-agent-protocol.' },
    { label: 'Show me the never-click rule', say: 'Section 8, normative: no clicks, no keystrokes, no actuation. The overlay is click-through by construction, so I could not click even if I wanted to.' },
    { label: 'Ask the director something', },
  ] } });
console.log(r.content[0].text);
await wait(2500);
execSync(`screencapture -x ${process.env.SP}/bubble-redressed.png`);
await c.close(); process.exit(0);
