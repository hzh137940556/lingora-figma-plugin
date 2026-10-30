// 用独立编译包验证摘要、渠道、文件白名单及可复现安装包，不访问网络或真实 Figma。
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const script = new URL('../scripts/package-release.mjs', import.meta.url).pathname;
// 为每个测试构造独立输入，调用真实发布打包入口。
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'figma-package-'));
  try {
    mkdirSync(join(root, 'input')); mkdirSync(join(root, 'scripts'));
    for (const name of ['main.js', 'ui.html']) writeFileSync(join(root, 'input', name), 'fixture');
    writeFileSync(join(root, 'input/manifest.json'), JSON.stringify({ id: '1697438320082764296', main: 'main.js', ui: 'ui.html' }));
    execFileSync('tar', ['-czf', join(root, 'plugin.tar.gz'), '-C', join(root, 'input'), 'main.js', 'manifest.json', 'ui.html'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    copyFileSync(new URL('../scripts/registry.js', import.meta.url), join(root, 'scripts/registry.js'));
    copyFileSync(new URL('../install.sh', import.meta.url), join(root, 'install.sh'));
    const data = { schema: 1, channel: 'develop', version: '0.1.0-rc.2', sourceCommit: 'a'.repeat(40), pluginId: '1697438320082764296', sha256: createHash('sha256').update(readFileSync(join(root, 'plugin.tar.gz'))).digest('hex') };
    // 保存输入后执行打包，返回完整进程结果供错误场景断言。
    const build = () => {
      writeFileSync(join(root, 'release.json'), JSON.stringify(data));
      return spawnSync(process.execPath, [script], { cwd: root, env: { ...process.env, CHANNEL: 'develop' }, encoding: 'utf8' });
    };
    run({ root, data, build });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test('编译包只添加分发仓库的安装组件且两次产物相同', () => fixture(({ root, build }) => {
  let result = build(); assert.equal(result.status, 0, result.stderr);
  const first = readFileSync(join(root, 'dist/lingora-figma-macos.tar.gz'));
  result = build(); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(first, readFileSync(join(root, 'dist/lingora-figma-macos.tar.gz')));
  const names = execFileSync('tar', ['-tzf', join(root, 'dist/lingora-figma-macos.tar.gz')], { encoding: 'utf8' }).trim().split('\n').sort();
  assert.deepEqual(names, ['main.js', 'manifest.json', 'registry.js', 'ui.html']);
}));
test('拒绝串渠道及篡改的构建产物', () => fixture(({ data, build }) => {
  data.channel = 'main'; assert.match(build().stderr, /构建来源或渠道无效/);
  data.channel = 'develop'; data.sha256 = '0'.repeat(64); assert.match(build().stderr, /编译包摘要错误/);
}));
