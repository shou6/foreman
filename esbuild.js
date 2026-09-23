const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  },
};

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  logLevel: 'silent',
  plugins: [esbuildProblemMatcherPlugin],
};

/** 拡張機能本体（Node、CJS） */
const extension = {
  ...common,
  entryPoints: ['src/extension.ts'],
  format: 'cjs',
  platform: 'node',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  // Agent SDK は ESM で import.meta.url を使う。CJS に束ねると undefined になり起動時に落ちるので、
  // 同じ意味の値に置き換える（docs/spike-results.md）
  define: { 'import.meta.url': '__importMetaUrl' },
  banner: { js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
};

/** タスク画面（Webview、ブラウザ）。styles.css は同名の dist/webview.css に出る */
const webview = {
  ...common,
  entryPoints: ['src/webview/main.tsx'],
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/webview.js',
  jsx: 'automatic',
  jsxImportSource: 'preact',
};

/** タスクボード（Webview）。board.css は dist/board.css に出る */
const board = {
  ...webview,
  entryPoints: ['src/webview/board/main.tsx'],
  outfile: 'dist/board.js',
};

async function main() {
  const contexts = await Promise.all([
    esbuild.context(extension),
    esbuild.context(webview),
    esbuild.context(board),
  ]);
  if (watch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
  } else {
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
