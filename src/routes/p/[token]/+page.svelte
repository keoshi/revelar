<script lang="ts">
	import { onMount } from 'svelte';
	import PasswordGate from '#lib/components/PasswordGate.svelte';
	import PrivateAlbumPage from '#lib/components/PrivateAlbumPage.svelte';
	import {
		WrongPasswordError,
		parseHash,
		rememberKey,
		rememberedKey,
		forgetKey,
		unlockWithKey,
		unlockWithPassword,
		type UnlockedAlbum
	} from '#lib/crypto/client.ts';
	import type { PrivateAlbumEntry } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const entry = $derived({ ...data.entry, slug: '' } as PrivateAlbumEntry);

	let unlocked = $state<UnlockedAlbum | undefined>(undefined);
	let busy = $state(false);
	let error = $state<string | undefined>(undefined);
	let initialPhoto = $state<string | undefined>(undefined);
	let ready = $state(false);

	onMount(async () => {
		const { key, photo } = parseHash(location.hash);
		initialPhoto = photo;
		const candidate = key ?? rememberedKey(entry.token);
		if (candidate) {
			busy = true;
			try {
				unlocked = await unlockWithKey(entry, candidate);
				if (key) rememberKey(entry.token, key, false);
			} catch {
				forgetKey(entry.token);
				error = key ? 'This link is not valid for this album.' : undefined;
			} finally {
				busy = false;
			}
		}
		ready = true;
	});

	async function submit(password: string, remember: 'session' | 'persistent') {
		busy = true;
		error = undefined;
		try {
			const result = await unlockWithPassword(entry, password);
			rememberKey(entry.token, result.dek, remember === 'persistent');
			unlocked = result;
		} catch (e) {
			error =
				e instanceof WrongPasswordError
					? 'Wrong password. Please try again.'
					: 'Could not unlock this album.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{unlocked?.payload.title ?? data.entry.title ?? 'Private album'} · {data.site.title}</title
	>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if unlocked}
	<PrivateAlbumPage album={unlocked.payload} site={data.site} dek={unlocked.dek} {initialPhoto} />
{:else if ready}
	<PasswordGate title={data.entry.title} {busy} {error} onSubmit={submit} />
{:else}
	<div class="container loading" aria-busy="true">
		<noscript
			><p>This private album needs JavaScript to decrypt its photos in your browser.</p></noscript
		>
	</div>
{/if}

<style>
	.loading {
		min-height: 60vh;
		display: grid;
		place-items: center;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>
