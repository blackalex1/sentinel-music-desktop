const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Running Sentinel Music Desktop Asset & Config Tests ---');

// 1. Проверяем package.json
const pkgPath = path.join(__dirname, '..', 'package.json');
assert.ok(fs.existsSync(pkgPath), 'package.json должен существовать');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
assert.strictEqual(pkg.name, 'sentinel-music-desktop', 'Имя пакета должно быть sentinel-music-desktop');
assert.strictEqual(pkg.version, '0.0.1', 'Версия пакета должна быть 0.0.1');
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
    'styles/tracklist.css',
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

// 6. Проверяем интеграцию динамического онлайн-поиска (по фонотеке и сети)
const tracksViewPath = path.join(frontendDir, 'js', 'components', 'views', 'tracksView.js');
const tracksViewJs = fs.readFileSync(tracksViewPath, 'utf8');
assert.ok(tracksViewJs.includes('searchTabsBar'), 'tracksView.js должен содержать контейнер searchTabsBar');
assert.ok(tracksViewJs.includes('searchCandidatesView'), 'tracksView.js должен содержать контейнер searchCandidatesView');

const searchJsPath = path.join(frontendDir, 'js', 'ui', 'search.js');
const searchJs = fs.readFileSync(searchJsPath, 'utf8');
assert.ok(searchJs.includes('searchCandidates'), 'search.js должен запрашивать кандидатов из сети через searchCandidates');
assert.ok(searchJs.includes('downloadCandidate'), 'search.js должен поддерживать скачивание кандидатов через downloadCandidate');
assert.ok(searchJs.includes('toggleCandidatePreview'), 'search.js должен поддерживать предпрослушивание кандидатов');
console.log('✓ Архитектура динамического поиска по фонотеке и сети успешно верифицирована');

console.log('--- ВСЕ АССЕТ-ТЕСТЫ УСПЕШНО ПРОЙДЕНЫ! ---');
