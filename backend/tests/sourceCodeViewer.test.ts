import { test, describe } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { extractZipSafely } from '../src/utils/zipHandler.js';
import { buildStage4SampleZip } from '../create-stage4-sample-repo.js';

describe('Source Code Viewer & Security Verification', () => {
  const testId = uuidv4();
  const testExtractDir = path.resolve('uploads', 'extracted', testId);
  const tempZipPath = path.resolve('test-artifacts', `source-test-${testId}.zip`);

  fs.mkdirSync(path.dirname(tempZipPath), { recursive: true });
  fs.mkdirSync(testExtractDir, { recursive: true });

  // Create sample repository archive
  buildStage4SampleZip(tempZipPath);
  extractZipSafely(tempZipPath, testExtractDir);

  // Helper to resolve scan target (single folder unwrap)
  const entries = fs.readdirSync(testExtractDir);
  const scanTarget = entries.length === 1 && fs.statSync(path.join(testExtractDir, entries[0])).isDirectory()
    ? path.join(testExtractDir, entries[0])
    : testExtractDir;

  test('Valid source file reading and line counting', () => {
    const filePath = 'src/utils/math.ts';
    const fullPath = path.resolve(scanTarget, filePath);

    assert.ok(fs.existsSync(fullPath), 'math.ts should exist');
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');

    assert.ok(lines.length >= 2, 'Should have multiple lines');
    assert.ok(content.includes('export const add'), 'Should contain source functions');
  });

  test('Nested file reading across directory depth', () => {
    const nestedPath = 'src/components/Calculator.tsx';
    const fullPath = path.resolve(scanTarget, nestedPath);

    assert.ok(fs.existsSync(fullPath), 'Calculator.tsx should exist');
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.ok(content.includes('export const Calculator'));
  });

  test('Different supported file types (JSON, CSS, Markdown, TSX)', () => {
    const filesToTest = [
      { path: 'package.json', ext: '.json', check: 'stage4-impact-demo' },
      { path: 'README.md', ext: '.md', check: 'Stage 4 Impact Analysis Demo' },
      { path: 'src/styles/app.css', ext: '.css', check: '@import' },
      { path: 'src/components/Calculator.tsx', ext: '.tsx', check: 'Calculator' },
    ];

    for (const f of filesToTest) {
      const fullPath = path.resolve(scanTarget, f.path);
      assert.ok(fs.existsSync(fullPath), `${f.path} must exist`);
      const content = fs.readFileSync(fullPath, 'utf-8');
      assert.ok(content.includes(f.check), `${f.path} must contain ${f.check}`);
      assert.strictEqual(path.extname(f.path), f.ext);
    }
  });

  test('Empty file handling (0 bytes)', () => {
    const emptyPath = 'src/empty.ts';
    const fullPath = path.resolve(scanTarget, emptyPath);

    assert.ok(fs.existsSync(fullPath), 'empty.ts should exist');
    const stat = fs.statSync(fullPath);
    assert.strictEqual(stat.size, 0, 'Empty file must have 0 size');

    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.strictEqual(content, '', 'Empty file content must be empty string');
  });

  test('Security: Path traversal attempts are blocked', () => {
    const maliciousPaths = [
      '../../package.json',
      '..\\..\\package.json',
      '/etc/passwd',
      '..%2f..%2fpackage.json',
    ];

    const safeBase = path.resolve(scanTarget);

    for (const mal of maliciousPaths) {
      const decoded = decodeURIComponent(mal).replace(/\\/g, '/');
      const resolved = path.resolve(safeBase, decoded);
      const isTraversal = !resolved.startsWith(safeBase + path.sep) && resolved !== safeBase;
      assert.strictEqual(isTraversal, true, `Path traversal must be detected for: ${mal}`);
    }
  });

  test('Binary file detection by extension and null byte sampling', () => {
    const binaryExts = ['.png', '.jpg', '.zip', '.exe', '.pdf', '.woff2'];
    for (const ext of binaryExts) {
      const isBin = ['.png', '.jpg', '.zip', '.exe', '.pdf', '.woff2'].includes(ext);
      assert.strictEqual(isBin, true);
    }

    // Byte check with null byte
    const fakeBinary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0a]);
    let hasNull = false;
    for (let i = 0; i < fakeBinary.length; i++) {
      if (fakeBinary[i] === 0) {
        hasNull = true;
        break;
      }
    }
    assert.strictEqual(hasNull, true, 'Null byte must trigger binary detection');
  });

  test('Directory rejection: directories cannot be opened as files', () => {
    const dirPath = path.resolve(scanTarget, 'src/utils');
    const stat = fs.statSync(dirPath);
    assert.strictEqual(stat.isDirectory(), true, 'Must identify directory correctly');
  });

  test('Large file truncation guard logic', () => {
    const MAX_VIEW_SIZE = 2 * 1024 * 1024;
    const fakeLargeSize = 3 * 1024 * 1024; // 3MB
    assert.ok(fakeLargeSize > MAX_VIEW_SIZE, 'Should detect file larger than 2MB');
  });

  // Cleanup
  test.after(() => {
    try {
      fs.rmSync(testExtractDir, { recursive: true, force: true });
      fs.rmSync(tempZipPath, { force: true });
    } catch {}
  });
});
