# SDK Event Catalogue

Captured by `cmd/spike` against `github.com/github/copilot-sdk/go v0.2.2`
+ Copilot CLI 1.0.32 with prompt `"Reply with just the word OK."`,
`Streaming: true`, model `gpt-4.1`. Full JSON in `sdk-events.log`.

## Observed event types (15)

| Go type (`event.Data` is `*copilot.X`) | Maps to SSE event in EventProcessor |
|---|---|
| `SessionStartData` | (internal — log only) |
| `SessionCustomAgentsUpdatedData` | (internal) |
| `SessionSkillsLoadedData` | (internal) |
| `SessionToolsUpdatedData` | (internal) |
| `SessionUsageInfoData` | `usage_info` |
| `SystemMessageData` | (internal — but persist for context view) |
| `UserMessageData` | (internal — already echoed by frontend) |
| `PendingMessagesModifiedData` | `pending_messages` |
| `AssistantTurnStartData` | (internal — start streaming UI hint) |
| `AssistantStreamingDeltaData` | `delta` (raw provider stream text) |
| `AssistantMessageDeltaData` | `delta` (preferred — post-processed chunk) |
| `AssistantUsageData` | `usage_info` |
| `AssistantMessageData` | (internal — final whole message; emit `delta` only if no prior deltas) |
| `AssistantTurnEndData` | terminate stream → SSE `done` |
| `SessionIdleData` | (internal — sentinel for idle GC) |

## Additional event types to watch for (not seen in this trivial turn)

These are documented on the SDK but require tool/reasoning use to fire:

- `AssistantReasoningData`, `AssistantReasoningDeltaData` → `step{title:"Reasoning"}`
- `CommandExecuteData`, `CommandCompletedData` → `step{title:"Tool: ..."}`
- `AbortData` → `error`
- `CapabilitiesChangedData` → `mode_changed`
- Title change events (TBD — exercise via second prompt, or use SDK metadata polling)

## Next steps for `EventProcessor` (P2)

1. Use `reflect.TypeOf(event.Data).String()` (or a type switch) as the dispatch key.
2. Mirror the "drop oldest non-sentinel on backpressure" pattern from copilot-console.
3. Treat `AssistantTurnEndData` as terminate-stream (sends `done` SSE event).
4. Buffer `AssistantReasoningDeltaData` per turn → flush as a `step` on `AssistantReasoningData`.
5. Prefer `AssistantMessageDeltaData` over `AssistantStreamingDeltaData` (the latter is the raw provider stream; the former is post-processed and matches what the CLI would print).

## Models available (17)

`auto`, `claude-sonnet-4.6`, `claude-sonnet-4.5`, `claude-haiku-4.5`,
`claude-opus-4.7`, `claude-opus-4.6`, `claude-opus-4.6-1m`, `claude-opus-4.5`,
`claude-sonnet-4`, `goldeneye`, `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.2-codex`,
`gpt-5.2`, `gpt-5.4-mini`, `gpt-5-mini`, `gpt-4.1`.

Default for new sessions: `gpt-4.1` (free tier, 0 multiplier).
