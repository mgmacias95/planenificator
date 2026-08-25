<script lang="ts">
	import { flightPlanStore } from '$lib/state/flight-plan.svelte';
	import { calculationStore } from '$lib/state/calculation.svelte';
	import { pyodideService } from '$lib/services/pyodide.svelte';
	import * as m from '$lib/paraglide/messages';

	let alternatesInput = $state<string>(flightPlanStore.profile.altIcaos.join(', '));

	function handleAlternatesChange(e: Event) {
		const input = e.target as HTMLInputElement;
		alternatesInput = input.value;
		const codes = input.value
			.split(',')
			.map((c) => c.trim().toUpperCase())
			.filter(Boolean);
		flightPlanStore.updateProfile({ altIcaos: codes });
	}

	async function handleCalculate() {
		await calculationStore.calculate();
	}
</script>

<div class="space-y-4">
	<!-- Aerodromes Section -->
	<div class="space-y-2">
		<h3 class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
			{m.section_aerodromes()}
		</h3>

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

	<!-- Performance Parameters -->
	<div class="space-y-2">
		<h3 class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
			{m.section_performance()}
		</h3>

		<div class="grid grid-cols-3 gap-2">
			<div>
				<label for="tas-input" class="mb-0.5 block text-[10px] text-slate-400"
					>{m.label_tas()}</label
				>
				<input
					id="tas-input"
					type="number"
					bind:value={flightPlanStore.profile.cruiseTas}
					class="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
				/>
			</div>

			<div>
				<label for="vy-input" class="mb-0.5 block text-[10px] text-slate-400">{m.label_vy()}</label>
				<input
					id="vy-input"
					type="number"
					bind:value={flightPlanStore.profile.climbVy}
					class="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
				/>
			</div>

			<div>
				<label for="climb-rate-input" class="mb-0.5 block text-[10px] text-slate-400"
					>{m.label_climb_rate()}</label
				>
				<input
					id="climb-rate-input"
					type="number"
					step="50"
					bind:value={flightPlanStore.profile.climbRateFpm}
					class="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
				/>
			</div>
		</div>

		<div class="grid grid-cols-3 gap-2">
			<div>
				<label for="initial-alt-input" class="mb-0.5 block text-[10px] text-slate-400"
					>{m.label_dep_alt()}</label
				>
				<input
					id="initial-alt-input"
					type="number"
					step="100"
					bind:value={flightPlanStore.profile.initialAlt}
					class="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
				/>
			</div>

			<div>
				<label for="arrival-alt-input" class="mb-0.5 block text-[10px] text-slate-400"
					>{m.label_arr_alt()}</label
				>
				<input
					id="arrival-alt-input"
					type="number"
					step="100"
					bind:value={flightPlanStore.profile.arrivalAlt}
					class="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
				/>
			</div>

			<div>
				<label for="descent-rate-input" class="mb-0.5 block text-[10px] text-slate-400"
					>{m.label_descent_rate()}</label
				>
				<input
					id="descent-rate-input"
					type="number"
					step="50"
					bind:value={flightPlanStore.profile.descentRateFpm}
					class="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
				/>
			</div>
		</div>
	</div>

	<!-- Action Buttons -->
	<div class="flex gap-2 pt-2">
		<button
			id="calculate-btn"
			type="button"
			onclick={handleCalculate}
			disabled={calculationStore.isCalculating || flightPlanStore.waypoints.length < 2}
			class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-xs font-bold tracking-wider text-slate-950 uppercase shadow-md transition-all hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
		>
			{#if calculationStore.isCalculating}
				<span class="animate-spin">⚙️</span>
				<span>{m.btn_calculating()}</span>
			{:else}
				<span>⚡</span>
				<span>{m.btn_calculate()}</span>
			{/if}
		</button>

		<button
			id="clear-route-btn"
			type="button"
			onclick={() => {
				flightPlanStore.clearRoute();
				calculationStore.clear();
			}}
			class="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-rose-400"
			title={m.btn_clear()}
		>
			🗑️
		</button>
	</div>

	<!-- Engine Status Banner -->
	<div
		class="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-[11px]"
	>
		<div class="flex items-center gap-1.5">
			<span
				class="h-2 w-2 rounded-full"
				class:bg-emerald-400={pyodideService.status.state === 'ready'}
				class:bg-amber-400={pyodideService.status.state === 'loading_wasm' ||
					pyodideService.status.state === 'installing_packages' ||
					pyodideService.status.state === 'loading_modules'}
				class:bg-rose-500={pyodideService.status.state === 'error'}
				class:bg-slate-600={pyodideService.status.state === 'uninitialized'}
			></span>
			<span class="font-mono text-[10px] text-slate-400">
				{pyodideService.status.progressMessage}
			</span>
		</div>
		{#if pyodideService.status.state === 'uninitialized'}
			<button
				type="button"
				onclick={() => pyodideService.init()}
				class="text-[10px] text-cyan-400 hover:underline"
			>
				Initialize
			</button>
		{/if}
	</div>
</div>
