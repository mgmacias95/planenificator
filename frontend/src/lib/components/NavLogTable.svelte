<script lang="ts">
	import { calculationStore } from '$lib/state/calculation.svelte';
	import Icon from './Icon.svelte';
	import * as m from '$lib/paraglide/messages';

	function isTechnicalError(error: string) {
		return error.includes('Traceback') || error.includes('File "') || error.includes('pyodide');
	}

	function userFacingError(error: string) {
		if (error.includes('Weather forecast unavailable for the selected departure time')) {
			return m.weather_unavailable_message();
		}
		return isTechnicalError(error) ? m.calculation_error_message() : error;
	}
</script>

<div class="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90 shadow-lg">
	{#if calculationStore.isStale}
		<div
			class="border-b border-amber-500/40 bg-amber-950/60 px-4 py-2 text-sm font-semibold text-amber-200"
			role="status"
		>
			{m.route_stale()}
		</div>
	{/if}
	<div class="flex items-center justify-between border-b border-slate-800 bg-slate-900 p-3">
		<div class="flex items-center gap-2">
			<Icon name="clipboard" class="h-4 w-4 text-cyan-400" />
			<h3 class="text-sm font-semibold tracking-wider text-slate-200 uppercase">
				{m.navlog_title()}
			</h3>
		</div>

		{#if calculationStore.hasCalculated}
			<div class="flex items-center gap-3 font-mono text-xs">
				<span class="text-slate-400">
					Dist: <strong class="text-slate-200"
						>{calculationStore.totalDistanceNm.toFixed(1)} NM</strong
					>
				</span>
				<span class="text-slate-400">
					ETE: <strong class="text-slate-200"
						>{calculationStore.totalFlightTimeMinutes.toFixed(1)} min</strong
					>
				</span>
			</div>
		{/if}
	</div>

	{#if calculationStore.error}
		<div class="border-b border-rose-900/50 bg-rose-950/40 p-4 text-sm text-rose-200" role="alert">
			<div class="flex items-center gap-2 font-semibold">
				<Icon name="alert-triangle" class="h-4 w-4 text-rose-400" />
				<span>{m.calculation_error_title()}</span>
			</div>
			<p class="mt-1.5 leading-relaxed">{userFacingError(calculationStore.error)}</p>
		</div>
	{/if}

	{#if calculationStore.navLog.length > 0}
		<div class="grid gap-2 p-2 sm:grid-cols-2 lg:hidden" aria-label={m.navlog_summary()}>
			{#each calculationStore.navLog as leg (leg.legIndex)}
				<article class="rounded-xl border border-slate-700/80 bg-slate-950/75 p-3 shadow-xs">
					<div class="mb-3 flex items-start justify-between gap-3 border-b border-slate-800 pb-2">
						<div class="min-w-0">
							<div class="text-[11px] font-semibold tracking-wide text-cyan-400 uppercase">
								{m.navlog_leg()}
								{leg.legIndex}
							</div>
							<div class="truncate text-sm font-semibold text-slate-100">{leg.fromName}</div>
						</div>
						{#if leg.notes}
							<span
								class="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-300"
							>
								{leg.notes === 'Top of Climb'
									? 'TOC'
									: leg.notes === 'Top of Descent'
										? 'TOD'
										: leg.notes}
							</span>
						{/if}
					</div>
					<dl class="grid grid-cols-4 gap-x-3 gap-y-2 font-mono">
						<div>
							<dt class="text-[10px] text-slate-500">{m.navlog_tc()}</dt>
							<dd class="text-xs font-semibold text-slate-100">{Math.round(leg.trueCourseDeg)}°</dd>
						</div>
						<div>
							<dt class="text-[10px] text-slate-500">{m.navlog_th()}</dt>
							<dd class="text-xs font-semibold text-slate-100">
								{Math.round(leg.trueHeadingDeg)}°
							</dd>
						</div>
						<div>
							<dt class="text-[10px] text-slate-500">{m.navlog_alt()}</dt>
							<dd class="text-xs font-semibold text-slate-100">{leg.altitudeFt}</dd>
						</div>
						<div>
							<dt class="text-[10px] text-slate-500">{m.navlog_gs()}</dt>
							<dd class="text-xs font-semibold text-slate-100">{leg.groundSpeedKt} kt</dd>
						</div>
						<div class="col-span-2">
							<dt class="text-[10px] text-slate-500">{m.navlog_wind()}</dt>
							<dd class="text-xs text-slate-200">
								{Math.round(leg.windDirDeg)}° / {Math.round(leg.windSpeedKt)} kt
							</dd>
						</div>
						<div>
							<dt class="text-[10px] text-slate-500">{m.navlog_dist()}</dt>
							<dd class="text-xs text-slate-200">{leg.distanceNm.toFixed(1)}</dd>
						</div>
						<div>
							<dt class="text-[10px] text-slate-500">{m.navlog_ete()}</dt>
							<dd class="text-xs text-slate-200">{leg.eteMinutes.toFixed(1)} m</dd>
						</div>
					</dl>
				</article>
			{/each}
		</div>
	{/if}

	<div class="hidden overflow-x-auto lg:block">
		<table id="nav-log-table" class="w-full border-collapse font-mono text-xs">
			<caption class="sr-only">{m.navlog_title()}</caption>
			<thead>
				<tr class="border-b border-slate-800 bg-slate-950 text-[11px] text-slate-400">
					<th scope="col" class="px-3 py-2.5 text-left">{m.navlog_leg()}</th>
					<th scope="col" class="px-3 py-2.5 text-left">{m.navlog_fix()}</th>
					<th scope="col" class="px-3 py-2.5 text-right">{m.navlog_tc()}</th>
					<th scope="col" class="px-3 py-2.5 text-right">{m.navlog_th()}</th>
					<th scope="col" class="px-3 py-2.5 text-left">{m.navlog_wind()}</th>
					<th scope="col" class="px-3 py-2.5 text-right">{m.navlog_alt()}</th>
					<th scope="col" class="px-3 py-2.5 text-right">{m.navlog_tas()}</th>
					<th scope="col" class="px-3 py-2.5 text-right">{m.navlog_gs()}</th>
					<th scope="col" class="px-3 py-2.5 text-right">{m.navlog_dist()}</th>
					<th scope="col" class="px-3 py-2.5 text-right">{m.navlog_ete()}</th>
					<th scope="col" class="px-3 py-2.5 text-left">{m.navlog_eta()}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-800/60">
				{#if calculationStore.navLog.length === 0}
					<tr>
						<td colspan="11" class="py-8 text-center text-slate-500 italic">
							{m.navlog_empty()}
						</td>
					</tr>
				{:else}
					{#each calculationStore.navLog as leg (leg.legIndex)}
						<tr class="transition-colors hover:bg-slate-800/30">
							<td class="px-3 py-2 font-bold text-slate-400">{leg.legIndex}</td>
							<td class="px-3 py-2 text-slate-200">
								<span class="font-sans font-medium">{leg.fromName}</span>
								{#if leg.notes}
									<span
										class="ml-1.5 rounded-sm border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-slate-400 uppercase"
									>
										{leg.notes === 'Top of Climb'
											? 'TOC'
											: leg.notes === 'Top of Descent'
												? 'TOD'
												: leg.notes}
									</span>
								{/if}
							</td>
							<td class="px-3 py-2 text-right text-slate-200 tabular-nums"
								>{Math.round(leg.trueCourseDeg)}°</td
							>
							<td class="px-3 py-2 text-right font-semibold text-slate-100 tabular-nums"
								>{Math.round(leg.trueHeadingDeg)}°</td
							>
							<td class="px-3 py-2 text-slate-300">
								{Math.round(leg.windDirDeg)}° / {Math.round(leg.windSpeedKt)} kt
							</td>
							<td class="px-3 py-2 text-right text-slate-200 tabular-nums">{leg.altitudeFt}</td>
							<td class="px-3 py-2 text-right text-slate-200 tabular-nums">{leg.tasKt}</td>
							<td class="px-3 py-2 text-right font-semibold text-slate-100 tabular-nums"
								>{leg.groundSpeedKt}</td
							>
							<td class="px-3 py-2 text-right text-slate-200 tabular-nums"
								>{leg.distanceNm.toFixed(1)}</td
							>
							<td class="px-3 py-2 text-right text-slate-300 tabular-nums"
								>{leg.eteMinutes.toFixed(1)} m</td
							>
							<td class="px-3 py-2 font-semibold text-slate-200">{leg.etaUtc}</td>
						</tr>
					{/each}

					<!-- Summary Total Row -->
					<tr class="border-t-2 border-slate-700 bg-slate-950 font-bold text-white">
						<td class="px-3 py-2.5 text-slate-500">Σ</td>
						<td class="px-3 py-2.5 font-sans tracking-wider text-slate-300 uppercase"
							>{m.navlog_total()}</td
						>
						<td class="px-3 py-2.5 text-slate-600">—</td>
						<td class="px-3 py-2.5 text-slate-600">—</td>
						<td class="px-3 py-2.5 text-slate-600">—</td>
						<td class="px-3 py-2.5 text-slate-600">—</td>
						<td class="px-3 py-2.5 text-slate-600">—</td>
						<td class="px-3 py-2.5 text-slate-600">—</td>
						<td class="px-3 py-2.5 text-right text-slate-200 tabular-nums"
							>{calculationStore.totalDistanceNm.toFixed(1)} NM</td
						>
						<td class="px-3 py-2.5 text-right text-slate-200 tabular-nums"
							>{calculationStore.totalFlightTimeMinutes.toFixed(1)} min</td
						>
						<td class="px-3 py-2.5 text-slate-600">—</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>
