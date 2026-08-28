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

	onMount(async () => {
		// Load custom aircraft profiles
		await aircraftProfilesStore.init();
		// Restore active session if available
		await flightPlanStore.restoreActiveSession();
		// Warm up Pyodide runtime in background
		pyodideService.init().catch((err) => console.warn('Background Pyodide init:', err));
	});
</script>

<svelte:head>
	<title>Planenificator · Modern VFR Flight Planner</title>
</svelte:head>

<div
	class="app-shell no-print flex h-[100dvh] min-h-[100dvh] w-full flex-col overflow-hidden bg-slate-950 lg:flex-row"
>
	<!-- Sidebar HUD Drawer -->
	<Sidebar />

	<!-- Main Viewport Area -->
	<main class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:gap-3 sm:p-3">
		<!-- Map Container -->
		<div class="relative min-h-0 w-full flex-1">
			<Map />
		</div>

		{#if calculationStore.hasCalculated || calculationStore.error}
			<!-- Results stay out of the way until a calculation exists. -->
			<div class="max-h-[clamp(11rem,26dvh,16rem)] shrink-0 overflow-y-auto">
				<NavLogTable />
			</div>
		{/if}
	</main>
</div>

<!-- Dedicated Print / PDF Layout -->
<PrintBriefing />

<!-- Calculation Loading Overlay -->
<LoadingOverlay />
