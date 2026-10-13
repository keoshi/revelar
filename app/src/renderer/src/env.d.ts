/// <reference types="svelte" />
/// <reference types="vite/client" />
import type { RevelarBridge } from '../../shared/api.ts';

declare global {
	interface Window {
		revelar: RevelarBridge;
	}
}
