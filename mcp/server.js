#!/usr/bin/env node
/* The Candidate MCP server, stdio entry: interrogate the candidate from any
   local MCP client (claude mcp add eap-stage -- node mcp/server.js).
   The deployed Streamable HTTP endpoint lives in serve.js (POST /mcp);
   both build the same server from mcp/factory.js. */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './factory.js';

await buildServer({ local: true }).connect(new StdioServerTransport());
