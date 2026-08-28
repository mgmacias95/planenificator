<script lang="ts">
	import { onMount } from 'svelte';
	import { chartStore } from '$lib/state/charts.svelte';
	import { chartGeoreferencer } from '$lib/services/georef';
	import Icon from './Icon.svelte';
	import * as m from '$lib/paraglide/messages';

	let isDragging = $state<boolean>(false);
	let selectedCatalogId = $state<string>('');
	let fileInput: HTMLInputElement;

	onMount(() => {
		chartStore.loadCatalog();
	});

	async function handleFiles(files: FileList | File[]) {
		const fileArr = Array.from(files);
		if (fileArr.length === 0) return;

		chartStore.isLoadingChart = true;
		chartStore.errorMessage = null;

		try {
			// 1. Process ZIP archives
			for (const file of fileArr) {
				if (file.name.toLowerCase().endsWith('.zip')) {
					try {
						const arrayBuffer = await file.arrayBuffer();
						const { tiffBuffer, tfwText } = await chartGeoreferencer.unpackZipChart(arrayBuffer);
						const overlay = await chartGeoreferencer.processRasterChart(
							file.name,
							tiffBuffer,
							tfwText
						);
						chartStore.addChart(overlay);
					} catch (err: any) {
						chartStore.errorMessage = `Error reading ZIP chart: ${err?.message || err}`;
					}
				}
			}

			// 2. Process TIF/TIFF files (with matching TFW or standalone GeoTIFF)
			const tifs = fileArr.filter(
				(f) => f.name.toLowerCase().endsWith('.tif') || f.name.toLowerCase().endsWith('.tiff')
			);
			const tfws = fileArr.filter((f) => f.name.toLowerCase().endsWith('.tfw'));

			for (const tif of tifs) {
				const base = tif.name.replace(/\.[^/.]+$/, '');
				const matchTfw = tfws.find(
					(tfw) => tfw.name.replace(/\.[^/.]+$/, '').toLowerCase() === base.toLowerCase()
				);
				try {
					const tiffBuffer = await tif.arrayBuffer();
					const tfwText = matchTfw ? await matchTfw.text() : '';
					const overlay = await chartGeoreferencer.processRasterChart(
						tif.name,
						tiffBuffer,
						tfwText
					);
					chartStore.addChart(overlay);
				} catch (err: any) {
					chartStore.errorMessage = `Error reading chart: ${err?.message || err}`;
				}
			}
		} finally {
			chartStore.isLoadingChart = false;
		}
	}

	async function handleLoadCatalogChart() {
		const item = chartStore.catalog.find((c) => c.id === selectedCatalogId);
		if (!item) return;
		try {
			await chartStore.loadOnlineCatalogItem(item);
		} catch {
			// Handled in store
		}
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="flex items-center gap-2 text-sm font-semibold text-slate-100">
			<Icon name="layers" class="h-4 w-4 text-cyan-400" />
			<span>{m.charts_title()}</span>
		</h3>
		<span class="font-mono text-[11px] text-slate-400">
			{chartStore.loadedCharts.length}/4 {m.charts_active()}
		</span>
	</div>

	<!-- Online Catalog Selector -->
	{#if chartStore.errorMessage}
		<div
			class="rounded-xl border border-rose-800 bg-rose-950/60 p-3 text-sm text-rose-200"
			role="alert"
		>
			{chartStore.errorMessage}
		</div>
	{/if}

	<div class="space-y-2 rounded-xl border border-slate-700/80 bg-slate-950/70 p-3.5 shadow-xs">
		<label for="catalog-select" class="block text-[11px] font-medium text-slate-400">
			{m.charts_catalog_label()}
		</label>
		<div class="flex gap-2">
			<select
				id="catalog-select"
				bind:value={selectedCatalogId}
				disabled={chartStore.isLoadingCatalog || chartStore.isLoadingChart}
				class="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-hidden disabled:opacity-50"
			>
				<option value="">{m.charts_select_placeholder()}</option>
				{#each chartStore.catalog as item (item.id)}
					<option value={item.id}>{item.name}</option>
				{/each}
			</select>

			<button
				type="button"
				onclick={handleLoadCatalogChart}
				disabled={!selectedCatalogId || chartStore.isLoadingChart}
				class="flex shrink-0 items-center justify-center rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500"
			>
				{#if chartStore.isLoadingChart}
					<Icon name="loader" class="h-4 w-4" />
				{:else}
					{m.btn_load()}
				{/if}
			</button>
		</div>
	</div>

	<!-- Dropzone for local files -->
	<div
		class="cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-colors"
		class:border-cyan-500={isDragging}
		class:bg-cyan-950={isDragging}
		class:border-slate-700={!isDragging}
		class:bg-slate-950={!isDragging}
		ondragover={(e) => {
			e.preventDefault();
			isDragging = true;
		}}
		ondragleave={() => (isDragging = false)}
		ondrop={(e) => {
			e.preventDefault();
			isDragging = false;
			if (e.dataTransfer?.files) {
				handleFiles(e.dataTransfer.files);
			}
		}}
		onclick={() => fileInput?.click()}
		role="button"
		tabindex="0"
		aria-label={m.charts_choose_files()}
		aria-describedby="chart-file-hint"
		aria-busy={chartStore.isLoadingChart}
		onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput?.click()}
	>
		<input
			bind:this={fileInput}
			type="file"
			multiple
			accept=".zip,.tif,.tiff,.tfw"
			class="hidden"
			onchange={(e) => {
				const input = e.target as HTMLInputElement;
				if (input.files) {
					handleFiles(input.files);
				}
			}}
		/>
		<div
			class="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-cyan-950 text-cyan-300"
		>
			<Icon name={chartStore.isLoadingChart ? 'loader' : 'plus'} class="h-5 w-5" />
		</div>
		<div class="text-sm font-semibold text-slate-100">{m.charts_choose_files()}</div>
		<div class="mt-1 text-xs text-slate-400">{m.charts_dropzone()}</div>
		<div id="chart-file-hint" class="mt-1 text-[11px] leading-relaxed text-slate-500">
			{m.charts_choose_hint()}
		</div>
	</div>

	<!-- Loaded Charts Management List -->
	{#if chartStore.loadedCharts.length > 0}
		<div class="space-y-2">
			<div class="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
				{m.charts_active()}
			</div>

			{#each chartStore.loadedCharts as chart (chart.id)}
				<div class="space-y-2 rounded-lg border border-slate-800 bg-slate-900 p-2.5">
					<div class="flex items-center justify-between">
						<label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								checked={chart.visible}
								onchange={() => chartStore.toggleVisibility(chart.id)}
								class="rounded-sm border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-400"
							/>
							<span class="truncate text-xs font-semibold text-slate-200" title={chart.name}>
								{chart.name}
							</span>
						</label>

						<button
							type="button"
							onclick={() => chartStore.removeChart(chart.id)}
							class="ml-2 shrink-0 p-1 text-slate-500 transition-colors hover:text-rose-400"
							title="Unload Chart"
						>
							<Icon name="x" class="h-3.5 w-3.5" />
						</button>
					</div>

					<div class="flex items-center gap-2 text-[11px] text-slate-400">
						<span class="shrink-0">Opacity:</span>
						<input
							type="range"
							min="0"
							max="1"
							step="0.05"
							value={chart.opacity}
							oninput={(e) =>
								chartStore.setOpacity(chart.id, parseFloat((e.target as HTMLInputElement).value))}
							class="w-full bg-slate-950 accent-cyan-400"
						/>
						<span class="w-8 text-right font-mono text-[10px]">
							{Math.round(chart.opacity * 100)}%
						</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
