# Foreman for Claude Code

VS Code 拡張機能。TypeScript + esbuild。Marketplace 公開を目指す。

Claude Code のセッションを「タスク」として並べて見守り、ツールの承認と、Git に頼らないターンごとの差分の確認を VS Code の中で行う。
ユーザーの PC のログイン済み `claude` CLI を Claude Agent SDK から起動する。拡張機能自身は認証情報を扱わない。

## ドキュメント

| 文書 | 内容 |
| --- | --- |
| [docs/README.md](docs/README.md) | 文書の索引と、何をした時にどの文書を直すかの更新ルール |
| [docs/workflow.md](docs/workflow.md) | 機能追加・改善の進め方（バックログ → 設計 → 実装 → PR → リリース） |
| [docs/requirements.md](docs/requirements.md) | 要件定義書。機能要件（`FR-*`）、非機能要件（`NFR-*`）、受け入れ基準 |
| [docs/architecture.md](docs/architecture.md) | 設計。層の分け方、データモデル、ポート、プロトコル、テスト方針 |
| [docs/backlog.md](docs/backlog.md) | 改善の候補、対応済み、保留 |
| [docs/spike-results.md](docs/spike-results.md) | Agent SDK の使い方で確かめたこと。SDK の使い方で迷ったらここを見る |
| [docs/publishing.md](docs/publishing.md) | リリースと公開の手順 |

## コマンド

```bash
npm run compile         # 型検査 + lint + esbuild（開発ビルド）
npm run watch           # tsc と esbuild を並列で watch（F5 の preLaunchTask）
npm run check-types     # tsc --noEmit
npm run lint            # eslint src
npm run format          # prettier --write
npm run test:unit       # 単体テストだけを Node 上で実行（数秒。TDD のループはこれを使う）
npm test                # 単体テスト + VS Code 上の統合テスト（初回は VS Code のダウンロードで時間がかかる）
npm run test:integration:local  # 手元用の統合テスト。extensionDependencies を一時ディレクトリに入れてから実行する
npm run package         # 本番ビルド（minify）
npm run vsix            # vsce package で .vsix を生成
npm run try             # 単体テスト → VSIX 生成 → 中身の検査 → 入れ直し。手元の VS Code で試す時に使う
npm run lint:md         # Markdown の lint
npm run verify:package  # 公開パッケージに入るファイルが意図したものだけかを検査する
```

- `README.md` は英語で書く（Marketplace のページにそのまま表示される）。日本語の説明は `README.ja.md`。片方を直したらもう片方も直す
- `.md` の校正は、保存時の hook に任せる。hook は日英を判定し、`~/.claude` の `.textlintrc`（日本語用）か `.textlintrc.en`（英語用）を当てる
- リリースと公開の手順は [docs/publishing.md](docs/publishing.md)。Marketplace への公開は手作業で、`vsce publish` は使わない
- `npm ci` は実行しない。F5 の watch タスクが `esbuild.exe` を掴んでいると `node_modules` の削除に失敗して壊れる。依存を入れ直す時は `npm install` を使う
- 開発中の動作確認は VS Code で F5（Run Extension）を押し、Extension Development Host で行う。本番ビルドを普段の環境で試すなら `npm run try`
- テストは Mocha（`suite` / `test`）。`src/test/unit/` は vscode 非依存の単体テスト、`src/test/integration/` は `@vscode/test-cli` で VS Code 上で動かす統合テスト
- 流れの確認（作成 → 承認 → レビュー待ち → 完了など）は `src/test/integration/scenarios.test.ts` に足す。`.vscode-test.mjs` が `FOREMAN_SCRIPTED_RUNNER=1` を渡す。この時、拡張機能は Claude の代わりに台本の Runner（`src/adapters/scriptedRunner.ts`）を使う。`activate` の返り値 `testApi` から service / runner / approvals / diffs / panels を触れる。開発ホストを手で開き直す前に、まずここで確かめる。待ちは決め打ちの sleep ではなく `untilStatus` で条件を待つ（保存はファイルなので処理の時間が揺れる）
- テストの `suite(...)` の直下で関数を呼ばない。そこで例外が出ると mocha ごと落ち、失敗件数すら表示されない。テストデータは直接組み立てるか、`test` の中で作る
- Windows では `npm` と `code` の実体が `.cmd` で、`spawn` から直接は起動できない（EINVAL）。シェル経由にする場合は、引数の配列と併用せず 1 行の文字列で渡す（Node がエスケープしないため）

## 構成

層の分け方とディレクトリの詳細は [docs/architecture.md](docs/architecture.md)。要点だけ書く。

```text
src/
├── extension.ts        エントリポイント。組み立てと登録だけ行い、ロジックを置かない
├── domain/             Task / Turn / FileChange の型、状態遷移、差分の計算（純粋関数）
├── ports/              AgentRunner / TaskStore / SnapshotStore / FileSystem のインタフェース
├── app/                TaskService / ApprovalService / DiffService（ポート経由で動く）
├── adapters/           AgentSdkRunner（Agent SDK）、FsTaskStore、FsSnapshotStore、NodeFileSystem
├── vscode/             左右のサイドバー（WebviewView）、タスク画面とボード（WebviewPanel）、通知、ステータスバー、コマンド、設定。vscode を import するのはここだけ
├── webview/            画面の中身（Preact、別バンドル）。タスク画面、board/、details/（右サイドバー）、sidebar/（左サイドバー）。*Protocol.ts は拡張機能側と共有
├── tooling/            npm run try などの開発用スクリプトの中身（単体テストする）
└── test/
    ├── unit/           単体テスト（vscode 非依存）
    ├── integration/    VS Code 上で動かす統合テスト
    └── support/        テストの補助。fakes/ にフェイクを置く
spikes/                 技術検証（M0）のスクリプト。独自の package.json を持ち、公開パッケージに入れない
scripts/                npm scripts から呼ぶ Node スクリプト
l10n/                   画面の文字列の日本語訳
resources/              アイコン。icon.png の元の画像は docs/images/（git 管理外）にある Gemini の生成画像で、Pillow で切り抜いて 256px にした
```

