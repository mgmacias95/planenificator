<script lang="ts">
	import { calculationStore } from '$lib/state/calculation.svelte';
	import { formatNotamAltitudeRange } from '$lib/services/pyodide.svelte';
	import Icon from './Icon.svelte';
	import * as m from '$lib/paraglide/messages';

	let isExpanded = $state<boolean>(true);
	let showInfoNotams = $state<boolean>(false);

	const totalAlerts = $derived(
		calculationStore.notams.length +
			calculationStore.semicircularNotices.length +
			calculationStore.warnings.length
	);

	const displayedNotams = $derived(
		showInfoNotams
			? calculationStore.notams
			: calculationStore.notams.filter((n) => n.severity !== 'INFO')
	);
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<button
			type="button"
			onclick={() => (isExpanded = !isExpanded)}
			class="flex cursor-pointer items-center gap-2 text-xs font-semibold tracking-wider text-slate-300 uppercase hover:text-white"
		>
			<Icon
				name={isExpanded ? 'chevron-down' : 'chevron-right'}
				class="h-3.5 w-3.5 text-slate-400"
			/>
			<Icon name="shield" class="h-4 w-4 text-cyan-400" />
			<span>4. {m.safety_title()}</span>
		</button>

		{#if calculationStore.hasCalculated}
			{#if totalAlerts > 0}
				<button
					type="button"
					onclick={() => (isExpanded = !isExpanded)}
					class="cursor-pointer rounded-full border border-amber-800/80 bg-amber-950/80 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300 transition-colors hover:bg-amber-900"
				>
					{totalAlerts} Alerts
				</button>
			{:else}
				<span
					class="flex items-center gap-1 rounded-full border border-emerald-800/80 bg-emerald-950/80 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300"
				>
					<Icon name="check-circle" class="h-3 w-3" />
					<span>Clear</span>
				</span>
			{/if}
		{/if}
	</div>

	{#if isExpanded}
		{#if !calculationStore.hasCalculated}
			<div
				class="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-center text-xs text-slate-400 italic"
			>
				Calculate a route to perform semicircular rule safety checks and ENAIRE corridor NOTAM
				filtering.
			</div>
		{:else if totalAlerts === 0}
			<div
				class="flex items-center gap-2 rounded-lg border border-emerald-900/60 bg-emerald-950/30 p-3 text-xs text-emerald-300"
			>
				<Icon name="check-circle" class="h-4 w-4 shrink-0 text-emerald-400" />
				<span>{m.safety_none()}</span>
			</div>
		{:else}
			<div class="max-h-[380px] space-y-2.5 overflow-y-auto pr-1">
				<!-- Semicircular Rule Notices -->
				{#each calculationStore.semicircularNotices as notice (notice.segmentIndex)}
					<div
						class="space-y-1.5 rounded-lg border border-slate-800 border-l-4 border-l-amber-500 bg-slate-900/90 p-3 text-xs shadow-xs"
					>
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-1.5 font-semibold text-white">
								<Icon name="alert-triangle" class="h-3.5 w-3.5 text-amber-400" />
								<span>{m.safety_semicircular_advisory()}</span>
							</div>
							<span
								class="rounded-xs border border-amber-800/80 bg-amber-950/80 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-amber-300 uppercase"
							>
								VFR ADVISORY
							</span>
						</div>
						<p class="text-[11px] leading-relaxed text-slate-300">
							{notice.advisoryMessage}
						</p>
					</div>
				{/each}

				<!-- Custom calculation warnings -->
				{#each calculationStore.warnings as warning (warning)}
					{#if !calculationStore.semicircularNotices.some((n) => n.advisoryMessage === warning)}
						<div
							class="space-y-1.5 rounded-lg border border-slate-800 border-l-4 border-l-amber-500 bg-slate-900/90 p-3 text-xs shadow-xs"
						>
							<div class="flex items-center justify-between gap-2">
								<div class="flex items-center gap-1.5 font-semibold text-white">
									<Icon name="alert-triangle" class="h-3.5 w-3.5 text-amber-400" />
									<span>Flight Advisory</span>
								</div>
								<span
									class="rounded-xs border border-amber-800/80 bg-amber-950/80 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-amber-300 uppercase"
								>
									CAUTION
								</span>
							</div>
							<p class="text-[11px] leading-relaxed text-slate-300">{warning}</p>
						</div>
					{/if}
				{/each}

				<!-- NOTAM Alerts -->
				{#each displayedNotams as notam (notam.id)}
					{@const isCritical = notam.severity === 'WARNING'}
					{@const isCaution = notam.severity === 'CAUTION'}
					{@const isAerodrome =
						notam.purpose?.includes('DEPARTURE') ||
						notam.purpose?.includes('ARRIVAL') ||
						notam.purpose?.includes('ALTERNATE') ||
						notam.purpose?.includes('AERODROME')}
					{@const statusLabel = isCritical
						? isAerodrome && notam.purpose?.includes('CLOSED')
							? 'AD CLOSED'
							: 'AIRSPACE CONFLICT'
						: isCaution
							? isAerodrome
								? 'AD ADVISORY'
								: 'CAUTION'
							: 'INFO'}

					<div
						class="space-y-2 rounded-lg border border-slate-800 bg-slate-900/90 p-3 text-xs shadow-xs"
						class:border-l-4={true}
						class:border-l-rose-500={isCritical}
						class:border-l-amber-500={isCaution}
						class:border-l-cyan-500={!isCritical && !isCaution}
					>
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-1.5 font-bold text-white">
								<Icon
									name={isCritical ? 'alert-circle' : isCaution ? 'alert-triangle' : 'info'}
									class={`h-3.5 w-3.5 ${isCritical ? 'text-rose-400' : isCaution ? 'text-amber-400' : 'text-cyan-400'}`}
								/>
								<span class="font-mono text-xs">{notam.id}</span>
								<span class="text-slate-400 font-sans text-xs">({notam.location})</span>
							</div>

							<span
								class="rounded-xs border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider uppercase"
								class:border-rose-800={isCritical}
								class:bg-rose-950={isCritical}
								class:text-rose-300={isCritical}
								class:border-amber-800={isCaution}
								class:bg-amber-950={isCaution}
								class:text-amber-300={isCaution}
								class:border-slate-700={!isCritical && !isCaution}
								class:bg-slate-950={!isCritical && !isCaution}
								class:text-slate-300={!isCritical && !isCaution}
							>
								{statusLabel}
							</span>
						</div>

						{#if notam.summary}
							<div class="font-medium text-slate-200">
								{notam.summary}
							</div>
						{/if}

						{#if notam.lowerLimitFt !== undefined || notam.upperLimitFt !== undefined}
							<div class="font-mono text-[10px] text-slate-400">
								Altitude Limits: <span class="font-semibold text-slate-300"
									>{formatNotamAltitudeRange(notam.lowerLimitFt, notam.upperLimitFt)}</span
								>
							</div>
						{/if}

						<!-- Aviation Raw NOTAM text -->
						<p
							class="line-clamp-3 rounded-md border border-slate-800/80 bg-slate-950/70 p-2 font-mono text-[11px] leading-relaxed tracking-wide text-slate-400 transition-all hover:line-clamp-none"
							title="Click / hover to expand full NOTAM text"
						>
							{notam.text}
						</p>
					</div>
				{/each}

				{#if calculationStore.notams.some((n) => n.severity === 'INFO')}
					<div class="pt-1 text-center">
						<button
							type="button"
							onclick={() => (showInfoNotams = !showInfoNotams)}
							class="cursor-pointer text-[10px] text-slate-400 underline hover:text-slate-200"
						>
							{showInfoNotams
								? 'Hide Informational NOTAMs'
								: `Show ${calculationStore.notams.filter((n) => n.severity === 'INFO').length} Informational NOTAMs`}
						</button>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
