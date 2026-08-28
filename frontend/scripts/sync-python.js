import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceDir = path.resolve(__dirname, '../../backend/planenificator');
const targetDir = path.resolve(__dirname, '../static/planenificator');

if (!fs.existsSync(sourceDir)) {
	console.error(`Source directory not found: ${sourceDir}`);
	process.exit(1);
}

if (!fs.existsSync(targetDir)) {
	fs.mkdirSync(targetDir, { recursive: true });
}

const files = fs.readdirSync(sourceDir);
let copiedCount = 0;

for (const file of files) {
	if (file.endsWith('.py')) {
		const srcFile = path.join(sourceDir, file);
		const destFile = path.join(targetDir, file);
		fs.copyFileSync(srcFile, destFile);
		copiedCount++;
	}
}

console.log(`Successfully synchronized ${copiedCount} Python modules to ${targetDir}`);
