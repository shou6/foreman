// esbuild が styles.css を dist/webview.css に束ねる。tsc には副作用だけの import として認識させる
declare module '*.css';
