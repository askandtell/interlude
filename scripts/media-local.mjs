import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = path.join(root, 'deploy/livekit.local.yaml');
const bundled = path.join(root, '.cache/livekit/livekit-server.exe');
const binary =
  process.env.LIVEKIT_BIN ||
  (process.platform === 'win32' && existsSync(bundled) ? bundled : 'livekit-server');
if (!existsSync(config)) {
  console.error('缺少本地媒体配置。请先运行 node scripts/setup-dev.mjs。');
  process.exit(1);
}
const child = spawn(binary, ['--config', config], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
child.on('error', () => {
  console.error('无法启动 LiveKit。请安装 livekit-server，或设置 LIVEKIT_BIN 指向可执行文件。');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
