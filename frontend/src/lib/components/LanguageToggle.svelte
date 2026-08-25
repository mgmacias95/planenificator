<script lang="ts">
	import { getLocale, setLocale, locales } from '$lib/paraglide/runtime';

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
	class="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-cyan-300 shadow-xs transition-colors hover:bg-slate-700"
	title="Switch Language (English / Spanish)"
>
	<span class="text-sm">{currentLocale === 'en' ? '🇬🇧' : '🇪🇸'}</span>
	<span class="tracking-wider uppercase">{currentLocale}</span>
</button>
