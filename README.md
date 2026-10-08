# Wireflow Skills for Claude Code

Image, video and product photo skills for Claude Code and Claude. Each skill does the thinking in Claude (prompt, shot plan, scene choice, cost quote) and runs the generation as a published Wireflow app over the Wireflow MCP connector. Nothing is spent until you say yes.

| Skill | What it does | Model in its app | Credits per run | Example |
|---|---|---|---|---|
| [ai-image-generation](skills/ai-image-generation/) | Text to image in any common aspect ratio, with a proper prompt written for you | Flux Pro Ultra | 19 | [Lisbon bicycle](skills/ai-image-generation/examples/EXAMPLES.md) |
| [ai-video-generation](skills/ai-video-generation/) | Text or start image to a 5 second 16:9 clip, shot planned first | MiniMax Hailuo 03 Max Turbo | about 40 | [Paper boat](skills/ai-video-generation/examples/EXAMPLES.md) |
| [product-photography](skills/product-photography/) | One product photo to white background, lifestyle, in-hand, flat lay and more | Nano Banana Lite | 16 | [Candle jar](skills/product-photography/examples/EXAMPLES.md) |
| [Wireflow builder skill](https://github.com/wireflowINC/wireflow-skill) (advanced, API) | Build and run your own Wireflow workflows from Claude with an API key | Any | Varies | Separate repo |

Prices are Wireflow credits checked on 8 October 2026 (1 credit = US$0.01).

| ai-image-generation | ai-video-generation | product-photography |
|---|---|---|
| ![Red bicycle against a blue tiled wall](skills/ai-image-generation/examples/lisbon-bicycle-16x9.jpg) | [![Paper boat on a neon puddle, click to play](skills/ai-video-generation/examples/paper-boat-poster.jpg)](https://cdn.wireflow.ai/e95405b0-c2ab-11f1-81b3-8fc0dc6bd2a6.mp4) | ![Candle jar in a flat lay](skills/product-photography/examples/candle-flat-lay.jpg) |

All three are real outputs from the skills' Wireflow apps, 8 October 2026.

## Install

### Claude Code plugin (all skills plus the Wireflow connector)

```text
/plugin marketplace add {{OWNER}}/skills
/plugin install wireflow-skills@wireflow
```

Then run `/mcp`, choose `wireflow` and sign in with your Wireflow account. Skills show up as `/wireflow-skills:ai-image-generation` and so on, and Claude also picks them up from plain requests.

### skills CLI (Claude Code, Cursor, Codex, Gemini CLI and more)

```bash
npx skills add {{OWNER}}/skills                                 # choose skills interactively
npx skills add {{OWNER}}/skills --skill ai-image-generation     # one skill
```

### Manual

Copy any folder under `skills/` into `~/.claude/skills/` (all projects) or `.claude/skills/` (one project).

### Connect Wireflow (CLI and manual installs)

```bash
claude mcp add --transport http wireflow https://www.wireflow.ai/api/mcp
```

Then `/mcp` to sign in. In Claude.ai or Claude Desktop, add `https://www.wireflow.ai/api/mcp` as a custom connector. The connector uses OAuth, so there is no API key to copy. Details: [Wireflow MCP connector docs](https://www.wireflow.ai/docs/mcp?ref=skill-wireflow-skills&utm_source=github&utm_medium=skill&utm_campaign=wireflow-skills).

## How every skill behaves

1. Checks that the Wireflow tools are connected. If not, it explains how to connect and still gives you a free prompt pack.
2. Plans locally: prompts, ratios, shots or scenes.
3. Shows the plan, the credit cost and your balance, and waits for your yes.
4. Calls `run_app` on its own Wireflow app, polls `get_execution`, saves results to `./wireflow-outputs/<date>/`.
5. Checks the results, reports the credits used, and offers the editable Wireflow board.

Every retry or extra variation needs a new yes.

## Pricing, plainly

Wireflow's Free plan lets you build and browse, and your first image is free when you finish setup. Running these skills after that needs a paid Wireflow plan, from US$24 a month for 1,600 credits. Credits are spent on your own account; the skills never use anyone else's.

## What these skills send and fetch

- Prompts, scene text and image URLs you provide go to Wireflow through the Wireflow MCP connector, signed in as you.
- They read your Wireflow credit balance and run status.
- They download finished files from `cdn.wireflow.ai` into `./wireflow-outputs/`.
- No API keys, no install scripts, no other services. The `scripts/` folder holds repository checks only; the skills never run it.

## For contributors

```bash
node scripts/lint-skills.mjs            # name, description, length, link tags, secrets, similarity
node scripts/lint-skills.mjs --release  # also fails while the GitHub owner placeholder is still present
claude plugin validate .
```

New skills follow the same shape: `skills/<name>/SKILL.md`, `README.md`, `skill.json` (app slug and workflow id), `reference/` and `examples/` with real outputs only.

Powered by [Wireflow, the node-based AI workflow platform](https://www.wireflow.ai/features/best-node-based-ai-workflow-platform?ref=skill-wireflow-skills&utm_source=github&utm_medium=skill&utm_campaign=wireflow-skills). MIT licensed, see [LICENSE](LICENSE).
