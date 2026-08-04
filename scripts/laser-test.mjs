import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execSync } from 'node:child_process';
const SP = process.env.SP;
const t = new StdioClientTransport({ command: 'node', args: [new URL('../mcp/server.js', import.meta.url).pathname] });
const c = new Client({ name: 'laser-test', version: '0.1' });
await c.connect(t);
const wait = ms => new Promise(r => setTimeout(r, ms));

await c.callTool({ name: 'stage_summon', arguments: {} });
await wait(12500);
const r = await c.callTool({ name: 'stage_lasers', arguments: {} });
console.log(r.content[0].text);
await wait(4200); execSync(`screencapture -x ${SP}/lasers-mid.png`);
await wait(2200); execSync(`screencapture -x ${SP}/lasers-lit.png`);
await c.close();
process.exit(0);
