// See https://svelte.dev/docs/kit/types#app.d.ts
/// <reference types="vite/client" />
declare global {
	namespace App {
		interface PageState {
			/** id of the photo currently open in the fullscreen viewer (shallow routing) */
			photo?: string;
			/** whether the viewer was opened from this document (so Back closes it) */
			viewerPushed?: boolean;
		}
	}
}

export {};
