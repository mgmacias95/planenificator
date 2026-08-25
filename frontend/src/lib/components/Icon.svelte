<script lang="ts">
	interface Props {
		name:
			| 'plane'
			| 'shield'
			| 'alert-triangle'
			| 'alert-circle'
			| 'info'
			| 'check-circle'
			| 'map-pin'
			| 'pencil'
			| 'trash'
			| 'refresh'
			| 'lock'
			| 'link'
			| 'printer'
			| 'clipboard'
			| 'chevron-down'
			| 'chevron-right'
			| 'plus'
			| 'x'
			| 'zap'
			| 'loader';
		class?: string;
		size?: number;
	}

	let { name, class: className = 'w-4 h-4', size = 16 }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
>
	{#if name === 'plane'}
		<path
			d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"
		/>
	{:else if name === 'shield'}
		<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
	{:else if name === 'alert-triangle'}
		<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
		<line x1="12" y1="9" x2="12" y2="13" />
		<line x1="12" y1="17" x2="12.01" y2="17" />
	{:else if name === 'alert-circle'}
		<circle cx="12" cy="12" r="10" />
		<line x1="12" y1="8" x2="12" y2="12" />
		<line x1="12" y1="16" x2="12.01" y2="16" />
	{:else if name === 'info'}
		<circle cx="12" cy="12" r="10" />
		<line x1="12" y1="16" x2="12" y2="12" />
		<line x1="12" y1="8" x2="12.01" y2="8" />
	{:else if name === 'check-circle'}
		<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
		<polyline points="22 4 12 14.01 9 11.01" />
	{:else if name === 'map-pin'}
		<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
		<circle cx="12" cy="10" r="3" />
	{:else if name === 'pencil'}
		<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
		<path d="m15 5 4 4" />
	{:else if name === 'trash'}
		<path d="M3 6h18" />
		<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
		<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
	{:else if name === 'refresh'}
		<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
		<path d="M21 3v5h-5" />
		<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
		<path d="M8 16H3v5" />
	{:else if name === 'lock'}
		<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
		<path d="M7 11V7a5 5 0 0 1 10 0v4" />
	{:else if name === 'link'}
		<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
		<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
	{:else if name === 'printer'}
		<polyline points="6 9 6 2 18 2 18 9" />
		<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
		<rect width="12" height="8" x="6" y="14" />
	{:else if name === 'clipboard'}
		<rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
		<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
	{:else if name === 'chevron-down'}
		<polyline points="6 9 12 15 18 9" />
	{:else if name === 'chevron-right'}
		<polyline points="9 18 15 12 9 6" />
	{:else if name === 'plus'}
		<line x1="12" y1="5" x2="12" y2="19" />
		<line x1="5" y1="12" x2="19" y2="12" />
	{:else if name === 'x'}
		<line x1="18" y1="6" x2="6" y2="18" />
		<line x1="6" y1="6" x2="18" y2="18" />
	{:else if name === 'zap'}
		<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
	{:else if name === 'loader'}
		<g class="animate-spin origin-center">
			<line x1="12" y1="2" x2="12" y2="6" />
			<line x1="12" y1="18" x2="12" y2="22" />
			<line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
			<line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
			<line x1="2" y1="12" x2="6" y2="12" />
			<line x1="18" y1="12" x2="22" y2="12" />
			<line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
			<line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
		</g>
	{/if}
</svg>
