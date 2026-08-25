<script lang="ts">
	import { flightPlanStore, SEGMENT_COLORS } from '$lib/state/flight-plan.svelte';
	import SegmentModal from './SegmentModal.svelte';
	import * as m from '$lib/paraglide/messages';

	let modalOpen = $state<boolean>(false);
	let modalTitle = $state<string>('');
	let modalDefaultAlt = $state<number>(5500);
	let modalCallback: ((alt: number) => void) | null = null;

	function isSegmentLocked(sIdx: number): boolean {
		for (let i = sIdx + 1; i < flightPlanStore.segments.length; i++) {
			if (flightPlanStore.segments[i].waypointIds.length > 1) {
				return true;
			}
		}
		return false;
	}

	function promptNewSegment() {
		modalTitle = 'Add New Route Segment';
		modalDefaultAlt = flightPlanStore.profile.cruiseTas ? 5500 : 5500;
		modalCallback = (alt: number) => {
			flightPlanStore.addSegment(alt);
			modalOpen = false;
		};
		modalOpen = true;
	}

	function promptEditSegmentAlt(index: number) {
		const seg = flightPlanStore.segments[index];
		if (!seg) return;
		modalTitle = `Edit Segment ${index + 1} Altitude`;
		modalDefaultAlt = seg.cruiseAlt;
		modalCallback = (alt: number) => {
			flightPlanStore.updateSegment(seg.id, { cruiseAlt: alt });
			modalOpen = false;
		};
		modalOpen = true;
	}

	function handleWaypointNameChange(wpId: string, e: Event) {
		const input = e.target as HTMLInputElement;
		flightPlanStore.updateWaypoint(wpId, { name: input.value, isManualName: true });
	}

	const waypointMap = $derived(new Map(flightPlanStore.waypoints.map((w) => [w.id, w])));
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<h3
			class="flex items-center gap-1.5 text-sm font-semibold tracking-wider text-slate-300 uppercase"
		>
			<span>📍</span>
			<span>Waypoints & Segments</span>
		</h3>
		<button
			type="button"
			onclick={promptNewSegment}
			class="flex items-center gap-1 rounded-md border border-cyan-500/30 bg-slate-800 px-2.5 py-1 text-xs text-cyan-400 transition-colors hover:bg-slate-700"
		>
			<span>+</span>
			<span>New Segment</span>
		</button>
	</div>

	{#if flightPlanStore.waypoints.length === 0}
		<div
			class="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-center text-xs text-slate-400"
		>
			Double-click on the map or georeferenced chart to place waypoints.
		</div>
	{:else}
		<div class="space-y-2.5">
			{#each flightPlanStore.segments as seg, sIdx (seg.id)}
				{@const isActive = sIdx === flightPlanStore.activeSegmentIndex}
				{@const isLocked = isSegmentLocked(sIdx)}
				{@const segColor = seg.color || SEGMENT_COLORS[sIdx % SEGMENT_COLORS.length]}

				<div
					class="overflow-hidden rounded-lg border bg-slate-900/90 shadow-xs transition-all"
					style:border-color={isActive ? segColor : '#1e293b'}
					style:border-left-width="4px"
					style:border-left-color={segColor}
				>
					<!-- Segment Header -->
					<div
						class="flex cursor-pointer items-center justify-between bg-slate-900 p-2.5 transition-colors hover:bg-slate-800/60"
						onclick={() => flightPlanStore.setActiveSegment(sIdx)}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && flightPlanStore.setActiveSegment(sIdx)}
					>
						<div class="flex items-center gap-2">
							<button
								type="button"
								onclick={(e) => {
									e.stopPropagation();
									flightPlanStore.toggleSegmentCollapse(sIdx);
								}}
								class="p-0.5 text-xs text-slate-400 hover:text-white"
								title={seg.collapsed ? 'Expand' : 'Collapse'}
							>
								{seg.collapsed ? '▶' : '▼'}
							</button>

							<span
								class="inline-block h-2.5 w-2.5 rounded-full"
								style:background-color={segColor}
								style:box-shadow={`0 0 6px ${segColor}`}
							></span>

							<span class="text-xs font-semibold text-white">
								Segment {sIdx + 1}
							</span>

							<span class="rounded-sm bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-cyan-300">
								{seg.cruiseAlt} ft
							</span>

							{#if isLocked}
								<span class="text-xs" title="Locked previous segment">🔒</span>
							{/if}
						</div>

						<div class="flex items-center gap-1">
							<button
								type="button"
								onclick={(e) => {
									e.stopPropagation();
									promptEditSegmentAlt(sIdx);
								}}
								class="p-1 text-xs text-slate-400 hover:text-cyan-300"
								title="Edit Cruise Altitude"
							>
								✏️
							</button>

							{#if flightPlanStore.segments.length > 1 && sIdx === flightPlanStore.segments.length - 1}
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										flightPlanStore.removeSegment(sIdx);
									}}
									class="p-1 text-xs text-slate-400 hover:text-red-400"
									title="Remove Segment"
								>
									🗑️
								</button>
							{/if}
						</div>
					</div>

					<!-- Segment Waypoints List -->
					{#if !seg.collapsed}
						<div class="space-y-1.5 border-t border-slate-800/80 bg-slate-950/40 p-2">
							{#if seg.waypointIds.length === 0}
								<p class="p-1 text-xs text-slate-500 italic">
									No waypoints in segment. Double-click map to add.
								</p>
							{:else}
								{#each seg.waypointIds as wpId, wIdx (wpId)}
									{@const wp = waypointMap.get(wpId)}
									{@const isShared = sIdx > 0 && wIdx === 0}

									{#if wp}
										<div
											class="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900/70 p-1.5 text-xs"
										>
											<div class="flex min-w-0 flex-1 items-center gap-2">
												<span
													class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-slate-950"
													style:background-color={segColor}
												>
													{isShared ? '🔗' : wIdx + 1}
												</span>

												<input
													type="text"
													value={wp.name}
													oninput={(e) => handleWaypointNameChange(wp.id, e)}
													class="flex-1 truncate border-b border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-slate-200 hover:border-slate-700 focus:border-cyan-400 focus:outline-hidden"
													title="Click to rename waypoint"
												/>
											</div>

											<div class="flex shrink-0 items-center gap-2">
												<span class="font-mono text-[10px] text-slate-400">
													{wp.lat.toFixed(3)}, {wp.lng.toFixed(3)}
												</span>

												{#if !isLocked && !isShared}
													<button
														type="button"
														onclick={() => flightPlanStore.removeWaypoint(wp.id)}
														class="p-0.5 text-xs text-slate-500 transition-colors hover:text-rose-400"
														title="Remove waypoint"
													>
														✕
													</button>
												{/if}
											</div>
										</div>
									{/if}
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<SegmentModal
	isOpen={modalOpen}
	title={modalTitle}
	defaultAlt={modalDefaultAlt}
	onConfirm={(alt) => modalCallback?.(alt)}
	onCancel={() => (modalOpen = false)}
/>
