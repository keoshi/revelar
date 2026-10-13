/**
 * Generates the fixture photo set used by the unit and e2e tests. Everything is
 * synthesised with sharp so no binary files live in the repo. Deterministic.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type Sharp } from 'sharp';

function iptcDataset(record: number, dataset: number, str: string): Buffer {
	const data = Buffer.from(str, 'utf8');
	const h = Buffer.alloc(5);
	h[0] = 0x1c;
	h[1] = record;
	h[2] = dataset;
	h.writeUInt16BE(data.length, 3);
	return Buffer.concat([h, data]);
}

/** Build a Photoshop APP13 segment carrying IPTC IIM datasets. */
function app13(datasets: Buffer[]): Buffer {
	const iptc = Buffer.concat([iptcDataset(1, 90, '\x1b%G'), ...datasets]);
	const res = Buffer.concat([
		Buffer.from('8BIM'),
		Buffer.from([0x04, 0x04]),
		Buffer.from([0, 0]),
		Buffer.alloc(4)
	]);
	res.writeUInt32BE(iptc.length, res.length - 4);
	let body = Buffer.concat([Buffer.from('Photoshop 3.0\0'), res, iptc]);
	if (body.length % 2) body = Buffer.concat([body, Buffer.alloc(1)]);
	const seg = Buffer.alloc(4);
	seg[0] = 0xff;
	seg[1] = 0xed;
	seg.writeUInt16BE(body.length + 2, 2);
	return Buffer.concat([seg, body]);
}

function injectApp13(jpeg: Buffer, seg: Buffer): Buffer {
	let pos = 2;
	while (jpeg[pos] === 0xff && (jpeg[pos + 1] === 0xe0 || jpeg[pos + 1] === 0xe1)) {
		pos += 2 + jpeg.readUInt16BE(pos + 2);
	}
	return Buffer.concat([jpeg.subarray(0, pos), seg, jpeg.subarray(pos)]);
}

function xmpPacket(fields: {
	title?: string;
	description?: string;
	alt?: string;
	subjects?: string[];
	dateCreated?: string;
}): string {
	const alt = (tag: string, v?: string) =>
		v ? `<${tag}><rdf:Alt><rdf:li xml:lang="x-default">${v}</rdf:li></rdf:Alt></${tag}>` : '';
	const bag = fields.subjects?.length
		? `<dc:subject><rdf:Bag>${fields.subjects.map((s) => `<rdf:li>${s}</rdf:li>`).join('')}</rdf:Bag></dc:subject>`
		: '';
	return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/">${alt('dc:title', fields.title)}${alt('dc:description', fields.description)}${alt('Iptc4xmpCore:AltTextAccessibility', fields.alt)}${bag}${fields.dateCreated ? `<photoshop:DateCreated>${fields.dateCreated}</photoshop:DateCreated>` : ''}</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}

/** A deterministic gradient image so every fixture looks different. */
function gradient(width: number, height: number, seed: number): Sharp {
	const data = Buffer.alloc(width * height * 3);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 3;
			data[i] = (x / width) * 255 * ((seed % 3) + 1) * 0.33;
			data[i + 1] = (y / height) * 255 * (((seed + 1) % 3) + 1) * 0.33;
			data[i + 2] = (((x + y) / (width + height)) * 255 + seed * 40) % 256;
		}
	}
	return sharp(data, { raw: { width, height, channels: 3 } });
}

const CAMERA = {
	IFD0: { Make: 'SONY', Model: 'ILCE-7M4', Copyright: '© Fixture' },
	IFD2: {
		DateTimeOriginal: '2025:03:14 07:12:00',
		FNumber: '28/10',
		ExposureTime: '1/250',
		ISOSpeedRatings: '400',
		FocalLength: '35/1',
		ExposureBiasValue: '-3/10',
		LensModel: 'FE 35mm F1.8'
	}
};

export type FixtureSet = { albumDir: string; files: string[] };

export type FixtureOptions = { extras?: boolean };

