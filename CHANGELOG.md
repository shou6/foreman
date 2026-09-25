# Change Log

All notable changes to this extension are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.1] - 2026-09-26

### Fixed

- Stopping a task now works even when Claude Code does not answer the stop request: Foreman closes the process after a few seconds and marks the task as interrupted
- Tasks no longer take minutes to start in a dev container or on a large repository: Foreman now watches the working directory with Visual Studio Code's file watcher instead of Node's recursive watcher

## [0.1.0]

First release.

- Tasks: run Claude Code sessions as tasks, grouped by what they need ("Your turn", running, review, draft, done)
- Task board: drag tasks between columns, one main action per card, more actions on right-click
- Task view: streamed output, tool calls (subagent calls nested under their Agent call), follow-up prompts, a model and an effort level per turn, and drafting the next prompt while Claude works. Date dividers, the time of each prompt, and the end time and duration of each turn
- Approvals: allow, deny with a reason, or always allow in this task; answer questions from Claude with number keys, your own answer, and tabs for more than one question
- Permission mode per task: "Ask each time", "Auto-accept edits" or "Plan only", switchable in the input box; the plan card can open the plan in an editor tab
- Diff cards: per-turn file changes with line counts, inline diff, diff editor, revert (no Git required), and undoing an approval
- Pass along: selection, Problems, `git diff`, files and pasted images, from the toolbar in the input box
- Prompt presets (`/fix`, `/test`, `/review`), Claude Code commands and skills in the `/` list (filtered as you type), `/compact` from the context meter, and the "What Claude will receive" panel
- Secondary side bar: changes and checkpoints by turn, grouped by day, plus a resizable session area with Overview, MCP servers and Always allowed tabs
- Context meter and token counts per turn, plus today's total and the plan usage (5-hour, 7-day and per-model limits) in the sidebar and the status bar
- Git worktrees: run a task on its own branch, then approve, review the whole diff and merge, or discard
- Checkpoints: rewind files or the conversation to a finished turn, or fork a new task from it
- Import a Claude Code session started from the CLI or other tools, with its past prompts, output and tool calls
- Notifications and status bar for waiting, finished and failed tasks
- Persistence: tasks, history and diff cards survive a restart; interrupted tasks resume their session. Snapshots of completed tasks are removed after `foreman.snapshotRetentionDays` (default 60)
- Windows: processes left behind by a crashed Visual Studio Code window are stopped at the next start
- Export a task as Markdown
