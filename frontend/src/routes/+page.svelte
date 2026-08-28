<script lang="ts">
	import { onMount } from 'svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Map from '$lib/components/Map.svelte';
	import NavLogTable from '$lib/components/NavLogTable.svelte';
	import PrintBriefing from '$lib/components/PrintBriefing.svelte';
	import LoadingOverlay from '$lib/components/LoadingOverlay.svelte';
	import { flightPlanStore } from '$lib/state/flight-plan.svelte';
	import { aircraftProfilesStore } from '$lib/state/aircraft-profiles.svelte';
	import { calculationStore } from '$lib/state/calculation.svelte';
	import { pyodideService } from '$lib/services/pyodide.svelte';
	import * as m from '$lib/paraglide/messages';
	import Icon from '$lib/components/Icon.svelte';

	let resultsHeight = $state(232);
	let resultsCollapsed = $state(false);

	onMount(async () => {
		const storedHeight = Number(localStorage.getItem('planenificator:results-height'));
		if (Number.isFinite(storedHeight) && storedHeight >= 150) resultsHeight = storedHeight;
		resultsCollapsed = localStorage.getItem('planenificator:results-collapsed') === 'true';
		// Load custom aircraft profiles
		await aircraftProfilesStore.init();
		// Restore active session if available
		await flightPlanStore.restoreActiveSession();
		// Warm up Pyodide runtime in background
		pyodideService.init().catch((err) => console.warn('Background Pyodide init:', err));
	});

	function clampResultsHeight(value: number) {
		return Math.min(Math.max(value, 150), Math.min(560, window.innerHeight * 0.62));
	}

	function handleResultsPointerDown(event: PointerEvent) {
		event.preventDefault();
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture(event.pointerId);
		const startY = event.clientY;
		const startHeight = resultsHeight;

		const move = (moveEvent: PointerEvent) => {
			resultsHeight = clampResultsHeight(startHeight + startY - moveEvent.clientY);
		};
		const finish = () => {
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('pointerup', finish);
			handle.removeEventListener('pointercancel', finish);
			localStorage.setItem('planenificator:results-height', String(Math.round(resultsHeight)));
		};

		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', finish);
		handle.addEventListener('pointercancel', finish);
	}

	function handleResultsKeydown(event: KeyboardEvent) {
		const delta = event.key === 'ArrowUp' ? 24 : event.key === 'ArrowDown' ? -24 : 0;
		if (!delta) return;
		event.preventDefault();
		resultsHeight = clampResultsHeight(resultsHeight + delta);
		localStorage.setItem('planenificator:results-height', String(Math.round(resultsHeight)));
	}

	function resultsResize(node: HTMLElement) {
		const pointerListener = (event: PointerEvent) => handleResultsPointerDown(event);
		const keyListener = (event: KeyboardEvent) => handleResultsKeydown(event);
		node.addEventListener('pointerdown', pointerListener);
		node.addEventListener('keydown', keyListener);
		return {
			destroy() {
				node.removeEventListener('pointerdown', pointerListener);
				node.removeEventListener('keydown', keyListener);
			}
		};
	}

	function toggleResults() {
		resultsCollapsed = !resultsCollapsed;
		localStorage.setItem('planenificator:results-collapsed', String(resultsCollapsed));
	}
</script>

<svelte:head>
	<title>Planenificator · Modern VFR Flight Planner</title>
</svelte:head>

<div
	class="app-shell no-print flex h-[100dvh] min-h-[100dvh] w-full flex-col overflow-hidden bg-slate-950 lg:flex-row"
>
	<a href="#main-workspace" class="skip-link">{m.skip_to_content()}</a>
	<!-- Sidebar HUD Drawer -->
	<Sidebar />

	<!-- Main Viewport Area -->
	<main
		id="main-workspace"
		tabindex="-1"
		class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:gap-3 sm:p-3"
	>
		<!-- Map Container -->
		<div class="relative min-h-0 w-full flex-1">
			<Map />
		</div>

		{#if calculationStore.hasCalculated || calculationStore.error}
			<div
				class="results-panel shrink-0 overflow-hidden"
				class:h-12={resultsCollapsed}
				style:height={resultsCollapsed ? undefined : `${resultsHeight}px`}
				aria-label={m.results_panel()}
			>
				<div
					class="results-panel-bar flex h-9 items-center rounded-t-xl border border-slate-700 bg-slate-950/95 shadow-lg backdrop-blur-md"
				>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex (This is an ARIA resize separator.) -->
					<div
						id="results-resize-handle"
						role="separator"
						aria-label={m.results_resize()}
						aria-orientation="horizontal"
						aria-valuemin="150"
						aria-valuemax="560"
						aria-valuenow={Math.round(resultsHeight)}
						tabindex="0"
						use:resultsResize
						class="flex h-full flex-1 cursor-row-resize touch-none items-center justify-center gap-2 text-[11px] font-semibold text-slate-400"
					>
						<span class="h-1 w-12 rounded-full bg-slate-600"></span>
						<span class="hidden sm:inline">{m.results_panel()}</span>
					</div>
					<button
						type="button"
						onclick={toggleResults}
						class="mr-1 flex min-h-8 min-w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
						aria-label={resultsCollapsed ? m.results_show() : m.results_hide()}
						title={resultsCollapsed ? m.results_show() : m.results_hide()}
					>
						<Icon name={resultsCollapsed ? 'chevron-up' : 'chevron-down'} class="h-4 w-4" />
					</button>
				</div>
				{#if !resultsCollapsed}
					<div class="h-[calc(100%-2.25rem)] overflow-y-auto">
						<NavLogTable />
					</div>
				{/if}
			</div>
		{/if}
	</main>
</div>

<!-- Dedicated Print / PDF Layout -->
<PrintBriefing />

<!-- Calculation Loading Overlay -->
<LoadingOverlay />
