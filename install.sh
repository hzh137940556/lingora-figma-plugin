#!/bin/bash
# 下载已发布插件并注册到当前用户的 Figma；只使用 macOS 自带工具。
set -euo pipefail
export PATH=/usr/bin:/bin:/usr/sbin:/sbin
export LC_ALL=C
umask 077
CHANNEL=main
SOURCE="${LINGORA_DISTRIBUTION_URL:-https://raw.githubusercontent.com/hzh137940556/lingora-figma-plugin/$CHANNEL}"
MODE="${1:-install}"
[[ "$MODE" == install || "$MODE" == --check ]] || { echo '用法：bash install.sh [--check]' >&2; exit 1; }
[[ "$(uname -s)" == Darwin ]] || { echo '此安装器仅支持 macOS。' >&2; exit 1; }
[[ "$SOURCE" == https://* ]] || { echo '下载地址必须使用 HTTPS。' >&2; exit 1; }
[[ "$(id -u)" != 0 ]] || { echo '请用当前用户运行，不要使用 sudo。' >&2; exit 1; }
APP=/Applications/Figma.app
[[ -d "$APP" ]] || APP="$HOME/Applications/Figma.app"
[[ -d "$APP" ]] || { echo '请先安装 Figma 桌面端。' >&2; exit 1; }
VERSION=$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$APP/Contents/Info.plist")
case "$VERSION" in 126.*) ;; *) echo "Figma $VERSION 尚未适配，未修改配置。当前支持 126.x（实测 126.10.13）。" >&2; exit 1 ;; esac
ROOT="$HOME/Library/Application Support/Lingora/FigmaPlugin"
SETTINGS="$HOME/Library/Application Support/Figma/settings.json"
mkdir -p "$ROOT"
LOCK="$ROOT/.install-lock"
mkdir "$LOCK" 2>/dev/null || { echo "已有安装正在运行；若上次异常退出，请确认没有安装进程后移除 $LOCK。" >&2; exit 1; }
TMP=$(mktemp -d "$ROOT/.install-XXXXXX")
# 仅清理本次创建的临时目录与锁，不清理版本或用户备份。
cleanup() { rm -rf "$TMP"; rmdir "$LOCK"; }
trap cleanup EXIT
# 下载仅允许 HTTPS，限制连接和总耗时；不使用 GitHub 凭据。
fetch() { curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 15 --max-time 180 "$1" -o "$2"; }
echo '正在查询 Lingora 最新安装版本…'
fetch "${SOURCE%/}/latest.json" "$TMP/latest.json"
/usr/bin/osascript -l JavaScript - "$TMP/latest.json" > "$TMP/metadata" <<'JXA'
// 校验发布索引，禁止路径穿越、任意协议和不完整摘要。
ObjC.import('Foundation');
function run(args) {
  var value = $.NSString.stringWithContentsOfFileEncodingError($(args[0]), $.NSUTF8StringEncoding, null);
  var data = JSON.parse(ObjC.unwrap(value));
  if (data.schema !== 1 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/.test(data.version) || !/^https:\/\/[^\s]+$/.test(data.url) || !/^[0-9a-f]{64}$/.test(data.sha256) || !/^\d+$/.test(data.pluginId)) throw Error('发布索引无效');
  return [data.version, data.url, data.sha256, data.pluginId].join('\n');
}
JXA
RELEASE=$(sed -n '1p' "$TMP/metadata")
URL=$(sed -n '2p' "$TMP/metadata")
DIGEST=$(sed -n '3p' "$TMP/metadata")
PLUGIN_ID=$(sed -n '4p' "$TMP/metadata")
fetch "$URL" "$TMP/plugin.tar.gz"
[[ "$(shasum -a 256 "$TMP/plugin.tar.gz" | cut -d ' ' -f 1)" == "$DIGEST" ]] || { echo '安装包校验失败，未修改 Figma。' >&2; exit 1; }
printf '%s\n' main.js manifest.json registry.js ui.html | sort > "$TMP/expected"
tar -tzf "$TMP/plugin.tar.gz" | sort > "$TMP/actual"
tar -tvzf "$TMP/plugin.tar.gz" | awk 'substr($0,1,1) != "-" { exit 1 }' || { echo '安装包包含非普通文件。' >&2; exit 1; }
cmp -s "$TMP/expected" "$TMP/actual" || { echo '安装包文件列表异常。' >&2; exit 1; }
mkdir "$TMP/package"
tar -xzf "$TMP/plugin.tar.gz" -C "$TMP/package"
for FILE in main.js manifest.json registry.js ui.html; do
  [[ -f "$TMP/package/$FILE" && ! -L "$TMP/package/$FILE" ]] || { echo '安装包必须只包含普通文件。' >&2; exit 1; }
