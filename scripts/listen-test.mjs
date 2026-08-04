import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execSync } from 'node:child_process';
const SP = process.env.SP;
const t = new StdioClientTransport({ command: 'node', args: [new URL('../mcp/server.js', import.meta.url).pathname] });
const c = new Client({ name: 'listen-test', version: '0.1' });
await c.connect(t);
const wait = ms => new Promise(r => setTimeout(r, ms));

await c.callTool({ name: 'stage_summon', arguments: {} });
await wait(12500);
execSync(`screencapture -x ${SP}/bubble-input.png`);
const empty = await c.callTool({ name: 'stage_listen', arguments: {} });
console.log('listen (empty):', empty.content[0].text);

// simulate the viewer typing: click one of the bubble chips via AppleScript click-at
// (chips route through askActor -> heardPost, same path as the text field)
const shot = `${SP}/bubble-input.png`;
console.log('shot saved:', shot);
await c.close();
process.exit(0);
