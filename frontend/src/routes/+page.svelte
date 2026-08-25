<script lang="ts">
	import { onMount } from 'svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Map from '$lib/components/Map.svelte';
	import NavLogTable from '$lib/components/NavLogTable.svelte';
	import PrintBriefing from '$lib/components/PrintBriefing.svelte';
	import LoadingOverlay from '$lib/components/LoadingOverlay.svelte';
	import { flightPlanStore } from '$lib/state/flight-plan.svelte';
	import { aircraftProfilesStore } from '$lib/state/aircraft-profiles.svelte';
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

<div class="no-print flex h-screen w-screen overflow-hidden bg-slate-950">
	<!-- Sidebar HUD Drawer -->
	<Sidebar />

	<!-- Main Viewport Area -->
	<main class="flex h-full flex-1 flex-col gap-3 overflow-hidden p-3">
		<!-- Map Container -->
		<div class="relative min-h-0 w-full flex-1">
			<Map />
		</div>

		<!-- Bottom Navigation Log Panel -->
		<div class="h-64 shrink-0 overflow-y-auto">
			<NavLogTable />
		</div>
	</main>
</div>

<!-- Dedicated Print / PDF Layout -->
<PrintBriefing />

<!-- Calculation Loading Overlay -->
<LoadingOverlay />
