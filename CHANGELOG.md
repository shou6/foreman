# Change Log

All notable changes to this extension are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0]

First release.

- Tasks: run Claude Code sessions as tasks, grouped by what they need ("Your turn", running, review, draft, done)
- Task board: drag tasks between columns, one main action per card, more actions on right-click
- Task view: streamed output, tool calls, follow-up prompts, a model and an effort level per turn, and drafting the next prompt while Claude works
- Approvals: allow, deny with a reason, or always allow in this task; answer questions from Claude with number keys, your own answer, and tabs for more than one question
- Diff cards: per-turn file changes with line counts, inline diff, diff editor, revert (no Git required), and undoing an approval
- Pass along: selection, Problems, `git diff`, files and pasted images, from the toolbar in the input box
- Prompt presets (`/fix`, `/test`, `/review`) and the "What Claude will receive" panel
- Context meter and token counts per turn, plus today's total and the plan usage (5-hour and 7-day limits) in the sidebar
- Git worktrees: run a task on its own branch, then approve, review the whole diff and merge, or discard
- Checkpoints: rewind files or the conversation to a finished turn, or fork a new task from it
- Notifications and status bar for waiting, finished and failed tasks
- Persistence: tasks, history and diff cards survive a restart; interrupted tasks resume their session
- Export a task as Markdown
