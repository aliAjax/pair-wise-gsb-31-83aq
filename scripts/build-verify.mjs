// 用 esbuild 把验证脚本（含 @ 别名与 idb-keyval 内存垫片）打成单文件 Node ESM。
// 用法：node scripts/build-verify.mjs [入口文件(相对 scripts/)] [输出文件]
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(root, '..');

const entry = process.argv[2] ?? 'verify-isolation.ts';
const out = process.argv[3] ?? '.verify-bundle.mjs';

await build({
  entryPoints: [path.isAbsolute(entry) ? entry : path.join(root, entry)],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.isAbsolute(out) ? out : path.join(root, out),
  absWorkingDir: projectRoot,
  alias: {
    '@': path.join(projectRoot, 'src'),
    'idb-keyval': path.join(root, 'idb-memory-shim.js'),
  },
  logLevel: 'info',
});
