# Lingora Figma Mac 安装与更新

这里分发 Lingora Figma 插件的 develop 预发布版本，无需 GitHub 账号、源码仓库、Node.js、Python 或 Homebrew。
编译后的插件可公开下载；安装包不包含账号、API Key 或个人设备设置。

## 安装或更新

先安装 Figma 桌面端并保存、同步设计稿，然后在终端执行：

```bash
/bin/bash -c "$(/usr/bin/curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' https://raw.githubusercontent.com/hzh137940556/lingora-figma-plugin/develop/install.sh)"
```

当前仅开放 `develop` 预发布渠道，正式版暂不发布。重复运行同一命令即可更新当前测试版本。脚本自动下载、校验、正常退出 Figma、备份配置、注册插件并重新打开 Figma。
不需要导入 manifest。安装后从 Plugins → Development → Lingora localization 运行插件。
首次使用仍需填写自己的 Lingora 服务、项目和 API Key。

## 适用范围

- 仅 macOS 的 Figma 桌面端，目前接受 Figma 126.x；真实界面验证版本为 126.10.13。
- 使用 Figma 内部的开发插件注册格式，非官方安装接口；不兼容的主版本停止安装。
- macOS 首次可能询问是否允许终端控制 Figma。拒绝权限、未保存提示或退出超时会停止，绝不强制终止。
- 没有后台自动更新，重新运行命令即可更新。
- GitHub 下载地址需要能从当前网络访问；安装器不需要 GitHub 凭据。

仅检查下载与配置兼容性，不退出 Figma 或写入注册：

```bash
/bin/bash -c "$(/usr/bin/curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' https://raw.githubusercontent.com/hzh137940556/lingora-figma-plugin/develop/install.sh)" -- --check
```

## 备份与恢复

版本和配置备份位于 `~/Library/Application Support/Lingora/FigmaPlugin/`。
每次安装都会新建备份；出现“配置备份”提示不代表安装失败，也不代表旧插件数据未清理。
备份保存的是安装前的 Figma 本机配置（包括插件注册），不是设计稿或翻译内容。安装器目前不会自动回滚。

如果安装失败，需要恢复到安装前：

1. 保存并同步设计稿，然后正常退出 Figma（按 ⌘Q，而不只是关闭窗口）。
2. 找到本次安装输出的“配置备份”路径，将下面的 `<备份目录名>` 替换为该路径最后一段的时间与进程号。
3. 在终端执行以下命令；它会检查 Figma 已退出、备份文件存在，再恢复配置并重开 Figma。

```bash
LINGORA_BACKUP="$HOME/Library/Application Support/Lingora/FigmaPlugin/backups/<备份目录名>/settings.json"

if /usr/bin/pgrep -x Figma >/dev/null; then
  echo "请先正常退出 Figma，再执行恢复。"
elif [ ! -f "$LINGORA_BACKUP" ]; then
  echo "未找到备份文件，请核对安装时显示的备份路径。"
else
  /bin/cp "$LINGORA_BACKUP" "$HOME/Library/Application Support/Figma/settings.json" \
    && /usr/bin/open -a Figma
fi
```

恢复整份备份会同时还原安装后修改的其他 Figma 设置，请核对备份时间。
它不会修改设计稿，也不会自动删除已下载的插件文件。
若目录内只有 `settings-absent`，说明安装前没有配置文件，不适用上述复制恢复方式。
备份含本机设置，不要公开。安装器不会自动删除旧版本和备份。

## 验证边界

CI 在独立的 Apple Silicon 和 Intel macOS runner 上匿名下载发布包、校验摘要，并在隔离目录
运行系统 JXA 注册测试与安装器预检。CI 使用 Figma 版本配置 fixture，不代表真实 Figma 登录或 UI 验收。
成员实际机器上的安装及首次连接仍需实测。

## 发布维护

插件源码维护在 Lingora 源码仓库，本仓库只保存公开分发脚本、版本索引和验证流程。
`main` 对应正式版 Release，`develop` 对应 prerelease；源码仓库同名分支的构建只能更新同名渠道。
版本附件不可覆盖，先完成 Release 发布，再通过审核后的 PR 更新同名渠道索引。
当前预发布版本为 `v0.1.0-rc.1`；正式版暂不发布。后续由源码仓库工作流发布；
自动流程需要维护者配置具备 Contents 和 Pull requests 读写权限的跨仓库发布凭据。
