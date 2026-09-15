import type { APIRoute } from 'astro';
import data from '@/data/generated/collaboration.json';
import { createMapGeometry } from '@/lib/collaborationMap';

export const GET: APIRoute = () => {
  const map = createMapGeometry(data);
  const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const leading = new Set([...map.nodes].sort((a, b) => b.count - a.count).slice(0, 3).map((country) => country.id));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1195" viewBox="0 0 1100 730" role="img" aria-labelledby="title desc">
<title id="title">World map of publications and international co-authorship</title>
<desc id="desc">Country shading represents publication counts. Connections represent shared publications. Natural Earth projection and Viridis colour scale.</desc>
<defs><linearGradient id="viridis">${map.gradient.map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.colour}"/>`).join('')}</linearGradient></defs>
<rect width="1100" height="730" fill="#fff"/>
<text x="28" y="35" fill="#0b1f33" font-family="Palatino Linotype,Georgia,serif" font-size="27">International collaboration in ophthalmic AI</text>
<text x="29" y="60" fill="#486174" font-family="Arial,sans-serif" font-size="12">${data.totals.mapped} publications with mapped affiliations · ${data.totals.countries} countries and territories · ${data.totals.collaborations} collaboration pairs</text>
<g transform="translate(0 70)">
<path d="${map.sphere}" fill="#edf6fb" stroke="#aec0cf" stroke-width=".7"/>
<path d="${map.graticule}" fill="none" stroke="#b9cdd8" stroke-width=".5" opacity=".5"/>
${map.land.map((country) => `<path d="${country.path}" fill="${country.fill || '#d4dfe5'}" stroke="#fff" stroke-width=".55" stroke-linejoin="round"><title>${escape(country.name)}: ${country.count}</title></path>`).join('')}
${map.arcs.map((link) => `<path d="${link.path}" fill="none" stroke="${link.colour}" stroke-width="${link.width}" stroke-linecap="round" opacity=".42"><title>${escape(link.name)}: ${link.count}</title></path>`).join('')}
${map.nodes.map((country) => `<circle cx="${country.x}" cy="${country.y}" r="${country.radius}" fill="${country.fill}" stroke="#fff" stroke-width="1.2"><title>${escape(country.name)}: ${country.count}</title></circle>${leading.has(country.id) ? `<text x="${country.x}" y="${country.y - country.radius - 9}" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="600" fill="#0b1f33" stroke="#fff" stroke-width="3" paint-order="stroke">${escape(country.name)}</text>` : ''}`).join('')}
</g>
<g font-family="Arial,sans-serif" fill="#486174" font-size="11">
<text x="30" y="682">Publications</text><rect x="110" y="673" width="155" height="8" rx="3" fill="url(#viridis)"/><text x="110" y="698">1</text><text x="265" y="698" text-anchor="end">${map.maxCount}</text>
<text x="335" y="682">Shared publications</text><rect x="455" y="673" width="155" height="8" rx="3" fill="url(#viridis)"/><text x="455" y="698">1</text><text x="610" y="698" text-anchor="end">${map.maxLinks}</text>
<rect x="690" y="672" width="10" height="10" fill="#d4dfe5"/><text x="707" y="682">No mapped affiliation</text><text x="1070" y="682" text-anchor="end">Map: Natural Earth</text>
<text x="30" y="721" font-size="10">Each publication counts once per affiliation country or territory and once per country pair. Affiliation geography does not establish study-population geography.</text></g>
</svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } });
};
