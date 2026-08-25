<script lang="ts">
	import { getLocale, setLocale } from '$lib/paraglide/runtime';
	import Icon from './Icon.svelte';

	let currentLocale = $derived(getLocale());

	function toggleLanguage() {
		const nextLocale = currentLocale === 'en' ? 'es' : 'en';
		setLocale(nextLocale);
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('preferred_locale', nextLocale);
		}
	}
</script>

<button
	type="button"
	onclick={toggleLanguage}
	class="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-cyan-300 shadow-xs transition-colors hover:bg-slate-700 hover:text-white"
	title="Switch Language (English / Spanish)"
>
	<Icon name="globe" class="h-3.5 w-3.5 text-cyan-400" />
	<span class="font-mono tracking-wider uppercase">{currentLocale}</span>
</button>
