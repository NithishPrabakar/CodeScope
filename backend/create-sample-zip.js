import AdmZip from 'adm-zip';
import path from 'path';

const zip = new AdmZip();

zip.addFile('CodeScope-Demo/package.json', Buffer.from(JSON.stringify({
  name: 'codescope-demo-project',
  version: '1.0.0',
  description: 'Sample project to test repository upload and file tree explorer',
  main: 'src/index.ts',
  dependencies: {
    react: '^18.3.1',
    express: '^4.21.2'
  }
}, null, 2)));

zip.addFile('CodeScope-Demo/README.md', Buffer.from('# CodeScope Demo Repository\n\nThis is a sample JavaScript/TypeScript repository used to verify file upload, extraction, and file explorer visualization.'));

zip.addFile('CodeScope-Demo/src/index.ts', Buffer.from(`import { analyzeCode } from './services/analyzer';
import { renderUI } from './components/App';

console.log('App Initialized');
analyzeCode();
renderUI();
`));

zip.addFile('CodeScope-Demo/src/components/App.tsx', Buffer.from(`export const renderUI = () => {
  return <div>CodeScope Demo Component</div>;
};
`));

zip.addFile('CodeScope-Demo/src/components/Header.tsx', Buffer.from(`export const Header = () => {
  return <header><h1>Header Navigation</h1></header>;
};
`));

zip.addFile('CodeScope-Demo/src/services/analyzer.ts', Buffer.from(`export function analyzeCode(): void {
  console.log('Analyzing dependencies and changes...');
}
`));

zip.addFile('CodeScope-Demo/src/utils/math.ts', Buffer.from(`export const add = (a: number, b: number): number => a + b;
export const multiply = (a: number, b: number): number => a * b;
`));

zip.addFile('CodeScope-Demo/src/styles/main.css', Buffer.from(`body {
  margin: 0;
  font-family: sans-serif;
  background-color: #0b1120;
}
`));

const outputPath = path.resolve('..', 'sample-repo.zip');
zip.writeZip(outputPath);
console.log('Sample ZIP archive generated successfully at:', outputPath);
