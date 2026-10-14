import { contextBridge, ipcRenderer } from 'electron';
import type { AppCommand, EngineEvent, RevelarBridge, Settings } from '../shared/api.ts';

const bridge: RevelarBridge = {
	call: (method, params) => ipcRenderer.invoke('engine', method, params),
	on: (fn) => {
		const listener = (_e: Electron.IpcRendererEvent, event: EngineEvent) => fn(event);
		ipcRenderer.on('engine:event', listener);
		return () => ipcRenderer.removeListener('engine:event', listener);
	},
	pickFolder: (title) => ipcRenderer.invoke('dialog.pickFolder', title),
	setRoot: (root) => ipcRenderer.invoke('site.setRoot', root),
	settings: {
		get: () => ipcRenderer.invoke('settings.get') as Promise<Settings>,
		set: (patch) => ipcRenderer.invoke('settings.set', patch) as Promise<Settings>
	},
	secrets: {
		get: (name) => ipcRenderer.invoke('secrets.get', name),
		set: (name, value) => ipcRenderer.invoke('secrets.set', name, value)
	},
	openExternal: (url) => ipcRenderer.invoke('shell.openExternal', url),
	onCommand: (fn) => {
		const listener = (_e: Electron.IpcRendererEvent, command: AppCommand) => fn(command);
		ipcRenderer.on('app:command', listener);
		return () => ipcRenderer.removeListener('app:command', listener);
	}
};

contextBridge.exposeInMainWorld('revelar', bridge);
