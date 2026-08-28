<script lang="ts">
	import { onMount } from 'svelte';
	import { flightPlanStore } from '$lib/state/flight-plan.svelte';
	import { calculationStore } from '$lib/state/calculation.svelte';
	import { aircraftProfilesStore } from '$lib/state/aircraft-profiles.svelte';
	import { DEFAULT_AIRCRAFT_PRESETS, type AircraftPerformanceProfile } from '$lib/types/flight';
	import Icon from './Icon.svelte';
	import AircraftProfileModal from './AircraftProfileModal.svelte';
	import * as m from '$lib/paraglide/messages';

	let isPerformanceExpanded = $state<boolean>(false);
	let alternatesInput = $state<string>(flightPlanStore.profile.altIcaos.join(', '));

	let isModalOpen = $state<boolean>(false);
	let modalMode = $state<'create' | 'edit'>('create');
	let modalInitialData = $state<Partial<AircraftPerformanceProfile>>({});

	onMount(() => {
		aircraftProfilesStore.init();
	});

	function handlePresetChange(e: Event) {
		const select = e.target as HTMLSelectElement;
		aircraftProfilesStore.selectProfile(select.value);
	}

	function handleCreateNewProfile() {
		modalMode = 'create';
		modalInitialData = {
			name: '',
			cruiseTas: flightPlanStore.profile.cruiseTas,
			climbVy: flightPlanStore.profile.climbVy,
			climbRateFpm: flightPlanStore.profile.climbRateFpm,
			descentRateFpm: flightPlanStore.profile.descentRateFpm
		};
		isModalOpen = true;
	}

	function handleEditCurrentProfile() {
		const current = aircraftProfilesStore.selectedProfile;
		if (!current) return;
		modalMode = 'edit';
		modalInitialData = {
			id: current.id,
			name: current.name,
			cruiseTas: flightPlanStore.profile.cruiseTas,
			climbVy: flightPlanStore.profile.climbVy,
			climbRateFpm: flightPlanStore.profile.climbRateFpm,
			descentRateFpm: flightPlanStore.profile.descentRateFpm
		};
		isModalOpen = true;
	}

	async function handleDeleteCurrentProfile() {
		const current = aircraftProfilesStore.selectedProfile;
		if (!current || !current.isCustom) return;
		const confirmMsg = m.profile_delete_confirm
			? m.profile_delete_confirm({ name: current.name })
			: `Delete custom profile "${current.name}"?`;
		if (window.confirm(confirmMsg)) {
			await aircraftProfilesStore.deleteCustomProfile(current.id);
		}
	}

	async function handleSaveModalProfile(data: {
		id?: string;
		name: string;
		cruiseTas: number;
		climbVy: number;
		climbRateFpm: number;
		descentRateFpm: number;
	}) {
		await aircraftProfilesStore.saveCustomProfile(data);
		isModalOpen = false;
	}

	function onPerformanceParamInput() {
		aircraftProfilesStore.syncWithCurrentFlightPlan();
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
			<h3 class="flex items-center gap-2 text-sm font-semibold text-slate-200">
				<Icon name="plane" class="h-3.5 w-3.5 text-cyan-400" />
				<span>1. {m.section_performance()}</span>
			</h3>

			<button
				type="button"
				onclick={() => (isPerformanceExpanded = !isPerformanceExpanded)}
				class="flex cursor-pointer items-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-200"
			>
				<Icon name={isPerformanceExpanded ? 'chevron-down' : 'chevron-right'} class="h-3 w-3" />
				<span>{isPerformanceExpanded ? 'Hide Details' : 'Edit Performance'}</span>
			</button>
		</div>

		<!-- Reusable Aircraft Profile Selector -->
		<div class="rounded-xl border border-slate-700/80 bg-slate-950/70 p-3 shadow-xs">
			<div class="mb-1 flex items-center justify-between">
				<label for="aircraft-preset-select" class="block text-[11px] font-medium text-slate-400">
					{m.profile_airframe_label ? m.profile_airframe_label() : 'Aircraft Airframe / Profile'}
				</label>
				<button
					type="button"
					onclick={handleCreateNewProfile}
					class="flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
					title="Create new aircraft profile"
				>
					<Icon name="plus" class="h-3 w-3" />
					<span>{m.profile_new_btn ? m.profile_new_btn() : 'New Profile'}</span>
				</button>
			</div>

			<div class="flex items-center gap-2">
				<select
					id="aircraft-preset-select"
					value={aircraftProfilesStore.selectedProfileId}
					onchange={handlePresetChange}
					class="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-hidden"
				>
					<optgroup
						label={m.profile_default_presets ? m.profile_default_presets() : 'Default Presets'}
					>
						{#each DEFAULT_AIRCRAFT_PRESETS as preset (preset.id)}
							<option value={preset.id}>{preset.name}</option>
						{/each}
					</optgroup>

					{#if aircraftProfilesStore.customProfiles.length > 0}
						<optgroup
							label={m.profile_custom_profiles ? m.profile_custom_profiles() : 'Custom Profiles'}
						>
							{#each aircraftProfilesStore.customProfiles as customProf (customProf.id)}
								<option value={customProf.id}>{customProf.name}</option>
							{/each}
						</optgroup>
					{/if}
				</select>

				{#if aircraftProfilesStore.isCurrentCustomProfile}
					<button
						type="button"
						onclick={handleEditCurrentProfile}
						class="flex cursor-pointer items-center justify-center rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-300 transition-colors hover:border-cyan-500 hover:text-cyan-400"
						title={m.profile_edit_btn ? m.profile_edit_btn() : 'Edit Profile'}
						aria-label="Edit Profile"
					>
						<Icon name="pencil" class="h-3.5 w-3.5" />
					</button>

					<button
						type="button"
						onclick={handleDeleteCurrentProfile}
						class="flex cursor-pointer items-center justify-center rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-400 transition-colors hover:border-rose-500 hover:text-rose-400"
						title={m.profile_delete_btn ? m.profile_delete_btn() : 'Delete Profile'}
						aria-label="Delete Profile"
					>
						<Icon name="trash" class="h-3.5 w-3.5" />
					</button>
				{/if}
			</div>

			<!-- Compact Profile Summary Badges -->
			<div class="mt-2 grid grid-cols-4 gap-1 font-mono text-[10px] text-slate-400">
				<span class="rounded-md border border-slate-800 bg-slate-900 px-1 py-1 text-center">
					TAS: <strong class="text-cyan-300">{flightPlanStore.profile.cruiseTas} kt</strong>
				</span>
				<span class="rounded-md border border-slate-800 bg-slate-900 px-1 py-1 text-center">
					Climb: <strong class="text-cyan-300">{flightPlanStore.profile.climbRateFpm} fpm</strong>
				</span>
				<span class="rounded-md border border-slate-800 bg-slate-900 px-1 py-1 text-center">
					Vy: <strong class="text-cyan-300">{flightPlanStore.profile.climbVy} kt</strong>
				</span>
				<span class="rounded-md border border-slate-800 bg-slate-900 px-1 py-1 text-center">
					Desc: <strong class="text-cyan-300">{flightPlanStore.profile.descentRateFpm} fpm</strong>
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
							<label for="vy-input" class="mb-0.5 block text-[10px] text-slate-400"
								>{m.label_vy()}</label
							>
							<div class="relative flex items-center">
								<input
									id="vy-input"
									type="number"
									bind:value={flightPlanStore.profile.climbVy}
									oninput={onPerformanceParamInput}
									class="w-full rounded-md border border-slate-700 bg-slate-950 py-1 pr-6 pl-2 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
								/>
								<span
									class="pointer-events-none absolute right-1.5 font-mono text-[10px] text-slate-400"
									>kt</span
								>
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
									oninput={onPerformanceParamInput}
									class="w-full rounded-md border border-slate-700 bg-slate-950 py-1 pr-7 pl-2 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
								/>
								<span
									class="pointer-events-none absolute right-1.5 font-mono text-[10px] text-slate-400"
									>fpm</span
								>
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
								<span
									class="pointer-events-none absolute right-1.5 font-mono text-[10px] text-slate-400"
									>ft</span
								>
							</div>
						</div>
					</div>
				</div>

				<!-- Cruise & Descent Parameters -->
				<div class="space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
					<div class="text-[11px] font-semibold text-cyan-400">Cruise & Descent</div>
					<div class="grid grid-cols-3 gap-2">
						<div>
							<label for="tas-input" class="mb-0.5 block text-[10px] text-slate-400"
								>{m.label_tas()}</label
							>
							<div class="relative flex items-center">
								<input
									id="tas-input"
									type="number"
									bind:value={flightPlanStore.profile.cruiseTas}
									oninput={onPerformanceParamInput}
									class="w-full rounded-md border border-slate-700 bg-slate-950 py-1 pr-6 pl-2 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
								/>
								<span
									class="pointer-events-none absolute right-1.5 font-mono text-[10px] text-slate-400"
									>kt</span
								>
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
									oninput={onPerformanceParamInput}
									class="w-full rounded-md border border-slate-700 bg-slate-950 py-1 pr-7 pl-2 font-mono text-xs text-white focus:border-cyan-400 focus:outline-hidden"
								/>
								<span
									class="pointer-events-none absolute right-1.5 font-mono text-[10px] text-slate-400"
									>fpm</span
								>
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
								<span
									class="pointer-events-none absolute right-1.5 font-mono text-[10px] text-slate-400"
									>ft</span
								>
							</div>
						</div>
					</div>
				</div>

				<!-- Quick Save / Update actions in details view -->
				<div class="flex items-center justify-end gap-2 pt-1">
					{#if aircraftProfilesStore.isCurrentCustomProfile}
						<button
							type="button"
							onclick={() => {
								if (aircraftProfilesStore.selectedProfile) {
									aircraftProfilesStore.saveCustomProfile({
										id: aircraftProfilesStore.selectedProfile.id,
										name: aircraftProfilesStore.selectedProfile.name,
										cruiseTas: flightPlanStore.profile.cruiseTas,
										climbVy: flightPlanStore.profile.climbVy,
										climbRateFpm: flightPlanStore.profile.climbRateFpm,
										descentRateFpm: flightPlanStore.profile.descentRateFpm
									});
								}
							}}
							class="cursor-pointer rounded-md border border-cyan-500/40 bg-cyan-950/40 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-900/60"
						>
							{m.profile_update_saved ? m.profile_update_saved() : 'Update Profile'}
						</button>
					{/if}
					<button
						type="button"
						onclick={handleCreateNewProfile}
						class="cursor-pointer rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:border-cyan-500 hover:text-white"
					>
						{m.profile_save_as_new ? m.profile_save_as_new() : 'Save as New Profile'}
					</button>
				</div>
			</div>
		{/if}
	</div>

	<!-- Step 2: Aerodromes, Timing & Fuel -->
	<div class="space-y-2.5">
		<div class="flex items-center justify-between">
			<h3 class="flex items-center gap-2 text-sm font-semibold text-slate-200">
				<Icon name="map-pin" class="h-3.5 w-3.5 text-cyan-400" />
				<span>2. {m.section_aerodromes()}</span>
			</h3>
			<button
				type="button"
				onclick={handleResetForm}
				class="flex cursor-pointer items-center gap-1 text-[11px] text-slate-500 transition-colors hover:text-rose-400"
				title="Clear route waypoints and results"
			>
				<Icon name="refresh" class="h-3 w-3" />
				<span>Reset Form</span>
			</button>
		</div>

		<div class="space-y-3 rounded-xl border border-slate-700/80 bg-slate-950/70 p-3 shadow-xs">
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
</div>

<!-- Modal for creating/editing aircraft profiles -->
<AircraftProfileModal
	isOpen={isModalOpen}
	mode={modalMode}
	initialData={modalInitialData}
	onSave={handleSaveModalProfile}
	onCancel={() => (isModalOpen = false)}
/>
