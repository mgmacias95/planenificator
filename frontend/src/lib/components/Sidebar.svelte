<script lang="ts">
	import FlightProfileForm from './FlightProfileForm.svelte';
	import WaypointList from './WaypointList.svelte';
	import ChartManager from './ChartManager.svelte';
	import SafetyAlerts from './SafetyAlerts.svelte';
	import SavedPlansDrawer from './SavedPlansDrawer.svelte';
	import LanguageToggle from './LanguageToggle.svelte';
	import Icon from './Icon.svelte';
	import { flightPlanStore } from '$lib/state/flight-plan.svelte';
	import { calculationStore } from '$lib/state/calculation.svelte';
	import { pyodideService } from '$lib/services/pyodide.svelte';
	import * as m from '$lib/paraglide/messages';

	type TabType = 'route' | 'charts' | 'saved';
	const tabs: TabType[] = ['route', 'charts', 'saved'];
	let activeTab = $state<TabType>('route');

	function handleTabKey(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const currentIndex = tabs.indexOf(activeTab);
		if (event.key === 'Home') activeTab = tabs[0];
		else if (event.key === 'End') activeTab = tabs[tabs.length - 1];
		else if (event.key === 'ArrowRight') activeTab = tabs[(currentIndex + 1) % tabs.length];
		else activeTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
		requestAnimationFrame(() => document.getElementById(`${activeTab}-tab`)?.focus());
	}

	function handlePrint() {
		window.print();
	}
</script>

<aside
	class="flex h-[42dvh] w-full shrink-0 flex-col border-b border-slate-800 bg-slate-900 shadow-lg lg:h-full lg:w-96 lg:border-r lg:border-b-0 xl:w-[420px]"
