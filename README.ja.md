# Foreman for Claude Code

[![CI](https://github.com/shou6/foreman/actions/workflows/ci.yml/badge.svg)](https://github.com/shou6/foreman/actions/workflows/ci.yml)

[English](README.md)

Claude Code のセッションを「タスク」として VS Code の中で並べて動かし、実行中か入力待ちかを一目で確かめ、ツールの実行を承認し、変更をターンごとに確認できる拡張機能。Git を使っていないフォルダでも差分を追える。

Foreman は、PC にインストール済みでログイン済みの `claude` CLI をそのまま使う。自分の Claude の契約（Pro / Max）または API キーで動き、GitHub Copilot の契約も GitHub へのサインインも要らない。

## 機能

- **チャット 1 本ではなくタスク**：1 つのタスクが 1 つの Claude Code のセッションを持つ。サイドバーでは、実行中・入力待ち・完了・失敗・中断の状態ごとに並ぶ
- **エディタのタブに開くタスク画面**：出力の逐次表示、ツールの呼び出し、追加の指示（Ctrl+Enter）、モデルの切り替え。コードの横に並べて開ける
- **タスク画面での承認**：ツールの呼び出しごとに許可・拒否を選び、理由を添えられる。「このタスクでは常に許可」もできる。Claude からの質問は選択肢で答える
- **Git に頼らない差分カード**：各ターンで、変更されたファイルと行数を出す。インラインの差分と VS Code の差分エディタで確かめ、ファイル単位で戻せる。Git リポジトリでないフォルダでも動く
- **添付**：ファイルを右クリックして「Foreman: タスクに添付」を選ぶか、タスク画面へドロップする（エディタ領域からは Shift を押しながらドラッグ）
- **通知とステータスバー**：入力待ちと完了が分かる。ステータスバーに実行中と入力待ちの件数が出る
- **保存**：タスク、履歴、差分カードは再起動後も残る。中断したタスクはセッションを保ち、次の指示で続きが動く

## 動作環境

- Visual Studio Code 1.138 以上
- [Claude Code](https://code.claude.com/docs/en/overview) がインストール済みでログイン済みであること（`claude` が PATH にあるか、`foreman.claudePath` で指定する）
- Claude の契約（Pro / Max）または Claude Code に設定した API キー

Foreman は認証情報を読まず、保存もしない。ローカルの `claude` CLI を起動し、認証は CLI に任せる。

## 設定

| 設定 | 用途 |
| --- | --- |
| `foreman.claudePath` | `claude` の実行ファイルの場所。空なら `PATH` と `~/.local/bin` から探す |
| `foreman.defaultModel` | 新しいタスクで使うモデル（例：`claude-sonnet-5`）。空なら Claude Code の既定 |
| `foreman.defaultPermissionMode` | `default` はツールの実行のたびに確認する。`acceptEdits` はファイルの編集を自動で許可する |
| `foreman.notifications` | `all`、`waiting`、`none` のいずれか |

## 仕組み

Foreman は公式の Claude Agent SDK を通して Claude Code と対話する。1 つのタスクが 1 つの Claude Code のセッションに対応し、セッション ID で識別する。Claude Code の設定、許可のルール、hooks は Foreman のタスクにもそのまま効く。タスクのデータ、表示用の会話の履歴、差分カード用のファイルのスナップショットは、拡張機能のワークスペース用ストレージに保存する。リポジトリの中には置かない。

## 既知の制限

- シェルのコマンドによる変更（編集ツール以外）は変更前の内容が取れないため、差分カードから戻せない
- VS Code を閉じた時に実行中だったターンは、Claude Code の会話に残らない。続きを指示する時に、Foreman がその指示を添えて送る
- サブスクの残り枠は表示しない。Claude Code に取得する手段がない

## 今後の予定

- タスクごとの git worktree による並列作業、タスクボード、ターン単位のチェックポイント
- Context パネル、Prompt のプリセット、診断と `git diff` のワンクリックでの添付

## ライセンス

[MIT](LICENSE)
