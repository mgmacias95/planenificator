<script lang="ts">
	import { calculationStore } from '$lib/state/calculation.svelte';
	import * as m from '$lib/paraglide/messages';
</script>

<div class="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90 shadow-lg">
	<div class="flex items-center justify-between border-b border-slate-800 bg-slate-900 p-3">
		<div class="flex items-center gap-2">
			<span class="text-base">📋</span>
			<h3 class="text-sm font-semibold tracking-wider text-slate-200 uppercase">
				{m.navlog_title()}
			</h3>
		</div>

		{#if calculationStore.hasCalculated}
			<div class="flex items-center gap-3 font-mono text-xs">
				<span class="text-slate-400">
					Dist: <strong class="text-cyan-400"
						>{calculationStore.totalDistanceNm.toFixed(1)} NM</strong
					>
				</span>
				<span class="text-slate-400">
					ETE: <strong class="text-cyan-400"
						>{calculationStore.totalFlightTimeMinutes.toFixed(1)} min</strong
					>
				</span>
			</div>
		{/if}
	</div>

	{#if calculationStore.error}
		<div class="border-b border-rose-900/50 bg-rose-950/40 p-4 font-mono text-xs text-rose-300">
			<div class="mb-1 flex items-center gap-1.5 font-bold">
				<span>⚠️</span>
				<span>Flight Calculation Error:</span>
			</div>
			<div>{calculationStore.error}</div>
		</div>
	{/if}

	<div class="overflow-x-auto">
		<table id="nav-log-table" class="w-full border-collapse text-left font-mono text-xs">
			<thead>
				<tr class="border-b border-slate-800 bg-slate-950 text-[11px] text-slate-400">
					<th class="px-3 py-2.5">{m.navlog_leg()}</th>
					<th class="px-3 py-2.5">{m.navlog_fix()}</th>
					<th class="px-3 py-2.5">{m.navlog_tc()}</th>
					<th class="px-3 py-2.5">{m.navlog_wca()}</th>
					<th class="px-3 py-2.5">{m.navlog_th()}</th>
					<th class="px-3 py-2.5">{m.navlog_wind()}</th>
					<th class="px-3 py-2.5">{m.navlog_alt()}</th>
					<th class="px-3 py-2.5">{m.navlog_tas()}</th>
					<th class="px-3 py-2.5">{m.navlog_gs()}</th>
					<th class="px-3 py-2.5">{m.navlog_dist()}</th>
					<th class="px-3 py-2.5">{m.navlog_ete()}</th>
					<th class="px-3 py-2.5">{m.navlog_eta()}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-800/60">
				{#if calculationStore.navLog.length === 0}
					<tr>
						<td colspan="12" class="py-8 text-center text-slate-500 italic">
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
										class="ml-1.5 rounded-xs border border-cyan-800 bg-cyan-950 px-1.5 py-0.5 text-[9px] text-cyan-300"
									>
										{leg.notes}
									</span>
								{/if}
							</td>
							<td class="px-3 py-2 font-semibold text-cyan-300">{Math.round(leg.trueCourseDeg)}°</td
							>
							<td class="px-3 py-2 text-slate-300"
								>{leg.wcaDeg > 0 ? `+${leg.wcaDeg}` : leg.wcaDeg}°</td
							>
							<td class="px-3 py-2 font-bold text-amber-300">{Math.round(leg.trueHeadingDeg)}°</td>
							<td class="px-3 py-2 text-slate-300">
								{Math.round(leg.windDirDeg)}° / {Math.round(leg.windSpeedKt)} kt
							</td>
							<td class="px-3 py-2 font-medium text-emerald-400">{leg.altitudeFt}</td>
							<td class="px-3 py-2 text-slate-300">{leg.tasKt}</td>
							<td class="px-3 py-2 font-bold text-slate-100">{leg.groundSpeedKt}</td>
							<td class="px-3 py-2 text-slate-200">{leg.distanceNm.toFixed(1)}</td>
							<td class="px-3 py-2 text-slate-300">{leg.eteMinutes.toFixed(1)} m</td>
							<td class="px-3 py-2 font-bold text-cyan-300">{leg.etaUtc}</td>
						</tr>
					{/each}

					<!-- Summary Total Row -->
					<tr class="border-t-2 border-slate-700 bg-slate-950 font-bold text-white">
						<td class="px-3 py-2.5 text-cyan-400">Σ</td>
						<td class="px-3 py-2.5 font-sans tracking-wider text-cyan-400 uppercase"
							>{m.navlog_total()}</td
						>
						<td class="px-3 py-2.5 text-slate-500">—</td>
						<td class="px-3 py-2.5 text-slate-500">—</td>
						<td class="px-3 py-2.5 text-slate-500">—</td>
						<td class="px-3 py-2.5 text-slate-500">—</td>
						<td class="px-3 py-2.5 text-slate-500">—</td>
						<td class="px-3 py-2.5 text-slate-500">—</td>
						<td class="px-3 py-2.5 text-slate-500">—</td>
						<td class="px-3 py-2.5 text-cyan-300"
							>{calculationStore.totalDistanceNm.toFixed(1)} NM</td
						>
						<td class="px-3 py-2.5 text-cyan-300"
							>{calculationStore.totalFlightTimeMinutes.toFixed(1)} min</td
						>
						<td class="px-3 py-2.5 text-slate-500">—</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>
