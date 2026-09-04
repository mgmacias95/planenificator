<script lang="ts">
	import { flightPlanStore } from '$lib/state/flight-plan.svelte';
	import { calculationStore } from '$lib/state/calculation.svelte';
	import { formatNotamAltitudeRange } from '$lib/services/pyodide.svelte';

	const conflictNotams = $derived(calculationStore.notams.filter((n) => n.severity !== 'INFO'));
	const infoNotams = $derived(calculationStore.notams.filter((n) => n.severity === 'INFO'));
</script>

<div class="print-only space-y-6 bg-white p-6 font-sans text-xs text-slate-800">
	<!-- Document Header -->
	<div class="flex items-center justify-between border-b-2 border-sky-800 pb-3">
		<div class="flex items-center gap-3">
			<div
				class="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-900 font-bold text-white shadow-xs"
			>
				<span class="text-xl leading-none select-none">✈</span>
			</div>
			<div>
				<div class="flex items-center gap-2">
					<h1 class="text-lg font-black tracking-tight text-slate-900 uppercase">
						Operational Flight Plan & Briefing
					</h1>
					<span
						class="rounded border border-sky-300 bg-sky-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-sky-800 uppercase"
					>
						VFR NAVLOG
					</span>
				</div>
				<p class="font-mono text-[10px] text-slate-500">
					PLANENIFICATOR VFR FLIGHT BRIEFING · ICAO ANNEX 2 / SERA COMPLIANT
				</p>
			</div>
		</div>
		<div
			class="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-right font-mono text-[11px]"
		>
			<div class="text-slate-600">
				<strong class="text-slate-700">DATE:</strong>
				{new Date().toLocaleDateString()}
			</div>
			<div class="text-slate-600">
				<strong class="text-sky-800">UTC:</strong>
				<span class="font-bold text-sky-950">{new Date().toTimeString().slice(0, 8)}Z</span>
			</div>
		</div>
	</div>

	<!-- Flight Metadata Grid -->
	<div class="grid grid-cols-4 gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 font-mono text-xs shadow-2xs">
		<!-- Route Card -->
		<div class="rounded-md border border-sky-200 bg-sky-50/90 p-2.5">
			<div class="text-[10px] font-bold tracking-wider text-sky-700 uppercase">ROUTE</div>
			<div class="mt-0.5 text-sm font-black text-sky-950">
				{flightPlanStore.profile.depIcao || 'DEP'} &rarr; {flightPlanStore.profile.destIcao || 'DEST'}
			</div>
		</div>

		<!-- Alternates Card -->
		<div class="rounded-md border border-slate-200 bg-white p-2.5">
			<div class="text-[10px] font-bold tracking-wider text-slate-500 uppercase">ALTERNATES</div>
			<div class="mt-0.5 font-semibold text-slate-800">
				{flightPlanStore.profile.altIcaos.join(', ') || 'NONE'}
			</div>
		</div>

		<!-- Departure Time Card -->
		<div class="rounded-md border border-slate-200 bg-white p-2.5">
			<div class="text-[10px] font-bold tracking-wider text-slate-500 uppercase">DEPARTURE TIME</div>
			<div class="mt-0.5 font-semibold text-slate-800">
				{flightPlanStore.profile.departureTime
					? new Date(flightPlanStore.profile.departureTime).toLocaleString()
					: 'N/A'}
			</div>
		</div>

		<!-- Total Time & Dist Card -->
		<div class="rounded-md border border-emerald-200 bg-emerald-50/90 p-2.5">
			<div class="text-[10px] font-bold tracking-wider text-emerald-700 uppercase">TOTAL TIME / DIST</div>
			<div class="mt-0.5 text-sm font-black text-emerald-950">
				{calculationStore.totalFlightTimeMinutes.toFixed(1)} min / {calculationStore.totalDistanceNm.toFixed(1)} NM
			</div>
		</div>

		<!-- Performance Card -->
		<div class="rounded-md border border-slate-200 bg-white p-2.5">
			<div class="text-[10px] font-bold tracking-wider text-slate-500 uppercase">PERFORMANCE</div>
			<div class="mt-0.5 font-medium text-slate-700">
				TAS: <strong class="text-slate-900">{flightPlanStore.profile.cruiseTas} kt</strong> · Vy: <strong class="text-slate-900">{flightPlanStore.profile.climbVy} kt</strong>
			</div>
		</div>

		<!-- Vertical Speeds Card -->
		<div class="rounded-md border border-slate-200 bg-white p-2.5">
			<div class="text-[10px] font-bold tracking-wider text-slate-500 uppercase">VERTICAL SPEEDS</div>
			<div class="mt-0.5 font-medium text-slate-700">
				<span class="font-bold text-emerald-700">+{flightPlanStore.profile.climbRateFpm}</span> / <span class="font-bold text-amber-700">-{flightPlanStore.profile.descentRateFpm}</span> fpm
			</div>
		</div>

		<!-- Altitude Profile Card -->
		<div class="rounded-md border border-slate-200 bg-white p-2.5">
			<div class="text-[10px] font-bold tracking-wider text-slate-500 uppercase">ALTITUDE PROFILE</div>
			<div class="mt-0.5 font-medium text-slate-700">
				Init: <strong class="text-indigo-900">{flightPlanStore.profile.initialAlt} ft</strong> · Pat: <strong class="text-indigo-900">{flightPlanStore.profile.arrivalAlt} ft</strong>
			</div>
		</div>

		<!-- Cruise Segments Card -->
		<div class="rounded-md border border-slate-200 bg-white p-2.5">
			<div class="text-[10px] font-bold tracking-wider text-slate-500 uppercase">CRUISE SEGMENTS</div>
			<div class="mt-1 flex flex-wrap gap-1">
				{#each flightPlanStore.segments as s, i (i)}
					<span class="rounded border border-sky-200 bg-sky-100 px-1.5 py-0.2 text-[10px] font-bold text-sky-800">
						S{i + 1}: {s.cruiseAlt}ft
					</span>
				{/each}
			</div>
		</div>
	</div>

	<!-- Navigation Log Table -->
	<div class="space-y-1.5">
		<div class="flex items-center justify-between border-b-2 border-slate-800 pb-1.5">
			<h2 class="text-xs font-black tracking-wider text-slate-900 uppercase">
				Navigation Log
			</h2>
			<span class="font-mono text-[10px] font-semibold text-slate-500">
				{calculationStore.navLog.length} Legs · Navigational Waypoint Calculations
			</span>
		</div>
		<div class="overflow-hidden rounded-md border border-slate-300 shadow-2xs">
			<table class="w-full border-collapse text-left font-mono text-[11px]">
				<thead>
					<tr class="bg-slate-900 text-[10px] font-bold tracking-wider text-white uppercase">
						<th class="px-2 py-1.5 text-center">Leg</th>
						<th class="px-2 py-1.5">Waypoint</th>
						<th class="px-2 py-1.5 text-right">TC</th>
						<th class="border-x border-sky-700 bg-sky-800 px-2 py-1.5 text-right font-black text-white">TH</th>
						<th class="px-2 py-1.5 text-center">Wind</th>
						<th class="px-2 py-1.5 text-right">Alt (ft)</th>
						<th class="px-2 py-1.5 text-right">TAS</th>
						<th class="border-x border-slate-700 bg-slate-800 px-2 py-1.5 text-right font-black text-amber-300">GS</th>
						<th class="px-2 py-1.5 text-right">Dist (NM)</th>
						<th class="px-2 py-1.5 text-right">ETE</th>
						<th class="px-2 py-1.5 text-right">ETA</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-200 border-t border-slate-200">
					{#if calculationStore.navLog.length === 0}
						<tr>
							<td colspan="11" class="py-6 text-center font-sans text-slate-400 italic">
								No navigation legs calculated.
							</td>
						</tr>
					{:else}
						{#each calculationStore.navLog as leg, idx (leg.legIndex)}
							<tr class="{idx % 2 === 1 ? 'bg-slate-50/85' : 'bg-white'} transition-colors">
								<td class="px-2 py-1.5 text-center font-bold text-slate-500">{leg.legIndex}</td>
								<td class="px-2 py-1.5">
									<span class="font-sans font-bold text-slate-900">{leg.fromName}</span>
									{#if leg.notes}
										{#if leg.notes === 'Top of Climb' || leg.notes === 'TOC'}
											<span
												class="ml-1.5 inline-block rounded border border-emerald-300 bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold tracking-wide text-emerald-800 uppercase"
											>
												TOC
											</span>
										{:else if leg.notes === 'Top of Descent' || leg.notes === 'TOD'}
											<span
												class="ml-1.5 inline-block rounded border border-amber-300 bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold tracking-wide text-amber-800 uppercase"
											>
												TOD
											</span>
										{:else}
											<span
												class="ml-1.5 inline-block rounded border border-slate-300 bg-slate-100 px-1.5 py-0.2 text-[9px] font-semibold tracking-wide text-slate-700 uppercase"
											>
												{leg.notes}
											</span>
										{/if}
									{/if}
								</td>
								<td class="px-2 py-1.5 text-right tabular-nums text-slate-700">
									{Math.round(leg.trueCourseDeg)}°
								</td>
								<td class="border-x border-sky-200 bg-sky-50/90 px-2 py-1.5 text-right font-mono font-bold tabular-nums text-sky-950">
									{Math.round(leg.trueHeadingDeg)}°
								</td>
								<td class="px-2 py-1.5 text-center tabular-nums text-slate-600">
									{Math.round(leg.windDirDeg)}°/{Math.round(leg.windSpeedKt)}kt
								</td>
								<td class="px-2 py-1.5 text-right font-semibold tabular-nums text-indigo-900">
									{leg.altitudeFt}
								</td>
								<td class="px-2 py-1.5 text-right tabular-nums text-slate-700">
									{leg.tasKt}
								</td>
								<td class="border-x border-amber-100/60 bg-amber-50/50 px-2 py-1.5 text-right font-black tabular-nums text-slate-900">
									{leg.groundSpeedKt}
								</td>
								<td class="px-2 py-1.5 text-right tabular-nums text-slate-700">
									{leg.distanceNm.toFixed(1)}
								</td>
								<td class="px-2 py-1.5 text-right tabular-nums text-slate-700">
									{leg.eteMinutes.toFixed(1)}m
								</td>
								<td class="px-2 py-1.5 text-right font-bold tabular-nums text-slate-900">
									{leg.etaUtc}
								</td>
							</tr>
						{/each}
						<!-- Total En Route Row -->
						<tr class="border-t-2 border-sky-700 bg-sky-100/70 font-bold text-sky-950">
							<td class="px-2 py-2 text-center font-bold text-sky-800">Σ</td>
							<td class="px-2 py-2 font-sans font-bold tracking-wider text-sky-950 uppercase">
								Total En Route
							</td>
							<td colspan="6" class="px-2 py-2"></td>
							<td class="px-2 py-2 text-right font-black tabular-nums text-sky-950">
								{calculationStore.totalDistanceNm.toFixed(1)} NM
							</td>
							<td class="px-2 py-2 text-right font-black tabular-nums text-sky-950">
								{calculationStore.totalFlightTimeMinutes.toFixed(1)} min
							</td>
							<td class="px-2 py-2"></td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Semicircular Rule Advisories -->
	{#if calculationStore.semicircularNotices.length > 0}
		<div
			class="print-avoid-break rounded-md border border-amber-300 border-l-4 border-l-amber-500 bg-amber-50/80 p-3 shadow-2xs"
		>
			<div class="mb-1.5 flex items-center gap-2">
				<span
					class="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold leading-none text-white select-none"
				>
					!
				</span>
				<h2 class="text-xs font-bold tracking-wider text-amber-900 uppercase">
					VFR Semicircular Rule Compliance (SERA.5005)
				</h2>
			</div>
			<ul class="space-y-1 pl-7 font-mono text-xs text-amber-950">
				{#each calculationStore.semicircularNotices as notice (notice.segmentIndex)}
					<li class="list-disc leading-snug">{notice.advisoryMessage}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Operational NOTAM Briefing (Conflicts & Safety Warnings) -->
	{#if conflictNotams.length > 0}
		<div class="space-y-2">
			<div class="flex items-center justify-between border-b-2 border-rose-600 pb-1">
				<div class="flex items-center gap-2">
					<span
						class="flex h-5 w-5 items-center justify-center rounded bg-rose-600 text-xs font-bold text-white select-none"
					>
						⚠️
					</span>
					<h2 class="text-xs font-black tracking-wider text-rose-900 uppercase">
						Operational NOTAM Briefing (Route & Aerodrome Conflicts)
					</h2>
				</div>
				<span
					class="rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-800"
				>
					{conflictNotams.length} {conflictNotams.length === 1 ? 'Conflict' : 'Conflicts'} Detected
				</span>
			</div>
			<div class="space-y-2.5 font-mono text-[11px]">
				{#each conflictNotams as notam (notam.id)}
					<div
						class="print-avoid-break rounded-md border border-rose-200 border-l-4 border-l-rose-600 bg-rose-50/50 p-2.5 shadow-2xs"
					>
						<div class="flex items-center justify-between gap-2">
							<div class="flex flex-wrap items-center gap-1.5">
								<span
									class="rounded border border-rose-300 bg-rose-200/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-900"
								>
									{notam.id}
								</span>
								<span
									class="rounded border border-slate-300 bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-800"
								>
									{notam.location}
								</span>
								<span class="font-sans text-xs font-bold text-rose-950">
									{notam.purpose}
								</span>
							</div>
							{#if notam.lowerLimitFt !== undefined || notam.upperLimitFt !== undefined}
								<span
									class="shrink-0 rounded border border-sky-300 bg-sky-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-900"
								>
									{formatNotamAltitudeRange(notam.lowerLimitFt, notam.upperLimitFt)}
								</span>
							{/if}
						</div>
						{#if notam.summary}
							<div class="mt-1 font-sans text-xs font-bold text-rose-900">
								{notam.summary}
							</div>
						{/if}
						<div
							class="mt-1.5 whitespace-pre-wrap rounded border border-rose-200/70 bg-white/90 p-2 font-mono text-[10px] leading-relaxed text-slate-800"
						>
							{notam.text}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Informational NOTAMs Briefing (Separate Page) -->
	{#if infoNotams.length > 0}
		<div class="print-page-break pt-4" style="break-before: page; page-break-before: always;">
			<div class="mb-3 flex items-center justify-between border-b-2 border-sky-700 pb-2">
				<div class="flex items-center gap-2">
					<span
						class="flex h-6 w-6 items-center justify-center rounded bg-sky-800 text-xs font-bold leading-none text-white select-none"
					>
						ℹ
					</span>
					<div>
						<h2 class="text-sm font-black tracking-tight text-slate-900 uppercase">
							Informational NOTAMs Briefing
						</h2>
						<p class="font-mono text-[10px] text-slate-500">
							ROUTE CORRIDOR & AERODROMES · EN ROUTE ADVISORIES (NO DIRECT ROUTE/ALTITUDE CONFLICT)
						</p>
					</div>
				</div>
				<div class="text-right font-mono text-[10px]">
					<div class="text-slate-600">
						<strong class="text-slate-800">Route:</strong>
						<span class="font-semibold text-sky-900">
							{flightPlanStore.profile.depIcao || 'DEP'} &rarr; {flightPlanStore.profile.destIcao ||
								'DEST'}
						</span>
					</div>
					<div class="text-slate-600">
						<strong class="text-slate-800">Total Advisories:</strong>
						<span class="font-bold text-sky-900">{infoNotams.length}</span>
					</div>
				</div>
			</div>

			<div class="space-y-2.5 font-mono text-[11px]">
				{#each infoNotams as notam (notam.id)}
					<div
						class="print-avoid-break rounded-md border border-slate-200 border-l-4 border-l-sky-500 bg-slate-50/70 p-2.5 shadow-2xs"
					>
						<div class="flex items-center justify-between gap-2">
							<div class="flex flex-wrap items-center gap-1.5">
								<span
									class="rounded border border-sky-200 bg-sky-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-800"
								>
									{notam.id}
								</span>
								<span
									class="rounded border border-slate-300 bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-800"
								>
									{notam.location}
								</span>
								<span class="font-sans text-xs font-semibold text-slate-900">
									{notam.purpose}
								</span>
							</div>
							{#if notam.lowerLimitFt !== undefined || notam.upperLimitFt !== undefined}
								<span
									class="shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700"
								>
									{formatNotamAltitudeRange(notam.lowerLimitFt, notam.upperLimitFt)}
								</span>
							{/if}
						</div>
						{#if notam.summary}
							<div class="mt-1 font-sans text-xs font-medium text-slate-700">
								{notam.summary}
							</div>
						{/if}
						<div
							class="mt-1.5 whitespace-pre-wrap rounded border border-slate-200 bg-white/90 p-2 font-mono text-[10px] leading-relaxed text-slate-700"
						>
							{notam.text}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
