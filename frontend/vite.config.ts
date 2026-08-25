import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function pythonSyncPlugin() {
	const sourceDir = path.resolve(__dirname, '../backend/planenificator');
	const targetDir = path.resolve(__dirname, 'static/planenificator');

	function sync() {
		if (!fs.existsSync(sourceDir)) {
			return;
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
		console.log(
			`[python-sync] Synchronized ${copiedCount} Python modules to static/planenificator`
		);
	}

	return {
		name: 'python-sync',
		buildStart() {
			sync();
		},
		configureServer(server: import('vite').ViteDevServer) {
			server.watcher.add(sourceDir);
			server.watcher.on('all', (_event, filePath) => {
				if (filePath.startsWith(sourceDir) && filePath.endsWith('.py')) {
					sync();
				}
			});
		}
	};
}

export default defineConfig({
	plugins: [
		pythonSyncPlugin(),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: 'index.html', strict: false }),
			paths: {
				base: process.argv.includes('dev') ? '' : (process.env.BASE_PATH ?? '')
			}
		}),

		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true
		})
	],
	test: {
		expect: { requireAssertions: true },
		environment: 'node',
		include: ['src/**/*.{test,spec}.{js,ts}', 'tests/unit/**/*.{test,spec}.{js,ts}'],
		exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'tests/e2e/**']
	}
});
