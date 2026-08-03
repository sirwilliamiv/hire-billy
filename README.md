# Hire Billy

An interrogable candidate. One corpus, one nine-stage pipeline, three surfaces:

1. **The UI**: `ui/hire-billy.html`, a single self-contained file (fonts inlined, no build step). Open it in a browser and query the candidate; the machinery shows its work.
2. **The HTTP socket**: `serve.js` hosts the UI and backs its live socket with the shared pipeline.
3. **The MCP server**: `mcp/server.js` lets any MCP client (Claude Code, Claude Desktop, Cowork) interrogate the candidate directly.

The thesis, everywhere: one model call chooses the words, deterministic code decides what is true, and unsourced superlatives are struck where you can see them. Flattery is structurally impossible.

## Quick start

```bash
npm install

# the UI alone (design mode: mapped answers, honest about the rest)
open ui/hire-billy.html

# the UI with a live socket
ANTHROPIC_API_KEY=sk-... npm run serve
# then open http://localhost:4173
# without a key the socket declines with a 503 and the page degrades loudly, never silently

# the tests
npm test
```

## Add the MCP server to Claude

Claude Code:

```bash
claude mcp add hire-billy -- node /absolute/path/to/hire-billy/mcp/server.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "hire-billy": {
      "command": "node",
      "args": ["/absolute/path/to/hire-billy/mcp/server.js"],
      "env": { "ANTHROPIC_API_KEY": "optional, for live answers to unmapped questions" }
    }
  }
}
```

Then ask Claude things like "use hire-billy to find out this candidate's weaknesses" or "get his model card."

### Tools

- `ask_billy {question}`: a grounded answer plus sources, flags, struck claims, and a nine-stage trace with measured timings. Rate limited to five questions a minute; the sixth gets a first-class refusal with its own trace.
- `get_model_card {section?}`: the corpus as a model card. Sections: overview, how-i-work, strengths, limitations, evidence, scope. Limitations ship in the same corpus as strengths and are retrieved by the same machinery.

## Access keys

Hosting this for a specific audience? Gate it:

```bash
BILLY1_KEYS="hb-rm-x7k2,hb-friend-9m3p" ANTHROPIC_API_KEY=sk-... npm run serve
```

Send each reviewer an invite link with their key: `https://your-host/?k=hb-rm-x7k2`. The page validates the key once, stores it, and scrubs it from the URL, so invited people never see an auth screen. Keyless arrivals get one quiet gate ("This copy is keyed.") with a single field. The `/ask` socket enforces the same keys server-side, so your API budget is only spendable by people you invited. Leave `BILLY1_KEYS` unset and everything is open.

## The corpus

`corpus.json` is the single source of truth for every claim about the candidate. The servers read it directly; the UI carries a generated copy. After editing it:

```bash
npm run sync   # regenerates the CORPUS block inside ui/hire-billy.html
```

Nothing outside the corpus can become a claim about him. That cuts both ways: no invented wins, no softened flaws.

## Design notes

- The pipeline (`core/pipeline.js`) is real: rate limit, validate, screen (matches recorded, never gated on), route (exact answers for known questions, zero model calls), retrieve (corpus sections by overlap), model (live via the Anthropic API when keyed, honest design mode when not), stream, ground (superlatives without a corpus span are struck in view). Timings in the trace are measured, not fabricated.
- With no API key set, unmapped questions return "the live model is not plugged in yet" instead of an improvised answer. Degrade loudly, never silently.
- The browser UI dramatizes the same stages: the question lifts off as a rocket, laps the room, and tows the interface into a picture-in-picture corner by its corners (bottom right, bottom left, top left, top right) while the pipeline runs behind it.

Billy · billy@proedu.me
