import { mount } from 'svelte';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './app.css';
import App from './App.svelte';

document.documentElement.dataset.platform = window.revelar.platform;

export default mount(App, { target: document.getElementById('app')! });
