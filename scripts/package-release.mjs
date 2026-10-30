// 校验源仓库编译包，在分发仓库加入安装器组件并制作不可变 Mac 安装包。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const channel = process.env.CHANNEL;
const input = JSON.parse(readFileSync('release.json', 'utf8'));
if (!['main', 'develop'].includes(channel) || input.schema !== 1 || input.channel !== channel || input.pluginId !== '1697438320082764296' || !/^[0-9a-f]{40}$/.test(input.sourceCommit)) throw Error('构建来源或渠道无效');
if (!(channel === 'develop' ? /^\d+\.\d+\.\d+-rc\.\d+$/ : /^\d+\.\d+\.\d+$/).test(input.version)) throw Error('构建版本不匹配渠道');
const digest = createHash('sha256').update(readFileSync('plugin.tar.gz')).digest('hex');
if (digest !== input.sha256) throw Error('编译包摘要错误');
const names = execFileSync('tar', ['-tzf', 'plugin.tar.gz'], { encoding: 'utf8' }).trim().split('\n').sort();
if (JSON.stringify(names) !== JSON.stringify(['main.js', 'manifest.json', 'ui.html'])) throw Error('编译包只能包含三个公开插件文件');
const listing = execFileSync('tar', ['-tvzf', 'plugin.tar.gz'], { encoding: 'utf8' }).trim().split('\n');
if (listing.some(line => !line.startsWith('-'))) throw Error('编译包禁止链接或其他非普通文件');
const out = resolve('dist');
const stage = join(out, 'package');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
execFileSync('tar', ['-xzf', resolve('plugin.tar.gz'), '-C', stage]);
const manifest = JSON.parse(readFileSync(join(stage, 'manifest.json'), 'utf8'));
if (manifest.id !== input.pluginId || manifest.main !== 'main.js' || manifest.ui !== 'ui.html') throw Error('插件 manifest 无效');
copyFileSync('scripts/registry.js', join(stage, 'registry.js'));
const archive = join(out, 'lingora-figma-macos.tar.gz');
// 使用标准库固定 tar/gzip 元数据，保证跨平台及失败重跑附件一致。
execFileSync('python3', ['-c', `
import gzip, io, pathlib, sys, tarfile
stage, archive = map(pathlib.Path, sys.argv[1:])
with archive.open('wb') as output, gzip.GzipFile(filename='', mode='wb', fileobj=output, mtime=0) as stream:
    with tarfile.open(fileobj=stream, mode='w', format=tarfile.USTAR_FORMAT) as tar:
        for name in ['main.js', 'manifest.json', 'registry.js', 'ui.html']:
            data = (stage / name).read_bytes()
            info = tarfile.TarInfo(name)
            info.size, info.mode, info.mtime = len(data), 0o644, 0
            tar.addfile(info, io.BytesIO(data))
`, stage, archive]);
const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex');
const url = `https://github.com/hzh137940556/lingora-figma-plugin/releases/download/v${input.version}/lingora-figma-macos.tar.gz`;
writeFileSync(join(out, 'latest.json'), JSON.stringify({ schema: 1, version: input.version, pluginId: input.pluginId, url, sha256, channel }, null, 2) + '\n');
writeFileSync(join(out, 'SHA256SUMS'), `${sha256}  lingora-figma-macos.tar.gz\n`);
writeFileSync(join(out, 'install.sh'), readFileSync('install.sh', 'utf8').replace(/^CHANNEL=\w+$/m, `CHANNEL=${channel}`));
console.log(`已制作 ${channel} 安装包 ${input.version}`);
