# eap-stage

The reference implementation of the [Embodied Agent Protocol](https://github.com/sirwilliamiv/embodied-agent-protocol). MCP gives an agent context; EAP gives it a body — and this repo is the body: an MCP server whose tools are stage directions, and a macOS desktop overlay where the actor lives.

**The one rule: the actor never clicks.** The overlay is click-through by construction. He points, sits, speaks, lights things up, and even rearranges windows — and no click, keystroke, or event of any kind ever enters the apps he visits.

## Quick start

```bash
npm install
bash overlay-native/build.sh   # builds the Swift overlay runtime (macOS)
npm test
```

Add the MCP server to a local client:

```bash
# Claude Code
claude mcp add eap-stage -- node /absolute/path/to/eap-stage/mcp/server.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "eap-stage": {
      "command": "node",
      "args": ["/absolute/path/to/eap-stage/mcp/server.js"]
    }
  }
}
```

Then, in a fresh chat: *"Summon the actor, light up every window, move Chrome to the right half, and sit on it."* Approving the summon tool call is the consent gate — the door does not open without it.

## The verbs

| Tool | What happens on screen |
|---|---|
| `stage_summon` | A door opens on the desktop, rain falls inside it, and the actor walks out and sits on the Claude window. On surfaces with no desktop (mobile, web, remote connectors) the entrance renders as an in-chat card instead; the remote transport can never reach the spawn path. |
| `list_windows` | Surveys the ordinary windows on the primary display: app, title where available, screen bounds. Geometry only — no pixels, no content. |
| `stage_point` | He walks to a real window, draws a wand, and points; the window lights up with a spotlight outline. |
| `stage_lasers` | He raises a finger and fires a beam at every open window in turn; each hit lands as a persistent spotlight until the whole stage is lit. |
| `stage_move` | Wand out, spotlight on, and the window glides to a new position (Accessibility API). Stage arrangement, not actuation — the frame moves, nothing inside it receives input. |
| `stage_sit` | He sits on a window's top edge, feet dangling over someone else's title bar. |
| `stage_speak` | The director's own words in his speech bubble — you are the model, so no API key is needed anywhere. |
| `stage_bubble` | Rewrites his bubble UI live: headline, body, chip buttons (canned answers or relay-to-director), input placeholder. |
| `stage_listen` | Returns whatever the viewer typed at the actor since you last listened. The talk-back channel. |

Every verb refuses politely until he has been summoned. Stage directions without a body are just strongly worded opinions.

## The loop

The viewer types into the actor's bubble → `stage_listen` delivers it to the director → the director answers through `stage_speak` or with an action. The model already driving the MCP session is the brain; there is no separate key, no separate service.

## Architecture

- `mcp/factory.js` — one server definition for both the stdio entry (`mcp/server.js`) and the Streamable HTTP endpoint (`serve.js`, `POST /mcp`). Local stdio gets the full verb set; remote transports get `stage_summon` only, which always falls back to the in-chat card.
- `overlay-native/` — a Swift shell: transparent, always-on-top, click-through WKWebView pinned to the primary display. `--list-windows` surveys the window server; `--ax-check` reports Accessibility trust; window moves are eased AX position updates.
- `overlay/overlay.html` — the choreography: door, rain, walk cycle, seat, wand, spotlights, beam engine, bubble. Talks to its owning server through a token-gated loopback "brain" (per-launch token, localhost only).
- The brain also hosts the crossing: the ✕ on the bubble opens a browser stage page, and the actor walks off the desktop into it with a same-frame handoff. An actor whose summoning session has exited notices within three missed heartbeats and sees himself out.

`scripts/desk-tour.mjs` drives a full tour over stdio for filming.

## Status

Tracks EAP 0.1-draft: summon, point, speak, and the crossing are implemented; move, lasers, bubble, and listen are implementation experience feeding the 0.2 spec. macOS only for now — a second platform is exactly the kind of independent implementation the spec is waiting on.
