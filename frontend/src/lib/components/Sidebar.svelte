<script lang="ts">
	import { onMount } from 'svelte';
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

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(true) }: Props = $props();

	type TabType = 'route' | 'charts' | 'saved';
	const tabs: TabType[] = ['route', 'charts', 'saved'];
	let activeTab = $state<TabType>('route');
	let plannerWidth = $state(400);
	let plannerHeight = $state(420);
	let isWideLayout = $state(false);
	let resizeMedia: MediaQueryList | null = null;

	onMount(() => {
		resizeMedia = window.matchMedia('(min-width: 1024px)');
		const storedWidth = Number(localStorage.getItem('planenificator:planner-width'));
		const storedHeight = Number(localStorage.getItem('planenificator:planner-height'));
		if (Number.isFinite(storedWidth) && storedWidth >= 320) plannerWidth = storedWidth;
		if (Number.isFinite(storedHeight) && storedHeight >= 260) plannerHeight = storedHeight;
		const updateLayout = () => {
			isWideLayout = resizeMedia?.matches ?? false;
			if (isWideLayout) plannerWidth = clampPlannerSize(plannerWidth, true);
			else plannerHeight = clampPlannerSize(plannerHeight, false);
		};
		updateLayout();
		resizeMedia.addEventListener('change', updateLayout);
		window.addEventListener('resize', updateLayout);

		return () => {
			resizeMedia?.removeEventListener('change', updateLayout);
			window.removeEventListener('resize', updateLayout);
		};
	});

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

	function clampPlannerSize(value: number, wide: boolean) {
		return wide
			? Math.min(Math.max(value, 320), Math.min(560, window.innerWidth * 0.55))
			: Math.min(Math.max(value, 260), Math.min(560, window.innerHeight * 0.55));
	}

	function savePlannerSize() {
		localStorage.setItem('planenificator:planner-width', String(Math.round(plannerWidth)));
		localStorage.setItem('planenificator:planner-height', String(Math.round(plannerHeight)));
	}

	function handleResizePointerDown(event: PointerEvent) {
		event.preventDefault();
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture(event.pointerId);
		const wide = isWideLayout;
		const startPosition = wide ? event.clientX : event.clientY;
		const startSize = wide ? plannerWidth : plannerHeight;

		const move = (moveEvent: PointerEvent) => {
			const position = wide ? moveEvent.clientX : moveEvent.clientY;
			const nextSize = clampPlannerSize(startSize + position - startPosition, wide);
			if (wide) plannerWidth = nextSize;
			else plannerHeight = nextSize;
		};
		const finish = () => {
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('pointerup', finish);
			handle.removeEventListener('pointercancel', finish);
			savePlannerSize();
		};

		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', finish);
		handle.addEventListener('pointercancel', finish);
	}

	function handleResizeKeydown(event: KeyboardEvent) {
		const wideDelta = event.key === 'ArrowRight' ? 24 : event.key === 'ArrowLeft' ? -24 : 0;
		const tallDelta = event.key === 'ArrowDown' ? 24 : event.key === 'ArrowUp' ? -24 : 0;
		const delta = isWideLayout ? wideDelta : tallDelta;
		if (!delta) return;
		event.preventDefault();
		if (isWideLayout) plannerWidth = clampPlannerSize(plannerWidth + delta, true);
		else plannerHeight = clampPlannerSize(plannerHeight + delta, false);
		savePlannerSize();
	}

	const engineLabel = $derived(
		pyodideService.status.state === 'ready'
			? m.engine_ready()
			: pyodideService.status.state === 'error'
				? m.engine_error()
				: m.engine_loading()
	);
</script>

<aside
	id="planner-sidebar"
	aria-label={m.route_workspace()}
	style={`--planner-width:${plannerWidth}px;--planner-height:${plannerHeight}px`}
	class={`planner-sidebar relative flex shrink-0 flex-col border-slate-800 bg-slate-900 shadow-xl transition-[width,height] duration-200 ${
		open
			? 'planner-sidebar-open w-full border-b lg:border-r lg:border-b-0'
			: 'h-16 w-full border-b lg:h-full lg:w-[68px] lg:border-r lg:border-b-0'
	}`}
