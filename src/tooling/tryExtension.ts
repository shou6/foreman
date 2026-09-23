/**
 * `npm run try` の手順を組み立てる（scripts/try-extension.js が使う）。
 * 実際にコマンドを動かすのはスクリプト側で、ここは何をどの順で動かすかだけを決める。
 */

export interface Manifest {
  name: string;
  version: string;
  publisher?: string;
}

export interface TryStep {
  /** 実行中に表示する見出し */
  title: string;
  command: string;
  args: string[];
  /** 失敗しても次へ進む。まだ入っていない時のアンインストールに使う */
  allowFailure?: boolean;
}

/** vsce が出す VSIX のファイル名 */
export function vsixFileName(manifest: Manifest): string {
  return manifest.name + '-' + manifest.version + '.vsix';
}

export function extensionId(manifest: Manifest): string {
  return (manifest.publisher ?? '') + '.' + manifest.name;
}

/**
 * Windows では npm も code も実体が .cmd で、Node 18.20.2 以降は spawn が .cmd を直接
 * 起動できない（EINVAL。CVE-2024-27980 の対応）。シェルを経由すると .cmd が解決される。
 */
export function needsShell(platform: string): boolean {
  return platform === 'win32';
}

/** シェルに渡すと解釈が変わる文字。引数に含まれていたら引用が要る */
const NEEDS_QUOTING = /[\s"'`$&|;<>(){}[\]*?!#~]/;

/**
 * シェルに渡す 1 行のコマンドにする。
 * 引数の配列とシェルを同時に使うと、Node が引数をエスケープせずに連結する（DEP0190）。
 * ここでは引用が要らないことを確かめたうえで自分で連結し、要る文字が来たら例外にする。
 */
export function toShellCommand(step: TryStep): string {
  for (const part of [step.command, ...step.args]) {
    if (NEEDS_QUOTING.test(part)) {
      throw new Error('引用が必要な文字を含む引数はシェルに渡せない: ' + JSON.stringify(part));
    }
  }
  return [step.command, ...step.args].join(' ');
}

/** 直して試すまでの手順。npm test（統合テスト）は時間がかかるので入れない */
export function buildTrySteps(manifest: Manifest): TryStep[] {
  const id = extensionId(manifest);
  const vsix = vsixFileName(manifest);

  return [
    { title: '単体テスト', command: 'npm', args: ['run', 'test:unit'] },
    // vsix は vscode:prepublish 経由で型検査・lint・本番ビルドも行う
    { title: 'VSIX を生成', command: 'npm', args: ['run', 'vsix'] },
    { title: 'パッケージの中身を検査', command: 'node', args: ['scripts/verify-package.js'] },
    {
      title: '古い版をアンインストール',
      command: 'code',
      args: ['--uninstall-extension', id],
      allowFailure: true,
    },
    // --force は「同じバージョンでも入れ直す」の意味。直して試す時は毎回同じバージョンになる
    { title: 'インストール', command: 'code', args: ['--install-extension', vsix, '--force'] },
  ];
}
