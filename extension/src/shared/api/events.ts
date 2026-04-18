/**
 * SSE event-name constants — kept in sync with the Go backend's
 * `internal/models/models.go` `Event*` constants.
 */
export const SSE_EVENTS = {
  DELTA: "delta",
  STEP: "step",
  USAGE_INFO: "usage_info",
  TURN_DONE: "turn_done",
  DONE: "done",
  ERROR: "error",
  TITLE_CHANGED: "title_changed",
  MODE_CHANGED: "mode_changed",
  ELICITATION: "elicitation",
  ASK_USER: "ask_user",
  PENDING_MESSAGES: "pending_messages",
} as const;

export type SSEEventName = (typeof SSE_EVENTS)[keyof typeof SSE_EVENTS];