export async function generateFixtures(
	root: string,
	opts: FixtureOptions = {}
): Promise<FixtureSet> {
	const albumDir = join(root, '2025-03-14-lisbon-walks');
	mkdirSync(albumDir, { recursive: true });
	const files: string[] = [];
	const write = (name: string, buf: Buffer) => {
		writeFileSync(join(albumDir, name), buf);
		files.push(name);
	};

	// 1. Landscape JPEG with full EXIF + XMP (title/caption/alt/keywords/date) — the "Lightroom export"
	write(
		'landscape.jpg',
		await gradient(1600, 1067, 1)
			.jpeg({ quality: 90 })
			.withExif(CAMERA)
			.withXmp(
				xmpPacket({
					title: 'Tram 28 at dawn',
					description: 'The first tram, before the tourists.',
					alt: 'Yellow tram climbing a narrow cobbled street at sunrise',
					subjects: ['lisbon', 'tram'],
					dateCreated: '2025-03-14T07:12:00+00:00'
				})
			)
			.toBuffer()
	);

	// 2. Portrait JPEG with EXIF date only
	write(
		'portrait.jpg',
		await gradient(900, 1350, 2)
			.jpeg({ quality: 90 })
			.withExif({
				IFD0: { Make: 'FUJIFILM', Model: 'X-T5' },
				IFD2: {
					DateTimeOriginal: '2025:03:15 18:40:00',
					FNumber: '2/1',
					ExposureTime: '1/60',
					ISOSpeedRatings: '800',
					FocalLength: '23/1'
				}
			})
			.toBuffer()
	);

	// 3. Landscape pixels stored with EXIF orientation 6 (should display as portrait after rotation)
	write(
		'rotated.jpg',
		await gradient(1200, 800, 3)
			.jpeg({ quality: 90 })
			.withExifMerge({ IFD2: { DateTimeOriginal: '2025:03:13 09:00:00' } })
			.withMetadata({ orientation: 6 })
			.toBuffer()
	);

	// 4. PNG with no metadata at all
	write('plain.png', await gradient(800, 600, 4).png().toBuffer());

	// 5. IPTC-captioned JPEG (no XMP): ObjectName, Caption-Abstract, Keywords, DateCreated
	const iptcBase = await gradient(1400, 933, 5)
		.jpeg({ quality: 88 })
		.withExif({ IFD0: { Make: 'Canon', Model: 'Canon EOS R5' } })
		.toBuffer();
	write(
		'iptc.jpg',
		injectApp13(
			iptcBase,
			app13([
				iptcDataset(2, 5, 'Miradouro'),
				iptcDataset(2, 120, 'Looking over Alfama from Graça.'),
				iptcDataset(2, 25, 'alfama'),
				iptcDataset(2, 25, 'viewpoint'),
				iptcDataset(2, 55, '20250316'),
				iptcDataset(2, 60, '101500+0000')
			])
		)
	);

	// 6. GPS-tagged JPEG
	write(
		'gps.jpg',
		await gradient(1500, 1000, 6)
			.jpeg({ quality: 90 })
			.withExif({
				IFD0: { Make: 'Apple', Model: 'iPhone 15 Pro', ImageDescription: 'EXIF description only' },
				IFD2: {
					DateTimeOriginal: '2025:03:17 12:00:00',
					FNumber: '178/100',
					ExposureTime: '1/1000',
					ISOSpeedRatings: '64',
					FocalLength: '69/10'
				},
				IFD3: {
					GPSLatitudeRef: 'N',
					GPSLatitude: '38/1 42/1 5000/100',
					GPSLongitudeRef: 'W',
					GPSLongitude: '9/1 8/1 1000/100'
				}
			})
			.toBuffer()
	);

	// 7. Photo whose metadata the sidecar overrides
	write(
		'override.jpg',
		await gradient(1000, 1000, 7)
			.jpeg({ quality: 90 })
			.withXmp(
				xmpPacket({
					title: 'Embedded title',
					description: 'Embedded caption',
					dateCreated: '2025-03-18'
				})
			)
			.toBuffer()
	);

	writeFileSync(
		join(albumDir, 'album.yaml'),
		`title: Lisbon walks
description: |
  Early mornings in **Alfama** and Graça.
cover: portrait.jpg
sort: date-asc
photos:
  override.jpg:
    title: Sidecar title
    caption: Sidecar caption wins.
    alt: Sidecar alt text
    location: hide
  plain.png:
    hidden: false
`
	);

	// A second, minimal album with the folder date prefix only (year) and no sidecar
	const second = join(root, '2024-iceland');
	mkdirSync(second, { recursive: true });
	writeFileSync(
		join(second, '001.jpg'),
		await gradient(1200, 800, 8)
			.jpeg()
			.withExif({ IFD2: { DateTimeOriginal: '2024:08:01 10:00:00' } })
			.toBuffer()
	);
	writeFileSync(
		join(second, '002.jpg'),
		await gradient(1200, 800, 9)
			.jpeg()
			.withExif({ IFD2: { DateTimeOriginal: '2024:08:02 10:00:00' } })
			.toBuffer()
	);

	if (opts.extras) {
		// Unlisted album: reachable at its slug, hidden from listings, noindex
		const unlisted = join(root, '2023-rooftops');
		mkdirSync(unlisted, { recursive: true });
		writeFileSync(
			join(unlisted, 'a.jpg'),
			await gradient(1200, 800, 10)
				.jpeg()
				.withExif({ IFD2: { DateTimeOriginal: '2023:06:01 10:00:00' } })
				.toBuffer()
		);
		writeFileSync(join(unlisted, 'b.jpg'), await gradient(800, 1200, 11).jpeg().toBuffer());
		writeFileSync(join(unlisted, 'album.yaml'), 'title: Rooftops\nvisibility: unlisted\n');

		// Private album: encrypted at build with the password in REVELAR_TEST_PW
		const priv = join(root, 'secret-garden');
		mkdirSync(priv, { recursive: true });
		writeFileSync(
			join(priv, 'one.jpg'),
			await gradient(1400, 933, 12)
				.jpeg()
				.withXmp(
					xmpPacket({
						title: 'Hidden fountain',
						description: 'Nobody else has seen this.',
						dateCreated: '2025-05-01'
					})
				)
				.toBuffer()
		);
		writeFileSync(join(priv, 'two.jpg'), await gradient(900, 1200, 13).jpeg().toBuffer());
		writeFileSync(join(priv, 'three.jpg'), await gradient(1600, 900, 14).jpeg().toBuffer());
		writeFileSync(
			join(priv, 'album.yaml'),
			'title: Secret garden\nvisibility: private\npassword_env: REVELAR_TEST_PW\ndownloads: large\n'
		);
	}

	// Things that must be ignored
	mkdirSync(join(root, '_drafts'), { recursive: true });
	writeFileSync(join(root, '_drafts', 'x.jpg'), await gradient(100, 100, 1).jpeg().toBuffer());
	writeFileSync(join(root, 'stray.jpg'), await gradient(100, 100, 1).jpeg().toBuffer());

	return { albumDir, files };
}

// CLI: `tsx tests/fixtures/generate.ts <dir>`
if (process.argv[1] && process.argv[1].endsWith('generate.ts') && process.argv[2]) {
	generateFixtures(process.argv[2]).then(() =>
		console.log(`fixtures written to ${process.argv[2]}`)
	);
}
