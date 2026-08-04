import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execSync } from 'node:child_process';
const SP = process.env.SP;
const t = new StdioClientTransport({ command: 'node', args: [new URL("../mcp/server.js", import.meta.url).pathname] });
const c = new Client({ name: 'desk-tour', version: '0.1' });
await c.connect(t);
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = n => execSync(`screencapture -x ${SP}/tour-${n}.png`);

const s = await c.callTool({ name: 'summon_billy', arguments: {} });
console.log('summon:', s.structuredContent?.mode);
await wait(13000); shot('1-seated');

const lw = await c.callTool({ name: 'list_windows', arguments: {} });
console.log(lw.content[0].text);

const p = await c.callTool({ name: 'stage_point', arguments: { app: 'postman', say: 'That request has been sitting untitled for a week. I am only pointing. Sending it is your job.' } });
console.log('point:', p.content[0].text);
await wait(6500); shot('2-point');

const st = await c.callTool({ name: 'stage_sit', arguments: { app: 'finder', title: 'downloads', say: 'I will wait up here. The window under me has no idea. Nothing I do registers as input.' } });
console.log('sit:', st.content[0].text);
await wait(6500); shot('3-sit');
await c.close();
process.exit(0);
