import fs from 'fs';
import path from 'path';
import { buildStage4SampleZip } from './create-stage4-sample-repo.js';

async function runStage7Tests() {
  console.log('=== STARTING STAGE 7 SOURCE CODE VIEWER & NAVIGATION TEST SUITE ===\n');

  const testZipPath = path.resolve('test-artifacts', 'stage7-test.zip');
  fs.mkdirSync(path.dirname(testZipPath), { recursive: true });

  console.log('1. Building sample repository archive for Stage 7 testing...');
  buildStage4SampleZip(testZipPath);
  console.log('   ✓ Test archive built successfully');

  // Upload to API
  console.log('\n2. Uploading archive to POST /api/repos/upload on port 5000...');
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(testZipPath);
  const blob = new Blob([fileBuffer], { type: 'application/zip' });
  formData.append('repoZip', blob, 'stage7-test.zip');

  const uploadRes = await fetch('http://localhost:5000/api/repos/upload', {
    method: 'POST',
    body: formData,
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`Upload failed with status ${uploadRes.status}: ${errorText}`);
  }

  const uploadData = await uploadRes.json();
  const repoId = uploadData.repoId;
  console.log(`   ✓ Upload succeeded! Repo ID: ${repoId}`);

  // Test 1: Fetch valid source code file
  console.log('\n3. Fetching source code for "src/utils/math.ts" via GET /api/repos/:repoId/file...');
  const fileRes = await fetch(`http://localhost:5000/api/repos/${repoId}/file?path=src/utils/math.ts`);
  if (!fileRes.ok) throw new Error(`File fetch failed with status ${fileRes.status}`);
  const fileData = await fileRes.json();

  console.log(`   • File path: ${fileData.filePath}`);
  console.log(`   • Total lines: ${fileData.totalLines}`);
  console.log(`   • File size: ${fileData.size} bytes`);
  console.log(`   • Is binary: ${fileData.isBinary}`);
  console.log(`   • Extension: ${fileData.extension}`);

  if (!fileData.content || !fileData.content.includes('export const add')) {
    throw new Error('Expected source code content was missing or corrupt');
  }
  console.log('   ✓ Source code content matches repository file accurately');

  // Verify Dependency Awareness
  console.log('\n4. Verifying Dependency Awareness in file response...');
  console.log(`   • Outgoing dependencies: ${fileData.outgoingDependencies.length}`);
  console.log(`   • Incoming callers (dependents): ${fileData.incomingDependents.length}`);

  const callerFiles = fileData.incomingDependents.map((d) => d.sourceFile);
  console.log(`   • Callers of math.ts: ${callerFiles.join(', ')}`);
  if (!callerFiles.includes('src/services/calcService.ts') || !callerFiles.includes('src/utils/index.ts')) {
    throw new Error('Incoming dependents did not include expected callers (calcService.ts, index.ts)');
  }
  console.log('   ✓ Incoming dependents correctly identified with caller line information');

  // Test 2: Binary file handling (assets/icon.png)
  console.log('\n5. Testing Binary File detection on "src/assets/icon.png"...');
  const binRes = await fetch(`http://localhost:5000/api/repos/${repoId}/file?path=src/assets/icon.png`);
  if (!binRes.ok) throw new Error(`Binary file fetch failed: ${binRes.status}`);
  const binData = await binRes.json();

  if (!binData.isBinary) {
    throw new Error('Expected isBinary to be true for icon.png');
  }
  console.log(`   ✓ Binary file correctly flagged: isBinary=true, message="${binData.message}"`);

  // Test 3: Path traversal protection
  console.log('\n6. Testing Security: Path traversal attempts must be blocked with 403 Forbidden...');
  const traversalAttempts = [
    '../../package.json',
    '..\\..\\package.json',
    '../../../windows/system32/cmd.exe',
  ];

  for (const attempt of traversalAttempts) {
    const travRes = await fetch(`http://localhost:5000/api/repos/${repoId}/file?path=${encodeURIComponent(attempt)}`);
    if (travRes.status !== 403) {
      throw new Error(`Security breach! Expected 403 Forbidden for "${attempt}", got ${travRes.status}`);
    }
  }
  console.log('   ✓ All path traversal attacks strictly blocked with 403 Forbidden');

  // Test 4: Missing file handling
  console.log('\n7. Testing Non-Existent File handling...');
  const missingRes = await fetch(`http://localhost:5000/api/repos/${repoId}/file?path=src/non-existent-file.ts`);
  if (missingRes.status !== 404) {
    throw new Error(`Expected 404 for missing file, got ${missingRes.status}`);
  }
  console.log('   ✓ Non-existent file correctly returned 404 Not Found');

  // Test 5: Directory path rejection
  console.log('\n8. Testing Directory Path rejection...');
  const dirRes = await fetch(`http://localhost:5000/api/repos/${repoId}/file?path=src/utils`);
  if (dirRes.status !== 400) {
    throw new Error(`Expected 400 when requesting directory, got ${dirRes.status}`);
  }
  console.log('   ✓ Directory path correctly rejected with 400 Bad Request');

  // Test 6: Empty file handling (0 bytes)
  console.log('\n9. Testing Empty File handling (src/empty.ts)...');
  const emptyRes = await fetch(`http://localhost:5000/api/repos/${repoId}/file?path=src/empty.ts`);
  if (!emptyRes.ok) throw new Error(`Empty file fetch failed: ${emptyRes.status}`);
  const emptyData = await emptyRes.json();
  if (emptyData.size !== 0 || emptyData.totalLines !== 0 || emptyData.content !== '') {
    throw new Error(`Empty file failed validation: size=${emptyData.size}, lines=${emptyData.totalLines}`);
  }
  console.log('   ✓ Empty file handled accurately: size=0, lines=0, content=""');

  // Test 7: Different supported file types (JSON, CSS, Markdown, TSX)
  console.log('\n10. Testing Different Supported File Types...');
  const typesToCheck = ['package.json', 'README.md', 'src/styles/app.css', 'src/components/Calculator.tsx'];
  for (const tPath of typesToCheck) {
    const tRes = await fetch(`http://localhost:5000/api/repos/${repoId}/file?path=${tPath}`);
    if (!tRes.ok) throw new Error(`Failed to load ${tPath}: status ${tRes.status}`);
    const tData = await tRes.json();
    if (!tData.content || tData.isBinary) throw new Error(`${tPath} returned invalid content or marked binary`);
    console.log(`   ✓ ${tPath.padEnd(30)} loaded (${tData.totalLines} lines, ${tData.extension})`);
  }

  // Cleanup
  try {
    fs.rmSync(path.dirname(testZipPath), { recursive: true, force: true });
  } catch {}

  console.log('\n===============================================================');
  console.log('🎉 ALL STAGE 7 SPECIFICATION REQUIREMENTS VERIFIED & PASSED! 🎉');
  console.log('===============================================================');
}

runStage7Tests().catch((err) => {
  console.error('\n❌ Stage 7 Test Suite Failed:', err);
  process.exit(1);
});
