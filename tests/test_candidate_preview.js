import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Setup minimal browser mocks for Node environment
global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; }
};

global.window = {
  location: {
    hostname: 'localhost',
    origin: 'http://localhost:8000',
    href: 'http://localhost:8000/',
    protocol: 'http:'
  },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {}
};

global.document = {
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() {
    return {
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      appendChild() {},
      addEventListener() {}
    };
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

console.log('--- Запуск тестов предпрослушивания плагинов и архитектурной изоляции Sentinel Music ---');

// 1. Проверяем, что в основной кодовой базе (core) НЕТ упоминаний конкретных плагинов
const coreDirs = [
  path.join(rootDir, 'desktop', 'frontend', 'js'),
  path.join(rootDir, 'server', 'frontend', 'js')
];

const forbiddenPluginNames = [
  'hybrid_search',
  'hitmo',
  'hitmos',
  'zaycev',
  'zvuch',
  'slskd'
];

function checkFilesForForbiddenStrings(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      checkFilesForForbiddenStrings(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const code = fs.readFileSync(fullPath, 'utf8');
      for (const pluginName of forbiddenPluginNames) {
        const regex = new RegExp(`\\b${pluginName}\\b`, 'i');
        assert.ok(
          !regex.test(code),
          `Нарушение изоляции плагинов! Файл ядра ${fullPath} содержит прямое упоминание плагина «${pluginName}»`
        );
      }
    }
  }
}

coreDirs.forEach(dir => checkFilesForForbiddenStrings(dir));
console.log('✓ Основная кодовая база не содержит хардкода и упоминаний конкретных плагинов');

// 2. Проверяем синхронизацию ключевых модулей между desktop и server
const desktopJsDir = path.join(rootDir, 'desktop', 'frontend', 'js');
const serverJsDir = path.join(rootDir, 'server', 'frontend', 'js');

const sharedFilesToCheck = [
  'candidatePreview.js',
  'player.js',
  'pluginConnector.js',
  'queue.js',
  'lyrics.js',
  path.join('ui', 'search.js'),
  path.join('ui', 'trackVersions.js'),
  path.join('ui', 'expandedPlayer.js'),
  path.join('ui', 'reactions.js')
];

for (const rel of sharedFilesToCheck) {
  const dFile = path.join(desktopJsDir, rel);
  const sFile = path.join(serverJsDir, rel);
  assert.ok(fs.existsSync(dFile), `Файл ${rel} должен существовать в desktop/frontend/js`);
  assert.ok(fs.existsSync(sFile), `Файл ${rel} должен существовать в server/frontend/js`);

  const dContent = fs.readFileSync(dFile, 'utf8').replace(/\r\n/g, '\n');
  const sContent = fs.readFileSync(sFile, 'utf8').replace(/\r\n/g, '\n');
  assert.strictEqual(dContent, sContent, `Файл ${rel} рассинхронизирован между desktop и server`);
}
console.log('✓ Все задействованные модули синхронизированы между desktop и server');

// 3. Проверяем структуру candidatePreview.js
const candidatePreviewCode = fs.readFileSync(path.join(desktopJsDir, 'candidatePreview.js'), 'utf8');

// Проверяем отсутствие создания rogue new Audio()
assert.ok(
  !candidatePreviewCode.includes('new Audio()'),
  'candidatePreview.js НЕ должен создавать отдельный экземпляр new Audio(), все треки должны воспроизводиться через плеер!'
);

// Проверяем интеграцию с player.js
assert.ok(
  candidatePreviewCode.includes("from './player.js'"),
  'candidatePreview.js должен импортировать функции из центрального player.js'
);
assert.ok(
  candidatePreviewCode.includes('playTrack'),
  'candidatePreview.js должен вызывать playTrack для воспроизведения в плеере'
);
assert.ok(
  candidatePreviewCode.includes('candidateToTrack'),
  'candidatePreview.js должен экспортировать candidateToTrack для преобразования кандидата'
);
assert.ok(
  candidatePreviewCode.includes('isCandidatePlaying'),
  'candidatePreview.js должен экспортировать isCandidatePlaying для индикации активности'
);
assert.ok(
  candidatePreviewCode.includes('syncAllCandidateButtonsUI'),
  'candidatePreview.js должен синхронизировать состояние кнопок предпрослушивания'
);
console.log('✓ candidatePreview.js корректно маршрутизирует треки в центральный плеер без паразитного new Audio()');

// 4. Проверяем поддержку candidate в player.js
const playerCode = fs.readFileSync(path.join(desktopJsDir, 'player.js'), 'utf8');

assert.ok(
  playerCode.includes('track.is_preview') || playerCode.includes('track.is_candidate'),
  'player.js должен содержать обработку флага is_preview / is_candidate'
);
assert.ok(
  playerCode.includes("window.dispatchEvent(new CustomEvent('playback:play'"),
  'player.js должен генерировать событие playback:play для синхронизации UI плагинов'
);
assert.ok(
  playerCode.includes("window.dispatchEvent(new CustomEvent('playback:pause'"),
  'player.js должен генерировать событие playback:pause для синхронизации UI плагинов'
);
assert.ok(
  playerCode.includes('export function pauseTrack'),
  'player.js должен экспортировать функцию pauseTrack'
);
assert.ok(
  playerCode.includes('export function resumeTrack'),
  'player.js должен экспортировать функцию resumeTrack'
);
console.log('✓ player.js поддерживает воспроизведение треков-кандидатов, события playback:* и функции управления');

// 5. Проверяем расширение Sentinel SDK в pluginConnector.js
const connectorCode = fs.readFileSync(path.join(desktopJsDir, 'pluginConnector.js'), 'utf8');

assert.ok(
  connectorCode.includes('player: {'),
  'Sentinel SDK в pluginConnector.js должен предоставлять модуль Sentinel.player для плагинов'
);
assert.ok(
  connectorCode.includes('playCandidate('),
  'Sentinel.player должен содержать метод playCandidate'
);
console.log('✓ Sentinel SDK (pluginConnector.js) предоставляет player API без привязки к конкретным плагинам');

// 6. Проверяем функциональную логику парсинга и формирования модели трека кандидата
const {
  isCandidatePreviewSupported,
  parseCandidateDuration,
  candidateToTrack
} = await import('../frontend/js/candidatePreview.js');

const mockCandidate = {
  candidate_id: 'test_cand_123',
  title: 'Test Song',
  artist: 'Great Artist',
  album: 'Plugin Source',
  duration: '03:45',
  format: 'mp3',
  bitrate: 320,
  can_preview: true,
  source: 'network'
};

assert.strictEqual(isCandidatePreviewSupported(mockCandidate), true);
assert.strictEqual(isCandidatePreviewSupported({ can_preview: false }), false);
assert.strictEqual(parseCandidateDuration('03:45'), 225);
assert.strictEqual(parseCandidateDuration(180), 180);
assert.strictEqual(parseCandidateDuration('01:02:03'), 3723);

const trackObj = candidateToTrack(mockCandidate);
assert.strictEqual(trackObj.id, 'candidate_test_cand_123');
assert.strictEqual(trackObj.candidate_id, 'test_cand_123');
assert.strictEqual(trackObj.title, 'Test Song');
assert.strictEqual(trackObj.artist, 'Great Artist');
assert.strictEqual(trackObj.duration, 225);
assert.strictEqual(trackObj.is_preview, true);
assert.strictEqual(trackObj.is_candidate, true);
assert.ok(trackObj.preview_url.includes('test_cand_123'));
assert.ok(trackObj.preview_url.includes('/api/tracks/candidates/preview'));

console.log('✓ Логика преобразования и нормализации кандидатов успешно проверена');

console.log('\n--- ВСЕ ТЕСТЫ УСПЕШНО ПРОЙДЕНЫ! ---');
