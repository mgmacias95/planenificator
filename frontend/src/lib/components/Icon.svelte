<script lang="ts">
	import {
		Plane,
		Shield,
		TriangleAlert,
		CircleAlert,
		Info,
		CircleCheck,
		Check,
		MapPin,
		Pencil,
		Trash2,
		RotateCw,
		Lock,
		Link,
		Printer,
		Clipboard,
		ChevronDown,
<<<<<<< HEAD
		ChevronUp,
=======
>>>>>>> 0577d7b (feat: Implement Svelte Frontend (#16))
		ChevronRight,
		Plus,
		X,
		Zap,
		Loader2,
		Globe,
		Cloud,
<<<<<<< HEAD
		Compass,
		Route,
		Layers3,
		FolderOpen,
		PanelLeftClose,
		PanelLeftOpen,
		Scan,
		Gauge,
		Play,
		Pause,
		Wind
=======
		Compass
>>>>>>> 0577d7b (feat: Implement Svelte Frontend (#16))
	} from '@lucide/svelte';

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
<<<<<<< HEAD
			| 'chevron-up'
=======
>>>>>>> 0577d7b (feat: Implement Svelte Frontend (#16))
			| 'chevron-right'
			| 'plus'
			| 'x'
			| 'zap'
			| 'loader'
			| 'check'
			| 'globe'
			| 'cloud'
<<<<<<< HEAD
			| 'compass'
			| 'route'
			| 'layers'
			| 'folder-open'
			| 'panel-close'
			| 'panel-open'
			| 'scan'
			| 'gauge'
			| 'play'
			| 'pause'
			| 'wind';
=======
			| 'compass';
>>>>>>> 0577d7b (feat: Implement Svelte Frontend (#16))
		class?: string;
		size?: number;
	}

	let { name, class: className = 'w-4 h-4', size = 16 }: Props = $props();
</script>

{#if name === 'plane'}
	<Plane class={className} {size} />
{:else if name === 'shield'}
	<Shield class={className} {size} />
{:else if name === 'alert-triangle'}
	<TriangleAlert class={className} {size} />
{:else if name === 'alert-circle'}
	<CircleAlert class={className} {size} />
{:else if name === 'info'}
	<Info class={className} {size} />
{:else if name === 'check-circle'}
	<CircleCheck class={className} {size} />
{:else if name === 'check'}
	<Check class={className} {size} />
{:else if name === 'map-pin'}
	<MapPin class={className} {size} />
{:else if name === 'pencil'}
	<Pencil class={className} {size} />
{:else if name === 'trash'}
	<Trash2 class={className} {size} />
{:else if name === 'refresh'}
	<RotateCw class={className} {size} />
{:else if name === 'lock'}
	<Lock class={className} {size} />
{:else if name === 'link'}
	<Link class={className} {size} />
{:else if name === 'printer'}
	<Printer class={className} {size} />
{:else if name === 'clipboard'}
	<Clipboard class={className} {size} />
{:else if name === 'chevron-down'}
	<ChevronDown class={className} {size} />
<<<<<<< HEAD
{:else if name === 'chevron-up'}
	<ChevronUp class={className} {size} />
=======
>>>>>>> 0577d7b (feat: Implement Svelte Frontend (#16))
{:else if name === 'chevron-right'}
	<ChevronRight class={className} {size} />
{:else if name === 'plus'}
	<Plus class={className} {size} />
{:else if name === 'x'}
	<X class={className} {size} />
{:else if name === 'zap'}
	<Zap class={className} {size} />
{:else if name === 'loader'}
	<Loader2 class="{className} animate-spin" {size} />
{:else if name === 'globe'}
	<Globe class={className} {size} />
{:else if name === 'cloud'}
	<Cloud class={className} {size} />
{:else if name === 'compass'}
	<Compass class={className} {size} />
<<<<<<< HEAD
{:else if name === 'route'}
	<Route class={className} {size} />
{:else if name === 'layers'}
	<Layers3 class={className} {size} />
{:else if name === 'folder-open'}
	<FolderOpen class={className} {size} />
{:else if name === 'panel-close'}
	<PanelLeftClose class={className} {size} />
{:else if name === 'panel-open'}
	<PanelLeftOpen class={className} {size} />
{:else if name === 'scan'}
	<Scan class={className} {size} />
{:else if name === 'gauge'}
	<Gauge class={className} {size} />
{:else if name === 'play'}
	<Play class={className} {size} />
{:else if name === 'pause'}
	<Pause class={className} {size} />
{:else if name === 'wind'}
	<Wind class={className} {size} />
=======
>>>>>>> 0577d7b (feat: Implement Svelte Frontend (#16))
{/if}
