import { countryPartners, linkIsVisible, selectedPublications, selectionFromParams } from './collaboration';
import type { CollaborationData, MapSelection } from './collaboration';

export function initialiseCollaborationMap(root: HTMLElement) {
  if (root.dataset['ready']) return;
  const get = <T extends Element>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing map control: ${selector}`);
    return element;
  };
  const data = JSON.parse(get('[data-collaboration-data]').textContent ?? '{}') as CollaborationData;
  const countries = new Map(data.countries.map((country) => [country.id, country]));
  const links = new Map(data.collaborations.map((link) => [link.id, link]));
  const svg = get<SVGSVGElement>('[data-world-map]');
  const transformGroup = get<SVGGElement>('[data-map-transform]');
  const canvas = get<HTMLElement>('[data-map-canvas]');
  const tooltip = get<HTMLElement>('[data-map-tooltip]');
  const select = get<HTMLSelectElement>('[data-country-select]');
  const showLinks = get<HTMLInputElement>('[data-show-links]');
  const minimum = get<HTMLInputElement>('[data-link-minimum]');
  const search = get<HTMLInputElement>('[data-publication-search]');
  const list = get<HTMLOListElement>('[data-publication-list]');
  const zoomIn = get<HTMLButtonElement>('[data-zoom-in]');
  const zoomOut = get<HTMLButtonElement>('[data-zoom-out]');
  const width = 1100, height = 590;
  let selection: MapSelection = selectionFromParams(data, new URLSearchParams(location.search));
  let networkList: 'countries' | 'collaborations' = 'countries';
  let zoom = 1, dx = 0, dy = 0;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const text = (selector: string, value: string) => { get(selector).textContent = value; };
  const countryName = (id: string) => countries.get(id)?.name ?? id;
  const pairName = (id: string) => {
    const pair = links.get(id);
    return pair ? `${countryName(pair.countryA)} ↔ ${countryName(pair.countryB)}` : '';
  };

  function renderPublications() {
    const publications = selectedPublications(data, selection, search.value);
    list.replaceChildren();
    for (const publication of publications) {
      const row = node('li');
      const anchor = node('a', publication.title);
      anchor.href = `${root.dataset['base'] ?? '/'}publications/${encodeURIComponent(publication.slug)}/`;
      const author = publication.authors[0] ?? '';
      anchor.append(node('span', `${publication.year}${author ? ` · ${author}${publication.authors.length > 1 ? ' et al.' : ''}` : ''}`));
      row.append(anchor);
      list.append(row);
    }
    if (!publications.length) list.append(node('li', 'No publications match this search.', 'geo-no-results'));
    text('[data-publication-count]', String(publications.length));
  }

  function renderRanking() {
    const ranking = get<HTMLElement>('[data-ranking-list]');
    ranking.replaceChildren();
    const items = networkList === 'countries'
      ? data.countries.map((country) => ({ id: country.id, name: country.name, count: country.count }))
      : data.collaborations.map((pair) => ({ id: pair.id, name: pairName(pair.id), count: pair.count }));
    items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const max = items[0]?.count ?? 1;
    items.forEach((item, index) => {
      const button = node('button', '', 'geo-rank-row');
      button.type = 'button';
      button.dataset[networkList === 'countries' ? 'country' : 'link'] = item.id;
      button.append(node('span', String(index + 1).padStart(2, '0'), 'geo-rank'));
      const label = node('span', item.name, 'geo-rank-name');
      const bar = node('i');
      bar.style.setProperty('--share', `${item.count / max * 100}%`);
      label.append(bar);
      const arrow = node('span', '↗');
      arrow.setAttribute('aria-hidden', 'true');
      button.append(label, node('strong', String(item.count)), arrow);
      ranking.append(button);
    });
    text('[data-ranking-caption]', networkList === 'countries' ? 'Publications per country or territory' : 'Shared publications per country pair');
    root.querySelectorAll<HTMLButtonElement>('[data-network-list]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset['networkList'] === networkList)));
  }

  function renderMap() {
    const active = new Set<string>();
    if (selection?.kind === 'country') {
      active.add(selection.id);
      countryPartners(data, selection.id).forEach((pair) => { active.add(pair.countryA); active.add(pair.countryB); });
    } else if (selection?.kind === 'collaboration') {
      const pair = links.get(selection.id);
      if (pair) { active.add(pair.countryA); active.add(pair.countryB); }
    }
    const selectedIds = selection?.kind === 'country' ? new Set([selection.id]) : active;
    root.querySelectorAll<SVGElement>('[data-country-shape], [data-map-node]').forEach((element) => {
      const id = element.dataset['countryShape'] ?? element.dataset['mapNode'] ?? '';
      element.classList.toggle('is-muted', Boolean(selection) && !active.has(id));
      element.classList.toggle('is-selected', Boolean(selection) && selectedIds.has(id));
      if (element.hasAttribute('data-map-node')) element.setAttribute('aria-pressed', String(Boolean(selection) && selectedIds.has(id)));
    });
    let visible = 0;
    root.querySelectorAll<SVGGElement>('.geo-connection').forEach((element) => {
      const pair = links.get(element.dataset['link'] ?? '');
      if (!pair) return;
      const shown = linkIsVisible(pair, selection, Number(minimum.value), showLinks.checked);
      element.classList.toggle('is-muted', !shown);
      element.classList.toggle('is-selected', selection?.kind === 'collaboration' && pair.id === selection.id);
      element.classList.toggle('is-connected', selection?.kind === 'country' && shown);
      element.setAttribute('aria-hidden', String(!shown));
      if (shown) visible += 1;
    });
    text('[data-visible-links]', `${visible} ${visible === 1 ? 'collaboration' : 'collaborations'} shown`);
    text('[data-link-minimum-value]', minimum.value);
    minimum.disabled = !showLinks.checked;
  }

  function renderSelection() {
    tooltip.hidden = true;
    select.value = selection?.kind === 'country' ? selection.id : '';
    get<HTMLElement>('[data-overview-panel]').hidden = Boolean(selection);
    get<HTMLElement>('[data-detail-panel]').hidden = !selection;
    get<HTMLButtonElement>('[data-clear-selection]').hidden = !selection;
    const partners = get<HTMLElement>('[data-partners-list]');
    const metrics = get<HTMLElement>('[data-selected-metrics]');
    partners.replaceChildren();
    metrics.replaceChildren();
    const metric = (value: number, label: string) => { const box = node('div'); box.append(node('strong', String(value)), node('span', label)); metrics.append(box); };
    const partner = (id: string, label: string, count?: number, kind: 'country' | 'link' = 'link') => {
      const button = node('button', label, 'geo-partner'); button.type = 'button'; button.dataset[kind] = id;
      if (count !== undefined) button.append(node('strong', String(count)));
      partners.append(button);
    };
    if (!selection) {
      text('[data-selection-kind]', 'Explore the network');
      text('[data-selection-title]', 'A world of connections');
      text('[data-selection-description]', 'Select a country to see its publications and partners, or follow a link to explore a collaboration.');
    } else if (selection.kind === 'country') {
      const country = countries.get(selection.id)!;
      const pairs = countryPartners(data, country.id);
      text('[data-selection-kind]', 'Country / territory');
      text('[data-selection-title]', country.name);
      text('[data-selection-description]', 'Publications with an author affiliation here. Select a partner below to explore their shared work.');
      metric(country.count, 'publications'); metric(pairs.length, 'collaboration partners');
      for (const pair of pairs) partner(pair.id, countryName(pair.countryA === country.id ? pair.countryB : pair.countryA), pair.count);
      get<HTMLElement>('[data-partners-panel]').hidden = pairs.length === 0;
      text('[data-partners-panel] h3', 'Explore collaborations');
    } else {
      const pair = links.get(selection.id)!;
      text('[data-selection-kind]', 'International collaboration');
      text('[data-selection-title]', pairName(pair.id));
      text('[data-selection-description]', 'Publications with author affiliations in both places. Other countries may also be represented.');
      metric(pair.count, 'shared publications');
      metric(new Set(selectedPublications(data, selection).flatMap((item) => item.countries)).size, 'countries in these publications');
      partner(pair.countryA, countryName(pair.countryA), undefined, 'country');
      partner(pair.countryB, countryName(pair.countryB), undefined, 'country');
      get<HTMLElement>('[data-partners-panel]').hidden = false;
      text('[data-partners-panel] h3', 'Explore either country');
    }
    renderPublications();
    renderMap();
    text('[data-selection-announcement]', selection ? `${get('[data-selection-title]').textContent}: ${selectedPublications(data, selection).length} publications.` : 'World map overview.');
  }

  function choose(nextSelection: MapSelection, saveUrl = true) {
    selection = nextSelection;
    search.value = '';
    if (selection?.kind === 'collaboration') showLinks.checked = true;
    renderSelection();
    get<HTMLElement>('[data-partners-list]').scrollTop = 0;
    list.scrollTop = 0;
    if (saveUrl) {
      const url = new URL(location.href);
      url.searchParams.delete('country'); url.searchParams.delete('collaboration');
      if (selection) url.searchParams.set(selection.kind, selection.id);
      history.replaceState(null, '', url);
    }
  }
  function selectionAt(element: Element | null): MapSelection {
    const target = element?.closest<HTMLElement | SVGElement>('[data-country], [data-link]');
    if (!target || !root.contains(target)) return null;
    const id = target.dataset['country'];
    if (id && countries.has(id)) return { kind: 'country', id };
    const link = target.dataset['link'];
    return link && links.has(link) ? { kind: 'collaboration', id: link } : null;
  }
  root.addEventListener('click', (event) => {
    const element = event.target instanceof Element ? event.target : null;
    if (!element || svg.contains(element)) return;
    const nextSelection = selectionAt(element);
    if (nextSelection) choose(nextSelection);
    const button = element.closest<HTMLButtonElement>('[data-network-list]');
    if (button) { networkList = button.dataset['networkList'] === 'collaborations' ? 'collaborations' : 'countries'; renderRanking(); }
  });
  select.addEventListener('change', () => choose(select.value ? { kind: 'country', id: select.value } : null));
  get('[data-clear-selection]').addEventListener('click', () => choose(null));
  showLinks.addEventListener('change', renderMap);
  minimum.addEventListener('input', renderMap);
  search.addEventListener('input', () => { renderPublications(); list.scrollTop = 0; });

  function applyTransform() {
    dx = Math.max(width * (1 - zoom), Math.min(0, dx));
    dy = Math.max(height * (1 - zoom), Math.min(0, dy));
    transformGroup.setAttribute('transform', `translate(${dx} ${dy}) scale(${zoom})`);
    text('[data-map-zoom]', `${Math.round(zoom * 100)}%`);
    zoomOut.disabled = zoom <= 1; zoomIn.disabled = zoom >= 5;
  }
  function setZoom(value: number, point = { x: width / 2, y: height / 2 }) {
    const nextZoom = Math.max(1, Math.min(5, value));
    dx = point.x - (point.x - dx) * nextZoom / zoom;
    dy = point.y - (point.y - dy) * nextZoom / zoom;
    zoom = nextZoom;
    applyTransform();
  }
  function resetZoom() { zoom = 1; dx = 0; dy = 0; applyTransform(); }
  zoomIn.addEventListener('click', () => setZoom(zoom * 1.4));
  zoomOut.addEventListener('click', () => setZoom(zoom / 1.4));
  get('[data-zoom-reset]').addEventListener('click', resetZoom);
  get('[data-reset-map]').addEventListener('click', () => { minimum.value = '1'; showLinks.checked = true; resetZoom(); choose(null); });
  function svgPoint(clientX: number, clientY: number) {
    const point = svg.createSVGPoint(); point.x = clientX; point.y = clientY;
    const matrix = svg.getScreenCTM();
    return matrix ? point.matrixTransform(matrix.inverse()) : point;
  }
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    tooltip.hidden = true;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
    setZoom(zoom * Math.exp(-delta * .0025), svgPoint(event.clientX, event.clientY));
  }, { passive: false });
  svg.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      const nextSelection = selectionAt(event.target instanceof Element ? event.target : null);
      if (nextSelection) { event.preventDefault(); choose(nextSelection); }
    } else if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom(zoom * 1.4); }
    else if (event.key === '-') { event.preventDefault(); setZoom(zoom / 1.4); }
    else if (event.key === '0') { event.preventDefault(); resetZoom(); }
    else if (event.key === 'Escape') { event.preventDefault(); choose(null); }
    else if (zoom > 1 && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      dx += event.key === 'ArrowLeft' ? 50 : event.key === 'ArrowRight' ? -50 : 0;
      dy += event.key === 'ArrowUp' ? 50 : event.key === 'ArrowDown' ? -50 : 0;
      applyTransform();
    }
  });

  const pointers = new Map<number, { x: number; y: number }>();
  let pointerSelection: MapSelection = null;
  let startClient = { x: 0, y: 0 }, dragged = false;
  let pinchDistance = 0, pinchMid = { x: 0, y: 0 };
  const pinch = () => {
    const values = [...pointers.values()]; const a = values[0]!, b = values[1]!;
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };
  svg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const point = svgPoint(event.clientX, event.clientY);
    pointers.set(event.pointerId, point);
    if (pointers.size === 1) { startClient = { x: event.clientX, y: event.clientY }; dragged = false; pointerSelection = selectionAt(event.target instanceof Element ? event.target : null); }
    if (pointers.size === 2) { const state = pinch(); pinchDistance = state.distance; pinchMid = state.middle; dragged = true; }
    tooltip.hidden = true;
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) { showTooltip(event); return; }
    const previousPoint = pointers.get(event.pointerId)!;
    const point = svgPoint(event.clientX, event.clientY);
    pointers.set(event.pointerId, point);
    if (pointers.size >= 2) {
      const state = pinch();
      if (pinchDistance) setZoom(zoom * state.distance / pinchDistance, pinchMid);
      dx += state.middle.x - pinchMid.x; dy += state.middle.y - pinchMid.y;
      pinchDistance = state.distance; pinchMid = state.middle;
      applyTransform();
    } else {
      if (Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y) > (event.pointerType === 'touch' ? 9 : 6)) dragged = true;
      if (dragged) { dx += point.x - previousPoint.x; dy += point.y - previousPoint.y; applyTransform(); }
    }
    svg.classList.toggle('is-dragging', dragged);
  });
  function endPointer(event: PointerEvent, cancelled = false) {
    if (!pointers.has(event.pointerId)) return;
    if (!cancelled && !dragged && pointers.size === 1 && pointerSelection) choose(pointerSelection);
    pointers.delete(event.pointerId);
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    if (!pointers.size) { svg.classList.remove('is-dragging'); pointerSelection = null; }
    else { dragged = true; }
  }
  svg.addEventListener('pointerup', (event) => endPointer(event));
  svg.addEventListener('pointercancel', (event) => endPointer(event, true));
  function showTooltip(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    const target = selectionAt(event.target instanceof Element ? event.target : null);
    if (!target) { tooltip.hidden = true; return; }
    tooltip.replaceChildren();
    if (target.kind === 'country') {
      const country = countries.get(target.id)!;
      tooltip.append(node('strong', country.name), node('span', `${country.count} publications · ${countryPartners(data, country.id).length} partners`));
    } else {
      const pair = links.get(target.id)!;
      tooltip.append(node('strong', pairName(pair.id)), node('span', `${pair.count} shared ${pair.count === 1 ? 'publication' : 'publications'}`));
    }
    tooltip.hidden = false;
    const box = canvas.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(box.width - tooltip.offsetWidth - 8, event.clientX - box.left + 14))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(box.height - tooltip.offsetHeight - 8, event.clientY - box.top + 16))}px`;
  }
  svg.addEventListener('pointerleave', () => { tooltip.hidden = true; });
  window.addEventListener('popstate', () => choose(selectionFromParams(data, new URLSearchParams(location.search)), false));
  renderRanking(); renderSelection(); applyTransform();
  root.dataset['ready'] = 'true';
}
