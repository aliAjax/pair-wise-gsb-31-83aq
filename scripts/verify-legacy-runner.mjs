// 构建并运行旧数据迁移验证脚本，结束后清理产物。
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const bundle = path.join(root, '.verify-legacy.mjs');

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: path.join(root, '..') });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(process.execPath, [path.join(root, 'build-verify.mjs'), 'verify-legacy.ts', bundle]);
run(process.execPath, [bundle]);
