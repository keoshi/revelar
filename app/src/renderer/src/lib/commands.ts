/**
 * Keyboard shortcuts come in from the application menu (see buildMenu in the main process);
 * screens register what each command does while they are on screen. The labels here feed
 * tooltips and menu hints so the shortcuts are discoverable.
 */
import type { AppCommand } from '../../../shared/api.ts';

const handlers = new Map<AppCommand, () => void>();

export function onCommand(command: AppCommand, fn: () => void): () => void {
	handlers.set(command, fn);
	return () => {
		if (handlers.get(command) === fn) handlers.delete(command);
	};
}

export function runCommand(command: AppCommand): void {
	handlers.get(command)?.();
}

const mac = navigator.platform.startsWith('Mac');
/** "⌘N" on a Mac, "Ctrl+N" elsewhere. */
export const key = (k: string): string => (mac ? `⌘${k}` : `Ctrl+${k}`);
export const KEYS: Record<AppCommand, string> = {
	new: key('N'),
	open: key('O'),
	save: key('S'),
	settings: key(','),
	library: key('1'),
	preview: key('2'),
	publish: key('3')
};
