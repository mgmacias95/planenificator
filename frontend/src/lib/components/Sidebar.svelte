<script lang="ts">
	import FlightProfileForm from './FlightProfileForm.svelte';
	import WaypointList from './WaypointList.svelte';
	import ChartManager from './ChartManager.svelte';
	import SafetyAlerts from './SafetyAlerts.svelte';
	import SavedPlansDrawer from './SavedPlansDrawer.svelte';
	import LanguageToggle from './LanguageToggle.svelte';
	import { calculationStore } from '$lib/state/calculation.svelte';
	import * as m from '$lib/paraglide/messages';

	type TabType = 'route' | 'charts' | 'safety' | 'saved';
	let activeTab = $state<TabType>('route');

	function handlePrint() {
		window.print();
	}
</script>

<aside
	class="flex h-full w-full shrink-0 flex-col border-r border-slate-800 bg-slate-900 shadow-2xl select-none md:w-96 lg:w-[420px]"
>
	<!-- HUD Header -->
	<div class="flex items-center justify-between border-b border-slate-800 bg-slate-950 p-4">
		<div class="flex items-center gap-2.5">
			<span class="text-xl">✈️</span>
			<div>
				<h1 class="text-sm font-black tracking-wider text-cyan-400 uppercase">
					{m.app_title()}
				</h1>
				<p class="font-mono text-[10px] tracking-wide text-slate-400">
					{m.app_subtitle()}
				</p>
			</div>
		</div>

		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={handlePrint}
				disabled={!calculationStore.hasCalculated}
				class="flex cursor-pointer items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300 shadow-xs transition-colors hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
				title="Print or Export PDF Briefing"
			>
				<span>🖨️</span>
				<span>{m.btn_print()}</span>
			</button>

			<LanguageToggle />
		</div>
	</div>

	<!-- Navigation Tab Bar -->
	<div class="flex border-b border-slate-800 bg-slate-950 text-xs font-medium">
		<button
			type="button"
			onclick={() => (activeTab = 'route')}
			class="flex-1 border-b-2 py-2.5 text-center transition-colors"
			class:border-cyan-400={activeTab === 'route'}
			class:text-cyan-400={activeTab === 'route'}
			class:border-transparent={activeTab !== 'route'}
			class:text-slate-400={activeTab !== 'route'}
			class:hover:text-slate-200={activeTab !== 'route'}
		>
			{m.tab_route()}
		</button>

		<button
			type="button"
			onclick={() => (activeTab = 'charts')}
			class="flex-1 border-b-2 py-2.5 text-center transition-colors"
			class:border-cyan-400={activeTab === 'charts'}
			class:text-cyan-400={activeTab === 'charts'}
			class:border-transparent={activeTab !== 'charts'}
			class:text-slate-400={activeTab !== 'charts'}
			class:hover:text-slate-200={activeTab !== 'charts'}
		>
			{m.tab_charts()}
		</button>

		<button
			type="button"
			onclick={() => (activeTab = 'safety')}
			class="relative flex-1 border-b-2 py-2.5 text-center transition-colors"
			class:border-cyan-400={activeTab === 'safety'}
			class:text-cyan-400={activeTab === 'safety'}
			class:border-transparent={activeTab !== 'safety'}
			class:text-slate-400={activeTab !== 'safety'}
			class:hover:text-slate-200={activeTab !== 'safety'}
		>
			{m.tab_safety()}
			{#if calculationStore.notams.length > 0}
				<span class="absolute top-2 right-2 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400"
				></span>
			{/if}
		</button>

		<button
			type="button"
			onclick={() => (activeTab = 'saved')}
			class="flex-1 border-b-2 py-2.5 text-center transition-colors"
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
	<div class="flex-1 space-y-6 overflow-y-auto p-4">
		{#if activeTab === 'route'}
			<WaypointList />
			<div class="border-t border-slate-800 pt-4">
				<FlightProfileForm />
			</div>
		{:else if activeTab === 'charts'}
			<ChartManager />
		{:else if activeTab === 'safety'}
			<SafetyAlerts />
		{:else if activeTab === 'saved'}
			<SavedPlansDrawer />
		{/if}
	</div>
</aside>
