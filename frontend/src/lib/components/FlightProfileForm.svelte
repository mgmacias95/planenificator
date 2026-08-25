<script lang="ts">
	import { flightPlanStore } from '$lib/state/flight-plan.svelte';
	import { calculationStore } from '$lib/state/calculation.svelte';
	import Icon from './Icon.svelte';
	import * as m from '$lib/paraglide/messages';

	interface AircraftPreset {
		id: string;
		name: string;
		cruiseTas: number;
		climbVy: number;
		climbRateFpm: number;
		descentRateFpm: number;
	}

	const AIRCRAFT_PRESETS: AircraftPreset[] = [
		{
			id: 'c172',
			name: 'Cessna 172 Skyhawk',
			cruiseTas: 110,
			climbVy: 74,
			climbRateFpm: 700,
			descentRateFpm: 500
		},
		{
			id: 'pa28',
			name: 'Piper PA-28 Cherokee',
			cruiseTas: 115,
			climbVy: 76,
			climbRateFpm: 650,
			descentRateFpm: 500
		},
		{
			id: 'c152',
			name: 'Cessna 152',
			cruiseTas: 90,
			climbVy: 67,
			climbRateFpm: 600,
			descentRateFpm: 500
		},
		{
			id: 'lsa',
			name: 'Ultralight / LSA (Default)',
			cruiseTas: 80,
			climbVy: 70,
			climbRateFpm: 700,
			descentRateFpm: 500
		},
		{
			id: 'custom',
			name: 'Custom Performance Profile',
			cruiseTas: flightPlanStore.profile.cruiseTas,
			climbVy: flightPlanStore.profile.climbVy,
			climbRateFpm: flightPlanStore.profile.climbRateFpm,
			descentRateFpm: flightPlanStore.profile.descentRateFpm
		}
	];

	let selectedPresetId = $state<string>('lsa');
	let isPerformanceExpanded = $state<boolean>(false);
	let alternatesInput = $state<string>(flightPlanStore.profile.altIcaos.join(', '));

	function handlePresetChange(e: Event) {
		const select = e.target as HTMLSelectElement;
		selectedPresetId = select.value;
		const preset = AIRCRAFT_PRESETS.find((p) => p.id === select.value);
		if (preset && preset.id !== 'custom') {
			flightPlanStore.updateProfile({
				cruiseTas: preset.cruiseTas,
				climbVy: preset.climbVy,
				climbRateFpm: preset.climbRateFpm,
				descentRateFpm: preset.descentRateFpm
			});
		}
	}

	function handleAlternatesChange(e: Event) {
		const input = e.target as HTMLInputElement;
		alternatesInput = input.value;
		const codes = input.value
			.split(',')
			.map((c) => c.trim().toUpperCase())
			.filter(Boolean);
		flightPlanStore.updateProfile({ altIcaos: codes });
	}

	function handleResetForm() {
		if (window.confirm('Clear all route waypoints and calculation results?')) {
			flightPlanStore.clearRoute();
			calculationStore.clear();
		}
	}
</script>

