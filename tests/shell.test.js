import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('index.html contains all essential HUD and UI overlay IDs', () => {
  const htmlPath = path.resolve('index.html');
  assert.ok(fs.existsSync(htmlPath), 'index.html must exist');
  const content = fs.readFileSync(htmlPath, 'utf8');

  const requiredIds = [
    'game-container',
    'game-canvas',
    'hud',
    'hud-position',
    'hud-lap',
    'hud-timer',
    'hud-best-lap',
    'hud-speed',
    'hud-nitro-fill',
    'minimap-canvas',
    'menu-screen',
    'start-btn',
    'countdown-overlay',
    'finish-screen',
    'leaderboard-table'
  ];

  for (const id of requiredIds) {
    assert.match(content, new RegExp(`id=["']${id}["']`), `Missing required ID: ${id}`);
  }
});

test('css/style.css exists and contains synthwave theme rules', () => {
  const cssPath = path.resolve('css/style.css');
  assert.ok(fs.existsSync(cssPath), 'css/style.css must exist');
  const content = fs.readFileSync(cssPath, 'utf8');

  const requiredSelectors = [
    '#game-container',
    '#game-canvas',
    '#hud',
    '#minimap-container',
    '#dashboard',
    '.neon-pink',
    '.neon-cyan',
    '.screen-overlay'
  ];

  for (const selector of requiredSelectors) {
    assert.ok(content.includes(selector), `Missing required CSS selector: ${selector}`);
  }
});