done
PACK_ID=$(/usr/bin/plutil -extract id raw -o - "$TMP/package/manifest.json")
[[ "$PACK_ID" == "$PLUGIN_ID" ]] || { echo '插件身份与发布索引不一致。' >&2; exit 1; }
DEST="$ROOT/versions/$RELEASE-$DIGEST"
/usr/bin/osascript -l JavaScript "$TMP/package/registry.js" "$SETTINGS" "$TMP/package/manifest.json" "$DEST" "$TMP/preflight.json"
if [[ "$MODE" == --check ]]; then
  echo "检查通过：Lingora $RELEASE，Figma $VERSION。安装包、摘要、身份及配置合并正常；未退出 Figma或写入注册。"
  exit 0
fi
# 正常请求退出，不发送强制终止；未保存提示、权限拒绝或超时均停止。
if pgrep -x Figma >/dev/null; then
  echo '正在正常退出 Figma。若有未保存提示，请先保存；不会强制退出。'
  /usr/bin/osascript -e 'with timeout of 30 seconds' -e 'tell application id "com.figma.Desktop" to quit' -e 'end timeout'
  for ((I=0; I<30; I++)); do pgrep -x Figma >/dev/null || break; sleep 1; done
  if pgrep -x Figma >/dev/null; then echo 'Figma 未退出，安装已停止。' >&2; exit 1; fi
fi
mkdir -p "$ROOT/versions" "$ROOT/backups" "$(dirname "$SETTINGS")"
if [[ -e "$DEST" ]]; then
  for FILE in main.js manifest.json registry.js ui.html; do cmp -s "$TMP/package/$FILE" "$DEST/$FILE" || { echo '已有版本内容不一致，停止安装。' >&2; exit 1; }; done
else
  mv "$TMP/package" "$DEST"
fi
BACKUP="$ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir "$BACKUP"
if [[ -f "$SETTINGS" ]]; then cp -p "$SETTINGS" "$BACKUP/settings.json"; else touch "$BACKUP/settings-absent"; fi
/usr/bin/osascript -l JavaScript "$DEST/registry.js" "$SETTINGS" "$DEST/manifest.json" "$DEST" "$TMP/settings.next.json"
# 保存前再次核对进程与配置，避免覆盖重启或并发写入。
if pgrep -x Figma >/dev/null; then echo 'Figma 已重新启动，停止写入。' >&2; exit 1; fi
if [[ -f "$BACKUP/settings.json" ]]; then
  cmp -s "$SETTINGS" "$BACKUP/settings.json" || { echo 'Figma 配置发生变化，停止写入。' >&2; exit 1; }
else
  [[ ! -e "$SETTINGS" ]] || { echo 'Figma 配置已创建，停止写入。' >&2; exit 1; }
fi
mv "$TMP/settings.next.json" "$SETTINGS"
echo "已安装 Lingora $RELEASE。配置备份：$BACKUP"
open "$APP"
echo '请在 Figma 的 Plugins → Development 中运行 Lingora localization。无需手动导入。'
