/**
 * Forms save themselves: a change schedules a write a moment later, leaving a screen flushes
 * it at once, and nothing is lost by navigating away. Screens show `status` beside the title.
 */
export function autosave(save: () => Promise<void>, delay = 700) {
	const st = $state({ status: '' as '' | 'saving' | 'saved' });
	let timer: ReturnType<typeof setTimeout> | undefined;
	let hide: ReturnType<typeof setTimeout> | undefined;
	let chain: Promise<void> = Promise.resolve();

	const flush = (): Promise<void> => {
		if (timer) clearTimeout(timer);
		timer = undefined;
		st.status = 'saving';
		if (hide) clearTimeout(hide);
		// writes queue up, so a fast edit never overtakes a slower earlier one
		chain = chain.then(save).then(
			() => {
				st.status = 'saved';
				hide = setTimeout(() => (st.status = ''), 1800);
			},
			() => {
				st.status = '';
			}
		);
		return chain;
	};
	return {
		get status() {
			return st.status;
		},
		/** call after every change */
		touch() {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => void flush(), delay);
		},
		/** save now (⌘S, leaving the screen, before processing) */
		flush,
		get pending() {
			return timer !== undefined;
		}
	};
}
