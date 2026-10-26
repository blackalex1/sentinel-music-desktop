/**
 * Sentinel Music Desktop - Version Synchronizer
 * Читает версию из desktop/VERSION (Single Source of Truth)
 * и синхронизирует её в package.json, tauri.conf.json и src-tauri/Cargo.toml.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const versionFile = path.join(rootDir, 'VERSION');

if (!fs.existsSync(versionFile)) {
  console.warn('[SyncVersion] Файл VERSION не найден в desktop/');
  process.exit(0);
}

const version = fs.readFileSync(versionFile, 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`[SyncVersion] Ошибка: Некорректный формат версии в VERSION: "${version}"`);
  process.exit(1);
}

let modified = false;

// 1. package.json
const pkgPath = path.join(rootDir, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.version !== version) {
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`[SyncVersion] package.json -> v${version}`);
    modified = true;
  }
}

// 2. src-tauri/tauri.conf.json
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
if (fs.existsSync(tauriConfPath)) {
  const conf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  if (conf.version !== version) {
    conf.version = version;
    fs.writeFileSync(tauriConfPath, JSON.stringify(conf, null, 2) + '\n', 'utf8');
    console.log(`[SyncVersion] src-tauri/tauri.conf.json -> v${version}`);
    modified = true;
  }
}

// 3. src-tauri/Cargo.toml
const cargoPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
if (fs.existsSync(cargoPath)) {
  let cargoContent = fs.readFileSync(cargoPath, 'utf8');
  const cargoVersionRegex = /^version\s*=\s*"[^"]+"/m;
  const targetLine = `version = "${version}"`;
  if (cargoVersionRegex.test(cargoContent)) {
    const currentLine = cargoContent.match(cargoVersionRegex)[0];
    if (currentLine !== targetLine) {
      cargoContent = cargoContent.replace(cargoVersionRegex, targetLine);
      fs.writeFileSync(cargoPath, cargoContent, 'utf8');
      console.log(`[SyncVersion] src-tauri/Cargo.toml -> v${version}`);
      modified = true;
    }
  }
}

if (!modified) {
  // Уже все файлы соответствуют VERSION
}
