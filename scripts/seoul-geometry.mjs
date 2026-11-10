// Shared centimetre-coordinate identity; no geographic geometry is invented.
export function canonicalLine(points) {
  const tokens = points.map(p => p.join(','));
  const forward = tokens.join(';'), backward = tokens.slice().reverse().join(';');
  return forward < backward ? forward : backward;
}
export function canonicalRing(input) {
  const points = input.slice();
  if (points.length > 1 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]) points.pop();
  const tokens = points.map(p => p.join(','));
  if (!tokens.length) return '';
  let smallest = tokens[0];
  for (const token of tokens) if (token < smallest) smallest = token;
  let best = null;
  for (let i = 0; i < tokens.length; i++) if (tokens[i] === smallest) {
    const forward = tokens.slice(i).concat(tokens.slice(0, i)).join(';');
    const backward = [tokens[i], ...tokens.slice(0, i).reverse(), ...tokens.slice(i + 1).reverse()].join(';');
    for (const value of [forward, backward]) if (best === null || value < best) best = value;
  }
  return best;
}
export function canonicalGeoJSON(geometry, project) {
  const polygon = rings => [canonicalRing(rings[0].map(project)), ...rings.slice(1).map(r => canonicalRing(r.map(project))).sort()];
  if (geometry.type === 'LineString') return ['LineString', canonicalLine(geometry.coordinates.map(project))];
  if (geometry.type === 'Polygon') return ['Polygon', polygon(geometry.coordinates)];
  if (geometry.type === 'MultiPolygon') return ['MultiPolygon', geometry.coordinates.map(polygon).map(JSON.stringify).sort()];
  return [geometry.type, geometry.coordinates];
}
