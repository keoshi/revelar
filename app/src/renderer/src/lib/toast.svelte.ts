/** A short confirmation pill at the bottom of the window ("Saved"); never used for errors. */
export const toastState = $state({ text: '', on: false });
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string): void {
	toastState.text = text;
	toastState.on = true;
	if (timer) clearTimeout(timer);
	timer = setTimeout(() => (toastState.on = false), 1600);
}
