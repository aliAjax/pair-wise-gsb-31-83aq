const { build } = require('esbuild');
const path = require('path');

build({
  entryPoints: ['scripts/run-verify.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'scripts/.verify-bundle.cjs',
  alias: {
    '@': path.resolve(__dirname, '../src'),
    'idb-keyval': path.resolve(__dirname, './idb-memory.ts'),
  },
  logLevel: 'info',
}).catch(() => process.exit(1));
