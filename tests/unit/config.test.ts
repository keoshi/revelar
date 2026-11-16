import { describe, expect, it } from 'vitest';
import { validateConfig } from '../../src/lib/config.ts';
import { ownDomain } from '../../src/engine/publish.ts';

describe('site.baseUrl', () => {
	it('is optional: a site without a domain of its own is valid', () => {
		expect(validateConfig({ site: {} }).site.baseUrl).toBe('');
		expect(validateConfig({ site: { baseUrl: '' } }).site.baseUrl).toBe('');
	});
	it('takes an absolute address', () => {
		expect(validateConfig({ site: { baseUrl: 'https://photos.ana.pt' } }).site.baseUrl).toBe(
			'https://photos.ana.pt'
		);
	});
	it('refuses an address without a scheme with a readable message', () => {
		expect(() => validateConfig({ site: { baseUrl: 'photos.ana.pt' } })).toThrow(
			'site.baseUrl must be empty or an absolute URL'
		);
	});
});

describe('ownDomain', () => {
	it('is the configured domain, or nothing for host-given addresses and the placeholder', () => {
		expect(ownDomain('https://photos.ana.pt/')).toBe('https://photos.ana.pt');
		expect(ownDomain('https://dev.keoshi.com/revelar')).toBe('https://dev.keoshi.com/revelar');
		expect(ownDomain('')).toBe('');
		expect(ownDomain('https://photos.example.com')).toBe('');
		expect(ownDomain('https://my-photos.space.fast')).toBe('');
		expect(ownDomain('https://my-photos.netlify.app')).toBe('');
	});
});
