// 拡張機能の仮アイコン（resources/icon.png）を生成する。
// 使い方: npm run icon
//
// Marketplace のアイコンは 128px 以上の PNG でなければならない（SVG は受け付けられない）。
// 画像ライブラリに依存せず、Node 標準の zlib だけで PNG を書き出す。
// 図案は角丸の四角を 2 つ重ねただけの仮のもの。公開前に本来のアイコンへ差し替えるか、
// 下の色と colorAt() を書き換えて作り直す。描画の部品（符号付き距離の図形、三角形、影、
// グラデーション用の mix、層の重ね合わせ）はそのまま使える。
// VS Code のロゴはブランドガイドラインで拡張機能のアイコンへの使用が禁じられているので使わない。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
/** 縁をなめらかにするため、1 画素を SS x SS に分けて塗り、平均を取る */
const SS = 4;
/** 図形の座標は 1024 x 1024 の下書きの値で書き、SIZE に縮める */
const UNIT = SIZE / 1024;

const BACKGROUND = [0x1f, 0x29, 0x37];
const FOREGROUND = [0x60, 0xa5, 0xfa];

/** 角丸の四角までの符号付き距離（内側が負）。座標は下書きの単位 */
function roundedRectDistance(x, y, [left, top, right, bottom], radius) {
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const qx = Math.abs(x - cx) - ((right - left) / 2 - radius);
  const qy = Math.abs(y - cy) - ((bottom - top) / 2 - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

function circleDistance(x, y, cx, cy, radius) {
  return Math.hypot(x - cx, y - cy) - radius;
}

/** 三角形（頂点は時計回り・反時計回りのどちらでもよい）の内側か */
function inTriangle(x, y, [a, b, c]) {
  const side = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const d1 = side(a, b);
  const d2 = side(b, c);
  const d3 = side(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** 影。形の縁を中心に blur の幅でぼかす（ガウスぼかしの近似） */
function shadowAlpha(distance, blur, opacity) {
  const t = Math.min(Math.max(0.5 - distance / (2 * blur), 0), 1);
  return opacity * t * t * (3 - 2 * t);
}

function mix(from, to, t) {
  return from.map((value, i) => value + (to[i] - value) * t);
}

/**
 * 下書きの座標 (x, y) の色を、奥の層から順に重ねて求める。
 * 戻り値は [r, g, b, a]（a は 0〜1）。
 */
function colorAt(x, y) {
  let color = [0, 0, 0];
  let alpha = 0;
  const paint = (rgb, a = 1) => {
    const outAlpha = a + alpha * (1 - a);
    if (outAlpha > 0) {
      color = color.map((value, i) => (rgb[i] * a + value * alpha * (1 - a)) / outAlpha);
    }
    alpha = outAlpha;
  };

  // 背景
  if (roundedRectDistance(x, y, [0, 0, 1024, 1024], 224) > 0) {
    return [0, 0, 0, 0];
  }
  paint(BACKGROUND);

  // 中央の四角
  if (roundedRectDistance(x, y, [256, 256, 768, 768], 96) <= 0) {
    paint(FOREGROUND);
  }

  return [...color, alpha];
}

function renderPixels() {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let py = 0; py < SIZE; py++) {
    const row = py * (SIZE * 4 + 1);
    raw[row] = 0; // フィルタなし
    for (let px = 0; px < SIZE; px++) {
      // 透明度を掛けた値で平均し、縁が暗くにじまないようにする
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb, ca] = colorAt(
            (px + (sx + 0.5) / SS) / UNIT,
            (py + (sy + 0.5) / SS) / UNIT
          );
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const offset = row + 1 + px * 4;
      raw[offset] = a ? Math.round(r / a) : 0;
      raw[offset + 1] = a ? Math.round(g / a) : 0;
      raw[offset + 2] = a ? Math.round(b / a) : 0;
      raw[offset + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return raw;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // ビット深度
header[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(renderPixels(), { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.resolve(__dirname, '../resources/icon.png');
fs.writeFileSync(out, png);
console.log('wrote ' + out + ' (' + SIZE + 'x' + SIZE + ', ' + png.length + ' bytes)');
