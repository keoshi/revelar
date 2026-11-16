/**
 * Whether a config address is not a domain of the owner's: empty, the old placeholder, or an
 * address a host hands out (which earlier versions wrote into the config when publishing).
 * Mirrors `isManagedUrl` in the engine's publish.ts.
 */
export function isHostAddress(url: string): boolean {
	if (!url) return true;
	try {
		const host = new URL(url).hostname;
		return (
			host === 'photos.example.com' ||
			/\.(netlify\.app|vercel\.app|pages\.dev|github\.io|space\.fast|view\.fast)$/.test(host)
		);
	} catch {
		return true;
	}
}
