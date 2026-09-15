import { projection, scheme } from 'vega';
import world from '@/data/geography/world-countries.json';
import type { CollaborationData } from './collaboration';

interface MapProjection {
  (point: number[]): [number, number];
  fitExtent(extent: number[][], object: unknown): MapProjection;
  precision(value: number): MapProjection;
  path(object: unknown): string;
}

export const MAP_WIDTH = 1100;
export const MAP_HEIGHT = 590;

export function createMapGeometry(data: CollaborationData) {
  const factory = projection as unknown as (name: string) => () => MapProjection;
  const project = factory('naturalEarth1')().fitExtent([[22, 20], [MAP_WIDTH - 22, MAP_HEIGHT - 20]], { type: 'Sphere' }).precision(0.2);
  const viridis = scheme('viridis') as (t: number) => string;
  const maxCount = Math.max(...data.countries.map((country) => country.count));
  const maxLinks = Math.max(...data.collaborations.map((link) => link.count));
  const byId = new Map(data.countries.map((country) => [country.id, country]));
  const colour = (count: number, max: number) => viridis((count - 1) / Math.max(1, max - 1));
  const land = world.features.map((feature) => {
    const id = feature.properties.ADM0_A3;
    const country = byId.get(id);
    return { id, name: country?.name ?? feature.properties.NAME_EN, path: project.path(feature), count: country?.count ?? 0, fill: country ? colour(country.count, maxCount) : '' };
  });
  const nodes = data.countries.map((country) => {
    const [x, y] = project([country.longitude, country.latitude]);
    return { ...country, x, y, fill: colour(country.count, maxCount), radius: 3.4 + 8 * Math.sqrt(country.count / maxCount) };
  });
  const arcs = data.collaborations.map((link) => {
    const a = byId.get(link.countryA)!;
    const b = byId.get(link.countryB)!;
    return { ...link, name: `${a.name} ↔ ${b.name}`, path: project.path({ type: 'LineString', coordinates: [[a.longitude, a.latitude], [b.longitude, b.latitude]] }), colour: colour(link.count, maxLinks), width: 0.8 + 5.2 * (link.count - 1) / Math.max(1, maxLinks - 1) };
  }).sort((a, b) => a.count - b.count);
  const coordinates: number[][][] = [];
  for (let lat = -60; lat <= 60; lat += 30) coordinates.push(Array.from({ length: 181 }, (_, i) => [-180 + i * 2, lat]));
  for (let lon = -150; lon <= 180; lon += 30) coordinates.push(Array.from({ length: 81 }, (_, i) => [lon, -80 + i * 2]));
  return { land, nodes, arcs, sphere: project.path({ type: 'Sphere' }), graticule: project.path({ type: 'MultiLineString', coordinates }), maxCount, maxLinks, gradient: Array.from({ length: 11 }, (_, i) => ({ offset: `${i * 10}%`, colour: viridis(i / 10) })) };
}
