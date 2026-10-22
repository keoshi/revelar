import { contextBridge, ipcRenderer } from 'electron';
import type { AppCommand, EngineEvent, RevelarBridge, Settings } from '../shared/api.ts';

/**
 * ipcRenderer.invoke wraps every failure as "Error invoking remote method 'x': Error: …"; the
 * screens show error messages as they are, so only the part after that wrapper comes through.
 */
const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
	ipcRenderer.invoke(channel, ...args).catch((e: unknown) => {
		const message = e instanceof Error ? e.message : String(e);
		throw new Error(message.replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, ''));
	});

const bridge: RevelarBridge = {
	platform: process.platform,
	call: (method, params) => invoke('engine', method, params),
	on: (fn) => {
		const listener = (_e: Electron.IpcRendererEvent, event: EngineEvent) => fn(event);
		ipcRenderer.on('engine:event', listener);
		return () => ipcRenderer.removeListener('engine:event', listener);
	},
	pickFolder: (title) => invoke('dialog.pickFolder', title),
	setRoot: (root) => invoke('site.setRoot', root),
	showBuild: () => invoke('site.showBuild'),
	saveZip: () => invoke('site.saveZip'),
	settings: {
		get: () => invoke<Settings>('settings.get'),
		set: (patch) => invoke<Settings>('settings.set', patch)
	},
	secrets: {
		get: (name) => invoke('secrets.get', name),
		set: (name, value) => invoke('secrets.set', name, value)
	},
	openExternal: (url) => invoke('shell.openExternal', url),
	onCommand: (fn) => {
		const listener = (_e: Electron.IpcRendererEvent, command: AppCommand) => fn(command);
		ipcRenderer.on('app:command', listener);
		return () => ipcRenderer.removeListener('app:command', listener);
	}
};

contextBridge.exposeInMainWorld('revelar', bridge);
