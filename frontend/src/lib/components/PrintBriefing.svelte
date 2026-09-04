<script lang="ts">
	import { flightPlanStore } from '$lib/state/flight-plan.svelte';
	import { calculationStore } from '$lib/state/calculation.svelte';
</script>

<div class="print-only space-y-6 bg-white p-8 font-sans text-xs text-black">
	<!-- Document Header -->
	<div class="flex items-center justify-between border-b-2 border-black pb-4">
		<div>
			<h1 class="text-xl font-bold tracking-tight uppercase">Operational Flight Plan & Briefing</h1>
			<p class="font-mono text-xs text-gray-600">
				PLANENIFICATOR VFR FLIGHT BRIEFING · ICAO ANNEX 2 / SERA COMPLIANT
			</p>
		</div>
		<div class="text-right font-mono text-xs">
			<div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
			<div><strong>UTC:</strong> {new Date().toTimeString().slice(0, 8)}Z</div>
		</div>
	</div>

	<!-- Flight Metadata Grid -->
	<div
		class="grid grid-cols-4 gap-4 rounded-sm border border-black bg-gray-50 p-4 font-mono text-xs"
	>
		<div>
			<div class="font-bold text-gray-500">ROUTE</div>
			<div class="text-sm font-bold">
				{flightPlanStore.profile.depIcao || 'DEP'} &rarr; {flightPlanStore.profile.destIcao || 'DEST'}
			</div>
		</div>

		<div>
			<div class="font-bold text-gray-500">ALTERNATES</div>
			<div>{flightPlanStore.profile.altIcaos.join(', ') || 'NONE'}</div>
		</div>

		<div>
			<div class="font-bold text-gray-500">DEPARTURE TIME</div>
			<div>
				{flightPlanStore.profile.departureTime
					? new Date(flightPlanStore.profile.departureTime).toLocaleString()
					: 'N/A'}
			</div>
		</div>

		<div>
			<div class="font-bold text-gray-500">TOTAL TIME / DIST</div>
			<div class="font-bold">
				{calculationStore.totalFlightTimeMinutes.toFixed(1)} min / {calculationStore.totalDistanceNm.toFixed(
					1
				)} NM
			</div>
		</div>

		<div>
			<div class="font-bold text-gray-500">PERFORMANCE</div>
			<div>
				TAS: {flightPlanStore.profile.cruiseTas} kt · Vy: {flightPlanStore.profile.climbVy} kt
			</div>
		</div>

		<div>
			<div class="font-bold text-gray-500">VERTICAL SPEEDS</div>
			<div>
				+{flightPlanStore.profile.climbRateFpm} / -{flightPlanStore.profile.descentRateFpm} fpm
			</div>
		</div>

		<div>
			<div class="font-bold text-gray-500">ALTITUDE PROFILE</div>
			<div>
				Initial: {flightPlanStore.profile.initialAlt} ft · Pattern: {flightPlanStore.profile
					.arrivalAlt} ft
			</div>
		</div>

		<div>
			<div class="font-bold text-gray-500">CRUISE SEGMENTS</div>
			<div>{flightPlanStore.segments.map((s, i) => `S${i + 1}:${s.cruiseAlt}ft`).join(', ')}</div>
		</div>
	</div>

	<!-- Navigation Log Table -->
	<div>
		<h2 class="mb-2 border-b border-black pb-1 text-sm font-bold tracking-wider uppercase">
			Navigation Log
		</h2>
		<table class="w-full border-collapse text-left font-mono text-[11px]">
			<thead>
				<tr class="border-b-2 border-black bg-gray-100">
					<th class="px-2 py-1">Leg</th>
					<th class="px-2 py-1">Waypoint</th>
					<th class="px-2 py-1">TC</th>
					<th class="px-2 py-1">TH</th>
					<th class="px-2 py-1">Wind</th>
					<th class="px-2 py-1">Alt (ft)</th>
					<th class="px-2 py-1">TAS</th>
					<th class="px-2 py-1">GS</th>
					<th class="px-2 py-1">Dist (NM)</th>
					<th class="px-2 py-1">ETE</th>
					<th class="px-2 py-1">ETA</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-300">
				{#each calculationStore.navLog as leg}
					<tr>
						<td class="px-2 py-1 font-bold">{leg.legIndex}</td>
						<td class="px-2 py-1">{leg.fromName}</td>
						<td class="px-2 py-1">{Math.round(leg.trueCourseDeg)}°</td>
						<td class="px-2 py-1 font-bold">{Math.round(leg.trueHeadingDeg)}°</td>
						<td class="px-2 py-1">{Math.round(leg.windDirDeg)}°/{Math.round(leg.windSpeedKt)}kt</td>
						<td class="px-2 py-1">{leg.altitudeFt}</td>
						<td class="px-2 py-1">{leg.tasKt}</td>
						<td class="px-2 py-1 font-bold">{leg.groundSpeedKt}</td>
						<td class="px-2 py-1">{leg.distanceNm.toFixed(1)}</td>
						<td class="px-2 py-1">{leg.eteMinutes.toFixed(1)}m</td>
						<td class="px-2 py-1 font-bold">{leg.etaUtc}</td>
					</tr>
				{/each}
				<tr class="border-t-2 border-black bg-gray-100 font-bold">
					<td class="px-2 py-1.5">Σ</td>
					<td class="px-2 py-1.5 uppercase">Total En Route</td>
					<td colspan="6" class="px-2 py-1.5"></td>
					<td class="px-2 py-1.5">{calculationStore.totalDistanceNm.toFixed(1)} NM</td>
					<td class="px-2 py-1.5">{calculationStore.totalFlightTimeMinutes.toFixed(1)} min</td>
					<td class="px-2 py-1.5"></td>
				</tr>
			</tbody>
		</table>
	</div>

	<!-- Semicircular Rule Advisories -->
	{#if calculationStore.semicircularNotices.length > 0}
		<div>
			<h2
				class="mb-2 border-b border-black pb-1 text-sm font-bold tracking-wider text-amber-700 uppercase"
			>
				VFR Semicircular Rule Compliance
			</h2>
			<ul class="list-disc space-y-1 pl-5 font-mono text-xs">
				{#each calculationStore.semicircularNotices as notice}
					<li>{notice.advisoryMessage}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Active NOTAM Briefing -->
	{#if calculationStore.notams.length > 0}
		<div>
			<h2 class="mb-2 border-b border-black pb-1 text-sm font-bold tracking-wider uppercase">
				Operational NOTAM Briefing (2km Safety Corridor)
			</h2>
			<div class="space-y-3 font-mono text-[11px]">
				{#each calculationStore.notams as notam}
					<div class="rounded-sm border border-gray-400 bg-gray-50 p-2">
						<div class="font-bold">[{notam.id}] {notam.location} · {notam.purpose}</div>
						<div class="mt-1">{notam.text}</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