>
	{#if open}
		<button
			id="planner-resize-handle"
			type="button"
			class="planner-resize-handle"
			aria-label={m.planner_resize()}
			onpointerdown={handleResizePointerDown}
			onkeydown={handleResizeKeydown}
		>
			<span></span>
		</button>
	{/if}
	<!-- HUD Header -->
	<div
		class={`flex min-h-16 items-center gap-2 border-b border-slate-800 bg-slate-950 py-2 ${open ? 'justify-between px-3' : 'justify-center px-2'}`}
	>
		{#if open}
			<div class="flex min-w-0 items-center gap-2.5">
				<div
					class="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-950/80 text-cyan-400"
				>
					<Icon name="plane" class="h-5 w-5" />
				</div>
				<div class="min-w-0">
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
					<p class="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-400">
						<span class="truncate">{m.app_subtitle_short()}</span>
						<span aria-hidden="true">·</span>
						<span
							class:text-emerald-300={pyodideService.status.state === 'ready'}
							class:text-amber-300={pyodideService.status.state !== 'ready' &&
								pyodideService.status.state !== 'error'}
							class:text-rose-300={pyodideService.status.state === 'error'}>{engineLabel}</span
						>
					</p>
				</div>
			</div>
		{/if}

		<div class="flex items-center gap-2">
			{#if open}
				<button
					type="button"
					onclick={handlePrint}
					disabled={!calculationStore.hasCalculated || calculationStore.isStale}
					class="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 shadow-xs transition-colors hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
					title="Print or Export PDF Briefing"
				>
					<Icon name="printer" class="h-3.5 w-3.5" />
					<span class="sr-only">{m.btn_print()}</span>
				</button>

				<LanguageToggle />
			{/if}

			<button
				type="button"
				onclick={() => (open = !open)}
				aria-expanded={open}
				aria-controls="planner-panel"
				class="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 transition-colors hover:border-cyan-500/60 hover:bg-slate-700 hover:text-white"
				title={open ? m.planner_hide() : m.planner_show()}
				aria-label={open ? m.planner_hide() : m.planner_show()}
			>
				<Icon name={open ? 'panel-close' : 'panel-open'} class="h-5 w-5" />
			</button>
		</div>
	</div>

	{#if open}
		<!-- Navigation Tab Bar -->
		<div
			class="grid grid-cols-3 gap-1 border-b border-slate-800 bg-slate-950 px-2 pt-1 text-xs font-medium"
			role="tablist"
			aria-label={m.planner_sections()}
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
				class="relative flex min-h-12 items-center justify-center gap-2 rounded-t-lg border-b-2 px-2 py-2.5 text-center transition-colors"
				class:border-cyan-400={activeTab === 'route'}
				class:text-cyan-400={activeTab === 'route'}
				class:border-transparent={activeTab !== 'route'}
				class:text-slate-400={activeTab !== 'route'}
				class:hover:text-slate-200={activeTab !== 'route'}
			>
				<Icon name="route" class="h-4 w-4" />
				<span>{m.tab_route()}</span>
				{#if flightPlanStore.waypoints.length > 0}
					<span
						class="rounded-full bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
					>
						{flightPlanStore.waypoints.length}
					</span>
				{/if}
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
				class="flex min-h-12 items-center justify-center gap-2 rounded-t-lg border-b-2 px-2 py-2.5 text-center transition-colors"
				class:border-cyan-400={activeTab === 'charts'}
				class:text-cyan-400={activeTab === 'charts'}
				class:border-transparent={activeTab !== 'charts'}
				class:text-slate-400={activeTab !== 'charts'}
				class:hover:text-slate-200={activeTab !== 'charts'}
			>
				<Icon name="layers" class="h-4 w-4" />
				<span>{m.tab_charts()}</span>
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
				class="flex min-h-12 items-center justify-center gap-2 rounded-t-lg border-b-2 px-2 py-2.5 text-center transition-colors"
				class:border-cyan-400={activeTab === 'saved'}
				class:text-cyan-400={activeTab === 'saved'}
				class:border-transparent={activeTab !== 'saved'}
				class:text-slate-400={activeTab !== 'saved'}
				class:hover:text-slate-200={activeTab !== 'saved'}
			>
				<Icon name="folder-open" class="h-4 w-4" />
				<span>{m.tab_projects()}</span>
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
				<div
					class="flex items-center justify-between rounded-xl border border-slate-700/80 bg-slate-950/70 px-3 py-2.5 shadow-xs"
				>
					<div class="flex items-center gap-2 text-sm font-semibold text-slate-100">
						<Icon name="route" class="h-4 w-4 text-cyan-400" />
						<span>{m.tab_route()}</span>
					</div>
					<span class="text-xs text-slate-400">
						{m.planner_route_status({
							waypoints: String(flightPlanStore.waypoints.length),
							segments: String(flightPlanStore.segments.length)
						})}
					</span>
				</div>

				<!-- Step 1 (Aircraft Profile & Performance) & Step 2 (Aerodromes & Timing) -->
				<FlightProfileForm />

				<!-- Step 3: Waypoints & Route Segments -->
				<div class="border-t border-slate-800 pt-4">
					<WaypointList />
				</div>

				{#if calculationStore.hasCalculated || calculationStore.error}
					<!-- Safety information stays out of the setup flow until results exist. -->
					<div class="border-t border-slate-800 pt-4 pb-2">
						<SafetyAlerts />
					</div>
				{/if}
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
	{/if}
</aside>

<style>
	.planner-sidebar-open {
		height: min(var(--planner-height), 70dvh);
		max-height: 70dvh;
	}

	.planner-resize-handle {
		position: absolute;
		z-index: 1200;
		right: 0;
		bottom: -22px;
		left: 0;
		display: flex;
		height: 44px;
		align-items: center;
		justify-content: center;
		cursor: row-resize;
		touch-action: none;
		border: 0;
		background: transparent;
		padding: 0;
	}

	.planner-resize-handle span {
		display: block;
		width: 52px;
		height: 5px;
		border-radius: 999px;
		background: #475569;
		box-shadow: 0 0 0 1px rgb(15 23 42 / 0.8);
	}

	.planner-resize-handle:hover span,
	.planner-resize-handle:focus-visible span {
		background: #22d3ee;
	}

	@media (min-width: 1024px) {
		.planner-sidebar-open {
			width: min(var(--planner-width), 55vw);
			height: 100%;
			max-height: none;
		}

		.planner-resize-handle {
			top: 0;
			right: -22px;
			bottom: 0;
			left: auto;
			width: 44px;
			height: auto;
			cursor: col-resize;
		}

		.planner-resize-handle span {
			width: 5px;
			height: 52px;
		}
	}
</style>
