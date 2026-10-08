# Context management

Each run has one context window. The execution service fills that window in a fixed order, then reserves room for the model reply. Memory never leaves the thread that created it.

This follows the public context practices from Anthropic and OpenAI:

- Treat the window as limited. Long context gets worse, so we keep the important prefix and compact the rest.
- Put stable instructions first and changing data later.
- Retrieve knowledge for the current question instead of loading a whole knowledge base.
- Clear old tool results before touching instructions.
- Store conversation memory outside the window, then copy only the slice that fits.

## Budget

Configured in `.env`:

| Setting | Role |
| --- | --- |
| `CONTEXT_WINDOW_TOKENS` | Full window for one thread. Default `8192`. |
| `CONTEXT_MAX_OUTPUT_TOKENS` | Reply cap sent to the gateway as `max_tokens`. |
| `CONTEXT_OUTPUT_RESERVE_TOKENS` | Used when the max-output setting is empty. Default `2048`. |
| `CONTEXT_TOOL_ROUND_RESERVE_TOKENS` | Room left for tool calls inside the same window. Default `1024`. |
| `CONTEXT_CHARS_PER_TOKEN` | Rough size estimate. Default `4`. |
| `CONTEXT_TOOL_MESSAGE_MAX_CHARS` | Cap on one tool result. Default `4000`. |
| `CONTEXT_ISOLATE_THREADS` | When `true` (default), memory is thread-only. |

```
input budget = window - max output - tool reserve
```

Example with defaults: `8192 - 2048 - 1024 = 5120` estimated input tokens.

## What we manage

Nine layers. The first two are never cut.

| # | Layer | Where it comes from | What we do |
| --- | --- | --- | --- |
| 1 | System prompt | Agent instructions on the runtime manifest | Pinned at the start of the system message. |
| 2 | Current user message | This run's input | Pinned as the user message. |
| 3 | Memory instructions | `memory.instructions` when memory is enabled | Added under the system prompt. Removed only if nothing else can shrink. |
| 4 | Conversation history | Stored transcript for this thread | Turn-count and character caps first, then compaction of older lines. |
| 5 | Retrieved knowledge | Knowledge bases whose mode is `Context` | Queried with the current user message. Lowest block dropped first. |
| 6 | Attached files | Input artifacts | Shortened first. |
| 7 | Tool definitions | Local tools and remote MCP tools on the manifest | Sent in the `tools` array, separate from the system prompt. |
| 8 | Tool calls and results | The current tool loop | Result text is capped. The oldest finished tool round is deleted next. |
| 9 | Output reserve | `max_tokens` on the gateway call | Held back from the input budget. |

Knowledge bases in `Tool` mode are not copied into the prompt. The model fetches them with the `search_knowledge_base` tool.

## Packing order

When the system message plus the user message is over the input budget, we shrink in this order:

1. Attached file text.
2. Retrieved knowledge blocks, from the end of the list.
3. Older conversation lines. They become one note: how many lines were omitted. The newest lines stay as written.
4. Memory instructions.

If the system prompt and the current user message alone are still too large, the run returns `CONTEXT_TOO_LARGE`.

During a tool loop the same budget is applied to the message list:

1. Cut each tool result to `CONTEXT_TOOL_MESSAGE_MAX_CHARS`.
2. Delete the oldest assistant tool-call plus its tool results.
3. Cut tool results again, harder.
4. If the list still does not fit, return `CONTEXT_TOO_LARGE`.

The system message and the latest user message stay in that list.

## Memory

Memory is optional and comes from the runtime manifest:

- `enabled` — when false, no history and no memory instructions enter the prompt, and nothing is saved.
- `instructions` — behavior notes for how to use memory.
- `maxTurnPairsInPrompt` and `maxCharsInPrompt` — caps before compaction. Defaults are `CONVERSATION_MAX_TURN_PAIRS` and `CONVERSATION_MAX_CHARS`.
- `retention` — how long the stored transcript is kept. The prompt only sees the capped slice.

`CONTEXT_ISOLATE_THREADS=true` rewrites every memory scope to `Session` and uses the thread id as the session id. A later thread does not read another thread's transcript, even if the manifest says `User`, `Agent`, or `Organization`.

## What is left for later

- A model call that writes a richer summary of dropped turns. Today the note only counts omitted lines and keeps the newest lines verbatim.
- Provider prompt-cache breakpoints. The prefix is already ordered so a cache can hit; we do not set cache markers yet.
- Cross-thread memory. Turn isolation off only when product policy allows a shared user or organization memory.
