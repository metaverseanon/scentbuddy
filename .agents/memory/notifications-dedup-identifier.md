---
name: Local notification de-duplication
description: Why every scheduled expo-notification in ScentBuddy must use a fixed identifier, or it silently stacks into duplicates.
---

# Scheduled local notifications must use a fixed identifier

In `expo-notifications`, `scheduleNotificationAsync` keys a pending request by its
`identifier`. Scheduling again with the SAME identifier **replaces** the pending
request; scheduling WITHOUT one generates a fresh auto id every time, so repeated
scheduling **stacks** multiple pending notifications that all fire together.

**Why:** ScentBuddy re-runs its notification setup on many triggers (auth change,
settings toggles, app foreground). Recurring reminders that were scheduled without
an identifier (goal-progress, quiz-follow-up) accumulated and delivered duplicate
notifications (e.g. two "Goal Progress" alerts at once). A per-device AsyncStorage
throttle is NOT a sufficient guard — it can be bypassed by reinstall / storage
reset / races; the fixed identifier is the hard guard.

**How to apply:**
- Any DATE/CALENDAR `scheduleNotificationAsync` for a recurring/re-scheduled
  reminder MUST pass a stable `identifier` (like the diary/weekly/monthly ones).
- Immediate one-shot notifications (`trigger: null`, event-driven, e.g. collection
  milestone) don't need this — they're gated by their own crossing logic.
- When introducing an identifier for a reminder that previously had none, also run
  a one-time cleanup: `getAllScheduledNotificationsAsync()` and cancel any pending
  request whose `content.data.type` matches but whose identifier isn't the new
  stable id — otherwise old auto-id copies already on-device still fire once.
- This is JS-only (ships via EAS Update; no native rebuild).
