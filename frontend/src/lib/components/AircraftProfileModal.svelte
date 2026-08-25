<script lang="ts">
	import Icon from './Icon.svelte';
	import type { AircraftPerformanceProfile } from '$lib/types/flight';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		isOpen: boolean;
		mode: 'create' | 'edit';
		initialData?: Partial<AircraftPerformanceProfile>;
		onSave: (data: {
			id?: string;
			name: string;
			cruiseTas: number;
			climbVy: number;
			climbRateFpm: number;
			descentRateFpm: number;
		}) => void;
		onCancel: () => void;
	}

	let { isOpen, mode, initialData = {}, onSave, onCancel }: Props = $props();

	let profileName = $state<string>('');
	let errorMessage = $state<string>('');

	$effect(() => {
		if (isOpen) {
			profileName = initialData.name || '';
			errorMessage = '';
		}
	});

	function handleSubmit(e?: Event) {
		if (e) e.preventDefault();
		const trimmedName = profileName.trim();
		if (!trimmedName) {
			errorMessage = 'Please enter a profile name.';
			return;
		}

		onSave({
			id: initialData.id,
			name: trimmedName,
			cruiseTas: initialData.cruiseTas ?? 100,
			climbVy: initialData.climbVy ?? 70,
			climbRateFpm: initialData.climbRateFpm ?? 700,
			descentRateFpm: initialData.descentRateFpm ?? 500
		});
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
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
			class="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-slate-800 pb-3">
				<h3 class="flex items-center gap-2 text-sm font-bold text-cyan-400">
					<Icon name="plane" class="h-4 w-4 text-cyan-400" />
					<span>
						{mode === 'create'
							? m.profile_add_title
								? m.profile_add_title()
								: 'New Aircraft Profile'
							: m.profile_edit_title
								? m.profile_edit_title()
								: 'Edit Aircraft Profile'}
					</span>
				</h3>
				<button
					type="button"
					onclick={onCancel}
					class="p-1 text-slate-400 transition-colors hover:text-white"
					aria-label="Close"
				>
					<Icon name="x" class="h-4 w-4" />
				</button>
			</div>

			<form onsubmit={handleSubmit} class="space-y-4">
				{#if errorMessage}
					<div class="rounded-md border border-rose-800/60 bg-rose-950/50 p-2 text-xs text-rose-300">
						{errorMessage}
					</div>
				{/if}

				<!-- Profile / Aircraft Name -->
				<div>
					<label for="aircraft-profile-name" class="mb-1 block text-xs font-medium text-slate-300">
						{m.profile_name_label ? m.profile_name_label() : 'Aircraft / Profile Name'}
					</label>
					<input
						id="aircraft-profile-name"
						type="text"
						placeholder={m.profile_name_placeholder
							? m.profile_name_placeholder()
							: 'e.g. Tecnam P2002 Sierra (EC-XYZ)'}
						bind:value={profileName}
						class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-cyan-400 focus:outline-hidden"
					/>
				</div>

				<!-- Actions -->
				<div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
					<button
						type="button"
						onclick={onCancel}
						class="cursor-pointer rounded-md bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
					>
						Cancel
					</button>
					<button
						type="submit"
						class="cursor-pointer rounded-md bg-cyan-500 px-4 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-cyan-400"
					>
						{m.profile_save_btn ? m.profile_save_btn() : 'Save Profile'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
