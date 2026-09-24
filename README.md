# Foreman for Claude Code

[![CI](https://github.com/shou6/foreman/actions/workflows/ci.yml/badge.svg)](https://github.com/shou6/foreman/actions/workflows/ci.yml)

[日本語](README.ja.md)

Run Claude Code sessions as tasks inside Visual Studio Code. Start them side by side and see which one is running or waiting for you. Approve tool calls and review every change turn by turn, with or without Git.

Foreman uses the `claude` CLI that is already installed and logged in on your machine. It works with your own Claude subscription (Pro / Max) or API key. You need neither a GitHub Copilot subscription nor a GitHub sign-in.

![Tasks in the sidebar, a task view with its diff card, and the changes of the task in the secondary side bar](images/task-view.png)

## Features

- **Tasks, not one chat**: each task is its own Claude Code session. The sidebar groups tasks by what they need: "Your turn" (a tool call to approve, a question to answer, a reply to read, or a failed or interrupted turn), running, review, draft and done. An icon shows each state, and done tasks show when they finished.
- **Task board**: open the board from the sidebar to see the draft, running, "Your turn", review and done columns. Each card has one main action, such as start, stop, open, mark as done, or approve and finish. Right-click a card to fork, edit, rename, export or delete it. Drag a draft into "Running" to start it, or a reviewed task into "Done" to approve it.
- **Task view in an editor tab**: streamed output, tool calls and follow-up prompts (Ctrl+Enter). The header shows the state, the main action and a "…" menu, then the branch and the context meter. While Claude works, the running tool and the elapsed time stay on one line, and you can already type your next instruction.
- **Approvals in the task view**: each request asks a plain question, such as "Run this command?", and shows the command or file. Allow it, always allow it in this task (the scope appears below the buttons), or deny it with a reason.
- **Questions from Claude**: pick a choice with the mouse or the number keys, or write your own answer under "Other". When Claude asks more than one question, switch between them with tabs and send all the answers from the last tab.
- **Diff cards without Git**: every turn shows which files changed and the line counts. Open an inline diff or the Visual Studio Code diff editor. Revert a file, or every file in the turn, with one click. "Approve and finish" marks the task as done. This works in folders that are not Git repositories.
- **Pass along**: the toolbar in the input box attaches the editor selection, the errors and warnings from Problems, the uncommitted `git diff`, or files from a picker. Paste a screenshot from the clipboard to attach it as an image. You can also right-click a file and choose "Foreman: Attach to Task", right-click in the editor for "Foreman: Attach Selection to Task", or drop files onto the task view (hold Shift when you drag from the editor area).
- **Model per turn**: pick the model for the next turn in the input box. If the previous turn ran on a different model, the input box says so.
- **Notifications and status bar**: know when a task needs you or has finished. The status bar counts running and waiting tasks.
- **Prompt presets and Context panel**: type `/fix`, `/test` or `/review` at the start of a prompt to expand a preset (edit them in `foreman.presets`). The "What Claude will receive" line above the input shows the directory, the permission mode and the number of attachments. Open it to see the exact text Foreman will send and the rules you always allowed.
- **Token usage**: the task view and the status bar show how much of the context window the task uses. Each turn shows its input and output tokens, and the sidebar shows today's total for all tasks.
- **Persistence**: tasks, history and diff cards survive a restart. An interrupted task keeps its session, so your next prompt continues it.
- **Git worktrees**: run a task in its own worktree and branch. The "Finish" section walks you through approving the changes, reviewing the whole diff and merging into the branch you started from. You can also discard the worktree there. Worktrees live in `.foreman/worktrees` inside the repository.
- **Checkpoints and forks**: every finished turn is a checkpoint. Hover over the turn divider to rewind the files, or the files and the conversation, to that point, or to fork a new task from it. A worktree task forks from its own branch, and merging the fork brings its changes back into that branch.
- **Changes and checkpoints in the secondary side bar**: the "Foreman Task" view follows the task you are looking at and lists its changes and checkpoints by turn.
- **Export**: save a task as a Markdown file from the "…" menu.

## Screenshots

Approve a tool call. The scope of "always allow" appears below the buttons:

![Approval card for a file edit](images/approval.png)

Answer a question from Claude with the mouse or the number keys:

![Question card with numbered choices](images/question.png)

The task board, with one main action per card:

![Task board with draft, running, your turn, review and done columns](images/board.png)

The screenshots show the Japanese display language. The extension follows the display language of Visual Studio Code.

## Requirements

- Visual Studio Code 1.138 or later
- [Claude Code](https://code.claude.com/docs/en/overview) installed and logged in (`claude` on your PATH, or set `foreman.claudePath`)
- A Claude subscription (Pro / Max) or an API key configured for Claude Code

Foreman never reads or stores your credentials. It launches your local `claude` CLI, which handles authentication itself. If the CLI is missing or not logged in, the task stops as failed and shows the reason, such as "Not logged in · Please run /login". Run `claude` in a terminal, log in, and send the prompt again.

## Settings

| Setting | Purpose |
| --- | --- |
| `foreman.claudePath` | Path to the `claude` executable. Leave empty to search `PATH` and `~/.local/bin`. |
| `foreman.defaultModel` | Model for new tasks, for example `claude-sonnet-5`. Leave empty for the Claude Code default. |
| `foreman.defaultPermissionMode` | `default` asks before every tool call. `acceptEdits` allows file edits automatically. |
| `foreman.notifications` | `all`, `waiting` or `none`. |
| `foreman.useWorktree` | Preselect "in a worktree" when creating or starting a task in a Git repository. |
| `foreman.worktreeBranchPrefix` | Prefix for worktree branches. Default `foreman/`. |
| `foreman.autoTitle` / `foreman.titleModel` | Let a small model name new tasks from the first prompt. |
| `foreman.toolCalls` | Show tool calls expanded or collapsed in the task view. |
| `foreman.taskViewWidth` | Maximum width of the task view content, in `em`. |
| `foreman.presets` | Prompt presets used as `/name`. `{input}` is replaced with the rest of the prompt. |

## Desktop notifications

Foreman only shows Visual Studio Code notifications. For Windows desktop notifications, install [Local Notifier](https://marketplace.visualstudio.com/items?itemName=shou6.vscode-local-notifier) and add its hook command to your Claude Code settings. Foreman tasks run your Claude Code hooks, so the same setup covers tasks started from Foreman.

## How it works

Foreman talks to Claude Code through the official Claude Agent SDK. Each task maps to one Claude Code session, identified by its session ID. Your Claude Code settings, permission rules and hooks apply to Foreman tasks as well. Foreman keeps task data, display history and file snapshots in the extension's workspace storage. It writes nothing into your repository.

## Known limitations

- Changes made by shell commands (not by the edit tools) show up without their previous content, so you cannot revert them from the diff card.
- A turn that was running when Visual Studio Code closed is not part of the Claude Code conversation. Foreman repeats that instruction when you continue the task.
- Your remaining subscription quota is not shown. Claude Code offers no way to read it.

## License

[MIT](LICENSE)
