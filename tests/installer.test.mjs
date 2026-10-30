// 验证空白 Mac 配置、旧注册升级与隔离 JXA 执行，不操作真实 Figma 或用户配置。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../scripts/registry.js', import.meta.url), 'utf8');
const merge = vm.runInNewContext(source + '\nmergeRegistry');
const manifest = { id: '123456789', name: 'Lingora localization', main: 'main.js', ui: 'ui.html' };
// 跨 VM 结果规范化，断言公开配置行为。
const apply = (settings, directory = '/Users/产品 用户/Library/Application Support/Lingora/test') => JSON.parse(JSON.stringify(merge(settings, manifest, directory)));

test('从无注册记录和无设置的 Mac 安装', () => {
  for (const input of [{}, { localFileExtensions: [] }]) {
    const output = apply(input);
    assert.equal(output.localFileExtensions.length, 3);
    assert.equal(output.localFileExtensions[0].lastKnownPluginId, manifest.id);
    assert.equal(output.localFileExtensions[1].fileMetadata.manifestFileId, output.localFileExtensions[0].id);
    assert.deepEqual(apply(output), output);
  }
});
test('升级保持身份，移除旧关联文件，保留其他插件与敏感设置且不输出内容', () => {
  const initial = apply({ theme: 'dark', privateSetting: 'fixture-only', localFileExtensions: [{ id: 8, manifestPath: '/other/manifest.json', lastKnownPluginId: '999' }] }, '/old');
  const updated = apply(initial);
  assert.equal(updated.theme, 'dark');
  assert.equal(updated.privateSetting, 'fixture-only');
  assert.deepEqual(updated.localFileExtensions[0], initial.localFileExtensions[0]);
  assert.equal(updated.localFileExtensions.length, 4);
  assert(!JSON.stringify(updated).includes('/old'));
  assert.deepEqual(apply(updated), updated);
});
test('拒绝损坏的配置与重复编号，不吞掉现有设置', () => {
  for (const data of [null, [], { localFileExtensions: {} }, { localFileExtensions: [{ id: 1, manifestPath: '/a' }, { id: 1, manifestPath: '/b' }] }]) assert.throws(() => apply(data));
  assert.throws(() => merge({}, { ...manifest, id: 'invalid' }, '/install'));
});
test('修复同一插件的重复注册和缺失文件记录', () => {
  const data = apply({});
  data.localFileExtensions.pop();
  const repaired = apply(data);
  assert.equal(repaired.localFileExtensions.length, 3);
  assert.deepEqual(apply(repaired), repaired);
});
test('系统 Bash 语法检查', () => {
  execFileSync('/bin/bash', ['-n', new URL('../install.sh', import.meta.url).pathname]);
});
test('在 macOS 原生 JXA 执行：无仓库路径、无设置、中文空格用户名、已有配置与损坏配置', { skip: process.platform !== 'darwin' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'lingora-mac-中文 空格-'));
  try {
    const settings = join(directory, 'settings.json');
    const pack = join(directory, 'manifest.json');
    const output = join(directory, 'next.json');
    writeFileSync(pack, JSON.stringify(manifest));
    const args = ['-l', 'JavaScript', resolve('scripts/registry.js'), settings, pack, directory, output];
    execFileSync('/usr/bin/osascript', args, { env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' } });
    const first = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(first.localFileExtensions.length, 3);
    writeFileSync(settings, JSON.stringify(first));
    execFileSync('/usr/bin/osascript', args);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), first);
    writeFileSync(settings, '{broken');
    assert.throws(() => execFileSync('/usr/bin/osascript', args, { stdio: 'pipe' }));
    assert.equal(readFileSync(settings, 'utf8'), '{broken');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

// 执行安装器内同一选择逻辑，覆盖跨渠道、跨分页和晚发布旧版本。
const installer = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const selectorSource = installer.split("<<'RELEASE_JXA'\n")[1].split('\nRELEASE_JXA')[0];
const selectRelease = vm.runInNewContext(selectorSource + '\nselectRelease', { ObjC: { import() {} } });
// 生成附件完整的 GitHub Release 响应，不访问真实服务。
const release = (version, prerelease = true) => ({ tag_name: `v${version}`, draft: false, prerelease, assets: ['latest.json', 'lingora-figma-macos.tar.gz', 'SHA256SUMS', 'install.sh'].map(name => ({ name, state: 'uploaded' })) });
test('渠道隔离、数字排序和分页累计，不因旧版本晚发布而降级', () => {
  const releases = [release('0.1.0-rc.9'), release('0.1.0-rc.100'), release('2.0.0', false)];
  assert.equal(selectRelease(releases, 'develop', ''), '0.1.0-rc.100');
  assert.equal(selectRelease(releases, 'main', ''), '2.0.0');
  assert.equal(selectRelease(releases, 'develop', '0.2.0-rc.1'), '0.2.0-rc.1');
});
test('草稿、不完整附件及非法版本均不能被安装', () => {
  assert.equal(selectRelease([{ ...release('0.2.0-rc.1'), draft: true }, { ...release('0.3.0-rc.1'), assets: [] }, release('../bad'), release('0.4.0-rc.1', false)], 'develop', ''), '');
  assert.throws(() => selectRelease({}, 'develop', ''));
});
