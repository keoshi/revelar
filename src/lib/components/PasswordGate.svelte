<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';

	type Props = {
		title?: string;
		busy: boolean;
		error?: string;
		onSubmit: (password: string, remember: 'session' | 'persistent') => void;
	};

	let { title, busy, error, onSubmit }: Props = $props();
	let password = $state('');
	let persistent = $state(false);
	let dialog: HTMLElement | undefined = $state();
	let input: HTMLInputElement | undefined = $state();

	onMount(() => input?.focus());

	/** Keep Tab within the dialog while it is the only thing on the page. */
	function trap(e: KeyboardEvent) {
		if (e.key !== 'Tab' || !dialog) return;
		const focusable = Array.from(
			dialog.querySelectorAll<HTMLElement>('input, button, a[href]')
		).filter((el) => !el.hasAttribute('disabled'));
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
</script>

<div
	class="gate"
	role="dialog"
	aria-modal="true"
	aria-labelledby="gate-title"
	tabindex="-1"
	bind:this={dialog}
	onkeydown={trap}
>
	<form
		class="card"
		onsubmit={(e) => {
			e.preventDefault();
			onSubmit(password, persistent ? 'persistent' : 'session');
		}}
	>
		<div class="lock"><Icon name="lock" size={22} /></div>
		<h1 id="gate-title">{title ?? 'Private album'}</h1>
		<p class="hint">Enter the password to view this album. Photos are decrypted in your browser.</p>
		<label class="field">
			<span>Password</span>
			<input
				bind:this={input}
				bind:value={password}
				type="password"
				name="password"
				autocomplete="current-password"
				required
				disabled={busy}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? 'gate-error' : undefined}
			/>
		</label>
		{#if error}
			<p class="error" id="gate-error" role="alert">{error}</p>
		{/if}
		<label class="remember">
			<input type="checkbox" bind:checked={persistent} disabled={busy} />
			<span>Remember on this device</span>
		</label>
		<button type="submit" class="submit" disabled={busy || !password}
			>{busy ? 'Unlocking…' : 'Unlock'}</button
		>
	</form>
</div>

<style>
	.gate {
		display: grid;
		place-items: center;
		min-height: 60vh;
		padding: 24px;
	}

	.card {
		width: min(400px, 100%);
		padding: 32px 28px;
		border-radius: var(--radius);
		background: var(--surface);
		border: 1px solid var(--hairline);
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.lock {
		color: var(--text-muted);
	}

	h1 {
		font-family: var(--font-titles);
		font-size: var(--text-xl);
		font-weight: 500;
	}

	.hint {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: var(--text-sm);
	}

	.field input {
		font: inherit;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		padding: 10px 12px;
	}

	.field input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.error {
		color: #e5484d;
		font-size: var(--text-sm);
	}

	.remember {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.submit {
		margin-top: 6px;
		padding: 10px 14px;
		border-radius: var(--radius);
		background: var(--text);
		color: var(--bg);
		font-weight: 600;
		font-size: var(--text-sm);
	}

	.submit:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
