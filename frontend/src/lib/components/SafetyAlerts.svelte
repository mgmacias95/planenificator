<script lang="ts">
	import { calculationStore } from '$lib/state/calculation.svelte';
	import * as m from '$lib/paraglide/messages';

	let showInfoNotams = $state<boolean>(false);
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<h3
			class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-300 uppercase"
		>
			<span>🛡️</span>
			<span>{m.safety_title()}</span>
		</h3>

		{#if calculationStore.notams.length > 0 || calculationStore.semicircularNotices.length > 0}
			<span
				class="rounded-full border border-amber-800 bg-amber-950 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300"
			>
				{calculationStore.notams.length + calculationStore.semicircularNotices.length} Alerts
			</span>
		{/if}
	</div>

	{#if !calculationStore.hasCalculated}
		<div
			class="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-center text-xs text-slate-500 italic"
		>
			Calculate a route to perform semicircular rule safety checks and ENAIRE corridor NOTAM
			filtering.
		</div>
	{:else if calculationStore.semicircularNotices.length === 0 && calculationStore.notams.length === 0 && calculationStore.warnings.length === 0}
		<div
			class="flex items-center gap-2 rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-3 text-xs text-emerald-400"
		>
			<span>🟢</span>
			<span>{m.safety_none()}</span>
		</div>
	{:else}
		<div class="max-h-[380px] space-y-2.5 overflow-y-auto pr-1">
			<!-- Semicircular Rule Notices -->
			{#each calculationStore.semicircularNotices as notice (notice.segmentIndex)}
				<div
					class="space-y-1 rounded-lg border border-l-4 border-amber-500/30 border-l-amber-400 bg-amber-950/20 p-2.5 text-xs"
				>
					<div class="flex items-center justify-between">
						<span class="flex items-center gap-1 font-bold text-amber-300">
							<span>⚠️</span>
							<span>{m.safety_semicircular_advisory()}</span>
						</span>
						<span
							class="rounded-xs bg-amber-900/60 px-1.5 py-0.5 font-mono text-[10px] text-amber-200"
						>
							VFR Rule
						</span>
					</div>
					<p class="text-[11px] leading-relaxed text-slate-300">
						{notice.advisoryMessage}
					</p>
				</div>
			{/each}

			<!-- Custom calculation warnings -->
			{#each calculationStore.warnings as warning}
				{#if !calculationStore.semicircularNotices.some((n) => n.advisoryMessage === warning)}
					<div
						class="rounded-lg border border-l-4 border-amber-500/30 border-l-amber-400 bg-amber-950/20 p-2.5 text-xs"
					>
						<div class="mb-1 font-bold text-amber-300">⚠️ Flight Advisory:</div>
						<div class="text-[11px] text-slate-300">{warning}</div>
					</div>
				{/if}
			{/each}

			<!-- NOTAM Alerts -->
			{#each calculationStore.notams as notam (notam.id)}
				<div
					class="space-y-1 rounded-lg border p-2.5 text-xs"
					class:bg-rose-950={notam.severity === 'WARNING'}
					class:border-rose-800={notam.severity === 'WARNING'}
					class:border-l-4={true}
					class:border-l-rose-500={notam.severity === 'WARNING'}
					class:bg-amber-950={notam.severity === 'CAUTION'}
					class:border-amber-800={notam.severity === 'CAUTION'}
					class:border-l-amber-500={notam.severity === 'CAUTION'}
					class:bg-slate-900={notam.severity === 'INFO'}
					class:border-slate-700={notam.severity === 'INFO'}
					class:border-l-cyan-500={notam.severity === 'INFO'}
				>
					<div class="flex items-center justify-between">
						<span class="flex items-center gap-1.5 font-bold text-white">
							<span>{notam.severity === 'WARNING' ? '🚨' : '📍'}</span>
							<span>{notam.id} ({notam.location})</span>
						</span>
						<span
							class="rounded-xs bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
						>
							{notam.purpose}
						</span>
					</div>

					<div class="text-[11px] font-semibold text-cyan-300">
						{notam.summary}
					</div>

					<p
						class="line-clamp-3 font-mono text-[11px] text-slate-300 transition-all hover:line-clamp-none"
					>
						{notam.text}
					</p>
				</div>
			{/each}
		</div>
	{/if}
</div>