## 開発ルール

- 要件は要件定義書、進め方は [docs/workflow.md](docs/workflow.md) に従う。テスト → 実装 → コミットを繰り返す
- TDD で進める。先にテストを書いて失敗を確認し、その後に実装する（グローバル設定を参照）
- `vscode` モジュールを import するのは `src/vscode/` と `src/extension.ts` だけ。ほかの層は純粋な TypeScript にし、単体テストできる形を保つ。翻訳関数などは引数で受け取る
- 外部プロセス（Claude Code）とファイルシステムは `src/ports/` のインタフェースで抽象化し、テストではフェイクに差し替える。実際の Claude との疎通は手で確かめる
- Agent SDK の型は `src/adapters/agentSdkRunner.ts` の外へ出さない。SDK のメッセージは `domain/events.ts` の型に正規化する
- `strict` を維持し、`any` を使わない
- 画面に出す文字列は `vscode.l10n.t('English text', ...args)` に通す。第 1 引数は単一の文字列リテラルにする（`+` でつなぐと実行時のキーと一致しなくなる）。足したら `l10n/bundle.l10n.ja.json` に日本語訳を足す。抜けや使われなくなった訳はテストが検出する。`package.json` の文字列は `%key%` にし、`package.nls.json` と `package.nls.ja.json` の両方へ定義する
- 公開パッケージに入れるファイルは `package.json` の `files`（許可リスト）で決まる。実行時に必要なファイルを足したら `files` にも足す。`.vscodeignore` は置かない
- 依存ライブラリを足したら、単体テストだけでなく統合テスト（`npm test`）も通す。バンドルすると動かないライブラリがある（例：`jsonc-parser` の既定の配布形式は、esbuild の `mainFields` を `['module', 'main']` にしないと実行時に落ちる）
- コミット前に `npm run compile` と `npm test` を通す。`compile` と単体テストは pre-commit フックが自動で回す（`npm run hooks` で登録。`npm install` の後に 1 回）。統合テストは手で回す
- `extensionDependencies` があると、`npm test` はそれを `.vscode-test/extensions` に自動で入れる。Windows では、このワークスペースを VS Code で開いていると、そのフォルダの rename が EPERM で失敗する。ワークスペースの外なら成功し、CI では起きない。`files.watcherExclude` では直らない。手元では `npm run test:integration:local` を使う
- 依存先の拡張機能が有効化の中で重い処理をすると、統合テストが mocha の既定の 2 秒を超える。`.vscode-test.mjs` で 30 秒にしている。初回の遅さを手元で再現するには、user-data-dir と extensions-dir の両方を消してから試す
- コミットメッセージは `.claude/rules/commit-message.md` に従う

## 技術検証（spikes/）

- `spikes/` のスクリプトは実際の Claude を呼ぶ。ユーザーの契約の枠を消費するので、指示は短くし、作業ディレクトリは OS の一時フォルダにする
- 実行は `node spikes/<name>.mjs`。`claude` の場所は `FOREMAN_CLAUDE_PATH` で上書きできる。既定は `~/.local/bin/claude.exe`
- 結果は `docs/spike-results.md` に書く。アカウントのメールアドレスなど個人情報は書かない

## 開発中の注意

- **F5 は動かない（2026-09-23 時点）**。js-debug が `localhost` を `::1` に解決するが、拡張機能ホストは `127.0.0.1` だけで待ち受けるので接続できない。「拡張機能ホストが 10 秒以内に開始されませんでした」となり、コマンドが not found になる。Foreman の問題ではない。開発用ウィンドウは **Ctrl+F5（デバッグなしで実行）** か、タスク「Run Extension (no debug)」で開く
- ブレークポイントがどうしても要る時だけ、`C:\Windows\System32\drivers\etc\hosts` に `127.0.0.1 localhost` を一時的に足す（管理者権限）。IPv6 だけで待ち受けるサーバーに `localhost` で届かなくなるので、終わったら消す

- F5 の開発用のウィンドウと普段のウィンドウは、依存先の拡張機能のインストール先を共有する。依存先が自分のインストール先へ生成物を書く拡張機能だと、F5 の結果が普段のウィンドウに残ることがある。「Developer: Reload Window」で戻る
- F5 で開いた開発用のウィンドウがすぐ閉じる時は、拡張機能ホストが異常終了している。原因は元のウィンドウの「デバッグ コンソール」に出る。ログは `%APPDATA%\Code\logs\<日時>\main.log` の `Extension host ... exited with code`
- `git rm` でステージした削除は、次のコミットに混ざる。コミット前に `git status` でステージ済みの内容を確かめる
- Foreman 自身が Claude Code のプロセスを起動する。F5 の開発用のウィンドウで起動したプロセスが残っていないかは、タスクマネージャーの `claude.exe` で確かめる

## 環境

- Node.js 24、VS Code 1.138 以上
- Claude Code 2.1 系（native インストール、`~/.local/bin/claude.exe`）。Agent SDK は 0.3 系
- ドキュメントは日本語。`.md` の保存時に markdownlint と textlint が hook で走る
