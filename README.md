# The Candidate

An interrogable candidate. One corpus, one nine-stage pipeline, three surfaces:

1. **The UI**: `ui/candidate.html`, a single self-contained file (fonts inlined, no build step). Open it in a browser and query the candidate; the machinery shows its work.
2. **The HTTP socket**: `serve.js` hosts the UI and backs its live socket with the shared pipeline.
3. **The MCP server**: `mcp/server.js` lets any MCP client (Claude Code, Claude Desktop, Cowork) interrogate the candidate directly.

The thesis, everywhere: one model call chooses the words, deterministic code decides what is true, and unsourced superlatives are struck where you can see them. Flattery is structurally impossible.

## Quick start

```bash
npm install

# the UI alone (design mode: mapped answers, honest about the rest)
open ui/candidate.html

# the UI with a live socket
ANTHROPIC_API_KEY=sk-... npm run serve
# then open http://localhost:4173
# without a key the socket declines with a 503 and the page degrades loudly, never silently

# the tests
npm test
```

## Add the MCP server to Claude or ChatGPT

**Deployed (what you send an employer)**: `serve.js` exposes the same server over Streamable HTTP at `/mcp`. One URL, no install:

- **claude.ai / Claude Desktop**: Settings → Connectors → Add custom connector → `https://your-host/mcp` (no auth). Paid plans render the inline interrogation panel; asking a question opens the widget with the answer, struck claims, sources, and the measured trace.
- **ChatGPT**: Settings → Apps & Connectors → enable Developer mode → Create → paste `https://your-host/mcp`. The widget renders via the Apps SDK (the server declares both the standard `_meta.ui.resourceUri` and the legacy `openai/outputTemplate`).
- **Claude Code**: `claude mcp add --transport http eap-stage https://your-host/mcp` — terminal has no widget surface, so answers arrive as formatted text with the same trace.

Over the connector, `stage_summon` always renders the in-chat card: a remote server has no business spawning a window, and on a phone or a browser tab there is no desktop to spawn it on.

The `/mcp` endpoint is deliberately keyless (connector UIs have no good place for a shared secret); cost is contained by the pipeline's rate limit and a spend-capped API key. The browser UI's `STAGE_KEYS` gating is unchanged and separate.

**Local (stdio)**:

Claude Code:

```bash
claude mcp add eap-stage -- node /absolute/path/to/eap-stage/mcp/server.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "eap-stage": {
      "command": "node",
      "args": ["/absolute/path/to/eap-stage/mcp/server.js"],
      "env": { "ANTHROPIC_API_KEY": "optional, for live answers to unmapped questions" }
    }
  }
}
```

Then ask Claude things like "use eap-stage to find out this candidate's weaknesses" or "get his model card."

### Tools

- `ask_candidate {question}`: a grounded answer plus sources, flags, struck claims, and a nine-stage trace with measured timings. Rate limited to five questions a minute; the sixth gets a first-class refusal with its own trace.
- `get_model_card {section?}`: the corpus as a model card. Sections: overview, how-i-work, strengths, limitations, evidence, scope. Limitations ship in the same corpus as strengths and are retrieved by the same machinery.
- `stage_summon {platform?}`: he walks in, sits down, and talks. The surface is detected: a **local stdio client on macOS with an overlay runtime built** gets the real thing — a transparent click-through overlay where he walks across the desktop and sits on the Claude window. Every other surface (mobile, web, Cowork, the remote connector) gets the same entrance as an inline card in the message, drawn from the same sprites, with the ask box wired back to `ask_candidate`. Pass `platform: "inline"` or `"desktop"` to override; a forced `desktop` that cannot be honoured says why and falls back to the card. The remote transport can never reach the spawn path.

### The Desk Tour verbs (local macOS only)

Once `stage_summon` has put him on the desktop, three more tools appear on local stdio servers and turn the overlay into an EAP stage:

- `list_windows`: surveys the ordinary windows on the primary display — owning app, title where available, screen bounds. Geometry only, no pixels, no content. Windows on other displays are off the stage and are not offered.
- `stage_point {app, title?, say?}`: he walks across the desktop to a real window and points at it, optionally delivering a line. He indicates; the human acts.
- `stage_sit {app, title?, say?}`: he walks to a real window and sits down on its top edge, feet dangling over someone else's title bar.

All three refuse politely until he has been summoned — the summon tool's approval is the consent gate. And the one rule holds by construction: the overlay is click-through, so the actor never clicks. Nothing he does registers as input to the windows he visits.

`scripts/desk-tour.mjs` drives the whole tour over stdio for filming: summon, survey, point, sit, with a screenshot after each beat (`SP=/tmp node scripts/desk-tour.mjs`).

### The summon card

`ui/summon.html` is generated — edit `ui/summon.tpl.html` and run `npm run build:summon`, which inlines the overlay's own sprites and fonts as data URIs so the card is self-contained (hosts render it in a sandboxed iframe with no network). Preview both states without a client:

```bash
npm run serve
# then open http://localhost:4173/dev/host and use the summon buttons,
# or http://localhost:4173/summon?mode=inline (or ?mode=desktop) directly
```

## Access keys

Hosting this for a specific audience? Gate it:

```bash
STAGE_KEYS="hb-rm-x7k2,hb-friend-9m3p" ANTHROPIC_API_KEY=sk-... npm run serve
```

Send each reviewer an invite link with their key: `https://your-host/?k=hb-rm-x7k2`. The page validates the key once, stores it, and scrubs it from the URL, so invited people never see an auth screen. Keyless arrivals get one quiet gate ("This copy is keyed.") with a single field. The `/ask` socket enforces the same keys server-side, so your API budget is only spendable by people you invited. Leave `STAGE_KEYS` unset and everything is open.

## The corpus

`corpus.json` is the single source of truth for every claim about the candidate. The servers read it directly; the UI carries a generated copy. After editing it:

```bash
npm run sync   # regenerates the CORPUS block inside ui/candidate.html
```

Nothing outside the corpus can become a claim about him. That cuts both ways: no invented wins, no softened flaws.

## Design notes

- The pipeline (`core/pipeline.js`) is real: rate limit, validate, screen (matches recorded, never gated on), route (exact answers for known questions, zero model calls), retrieve (corpus sections by overlap), model (live via the Anthropic API when keyed, honest design mode when not), stream, ground (superlatives without a corpus span are struck in view). Timings in the trace are measured, not fabricated.
- With no API key set, unmapped questions return "the live model is not plugged in yet" instead of an improvised answer. Degrade loudly, never silently.
- The browser UI dramatizes the same stages: the question lifts off as a rocket, laps the room, and tows the interface into a picture-in-picture corner by its corners (bottom right, bottom left, top left, top right) while the pipeline runs behind it.

