import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execSync } from 'node:child_process';
const SP = process.env.SP;
const t = new StdioClientTransport({ command: 'node', args: [new URL('../mcp/server.js', import.meta.url).pathname] });
const c = new Client({ name: 'wand-test', version: '0.1' });
await c.connect(t);
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = n => execSync(`screencapture -x ${SP}/wand-${n}.png`);

await c.callTool({ name: 'stage_summon', arguments: {} });
await wait(12500);

const lw = await c.callTool({ name: 'list_windows', arguments: {} });
const slack = lw.structuredContent.windows.find(w => w.app === 'Slack');
console.log('slack before:', JSON.stringify(slack));

await c.callTool({ name: 'stage_point', arguments: { app: 'slack', say: 'This one. Watch it.' } });
await wait(5500); shot('1-point');

const mv = await c.callTool({ name: 'stage_move', arguments: { app: 'slack', x: 260, y: 420, say: 'Rearranged. Nothing inside it felt a thing.' } });
console.log('move:', mv.content[0].text);
await wait(5000); shot('2-moved');

const lw2 = await c.callTool({ name: 'list_windows', arguments: {} });
console.log('slack after:', JSON.stringify(lw2.structuredContent.windows.find(w => w.app === 'Slack')));
await c.close();
process.exit(0);
