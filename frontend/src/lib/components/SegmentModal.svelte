<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	interface Props {
		isOpen: boolean;
		title: string;
		defaultAlt: number;
		onConfirm: (alt: number) => void;
		onCancel: () => void;
	}

	let { isOpen, title, defaultAlt, onConfirm, onCancel }: Props = $props();

	let altValue = $state<number>(5500);

	$effect(() => {
		if (isOpen) {
			altValue = defaultAlt;
		}
	});

	function handleSave() {
		if (altValue && altValue > 0) {
			onConfirm(altValue);
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleSave();
		} else if (e.key === 'Escape') {
			onCancel();
		}
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onkeydown={handleKeyDown}
	>
		<div
			class="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
		>
			<div class="flex items-center justify-between border-b border-slate-800 pb-3">
				<h3 class="flex items-center gap-2 text-lg font-semibold text-cyan-400">
					<span>✈️</span>
					<span>{title}</span>
				</h3>
				<button
					onclick={onCancel}
					class="p-1 text-xl font-bold text-slate-400 transition-colors hover:text-white"
					aria-label="Close"
				>
					✕
				</button>
			</div>

			<div class="space-y-2">
				<label for="modal-alt-input" class="block text-sm font-medium text-slate-300">
					Cruise Altitude (feet AMSL)
				</label>
				<input
					id="modal-alt-input"
					type="number"
					step="500"
					min="500"
					max="45000"
					bind:value={altValue}
					class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-lg text-white focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 focus:outline-hidden"
				/>
				<p class="text-xs text-slate-400">
					Standard VFR cruising altitudes: Odd/Even + 500 ft (e.g. 3500, 4500, 5500, 6500 ft)
				</p>
			</div>

			<div class="flex justify-end gap-3 pt-2">
				<button
					type="button"
					onclick={onCancel}
					class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={handleSave}
					class="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition-colors hover:bg-cyan-400"
				>
					Save Altitude
				</button>
			</div>
		</div>
	</div>
{/if}
