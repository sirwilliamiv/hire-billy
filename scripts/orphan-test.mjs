import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const t = new StdioClientTransport({ command: 'node', args: [new URL('../mcp/server.js', import.meta.url).pathname] });
const c = new Client({ name: 'orphan-test', version: '0.1' });
await c.connect(t);
await c.callTool({ name: 'stage_summon', arguments: {} });
await c.close();
process.exit(0); // server dies now; the overlay is an orphan with a dead brain
