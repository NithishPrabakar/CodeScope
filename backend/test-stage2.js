import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('=== STARTING STAGE 2 AUTOMATED TEST SUITE ===\n');

  const testDir = path.resolve('test-artifacts');
  fs.mkdirSync(testDir, { recursive: true });

  // 1. Create a valid sample repository ZIP
  console.log('1. Creating sample valid repository ZIP...');
  const validZip = new AdmZip();
  validZip.addFile('sample-repo/package.json', Buffer.from(JSON.stringify({ name: 'sample-repo', version: '1.0.0' }, null, 2)));
  validZip.addFile('sample-repo/README.md', Buffer.from('# Sample Repository\nTesting Stage 2 extraction.'));
  validZip.addFile('sample-repo/src/index.ts', Buffer.from("import { add } from './utils/math';\nconsole.log(add(2, 3));"));
  validZip.addFile('sample-repo/src/utils/math.ts', Buffer.from('export const add = (a: number, b: number) => a + b;'));
  validZip.addFile('sample-repo/src/components/Header.tsx', Buffer.from("export const Header = () => <h1>Header</h1>;"));
  
  const validZipPath = path.join(testDir, 'sample-repo.zip');
  validZip.writeZip(validZipPath);
  console.log('   ✓ Valid ZIP created at:', validZipPath);

  // 2. Test uploading valid ZIP
  console.log('\n2. Testing POST /api/repos/upload with valid ZIP...');
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(validZipPath);
  const blob = new Blob([fileBuffer], { type: 'application/zip' });
  formData.append('repoZip', blob, 'sample-repo.zip');

  const uploadRes = await fetch('http://localhost:5000/api/repos/upload', {
    method: 'POST',
    body: formData,
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`Upload failed with status ${uploadRes.status}: ${errorText}`);
  }

  const uploadData = await uploadRes.json();
  console.log('   ✓ Upload succeeded!');
  console.log(`   - Repo ID: ${uploadData.repoId}`);
  console.log(`   - Repo Name: ${uploadData.repoName}`);
  console.log(`   - Total Files: ${uploadData.totalFiles} (Expected: 5)`);
  console.log(`   - Total Directories: ${uploadData.totalDirectories} (Expected: 2)`);
  console.log(`   - Root Node: ${uploadData.fileTree.name} (${uploadData.fileTree.children?.length} direct children)`);

  if (uploadData.totalFiles !== 5) {
    throw new Error(`Expected 5 files, got ${uploadData.totalFiles}`);
  }

  // 3. Test GET /api/repos/:repoId/tree
  console.log('\n3. Testing GET /api/repos/:repoId/tree for cached retrieval...');
  const treeRes = await fetch(`http://localhost:5000/api/repos/${uploadData.repoId}/tree`);
  if (!treeRes.ok) {
    throw new Error(`Tree fetch failed with status ${treeRes.status}`);
  }
  const treeData = await treeRes.json();
  console.log('   ✓ Tree API returned matching data:', treeData.repoName === uploadData.repoName);

  // 4. Test Invalid File Extension / Mime Type
  console.log('\n4. Testing invalid non-ZIP file upload rejection...');
  const invalidFormData = new FormData();
  const textBlob = new Blob(['Not a zip file content'], { type: 'text/plain' });
  invalidFormData.append('repoZip', textBlob, 'malicious.txt');

  const invalidRes = await fetch('http://localhost:5000/api/repos/upload', {
    method: 'POST',
    body: invalidFormData,
  });

  if (invalidRes.status === 400) {
    const errJson = await invalidRes.json();
    console.log('   ✓ Correctly rejected non-ZIP upload with 400 Bad Request:', errJson.error);
  } else {
    throw new Error(`Expected 400 Bad Request for non-ZIP file, got ${invalidRes.status}`);
  }

  // 5. Test Zip Slip Protection (Malicious Path Traversal)
  console.log('\n5. Testing Zip Slip (path traversal) vulnerability protection...');
  const maliciousZip = new AdmZip();
  maliciousZip.addFile('placeholder.txt', Buffer.from('Malicious payload'));
  maliciousZip.getEntries()[0].entryName = '../escaped-file.txt';
  const maliciousZipPath = path.join(testDir, 'zip-slip.zip');
  maliciousZip.writeZip(maliciousZipPath);

  const maliciousFormData = new FormData();
  const maliciousBlob = new Blob([fs.readFileSync(maliciousZipPath)], { type: 'application/zip' });
  maliciousFormData.append('repoZip', maliciousBlob, 'zip-slip.zip');

  const maliciousRes = await fetch('http://localhost:5000/api/repos/upload', {
    method: 'POST',
    body: maliciousFormData,
  });

  if (maliciousRes.status === 400) {
    const maliciousErr = await maliciousRes.json();
    console.log('   ✓ Correctly blocked Zip Slip attack with 400 Bad Request:', maliciousErr.error);
  } else {
    throw new Error(`Expected Zip Slip to be blocked with 400, got ${maliciousRes.status}`);
  }

  // Cleanup test artifacts
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {}

  console.log('\n=== ALL STAGE 2 TESTS PASSED PERFECTLY! ===');
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
