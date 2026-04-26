import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildGeoJSON, seasons } from './data/clubs.js';

const STYLE = 'https://tiles.openfreemap.org/styles/positron';

const LEAGUE_COLORS = {
  'liga-1': '#E63946',
  'liga-2': '#457B9D',
  'liga-3': '#2A9D8F',
};

const LEAGUE_LABELS = {
  'liga-1': 'Liga Portugal 1',
  'liga-2': 'Liga Portugal 2',
  'liga-3': 'Liga Portugal 3',
};

const ALL_LEAGUES = ['liga-1', 'liga-2', 'liga-3'];

let currentSeason = '2025-26';

// ── Map instances ─────────────────────────────────────────────────────────────

const mainMap = new maplibregl.Map({
  container: 'map',
  style: STYLE,
  bounds: [[-9.6, 36.7], [-6.1, 42.2]],   // mainland Portugal
  fitBoundsOptions: { padding: 40 },
  maxBounds: [[-10.5, 36.4], [-5.5, 42.5]], // restrict pan to mainland
  minZoom: 5.5,
  maxZoom: 18,
  attributionControl: false,
});

mainMap.addControl(new maplibregl.NavigationControl(), 'top-right');
mainMap.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

function createInsetMap(containerId, bounds) {
  const map = new maplibregl.Map({
    container: containerId,
    style: STYLE,
    bounds,
    fitBoundsOptions: { padding: 12 },
    attributionControl: false,
  });
  // Keep click events, disable everything else
  map.scrollZoom.disable();
  map.boxZoom.disable();
  map.dragRotate.disable();
  map.dragPan.disable();
  map.keyboard.disable();
  map.doubleClickZoom.disable();
  map.touchZoomRotate.disable();
  return map;
}

const madeiraMap = createInsetMap('inset-madeira', [[-17.35, 32.52], [-16.25, 33.15]]);
const azoresMap  = createInsetMap('inset-azores',  [[-31.4,  36.6],  [-24.6, 40.1]]);

const allMaps = [mainMap, madeiraMap, azoresMap];

// ── Helpers ───────────────────────────────────────────────────────────────────

function updateCounts(season) {
  const seasonData = seasons[season] ?? {};
  for (const league of ALL_LEAGUES) {
    const el = document.getElementById(`count-${league}`);
    if (el) el.textContent = seasonData[league]?.length ?? 0;
  }
}

function refreshAll() {
  const geojson = buildGeoJSON(currentSeason, ALL_LEAGUES);
  for (const map of allMaps) {
    map.getSource('clubs')?.setData(geojson);
  }
}

function buildPopupHTML(props) {
  const leagueColor = LEAGUE_COLORS[props.league] ?? '#666';
  const leagueLabel = LEAGUE_LABELS[props.league] ?? props.league;
  const capacity = props.capacity ? Number(props.capacity).toLocaleString('en') : null;
  return `
    <div class="popup-inner">
      <div class="popup-league" style="color:${leagueColor}">${leagueLabel}</div>
      <div class="popup-name">${props.name}</div>
      <dl class="popup-details">
        <dt>City</dt>    <dd>${props.city}</dd>
        <dt>Stadium</dt> <dd>${props.stadium}</dd>
        ${capacity ? `<dt>Capacity</dt><dd>${capacity}</dd>` : ''}
        <dt>Founded</dt> <dd>${props.founded}</dd>
      </dl>
    </div>
  `;
}

// Add source + layers to any map instance. Labels only needed on the main map.
function setupLayers(map, { withLabels = false } = {}) {
  map.addSource('clubs', {
    type: 'geojson',
    data: buildGeoJSON(currentSeason, ALL_LEAGUES),
  });

  // Draw Liga 3 first so Liga 1 renders on top when circles overlap
  for (const league of ['liga-3', 'liga-2', 'liga-1']) {
    map.addLayer({
      id: `club-points-${league}`,
      type: 'circle',
      source: 'clubs',
      filter: ['==', ['get', 'league'], league],
      paint: {
        'circle-color': LEAGUE_COLORS[league],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 4, 10, 8, 14, 12],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.9,
      },
    });
  }

  if (withLabels) {
    map.addLayer({
      id: 'club-labels',
      type: 'symbol',
      source: 'clubs',
      minzoom: 9,
      layout: {
        'text-field': ['get', 'shortName'],
        'text-font': ['Noto Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': 11,
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: {
        'text-color': '#1F2937',
        'text-halo-color': '#FFFFFF',
        'text-halo-width': 1.5,
      },
    });
  }

  // Each map gets its own popup closure
  let activePopup = null;
  for (const league of ALL_LEAGUES) {
    const layerId = `club-points-${league}`;
    map.on('click', layerId, (e) => {
      const feature = e.features[0];
      if (activePopup) activePopup.remove();
      activePopup = new maplibregl.Popup({ offset: 12, maxWidth: '280px' })
        .setLngLat([...feature.geometry.coordinates])
        .setHTML(buildPopupHTML(feature.properties))
        .addTo(map);
    });
    map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
  }
}

// ── Load events ───────────────────────────────────────────────────────────────

mainMap.on('load', () => {
  updateCounts(currentSeason);
  setupLayers(mainMap, { withLabels: true });
});

madeiraMap.on('load', () => setupLayers(madeiraMap));
azoresMap.on('load',  () => setupLayers(azoresMap));

// ── UI controls ───────────────────────────────────────────────────────────────

document.getElementById('season-select').addEventListener('change', (e) => {
  currentSeason = e.target.value;
  updateCounts(currentSeason);
  refreshAll();
});

document.querySelectorAll('input[data-league]').forEach((checkbox) => {
  checkbox.addEventListener('change', () => {
    const { league } = checkbox.dataset;
    const visibility = checkbox.checked ? 'visible' : 'none';
    for (const map of allMaps) {
      const layerId = `club-points-${league}`;
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility);
    }
  });
});
