<script lang="ts">
	import '../app.postcss';
	import { AppShell, AppBar } from '@skeletonlabs/skeleton';
	import { LightSwitch } from '@skeletonlabs/skeleton';
	import { computePosition, autoUpdate, offset, shift, flip, arrow } from '@floating-ui/dom';
	import { storePopup } from '@skeletonlabs/skeleton';
	storePopup.set({ computePosition, autoUpdate, offset, shift, flip, arrow });

	import { onMount } from 'svelte';
	import { autoModeWatcher } from '@skeletonlabs/skeleton';
    import { goto } from '$app/navigation';
    import { base } from '$app/paths';


	onMount(() => {										
		autoModeWatcher();
	});
</script>


<!-- App Shell -->
<AppShell>
	<svelte:fragment slot="header">
		<!-- App Bar -->
		<AppBar class="h-50px">
			<svelte:fragment slot="lead">
				<span class="h2 bg-gradient-to-br from-blue-500 to-cyan-300 bg-clip-text text-transparent box-decoration-clone">doc2plan</span>
			</svelte:fragment>
			<svelte:fragment slot="default">
				<div class="flex items-center space-x-4">
					<button class="btn variant-soft" on:click={() => goto(`${base}/creator`)}>
						Creator
					</button>
					<button class="btn variant-soft" on:click={() => goto(`${base}/viewer`)}>
						Viewer
					</button>
					<button class="btn variant-soft" on:click={() => goto(`${base}/settings`)}>
						Settings
					</button>
				</div>
			</svelte:fragment>
			<svelte:fragment slot="trail">
				<LightSwitch />
			</svelte:fragment>
		</AppBar>
	</svelte:fragment>

	<!-- Page Route Content -->
	<slot />
</AppShell>