>
	<!-- HUD Header -->
	<div class="flex items-center justify-between border-b border-slate-800 bg-slate-950 p-3 sm:p-4">
		<div class="flex items-center gap-2.5">
			<div
				class="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-950/80 text-cyan-400"
			>
				<Icon name="plane" class="h-5 w-5" />
			</div>
			<div>
				<div class="flex items-center gap-2">
					<h1 class="text-sm font-black tracking-wider text-cyan-400 uppercase">
						{m.app_title()}
					</h1>
					<!-- Demoted Engine Status Indicator Dot -->
					<div
						class="flex cursor-help items-center gap-1"
						role="status"
						aria-live="polite"
						title={pyodideService.status.state === 'ready'
							? 'Engine Ready'
							: `Flight Engine: ${pyodideService.status.progressMessage}`}
					>
						<span
							class="h-2 w-2 rounded-full transition-all"
							class:bg-emerald-400={pyodideService.status.state === 'ready'}
							class:shadow-[0_0_6px_#34d399]={pyodideService.status.state === 'ready'}
							class:bg-amber-400={pyodideService.status.state === 'loading_wasm' ||
								pyodideService.status.state === 'installing_packages' ||
								pyodideService.status.state === 'loading_modules'}
							class:animate-pulse={pyodideService.status.state !== 'ready' &&
								pyodideService.status.state !== 'error'}
							class:bg-rose-500={pyodideService.status.state === 'error'}
							class:bg-slate-600={pyodideService.status.state === 'uninitialized'}
						></span>
						<span class="sr-only">{pyodideService.status.progressMessage}</span>
					</div>
				</div>
				<p class="font-mono text-[10px] tracking-wide text-slate-400">
					{m.app_subtitle()}
				</p>
			</div>
		</div>

		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={handlePrint}
				disabled={!calculationStore.hasCalculated || calculationStore.isStale}
				class="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 shadow-xs transition-colors hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
				title="Print or Export PDF Briefing"
			>
				<Icon name="printer" class="h-3.5 w-3.5" />
				<span>{m.btn_print()}</span>
			</button>

			<LanguageToggle />
		</div>
	</div>

	<!-- Navigation Tab Bar -->
	<div
		class="flex border-b border-slate-800 bg-slate-950 text-xs font-medium"
		role="tablist"
		aria-label="Planner sections"
	>
		<button
			id="route-tab"
			type="button"
			role="tab"
			aria-selected={activeTab === 'route'}
			aria-controls="planner-panel"
			tabindex={activeTab === 'route' ? 0 : -1}
			onkeydown={handleTabKey}
			onclick={() => (activeTab = 'route')}
			class="relative min-h-11 flex-1 border-b-2 py-2.5 text-center transition-colors"
			class:border-cyan-400={activeTab === 'route'}
			class:text-cyan-400={activeTab === 'route'}
			class:border-transparent={activeTab !== 'route'}
			class:text-slate-400={activeTab !== 'route'}
			class:hover:text-slate-200={activeTab !== 'route'}
		>
			{m.tab_route()}
			{#if calculationStore.notams.length > 0 || calculationStore.semicircularNotices.length > 0 || calculationStore.warnings.length > 0}
				<span class="absolute top-2 right-2 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400"
				></span>
			{/if}
		</button>

		<button
			id="charts-tab"
			type="button"
			role="tab"
			aria-selected={activeTab === 'charts'}
			aria-controls="planner-panel"
			tabindex={activeTab === 'charts' ? 0 : -1}
			onkeydown={handleTabKey}
			onclick={() => (activeTab = 'charts')}
			class="min-h-11 flex-1 border-b-2 py-2.5 text-center transition-colors"
			class:border-cyan-400={activeTab === 'charts'}
			class:text-cyan-400={activeTab === 'charts'}
			class:border-transparent={activeTab !== 'charts'}
			class:text-slate-400={activeTab !== 'charts'}
			class:hover:text-slate-200={activeTab !== 'charts'}
		>
			{m.tab_charts()}
		</button>

		<button
			id="saved-tab"
			type="button"
			role="tab"
			aria-selected={activeTab === 'saved'}
			aria-controls="planner-panel"
			tabindex={activeTab === 'saved' ? 0 : -1}
			onkeydown={handleTabKey}
			onclick={() => (activeTab = 'saved')}
			class="min-h-11 flex-1 border-b-2 py-2.5 text-center transition-colors"
			class:border-cyan-400={activeTab === 'saved'}
			class:text-cyan-400={activeTab === 'saved'}
			class:border-transparent={activeTab !== 'saved'}
			class:text-slate-400={activeTab !== 'saved'}
			class:hover:text-slate-200={activeTab !== 'saved'}
		>
			{m.tab_projects()}
		</button>
	</div>

	<!-- Tab Content Area -->
	<div
		id="planner-panel"
		class="flex-1 space-y-5 overflow-y-auto p-3 sm:p-4"
		role="tabpanel"
		aria-labelledby={`${activeTab}-tab`}
	>
		{#if activeTab === 'route'}
			<!-- Step 1 (Aircraft Profile & Performance) & Step 2 (Aerodromes & Timing) -->
			<FlightProfileForm />

			<!-- Step 3: Waypoints & Route Segments -->
			<div class="border-t border-slate-800 pt-4">
				<WaypointList />
			</div>

			<!-- Step 4: Safety Briefing & NOTAMs (Output Area) -->
			<div class="border-t border-slate-800 pt-4 pb-2">
				<SafetyAlerts />
			</div>
		{:else if activeTab === 'charts'}
			<ChartManager />
		{:else if activeTab === 'saved'}
			<SavedPlansDrawer />
		{/if}
	</div>

	<!-- Sticky Docked Action Bar for Route calculation -->
	{#if activeTab === 'route'}
		<div class="border-t border-slate-800 bg-slate-950/95 p-2 backdrop-blur-xs sm:p-3">
			{#if calculationStore.isStale}
				<div
					class="mb-2 rounded-lg border border-amber-500/40 bg-amber-950/60 px-3 py-2 text-xs font-semibold text-amber-200"
					role="status"
					aria-live="polite"
				>
					{m.route_stale()}
				</div>
			{/if}
			<button
				id="calculate-btn"
				type="button"
				onclick={() => calculationStore.calculate()}
				disabled={calculationStore.isCalculating || flightPlanStore.waypoints.length < 2}
				class="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-xs font-bold tracking-wider text-slate-950 uppercase shadow-md transition-all hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
			>
				{#if calculationStore.isCalculating}
					<Icon name="loader" class="h-4 w-4 text-slate-950" />
					<span>{m.btn_calculating()}</span>
				{:else}
					<Icon name="zap" class="h-4 w-4 text-slate-950" />
					<span>{calculationStore.isStale ? m.btn_recalculate() : m.btn_calculate()}</span>
				{/if}
			</button>
			{#if flightPlanStore.waypoints.length < 2}
				<p class="mt-1.5 text-center text-xs text-slate-400">{m.calculate_disabled_hint()}</p>
			{/if}
		</div>
	{/if}
</aside>
