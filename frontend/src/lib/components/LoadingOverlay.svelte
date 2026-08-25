<script lang="ts">
	import { calculationStore } from '$lib/state/calculation.svelte';
	import * as m from '$lib/paraglide/messages';

	interface StepItem {
		id: string;
		label: () => string;
		icon: string;
		detail: string;
	}

	const steps: StepItem[] = [
		{
			id: 'route',
			label: () => m.loading_step_route(),
			icon: '📍',
			detail: 'Resolving route coordinates & landmark fixes'
		},
		{
			id: 'weather',
			label: () => m.loading_step_weather(),
			icon: '⛅',
			detail: 'Querying Open-Meteo / ECMWF aloft winds & temperatures'
		},
		{
			id: 'notams',
			label: () => m.loading_step_notams(),
			icon: '⚠️',
			detail: 'Fetching en-route airspace & aerodrome NOTAM restrictions'
		},
		{
			id: 'navlog',
			label: () => m.loading_step_navlog(),
			icon: '🧭',
			detail: 'Computing magnetic headings, ground speeds & climb/descent profile'
		}
	];

	// Active step rotation timer for visual feedback during calculation
	let activeStepIndex = $state(0);
	let stepTimer: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		if (calculationStore.isCalculating) {
			activeStepIndex = 0;
			stepTimer = setInterval(() => {
				activeStepIndex = (activeStepIndex + 1) % steps.length;
			}, 1800);
		} else {
			if (stepTimer) {
				clearInterval(stepTimer);
				stepTimer = null;
			}
			activeStepIndex = 0;
		}

		return () => {
			if (stepTimer) {
				clearInterval(stepTimer);
				stepTimer = null;
			}
		};
	});
</script>

{#if calculationStore.isCalculating}
	<div
		class="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md transition-all duration-300"
		role="dialog"
		aria-modal="true"
		aria-label="Route calculation in progress"
	>
		<!-- HUD Center Card -->
		<div
			class="relative w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-900/95 p-6 shadow-2xl sm:p-8"
		>
			<!-- Top glowing highlight line -->
			<div
				class="absolute top-0 right-0 left-0 h-[2px] animate-pulse bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
			></div>

			<!-- Radar / Aircraft Animation Header -->
			<div class="mb-6 flex items-center gap-4">
				<div
					class="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-500/40 bg-cyan-950/40 shadow-inner"
				>
					<!-- Spinning radar beam -->
					<div
						class="absolute inset-1 animate-spin rounded-xl border-t-2 border-r-2 border-cyan-400/80 [animation-duration:2s]"
					></div>
					<!-- Pulsing ping ring -->
					<div
						class="absolute inset-0 animate-ping rounded-2xl bg-cyan-500/20 [animation-duration:2.5s]"
					></div>
					<!-- Center Icon -->
					<span class="text-2xl select-none">✈️</span>
				</div>

				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<h2 class="text-base font-bold tracking-wider text-cyan-300 uppercase sm:text-lg">
							{m.loading_title()}
						</h2>
						<span class="flex h-2 w-2">
							<span
								class="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-cyan-400 opacity-75"
							></span>
							<span class="relative inline-flex h-2 w-2 rounded-full bg-cyan-500"></span>
						</span>
					</div>
					<p class="mt-0.5 text-xs text-slate-400">
						{m.loading_subtitle()}
					</p>
				</div>
			</div>

			<!-- Progress Bar -->
			<div class="mb-6 space-y-1.5">
				<div class="h-2 w-full overflow-hidden rounded-full bg-slate-800">
					<div
						class="h-full w-full animate-pulse rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-500 [background-size:200%_100%]"
					></div>
				</div>
			</div>

			<!-- Calculation Steps Checklist -->
			<div class="space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
				{#each steps as step, idx (step.id)}
					{@const isActive = idx === activeStepIndex}
					{@const isPast = idx < activeStepIndex}
					<div
						class="flex items-start gap-3 transition-colors duration-300 {isActive
							? 'text-cyan-300'
							: isPast
								? 'text-slate-300'
								: 'text-slate-500'}"
					>
						<div class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
							{#if isActive}
								<span class="inline-block animate-spin text-xs">⚙️</span>
							{:else if isPast}
								<span class="text-xs text-emerald-400">✓</span>
							{:else}
								<span class="text-xs opacity-50">{step.icon}</span>
							{/if}
						</div>

						<div class="min-w-0 flex-1">
							<div class="flex items-center justify-between">
								<span class="text-xs font-semibold {isActive ? 'text-white' : ''}">
									{step.label()}
								</span>
								{#if isActive}
									<span class="animate-pulse font-mono text-[10px] text-cyan-400">
										In progress...
									</span>
								{/if}
							</div>
							<p class="text-[11px] text-slate-400">
								{step.detail}
							</p>
						</div>
					</div>
				{/each}
			</div>

			<!-- Aviation Telemetry Footer -->
			<div class="mt-4 flex items-center justify-between text-[11px] text-slate-500">
				<span class="flex items-center gap-1.5 font-mono">
					<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
					Flight Planning Engine
				</span>
				<span class="font-mono">Open-Meteo & ENAIRE Insignia</span>
			</div>
		</div>
	</div>
{/if}
