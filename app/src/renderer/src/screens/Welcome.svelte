<script lang="ts">
	type Props = {
		onOpen: (root: string) => Promise<boolean>;
		onCreate: (root: string) => Promise<boolean>;
	};
	let { onOpen, onCreate }: Props = $props();
	let busy = $state(false);
	let message = $state('');

	async function pick(create: boolean) {
		const root = await window.revelar.pickFolder(
			create ? 'Choose an empty folder for the new site' : 'Open a site folder'
		);
		if (!root) return;
		busy = true;
		message = '';
		try {
			const ok = await (create ? onCreate(root) : onOpen(root));
			if (!ok) message = 'That folder has no revelar.config.ts. Create a new site there instead?';
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<section class="welcome">
	<h1>Your photos, as a website.</h1>
	<p class="muted lead">
		A site is a folder: albums go in <code>photos/</code>, Revelar turns them into a fast, static
		gallery you can publish anywhere. No account, no server.
	</p>
	<div class="actions">
		<button type="button" class="primary" disabled={busy} onclick={() => pick(true)}
			>Create a new site…</button
		>
		<button type="button" disabled={busy} onclick={() => pick(false)}>Open a site folder…</button>
	</div>
	{#if message}<p class="error">{message}</p>{/if}
</section>

<style>
	.welcome {
		max-width: 520px;
		margin: 15vh auto 0;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	h1 {
		font-size: 30px;
	}
	.lead {
		font-size: 15px;
	}
	.actions {
		display: flex;
		gap: 10px;
	}
	code {
		background: var(--surface-2);
		padding: 1px 5px;
		border-radius: 4px;
	}
</style>
