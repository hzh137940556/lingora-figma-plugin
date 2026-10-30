// 合并 Figma 开发插件注册；供 macOS JXA 执行，也供隔离测试验证纯逻辑。

// 校验并替换同一插件身份，保留其他插件与所有非插件设置。
function mergeRegistry(settings, manifest, directory) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw Error('Figma 配置不是对象');
  if (!manifest || !/^\d+$/.test(manifest.id) || manifest.main !== 'main.js' || manifest.ui !== 'ui.html') throw Error('插件清单无效');
  var result = JSON.parse(JSON.stringify(settings));
  var entries = result.localFileExtensions === undefined ? [] : result.localFileExtensions;
  if (!Array.isArray(entries)) throw Error('不支持的 Figma 注册格式');
  var ids = {};
  var maximum = 0;
  entries.forEach(function (entry) {
    if (!entry || !Number.isSafeInteger(entry.id) || entry.id < 1 || ids[entry.id] || typeof entry.manifestPath !== 'string') throw Error('Figma 注册记录损坏');
    ids[entry.id] = true;
    maximum = Math.max(maximum, entry.id);
  });
  if (maximum > Number.MAX_SAFE_INTEGER - 3) throw Error('Figma 注册编号超出范围');
  var replaced = {};
  entries.forEach(function (entry) {
    if (entry.lastKnownPluginId === manifest.id || entry.manifestPath === directory + '/manifest.json') replaced[entry.id] = true;
  });
  var matches = entries.filter(function (entry) { return replaced[entry.id]; });
  var first = maximum + 1;
  // 完整且路径一致时保留原编号，重复安装不积累记录。
  if (matches.length === 1) {
    var old = matches[0];
    var meta = old.fileMetadata || {};
    if (meta.type === 'manifest' && meta.codeFileId && Array.isArray(meta.uiFileIds) && meta.uiFileIds.length === 1 && old.manifestPath === directory + '/manifest.json') {
      var code = entries.filter(function (e) { return e.id === meta.codeFileId && e.manifestPath === directory + '/main.js' && e.fileMetadata && e.fileMetadata.manifestFileId === old.id && e.fileMetadata.type === 'code'; });
      var ui = entries.filter(function (e) { return e.id === meta.uiFileIds[0] && e.manifestPath === directory + '/ui.html' && e.fileMetadata && e.fileMetadata.manifestFileId === old.id && e.fileMetadata.type === 'ui'; });
      if (code.length === 1 && ui.length === 1 && old.lastKnownPluginId === manifest.id && old.lastKnownName === manifest.name) return result;
    }
  }
  result.localFileExtensions = entries.filter(function (entry) {
    return !replaced[entry.id] && !(entry.fileMetadata && replaced[entry.fileMetadata.manifestFileId]);
  });
  result.localFileExtensions.push(
    { id: first, manifestPath: directory + '/manifest.json', lastKnownName: manifest.name, lastKnownPluginId: manifest.id, fileMetadata: { type: 'manifest', codeFileId: first + 1, uiFileIds: [first + 2] }, cachedContainsWidget: false },
    { id: first + 1, manifestPath: directory + '/main.js', fileMetadata: { type: 'code', manifestFileId: first } },
    { id: first + 2, manifestPath: directory + '/ui.html', fileMetadata: { type: 'ui', manifestFileId: first } }
  );
  return result;
}

// 使用系统 Foundation 读写 UTF-8，不依赖 Node、Python 或用户 Shell 配置。
function run(args) {
  ObjC.import('Foundation');
  var fm = $.NSFileManager.defaultManager;
  function read(path) {
    var error = Ref();
    var value = $.NSString.stringWithContentsOfFileEncodingError($(path), $.NSUTF8StringEncoding, error);
    if (!value || value.isNil()) throw Error('无法读取安装配置');
    return JSON.parse(ObjC.unwrap(value));
  }
  var settings = fm.fileExistsAtPath($(args[0])) ? read(args[0]) : {};
  var manifest = read(args[1]);
  var merged = mergeRegistry(settings, manifest, args[2]);
  var error = Ref();
  if (!$(JSON.stringify(merged)).writeToFileAtomicallyEncodingError($(args[3]), true, $.NSUTF8StringEncoding, error)) throw Error('无法写入安装配置');
  return '配置校验通过';
}
