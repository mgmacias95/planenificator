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
	let pendingPlanToLoad = $state<SavedFlightPlan | null>(null);
	let isConfirmOverlayOpen = $state<boolean>(false);

	async function refreshPlans() {
		savedPlans = await flightPlanStorage.listSavedPlans();
	}

	onMount(() => {
		refreshPlans();
	});

	async function handleSaveNewPlan() {
		const name = planNameInput.trim() || `Flight Plan ${new Date().toLocaleDateString()}`;
		isSaving = true;
		try {
			const plan = flightPlanStore.exportAsSavedPlan(name);
			await flightPlanStorage.savePlan(plan);
			flightPlanStore.activePlanId = plan.id;
			flightPlanStore.activePlanName = plan.name;
			flightPlanStore.takeCleanSnapshot();
			planNameInput = '';
			await refreshPlans();
		} finally {
			isSaving = false;
		}
	}

	async function handleSaveToPlan(e: MouseEvent, targetPlan: SavedFlightPlan) {
		e.stopPropagation();
		isSaving = true;
		try {
			const updated = flightPlanStore.exportAsSavedPlan(targetPlan.name, targetPlan.id);
			await flightPlanStorage.savePlan(updated);
			flightPlanStore.activePlanId = targetPlan.id;
			flightPlanStore.activePlanName = targetPlan.name;
			flightPlanStore.takeCleanSnapshot();
			await refreshPlans();
		} finally {
			isSaving = false;
		}
	}

	function handlePlanClick(plan: SavedFlightPlan) {
		if (flightPlanStore.activePlanId === plan.id && !flightPlanStore.hasUnsavedChanges()) {
			return;
		}

		if (flightPlanStore.hasUnsavedChanges()) {
			pendingPlanToLoad = plan;
			isConfirmOverlayOpen = true;
		} else {
			executeLoadPlan(plan);
		}
	}

	function executeLoadPlan(plan: SavedFlightPlan) {
		flightPlanStore.loadSavedPlan(plan);
		isConfirmOverlayOpen = false;
		pendingPlanToLoad = null;
	}

	function handleCancelConfirm() {
		isConfirmOverlayOpen = false;
		pendingPlanToLoad = null;
	}

	async function handleDeletePlan(e: MouseEvent, id: string) {
		e.stopPropagation();
		if (confirm('Delete this saved flight plan?')) {
			await flightPlanStorage.deletePlan(id);
			if (flightPlanStore.activePlanId === id) {
				flightPlanStore.activePlanId = null;
			}
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
			{savedPlans.length}
			{savedPlans.length === 1 ? 'Plan' : 'Plans'}
		</span>
	</div>

	<!-- Save Current Plan Form (Creates a New Plan) -->
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
				onclick={handleSaveNewPlan}
				disabled={isSaving || flightPlanStore.waypoints.length === 0}
				class="shrink-0 cursor-pointer rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
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
					role="button"
					tabindex="0"
					onclick={() => handlePlanClick(plan)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							handlePlanClick(plan);
						}
					}}
					class="group flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2.5 transition-all {plan.id ===
					flightPlanStore.activePlanId
						? 'border-cyan-500/50 bg-slate-900/90 shadow-xs ring-1 ring-cyan-500/20'
						: 'hover:bg-slate-850 border-slate-800 bg-slate-900 hover:border-slate-700'}"
				>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-1.5">
							<span
								class="truncate text-xs font-semibold text-slate-200 transition-colors group-hover:text-cyan-300"
								title={plan.name}
							>
								{plan.name}
							</span>
							{#if plan.id === flightPlanStore.activePlanId}
								<span
									class="py-0.2 shrink-0 rounded-xs border border-cyan-500/30 bg-cyan-950/80 px-1.5 text-[9px] font-bold text-cyan-400"
								>
									Active
								</span>
							{/if}
						</div>
						<div class="mt-0.5 font-mono text-[10px] text-slate-400">
							{plan.waypoints.length} WPs · {plan.segments.length} Segs · {new Date(
								plan.updatedAt
							).toLocaleDateString()}
						</div>
					</div>

					<div class="flex shrink-0 items-center gap-1.5">
						<button
							type="button"
							onclick={(e) => handleSaveToPlan(e, plan)}
							disabled={isSaving || flightPlanStore.waypoints.length === 0}
							class="cursor-pointer rounded-sm bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
							title="Overwrite this plan with current flight plan"
						>
							{m.btn_save()}
						</button>

						<button
							type="button"
							onclick={(e) => handleDeletePlan(e, plan.id)}
							class="cursor-pointer p-1 text-slate-500 transition-colors hover:text-rose-400"
							title="Delete Plan"
							aria-label="Delete Plan"
						>
							<Icon name="trash" class="h-3.5 w-3.5" />
						</button>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<!-- Confirmation Overlay Modal when loading replaces existing plan changes -->
{#if isConfirmOverlayOpen && pendingPlanToLoad}
	<div
		class="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onkeydown={(e) => {
			if (e.key === 'Escape') handleCancelConfirm();
		}}
	>
		<div
			class="w-full max-w-sm space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
		>
			<div class="flex items-start gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-400"
				>
					<Icon name="alert-triangle" class="h-5 w-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h4 class="text-sm font-bold text-white">
						{m.confirm_load_title ? m.confirm_load_title() : 'Load Flight Plan?'}
					</h4>
					<p class="mt-1 text-xs leading-relaxed text-slate-400">
						{m.confirm_load_message
							? m.confirm_load_message({ name: pendingPlanToLoad.name })
							: `Loading "${pendingPlanToLoad.name}" will replace your current route. Any unsaved changes will be lost.`}
					</p>
				</div>
			</div>

			<div class="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
				<button
					type="button"
					onclick={handleCancelConfirm}
					class="cursor-pointer rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
				>
					{m.btn_cancel ? m.btn_cancel() : 'Cancel'}
				</button>
				<button
					type="button"
					onclick={() => pendingPlanToLoad && executeLoadPlan(pendingPlanToLoad)}
					class="cursor-pointer rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-cyan-400"
				>
					{m.btn_confirm_load ? m.btn_confirm_load() : 'Load Plan'}
				</button>
			</div>
		</div>
	</div>
{/if}
