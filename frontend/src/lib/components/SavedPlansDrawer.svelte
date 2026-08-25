<script lang="ts">
	import { onMount } from 'svelte';
	import { flightPlanStore } from '$lib/state/flight-plan.svelte';
	import { flightPlanStorage } from '$lib/services/storage';
	import Icon from './Icon.svelte';
	import type { SavedFlightPlan } from '$lib/types/flight';
	import * as m from '$lib/paraglide/messages';

	let savedPlans = $state<SavedFlightPlan[]>([]);
	let planNameInput = $state<string>('');
	let isSaving = $state<boolean>(false);

	async function refreshPlans() {
		savedPlans = await flightPlanStorage.listSavedPlans();
	}

	onMount(() => {
		refreshPlans();
	});

	async function handleSavePlan() {
		const name = planNameInput.trim() || `Flight Plan ${new Date().toLocaleDateString()}`;
		isSaving = true;
		try {
			const plan = flightPlanStore.exportAsSavedPlan(name);
			await flightPlanStorage.savePlan(plan);
			planNameInput = '';
			await refreshPlans();
		} finally {
			isSaving = false;
		}
	}

	async function handleLoadPlan(plan: SavedFlightPlan) {
		flightPlanStore.loadSavedPlan(plan);
	}

	async function handleDeletePlan(id: string) {
		if (confirm('Delete this saved flight plan?')) {
			await flightPlanStorage.deletePlan(id);
			await refreshPlans();
		}
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3
			class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-300 uppercase"
		>
			<Icon name="clipboard" class="h-3.5 w-3.5 text-cyan-400" />
			<span>{m.projects_title()}</span>
		</h3>
		<span class="font-mono text-[11px] text-slate-400">
			{savedPlans.length} Projects
		</span>
	</div>

	<!-- Save Current Plan Form -->
	<div class="space-y-2 rounded-lg border border-slate-800 bg-slate-900 p-3">
		<label for="plan-name-input" class="block text-[11px] font-medium text-slate-400">
			{m.projects_save_label()}
		</label>
		<div class="flex gap-2">
			<input
				id="plan-name-input"
				type="text"
				placeholder="e.g. Córdoba to Madrid VFR"
				bind:value={planNameInput}
				class="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-hidden"
			/>
			<button
				type="button"
				onclick={handleSavePlan}
				disabled={isSaving || flightPlanStore.waypoints.length === 0}
				class="shrink-0 rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500"
			>
				{m.btn_save()}
			</button>
		</div>
	</div>

	<!-- Saved Plans List -->
	<div class="max-h-[320px] space-y-2 overflow-y-auto pr-1">
		{#if savedPlans.length === 0}
			<div
				class="rounded-lg border border-slate-800 bg-slate-950 p-4 text-center text-xs text-slate-500 italic"
			>
				{m.projects_empty()}
			</div>
		{:else}
			{#each savedPlans as plan (plan.id)}
				<div
					class="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2.5 transition-colors hover:border-slate-700"
				>
					<div class="min-w-0 flex-1">
						<div class="truncate text-xs font-semibold text-slate-200" title={plan.name}>
							{plan.name}
						</div>
						<div class="mt-0.5 font-mono text-[10px] text-slate-400">
							{plan.waypoints.length} WPs · {plan.segments.length} Segs · {new Date(
								plan.updatedAt
							).toLocaleDateString()}
						</div>
					</div>

					<div class="flex shrink-0 items-center gap-1">
						<button
							type="button"
							onclick={() => handleLoadPlan(plan)}
							class="rounded-sm bg-slate-800 px-2 py-1 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-600 hover:text-white"
						>
							{m.btn_load()}
						</button>

						<button
							type="button"
							onclick={() => handleDeletePlan(plan.id)}
							class="p-1 text-slate-500 transition-colors hover:text-rose-400"
							title="Delete Plan"
						>
							<Icon name="trash" class="h-3.5 w-3.5" />
						</button>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