<div class="space-y-5">
	<!-- Step 1: Aircraft Profile & Performance (Top) -->
	<div class="space-y-2.5">
		<div class="flex items-center justify-between">
			<h3 class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-400 uppercase">
				<Icon name="plane" class="h-3.5 w-3.5 text-cyan-400" />
				<span>1. {m.section_performance()}</span>
			</h3>

			<button
				type="button"
				onclick={() => (isPerformanceExpanded = !isPerformanceExpanded)}
				class="flex cursor-pointer items-center gap-1 text-[11px] text-cyan-400 transition-colors hover:text-cyan-300"
			>
				<Icon
					name={isPerformanceExpanded ? 'chevron-down' : 'chevron-right'}
					class="h-3 w-3"
				/>
				<span>{isPerformanceExpanded ? 'Hide Details' : 'Edit Performance'}</span>
			</button>
		</div>

		<!-- Reusable Aircraft Profile Selector -->
		<div class="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
			<label for="aircraft-preset-select" class="mb-1 block text-[11px] font-medium text-slate-400">
				Aircraft Airframe / Model
			</label>
			<div class="flex items-center gap-2">
				<select
					id="aircraft-preset-select"
					value={selectedPresetId}
					onchange={handlePresetChange}
					class="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-hidden"
				>
					{#each AIRCRAFT_PRESETS as preset (preset.id)}
						<option value={preset.id}>{preset.name}</option>
					{/each}
				</select>
			</div>

			<!-- Compact Profile Summary Badges -->
			<div class="mt-2 flex items-center gap-2 font-mono text-[10px] text-slate-400">
				<span class="rounded-xs bg-slate-900 px-1.5 py-0.5 border border-slate-800">
					TAS: <strong class="text-cyan-300">{flightPlanStore.profile.cruiseTas} kt</strong>
				</span>
				<span class="rounded-xs bg-slate-900 px-1.5 py-0.5 border border-slate-800">
					Climb: <strong class="text-cyan-300">{flightPlanStore.profile.climbRateFpm} fpm</strong>
				</span>
				<span class="rounded-xs bg-slate-900 px-1.5 py-0.5 border border-slate-800">
					Vy: <strong class="text-cyan-300">{flightPlanStore.profile.climbVy} kt</strong>
				</span>
			</div>
		</div>

		<!-- Collapsible Advanced Performance Parameters -->
		{#if isPerformanceExpanded}
			<div class="space-y-3 pt-1">
				<!-- Climb & Departure Parameters -->
				<div class="space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
					<div class="text-[11px] font-semibold text-cyan-400">Climb & Departure</div>
					<div class="grid grid-cols-3 gap-2">
						<div>
							<label for="vy-input" class="mb-0.5 block text-[10px] text-slate-400">{m.label_vy()}</label>
							<div class="relative flex items-center">
								<input
									id="vy-input"
									type="number"
									bind:value={flightPlanStore.profile.climbVy}
									oninput={() => (selectedPresetId = 'custom')}
									class="w-full rounded-md border border-slate-700 bg-slate-950 py-1 pr-6 pl-2 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
								/>
								<span class="pointer-events-none absolute right-1.5 text-[10px] font-mono text-slate-400">kt</span>
							</div>
						</div>

						<div>
							<label for="climb-rate-input" class="mb-0.5 block text-[10px] text-slate-400">
								{m.label_climb_rate()}
							</label>
							<div class="relative flex items-center">
								<input
									id="climb-rate-input"
									type="number"
									step="50"
									bind:value={flightPlanStore.profile.climbRateFpm}
									oninput={() => (selectedPresetId = 'custom')}
									class="w-full rounded-md border border-slate-700 bg-slate-950 py-1 pr-7 pl-2 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
								/>
								<span class="pointer-events-none absolute right-1.5 text-[10px] font-mono text-slate-400">fpm</span>
							</div>
						</div>

						<div>
							<label for="initial-alt-input" class="mb-0.5 block text-[10px] text-slate-400">
								{m.label_dep_alt()}
							</label>
							<div class="relative flex items-center">
								<input
									id="initial-alt-input"
									type="number"
									step="100"
									bind:value={flightPlanStore.profile.initialAlt}
									class="w-full rounded-md border border-slate-700 bg-slate-950 py-1 pr-6 pl-2 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
								/>
								<span class="pointer-events-none absolute right-1.5 text-[10px] font-mono text-slate-400">ft</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Cruise & Descent Parameters -->
				<div class="space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
					<div class="text-[11px] font-semibold text-cyan-400">Cruise & Descent</div>
					<div class="grid grid-cols-3 gap-2">
						<div>
							<label for="tas-input" class="mb-0.5 block text-[10px] text-slate-400">{m.label_tas()}</label>
							<div class="relative flex items-center">
								<input
									id="tas-input"
									type="number"
									bind:value={flightPlanStore.profile.cruiseTas}
									oninput={() => (selectedPresetId = 'custom')}
									class="w-full rounded-md border border-slate-700 bg-slate-950 py-1 pr-6 pl-2 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
								/>
								<span class="pointer-events-none absolute right-1.5 text-[10px] font-mono text-slate-400">kt</span>
							</div>
						</div>

						<div>
							<label for="descent-rate-input" class="mb-0.5 block text-[10px] text-slate-400">
								{m.label_descent_rate()}
							</label>
							<div class="relative flex items-center">
								<input
									id="descent-rate-input"
									type="number"
									step="50"
									bind:value={flightPlanStore.profile.descentRateFpm}
									oninput={() => (selectedPresetId = 'custom')}
									class="w-full rounded-md border border-slate-700 bg-slate-950 py-1 pr-7 pl-2 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
								/>
								<span class="pointer-events-none absolute right-1.5 text-[10px] font-mono text-slate-400">fpm</span>
							</div>
						</div>

						<div>
							<label for="arrival-alt-input" class="mb-0.5 block text-[10px] text-slate-400">
								{m.label_arr_alt()}
							</label>
							<div class="relative flex items-center">
								<input
									id="arrival-alt-input"
									type="number"
									step="100"
									bind:value={flightPlanStore.profile.arrivalAlt}
									class="w-full rounded-md border border-slate-700 bg-slate-950 py-1 pr-6 pl-2 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
								/>
								<span class="pointer-events-none absolute right-1.5 text-[10px] font-mono text-slate-400">ft</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Step 2: Aerodromes, Timing & Fuel -->
	<div class="space-y-2.5">
		<div class="flex items-center justify-between">
			<h3 class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-400 uppercase">
				<Icon name="map-pin" class="h-3.5 w-3.5 text-cyan-400" />
				<span>2. {m.section_aerodromes()}</span>
			</h3>
			<button
				type="button"
				onclick={handleResetForm}
				class="flex cursor-pointer items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-rose-400"
				title="Clear route waypoints and results"
			>
				<Icon name="refresh" class="h-3 w-3" />
				<span>Reset Form</span>
			</button>
		</div>

		<div class="grid grid-cols-2 gap-2">
			<div>
				<label for="dep-input" class="mb-1 block text-[11px] font-medium text-slate-400">
					{m.label_dep_icao()}
				</label>
				<input
					id="dep-input"
					type="text"
					placeholder="e.g. LEBA"
					value={flightPlanStore.profile.depIcao}
					oninput={(e) =>
						flightPlanStore.updateProfile({
							depIcao: (e.target as HTMLInputElement).value.toUpperCase()
						})}
					class="w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white placeholder-slate-600 focus:border-cyan-400 focus:outline-hidden"
				/>
			</div>

			<div>
				<label for="dest-input" class="mb-1 block text-[11px] font-medium text-slate-400">
					{m.label_dest_icao()}
				</label>
				<input
					id="dest-input"
					type="text"
					placeholder="e.g. LEMD"
					value={flightPlanStore.profile.destIcao}
					oninput={(e) =>
						flightPlanStore.updateProfile({
							destIcao: (e.target as HTMLInputElement).value.toUpperCase()
						})}
					class="w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white placeholder-slate-600 focus:border-cyan-400 focus:outline-hidden"
				/>
			</div>
		</div>

		<div>
			<label for="alt-input" class="mb-1 block text-[11px] font-medium text-slate-400">
				{m.label_alternates()}
			</label>
			<input
				id="alt-input"
				type="text"
				placeholder="e.g. LETO, LEVS"
				value={alternatesInput}
				oninput={handleAlternatesChange}
				class="w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white placeholder-slate-600 focus:border-cyan-400 focus:outline-hidden"
			/>
		</div>

		<div>
			<label for="dep-time-input" class="mb-1 block text-[11px] font-medium text-slate-400">
				{m.label_dep_time()}
			</label>
			<input
				id="dep-time-input"
				type="datetime-local"
				value={flightPlanStore.profile.departureTime}
				oninput={(e) =>
					flightPlanStore.updateProfile({ departureTime: (e.target as HTMLInputElement).value })}
				class="w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
			/>
		</div>
	</div>
</div>
