const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Running Sentinel Music Desktop Asset & Config Tests ---');

// 1. Проверяем package.json
const pkgPath = path.join(__dirname, '..', 'package.json');
assert.ok(fs.existsSync(pkgPath), 'package.json должен существовать');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
assert.strictEqual(pkg.name, 'sentinel-music-desktop', 'Имя пакета должно быть sentinel-music-desktop');
assert.ok(pkg.scripts && pkg.scripts.build, 'Скрипт build должен быть определен в package.json');
console.log('✓ package.json валиден');

// 2. Проверяем tauri.conf.json
const confPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
assert.ok(fs.existsSync(confPath), 'tauri.conf.json должен существовать');
const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
assert.strictEqual(conf.productName, 'Sentinel Music', 'productName должен быть "Sentinel Music"');
assert.strictEqual(conf.identifier, 'com.sentinelmusic.desktop', 'identifier должен быть "com.sentinelmusic.desktop"');
assert.ok(conf.bundle && conf.bundle.icon, 'bundle.icon должен быть задан');
console.log('✓ tauri.conf.json валиден');

// 3. Проверяем наличие всех иконок, указанных в tauri.conf.json
conf.bundle.icon.forEach((iconRel) => {
    const iconPath = path.join(__dirname, '..', 'src-tauri', iconRel);
    assert.ok(fs.existsSync(iconPath), `Иконка ${iconRel} должна существовать`);
});
console.log(`✓ Все ${conf.bundle.icon.length} иконки бандла присутствуют на диске`);

// 4. Проверяем наличие фронтенд-ассетов
const frontendDir = path.join(__dirname, '..', 'frontend');
assert.ok(fs.existsSync(frontendDir), 'Папка frontend должна присутствовать в репозитории');

const requiredFiles = [
    'index.html',
    'login.html',
    'js/app.js',
    'styles/login.css',
    'styles/player.css',
    'styles/modals.css',
    'img/logo.png'
];

requiredFiles.forEach((rel) => {
    const filePath = path.join(frontendDir, rel);
    assert.ok(fs.existsSync(filePath), `Файл ${rel} должен существовать во frontend/`);
    const stat = fs.statSync(filePath);
    assert.ok(stat.size > 0, `Файл ${rel} не должен быть пустым`);
});
console.log('✓ Критичные файлы фронтенда проверены и не пусты');

// 5. Проверяем валидность HTML-структуры и подключение скриптов
const indexHtml = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
assert.ok(indexHtml.includes('Sentinel Music'), 'index.html должен содержать название Sentinel Music');
assert.ok(indexHtml.includes('js/app.js'), 'index.html должен подключать app.js');

const loginHtml = fs.readFileSync(path.join(frontendDir, 'login.html'), 'utf8');
assert.ok(loginHtml.includes('login-card') || loginHtml.includes('login-container') || loginHtml.includes('Sentinel Music'), 'login.html должен содержать экран входа');
console.log('✓ index.html и login.html корректно содержат структуру приложения');

console.log('--- ВСЕ АССЕТ-ТЕСТЫ УСПЕШНО ПРОЙДЕНЫ! ---');
