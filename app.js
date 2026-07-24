// Planenificator Web UI Application Controller

// State variables
let map = null;
let waypoints = [];
let routePolyline = null;
let waypointMarkers = [];
let pyodide = null;
let loadedCharts = []; // Array of { id, name, overlay, bounds }

// Initialize Map
function initMap() {
  // Center map on Spain VFR region
  map = L.map('map', {
    doubleClickZoom: false // Disable double click zoom so we can use double click for waypoints
  }).setView([40.4167, -3.7037], 6);

  // Load a sleek dark base map layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 18
  }).addTo(map);

  // Route vector path line
  routePolyline = L.polyline([], {
    color: '#00f0ff',
    weight: 4,
    opacity: 0.8,
    className: 'animated-route'
  }).addTo(map);

  // Map click listeners
  map.on('dblclick', function(e) {
    addWaypoint(e.latlng.lat, e.latlng.lng);
  });
}

// 📦 Pyodide (Python WASM) Initialization
async function initPyodideRuntime() {
  const statusDot = document.getElementById('pyodide-status-dot');
  const statusText = document.getElementById('pyodide-status-text');

  try {
    statusDot.className = "indicator-dot loading";
    statusText.innerText = "Loading Pyodide engine...";
    
    // Load WebAssembly runtime from JS CDN
    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/"
    });

    statusText.innerText = "Installing packages...";
    await pyodide.loadPackage(["ssl", "micropip"]);
    const micropip = pyodide.pyimport("micropip");
    
    // Install pure Python dependencies
    await micropip.install(["requests", "geopy", "tabulate", "pyodide-http"]);

    statusText.innerText = "Loading Planenificator code...";
    
    // Create folders in Virtual Filesystem
    pyodide.FS.mkdir("planenificator");

    // Fetch and load our local Python files into Pyodide virtual FS
    const files = [
      "__init__.py",
      "helpers.py",
      "kml_parser.py",
      "meteo.py",
      "notams_spain.py",
      "osm.py",
      "planenificator.py"
    ];

    for (const file of files) {
      // Fetch relative to the /web directory (so up one level to find planenificator/)
      const response = await fetch(`planenificator/${file}`);
      if (!response.ok) {
        throw new Error(`Failed to load ${file} from static host`);
      }
      const code = await response.text();
      pyodide.FS.writeFile(`planenificator/${file}`, code);
    }

    // Patch Python requests to redirect to browser fetch calls (solving CORS & WASM socket limits)
    pyodide.runPython(`
      import pyodide_http
      pyodide_http.patch_all()
    `);

    // Complete loading state
    statusDot.className = "indicator-dot ready";
    statusText.innerText = "System Ready (Offline)";
    document.getElementById('calculate-btn').disabled = false;
    console.log("Pyodide fully loaded and patched!");
  } catch (error) {
    statusDot.className = "indicator-dot";
    statusText.innerText = "Failed loading Python!";
    console.error("Pyodide Initialization Error:", error);
    alert("Could not load Python runtime inside the browser. Details: " + error.message);
  }
}

// 📍 Waypoint Management
async function addWaypoint(lat, lon, name = null) {
  const index = waypoints.length + 1;
  const waypoint = {
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    lat: lat,
    lng: lon,
    name: name || `Loading waypoint name...`
  };

  waypoints.push(waypoint);
  updateRouteVector();

  // Create Marker
  const marker = L.marker([lat, lon], {
    draggable: true,
    title: `WP ${index}`
  }).addTo(map);

  marker.bindPopup(`<b>WP ${index}:</b> ${waypoint.name}`).openPopup();
  
  // Listeners for marker changes
  marker.on('dragend', function(e) {
    const newLatLng = marker.getLatLng();
    waypoint.lat = newLatLng.lat;
    waypoint.lng = newLatLng.lng;
    waypoint.name = `Waypoint georeferenced...`;
    updateRouteVector();
    resolveWaypointName(waypoint, marker);
  });

  waypointMarkers.push(marker);

  // Render Sidebar Waypoint Item
  renderWaypointList();

  // Resolve landmark geocoding in background asynchronously without blocking UI thread
  resolveWaypointName(waypoint, marker);
}

function removeWaypoint(id) {
  const index = waypoints.findIndex(wp => wp.id === id);
  if (index !== -1) {
    // Remove marker from map
    map.removeLayer(waypointMarkers[index]);
    waypointMarkers.splice(index, 1);
    waypoints.splice(index, 1);
    
    updateRouteVector();
    renderWaypointList();
  }
}

function clearRoute() {
  waypointMarkers.forEach(m => map.removeLayer(m));
  waypointMarkers = [];
  waypoints = [];
  updateRouteVector();
  renderWaypointList();
  
  // Reset outputs
  document.getElementById('print-pdf-btn').disabled = true;
  document.getElementById('notam-alerts-list').innerHTML = '<p class="empty-message">No NOTAM conflicts checked yet.</p>';
  document.getElementById('nav-log-table').querySelector('tbody').innerHTML = 
    `<tr><td colspan="10" class="empty-table-message">No route calculated. Click waypoints on the map and hit Calculate.</td></tr>`;
}

function updateRouteVector() {
  const latLngs = waypoints.map(wp => [wp.lat, wp.lng]);
  routePolyline.setLatLngs(latLngs);
  
  // Fit bounds if we have 2+ points and no loaded chart overlay is active
  if (latLngs.length >= 2 && loadedCharts.length === 0) {
    map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });
  }
}

// OSM Nominatim Geocoder - Async Fetch with Rate Limiting safety
async function resolveWaypointName(waypoint, marker) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${waypoint.lat}&lon=${waypoint.lng}&zoom=14&addressdetails=1`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("HTTP error " + response.status);
    const data = await response.json();
    
    const address = data.address || {};
    let resolvedName = "";

    if (address.aeroway || address.airport) {
      resolvedName = address.aeroway || address.airport;
    } else if (address.tourism) {
      resolvedName = address.tourism;
    } else {
      const townOrVillage = address.village || address.town || address.hamlet || address.suburb || address.city;
      resolvedName = townOrVillage || address.road || `Point_${waypoint.lat.toFixed(3)}_${waypoint.lng.toFixed(3)}`;
    }

    waypoint.name = resolvedName;
  } catch (error) {
    console.warn("Geocoding failed, using coordinates placeholder:", error);
    waypoint.name = `Waypoint (${waypoint.lat.toFixed(4)}, ${waypoint.lng.toFixed(4)})`;
  }

  // Update popup and lists
  marker.getPopup().setContent(`<b>WP:</b> ${waypoint.name}`);
  renderWaypointList();
}

function renderWaypointList() {
  const listEl = document.getElementById('waypoint-list');
  if (waypoints.length === 0) {
    listEl.innerHTML = '<p class="empty-message">Double-click on the map or georeferenced chart to add waypoints.</p>';
    return;
  }

  listEl.innerHTML = waypoints.map((wp, i) => `
    <div class="waypoint-item" data-id="${wp.id}">
      <span class="waypoint-index">${i + 1}</span>
      <span class="waypoint-name">${wp.name}</span>
      <span class="waypoint-coords">${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}</span>
      <span class="waypoint-remove" onclick="removeWaypoint('${wp.id}')">✕</span>
    </div>
  `).join('');
}

// 📂 Chart File Drop & Parsing (Unzipping VFR charts & reading TFW World Files)
async function setupChartDropZone() {
  const dropZone = document.getElementById('chart-drop-zone');
  const fileInput = document.getElementById('chart-file-input');

  dropZone.addEventListener('click', () => fileInput.click());
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleUploadedChartFiles(files);
    }
  });

  fileInput.addEventListener('change', async () => {
    if (fileInput.files.length > 0) {
      handleUploadedChartFiles(fileInput.files);
    }
  });
}

// Proj4 setups for Spanish VFR500 charts (Lambert Conformal Conic)
proj4.defs("ENAIRE:LE", "+proj=lcc +lat_0=40 +lon_0=-4 +lat_1=37 +lat_2=42 +ellps=WGS84 +datum=WGS84 +units=m +no_defs");
proj4.defs("ENAIRE:GC", "+proj=lcc +lat_0=26 +lon_0=-17 +lat_1=24 +lat_2=29 +ellps=WGS84 +datum=WGS84 +units=m +no_defs");

function projectLccToWgs84(x, y, isCanaries = false) {
  const targetCrs = isCanaries ? "ENAIRE:GC" : "ENAIRE:LE";
  // Proj4 takes [X, Y] and returns [Lng, Lat]
  const [lng, lat] = proj4(targetCrs, "WGS84", [x, y]);
  return { lat, lng };
}


// Custom Leaflet GridLayer to warp and render tiles from a downsampled offscreen source canvas on-the-fly
const GeotiffWarpedTileLayer = L.GridLayer.extend({
  initialize: function(options) {
    L.GridLayer.prototype.initialize.call(this, options);
    this.sourceCanvas = options.sourceCanvas;
    this.bounds = options.bounds;
    this.tfwParams = options.tfwParams;
    this.scale = options.scale;
    this.isCanaries = options.isCanaries;
    this.crs = options.isCanaries ? "ENAIRE:GC" : "ENAIRE:LE";
  },

  createTile: function(coords, done) {
    const tile = document.createElement('canvas');
    tile.width = 256;
    tile.height = 256;
    const ctx = tile.getContext('2d');

    // 1. Get LatLng bounds of the tile
    const tileBounds = this._tileCoordsToBounds(coords);
    const swLatLng = tileBounds.getSouthWest();
    const neLatLng = tileBounds.getNorthEast();

    try {
      // 2. Project tile corners to the LCC coordinate system (meters)
      const [x_sw, y_sw] = proj4("WGS84", this.crs, [swLatLng.lng, swLatLng.lat]);
      const [x_ne, y_ne] = proj4("WGS84", this.crs, [neLatLng.lng, neLatLng.lat]);

      // 3. Map Easting/Northing meters to original TIFF pixel coordinates
      const { originX, originY, pixelScaleX, pixelScaleY } = this.tfwParams;
      
      const px_left   = (x_sw - originX) / pixelScaleX;
      const px_right  = (x_ne - originX) / pixelScaleX;
      const py_top    = (y_ne - originY) / pixelScaleY;
      const py_bottom = (y_sw - originY) / pixelScaleY;

      // 4. Map original pixel coordinates to downsampled canvas coordinates
      const sx = px_left * this.scale;
      const sy = py_top * this.scale;
      const sw = (px_right - px_left) * this.scale;
      const sh = (py_bottom - py_top) * this.scale;

      const sx_clean = Math.min(sx, sx + sw);
      const sy_clean = Math.min(sy, sy + sh);
      const sw_clean = Math.abs(sw);
      const sh_clean = Math.abs(sh);

      // Check overlap with the downsampled canvas bounds
      const canvasWidth = this.sourceCanvas.width;
      const canvasHeight = this.sourceCanvas.height;

      // If no overlap, return empty tile
      if (sx_clean + sw_clean < 0 || sx_clean > canvasWidth || sy_clean + sh_clean < 0 || sy_clean > canvasHeight) {
        setTimeout(() => done(null, tile), 0);
        return tile;
      }

      // Draw the sub-region of our downsampled canvas onto the tile
      ctx.drawImage(this.sourceCanvas, sx_clean, sy_clean, sw_clean, sh_clean, 0, 0, 256, 256);
      setTimeout(() => done(null, tile), 0);

    } catch (err) {
      setTimeout(() => done(null, tile), 0);
    }

    return tile;
  }
});

async function handleUploadedChartFiles(files) {
  // Let's check max files limit first
  if (loadedCharts.length >= 2) {
    alert("Maximum of 2 charts can be loaded simultaneously. Please remove an existing chart first.");
    return;
  }

  // We group files by their base name (excluding extension)
  const fileGroups = {};
  const zipFiles = [];

  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      zipFiles.push(file);
    } else {
      const dotIndex = file.name.lastIndexOf('.');
      if (dotIndex !== -1) {
        const baseName = file.name.substring(0, dotIndex);
        const ext = file.name.substring(dotIndex).toLowerCase();
        if (!fileGroups[baseName]) {
          fileGroups[baseName] = {};
        }
        if (ext === '.tfw') {
          fileGroups[baseName].tfw = file;
        } else if (ext === '.tif' || ext === '.tiff') {
          fileGroups[baseName].tif = file;
        }
      }
    }
  }

  // Process all ZIP files
  for (const zipFile of zipFiles) {
    if (loadedCharts.length >= 2) break;
    try {
      const arrayBuffer = await zipFile.arrayBuffer();
      const zipped = new Uint8Array(arrayBuffer);
      const unzipped = fflate.unzipSync(zipped);
      
      let tfwContent = null;
      let tiffBuffer = null;
      let chartName = zipFile.name;

      for (const [path, data] of Object.entries(unzipped)) {
        if (path.toLowerCase().endsWith('.tfw')) {
          tfwContent = new TextDecoder().decode(data);
        } else if (path.toLowerCase().endsWith('.tif') || path.toLowerCase().endsWith('.tiff')) {
          tiffBuffer = data.slice().buffer;
        }
      }

      if (tfwContent && tiffBuffer) {
        await displayGeoreferencedChart(chartName, tfwContent, tiffBuffer);
      } else {
        console.warn("ZIP file missing .TIF or .TFW file inside: " + zipFile.name);
      }
    } catch (err) {
      console.error("Error processing zip: ", err);
    }
  }

  // Process all individual file pairs
  for (const [baseName, group] of Object.entries(fileGroups)) {
    if (loadedCharts.length >= 2) break;
    if (group.tfw && group.tif) {
      try {
        const tfwContent = await group.tfw.text();
        const tiffBuffer = await group.tif.arrayBuffer();
        const chartName = group.tif.name;
        await displayGeoreferencedChart(chartName, tfwContent, tiffBuffer);
      } catch (err) {
        console.error("Error processing file pair: ", err);
      }
    }
  }

  if (loadedCharts.length === 0 && zipFiles.length === 0 && Object.keys(fileGroups).length === 0) {
    alert("Please upload a ZIP file containing BOTH the .TIF and the .TFW file, or select both files together.");
  }
}

function renderLoadedChartsList() {
  const fileListEl = document.getElementById('loaded-files-list');
  if (loadedCharts.length === 0) {
    fileListEl.innerHTML = '';
    return;
  }

  fileListEl.innerHTML = loadedCharts.map(chart => `
    <div class="file-item">
      <span class="file-name" title="${chart.name}">📄 ${chart.name}</span>
      <span class="remove-btn" onclick="unloadChart('${chart.id}')">Remove</span>
    </div>
  `).join('');
}

function unloadChart(id) {
  const index = loadedCharts.findIndex(c => c.id === id);
  if (index !== -1) {
    map.removeLayer(loadedCharts[index].overlay);
    loadedCharts.splice(index, 1);
    renderLoadedChartsList();
    
    // Readjust map bounds if charts remain
    if (loadedCharts.length > 0) {
      fitMapToLoadedCharts();
    }
  }
}

function fitMapToLoadedCharts() {
  if (loadedCharts.length === 0) return;
  
  let combinedBounds = loadedCharts[0].bounds;
  for (let i = 1; i < loadedCharts.length; i++) {
    combinedBounds = combinedBounds.extend(loadedCharts[i].bounds);
  }
  map.fitBounds(combinedBounds);
}

async function displayGeoreferencedChart(name, tfwText, tiffBuffer) {
  // Parse world file coords metadata
  const lines = tfwText.trim().split(/\r?\n/).map(line => parseFloat(line.trim()));
  if (lines.length < 6 || lines.some(isNaN)) {
    alert("Could not parse World File (.TFW) metrics for " + name);
    return;
  }

  const [pixelScaleX, rotationY, rotationX, pixelScaleY, originX, originY] = lines;

  console.log("Parsed TFW values for " + name + ":", { pixelScaleX, pixelScaleY, originX, originY });

  // Read TIFF width/height metadata using geotiff.js
  const tiff = await GeoTIFF.fromArrayBuffer(tiffBuffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();

  console.log(`Original TIFF dimensions for ${name}: ${width}x${height}`);

  // Downsample to max dimension of 8192px for crystal-clear readability and zero zoom crashes
  const MAX_DIM = 8192;
  let scale = 1;
  if (width > MAX_DIM || height > MAX_DIM) {
    scale = MAX_DIM / Math.max(width, height);
  }
  const canvasWidth = Math.round(width * scale);
  const canvasHeight = Math.round(height * scale);
  console.log(`Downsampling TIFF to Canvas dimensions: ${canvasWidth}x${canvasHeight}`);

  // Calculate georeferenced bounding box corners
  const isProjected = Math.abs(originX) > 180 || Math.abs(originY) > 90;
  const nameLower = name.toLowerCase();
  const isCanaries = nameLower.includes('gc') || nameLower.includes('canarias');

  let sw, ne;

  if (isProjected) {
    const tlCoords = projectLccToWgs84(originX, originY, isCanaries);
    const brCoords = projectLccToWgs84(
      originX + (pixelScaleX * width), 
      originY + (pixelScaleY * height), 
      isCanaries
    );

    sw = L.latLng(brCoords.lat, tlCoords.lng);
    ne = L.latLng(tlCoords.lat, brCoords.lng);
  } else {
    const latSW = originY + (pixelScaleY * height);
    const lngSW = originX;
    const latNE = originY;
    const lngNE = originX + (pixelScaleX * width);
    
    sw = L.latLng(latSW, lngSW);
    ne = L.latLng(latNE, lngNE);
  }

  const bounds = L.latLngBounds(sw, ne);
  console.log("Calculated bounds for " + name + ":", bounds);

  // Decode and resample the TIFF image directly to the target canvas size
  console.log("Decoding and resampling TIFF to target size...");
  const rgbData = await image.readRGB({
    width: canvasWidth,
    height: canvasHeight,
    resampleMethod: 'bilinear'
  });
  
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(canvasWidth, canvasHeight);

  let i = 0, j = 0;
  const len = rgbData.length;
  while (i < len) {
    imgData.data[j] = rgbData[i];
    imgData.data[j+1] = rgbData[i+1];
    imgData.data[j+2] = rgbData[i+2];
    imgData.data[j+3] = 255;
    i += 3;
    j += 4;
  }
  ctx.putImageData(imgData, 0, 0);

  // Create custom GridLayer-based GeotiffWarpedTileLayer using the downsampled canvas
  console.log("Creating Warped Tiled GeoTIFF layer for " + name + "...");
  const tileLayer = new GeotiffWarpedTileLayer({
    sourceCanvas: canvas, // our downsampled canvas
    bounds: bounds, // clips requests to actual map sheet boundaries
    tfwParams: { originX, originY, pixelScaleX, pixelScaleY },
    scale: scale, // downsampling scale factor
    isCanaries: isCanaries,
    opacity: 0.85,
    maxZoom: 18,
    minZoom: 4
  }).addTo(map);

  const chartId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  loadedCharts.push({
    id: chartId,
    name: name,
    overlay: tileLayer,
    bounds: bounds
  });

  // Readjust map scale viewport
  fitMapToLoadedCharts();
  renderLoadedChartsList();
}

// 📐 Flight calculations via Pyodide Wasm execution
async function runFlightPlanningCalculations() {
  if (waypoints.length < 2) {
    alert("Please add at least two waypoints on the map first.");
    return;
  }

  const calculateBtn = document.getElementById('calculate-btn');
  calculateBtn.innerText = "Calculating...";
  calculateBtn.disabled = true;

  try {
    const cruiseAlt = parseInt(document.getElementById('cruise-alt-input').value, 10);
    const tas = parseInt(document.getElementById('tas-input').value, 10);
    const initialAlt = parseInt(document.getElementById('initial-alt-input').value, 10);
    const arrivalAlt = parseInt(document.getElementById('arrival-alt-input').value, 10);
    const vy = parseInt(document.getElementById('vy-input').value, 10);
    const rateOfClimb = parseInt(document.getElementById('climb-rate-input').value, 10);
    const rateOfDescent = parseInt(document.getElementById('descent-rate-input').value, 10);
    
    const depAerodrome = document.getElementById('dep-input').value.trim();
    const destAerodrome = document.getElementById('dest-input').value.trim();
    const alternatesText = document.getElementById('alt-input').value.trim();

    // Parse departure date
    const depTimeStr = document.getElementById('departure-time-input').value;
    if (!depTimeStr) {
      alert("Please specify a departure date and time.");
      calculateBtn.innerText = "Calculate Route";
      calculateBtn.disabled = false;
      return;
    }
    const depDate = new Date(depTimeStr);
    const depTimeEpoch = depDate.getTime() / 1000;

    // Parse alternate codes
    const altAerodromes = alternatesText ? alternatesText.split(',').map(a => a.trim().toUpperCase()).filter(Boolean) : [];

    // Prepare JSON waypoints payloads for the Python module
    const pythonCoords = waypoints.map(wp => [wp.lat, wp.lng]);
    const pythonNames = waypoints.map(wp => wp.name);

    pyodide.globals.set("py_coords", pyodide.toPy(pythonCoords));
    pyodide.globals.set("py_names", pyodide.toPy(pythonNames));
    pyodide.globals.set("py_cruise_alt", cruiseAlt);
    pyodide.globals.set("py_tas", tas);
    pyodide.globals.set("py_initial_alt", initialAlt);
    pyodide.globals.set("py_arrival_alt", arrivalAlt);
    pyodide.globals.set("py_vy", vy);
    pyodide.globals.set("py_climb_rate", rateOfClimb);
    pyodide.globals.set("py_descent_rate", rateOfDescent);
    pyodide.globals.set("py_dep_time_epoch", depTimeEpoch);
    pyodide.globals.set("py_dep", depAerodrome);
    pyodide.globals.set("py_dest", destAerodrome);
    pyodide.globals.set("py_alts", pyodide.toPy(altAerodromes));

    // Call the python refactored functions using Pyodide
    const results = pyodide.runPython(`
      import json
      import datetime
      from planenificator.planenificator import generate_navigation_report_from_coords

      # Run navigation calculations
      table, notam_data = generate_navigation_report_from_coords(
          coords=py_coords,
          point_names=py_names,
          initial_alt=py_initial_alt,
          arrival_alt=py_arrival_alt,
          cruise_alt=py_cruise_alt,
          tas=py_tas,
          vy=py_vy,
          rate_of_climb=py_climb_rate,
          rate_of_descent=py_descent_rate,
          flight_start_date=datetime.datetime.fromtimestamp(py_dep_time_epoch),
          dep_aerodrome=py_dep or None,
          dest_aerodrome=py_dest or None,
          alt_aerodromes=list(py_alts) if py_alts else None
      )

      # Convert outputs to serializable format
      serialized_table = []
      for row in table:
          # Convert datetime objects to string representations
          str_row = [str(cell) for cell in row]
          serialized_table.append(str_row)

      json.dumps({
          "table": serialized_table,
          "notam_data": notam_data
      })
    `);

    const resultData = JSON.parse(results);
    console.log("Calculation results received from Wasm:", resultData);
    console.log("Raw route NOTAMs count:", resultData.notam_data.all_route_notams ? resultData.notam_data.all_route_notams.length : 0);
    console.log("Filtered route conflicts count:", resultData.notam_data.route_conflicts ? resultData.notam_data.route_conflicts.length : 0);
    console.log("Raw aerodrome NOTAMs count:", resultData.notam_data.all_aerodrome_notams ? resultData.notam_data.all_aerodrome_notams.length : 0);
    console.log("Filtered aerodrome conflicts count:", resultData.notam_data.aerodrome_conflicts ? resultData.notam_data.aerodrome_conflicts.length : 0);
    renderFlightLogTable(resultData.table);
    renderNotamAlerts(resultData.notam_data);

    // Populate print metadata panel
    const printMetaEl = document.getElementById('print-flight-meta');
    if (printMetaEl) {
      printMetaEl.innerHTML = `
        <div><strong>Departure Time:</strong><br>${new Date(depTimeStr).toLocaleString()}</div>
        <div><strong>DEP / DEST:</strong><br>${depAerodrome} / ${destAerodrome}</div>
        <div><strong>Alternates:</strong><br>${altAerodromes.join(', ') || 'None'}</div>
        <div><strong>Cruise Alt:</strong><br>${cruiseAlt} ft</div>
        <div><strong>Initial / Arrival Alt:</strong><br>${initialAlt} / ${arrivalAlt} ft</div>
        <div><strong>TAS:</strong><br>${tas} kts</div>
        <div><strong>Best Climb Vy:</strong><br>${vy} kts</div>
        <div><strong>Climb / Descent:</strong><br>${rateOfClimb} / ${rateOfDescent} fpm</div>
      `;
    }

    // Enable PDF download
    document.getElementById('print-pdf-btn').disabled = false;

  } catch (error) {
    console.error("Flight plan python execution error:", error);
    const tbody = document.getElementById('nav-log-table').querySelector('tbody');
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="color: #ff6b6b; text-align: left; font-family: monospace; white-space: pre-wrap; padding: 20px; background: rgba(255, 107, 107, 0.05); border: 1px solid rgba(255, 107, 107, 0.2);">
          ❌ <strong>Flight Planning Execution Error:</strong><br><br>${error.message || error}<br><br>
          ${error.stack ? `<strong>JS Stack Trace:</strong><br>${error.stack}` : ''}
        </td>
      </tr>
    `;
    alert("Route calculation failed! Look at the 'Navigation Log' panel below the map to see the detailed error traceback.");
  } finally {
    calculateBtn.innerText = "Calculate Route";
    calculateBtn.disabled = false;
  }
}

function renderFlightLogTable(tableData) {
  const tbody = document.getElementById('nav-log-table').querySelector('tbody');
  
  if (!tableData || tableData.length <= 1) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-table-message">Failed parsing calculation report.</td></tr>`;
    return;
  }

  // Row 0 has the headers
  const rows = tableData.slice(1);
  let html = "";

  rows.forEach((row, idx) => {
    const isTotal = row[0] === "Total";
    const cssClass = isTotal ? 'class="total-row"' : '';
    
    html += `
      <tr ${cssClass}>
        <td>${row[0]}</td>
        <td>${row[1] || ''}</td>
        <td>${row[2] || ''}</td>
        <td>${row[3] || ''}</td>
        <td>${row[4] || ''}</td>
        <td>${row[5] || ''}</td>
        <td>${row[6] || ''}</td>
        <td>${row[7] || ''}</td>
        <td>${isTotal ? parseFloat(row[7]).toFixed(1) : (parseFloat(row[8]) || 0).toFixed(1)}</td>
        <td>${row[9] || ''}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function renderNotamAlerts(notamData) {
  const alertsEl = document.getElementById('notam-alerts-list');
  const routeConflicts = notamData.route_conflicts || [];
  const aerodromeConflicts = notamData.aerodrome_conflicts || [];
  const allRouteNotams = notamData.all_route_notams || [];
  const allAerodromeNotams = notamData.all_aerodrome_notams || [];
  const semiWarnings = notamData.semicircular_warnings || [];

  // Identify non-conflicting (filtered out) route NOTAMs
  const conflictIds = new Set(routeConflicts.map(c => c.notamId));
  const inactiveRouteNotams = allRouteNotams.filter(n => !conflictIds.has(n.notamId));

  // Identify non-conflicting (filtered out) aerodrome NOTAMs
  const conflictAdIds = new Set(aerodromeConflicts.map(item => item[0].notamId));
  const inactiveAerodromeNotams = allAerodromeNotams.filter(n => !conflictAdIds.has(n.notamId));

  // 1. Render active conflicts and semicircular warnings on the screen (VFR sidebar alerts list)
  if (routeConflicts.length === 0 && aerodromeConflicts.length === 0 && semiWarnings.length === 0) {
    alertsEl.innerHTML = '<p class="empty-message" style="color: var(--color-green);">🟢 No active warnings or NOTAM conflicts detected along the route corridor.</p>';
  } else {
    let html = "";
    
    // Render Semicircular flight warnings first
    semiWarnings.forEach(w => {
      html += `
        <div class="notam-card limited semicircular-warning-card" style="border-left-color: var(--color-yellow); background-color: rgba(255, 214, 0, 0.04);">
          <div class="notam-card-header">
            <span class="notam-id" style="color: var(--color-yellow);">⚠️ Flight Warning</span>
            <span class="notam-limits">SEMICIRCULAR</span>
          </div>
          <div class="notam-card-text" style="color: var(--text-primary); font-weight: 500;">${w}</div>
        </div>
      `;
    });

    routeConflicts.forEach(c => {
      html += `
        <div class="notam-card closed">
          <div class="notam-card-header">
            <span class="notam-id">⚠️ ${c.notamId} (${c.areaSactaName || 'ROUTE'})</span>
            <span class="notam-limits">FL${c.LOWER_VAL} - FL${c.UPPER_VAL}</span>
          </div>
          <div class="notam-card-text">${c.itemE}</div>
        </div>
      `;
    });

    aerodromeConflicts.forEach(item => {
      const [c, warnType, role] = item;
      const isClosed = warnType === 'CLOSED';
      const cardClass = isClosed ? 'notam-card closed' : 'notam-card limited';
      html += `
        <div class="${cardClass}">
          <div class="notam-card-header">
            <span class="notam-id">📍 AD ${c.itemA} [${role}]</span>
            <span class="notam-status">${warnType}</span>
          </div>
          <div class="notam-card-text">${c.itemE}</div>
        </div>
      `;
    });
    alertsEl.innerHTML = html;
  }

  // Populate print-only semicircular warnings list under the metadata block
  const printSemiWarningsEl = document.getElementById('print-semicircular-warnings');
  const printSemiListEl = document.getElementById('print-semicircular-warnings-list');
  if (printSemiWarningsEl && printSemiListEl) {
    if (semiWarnings.length === 0) {
      printSemiWarningsEl.style.display = 'none';
    } else {
      printSemiWarningsEl.style.display = 'block';
      printSemiListEl.innerHTML = semiWarnings.map(w => `<li style="margin-bottom: 4px;">${w}</li>`).join('');
    }
  }

  // 2. Render all non-conflicting nearby NOTAMs for the print-only report
  const printSectionEl = document.getElementById('print-inactive-notams-section');
  if (printSectionEl) {
    if (inactiveRouteNotams.length === 0 && inactiveAerodromeNotams.length === 0) {
      printSectionEl.innerHTML = "";
    } else {
      let printHtml = `
        <div class="print-notams-header">ADDITIONAL NEARBY NOTAM INFORMATION (NO TIME/ALT OVERLAP)</div>
      `;
      
      inactiveRouteNotams.forEach(c => {
        printHtml += `
          <div class="notam-card limited">
            <div class="notam-card-header">
              <span class="notam-id">ℹ️ ${c.notamId} (${c.areaSactaName || 'ROUTE'})</span>
              <span class="notam-limits">FL${c.LOWER_VAL} - FL${c.UPPER_VAL}</span>
            </div>
            <div class="notam-card-text">${c.itemE}</div>
          </div>
        `;
      });

      inactiveAerodromeNotams.forEach(c => {
        printHtml += `
          <div class="notam-card limited">
            <div class="notam-card-header">
              <span class="notam-id">ℹ️ AD ${c.itemA} (${c.notamId})</span>
              <span class="notam-status">INFORMATIONAL</span>
            </div>
            <div class="notam-card-text">${c.itemE}</div>
          </div>
        `;
      });

      printSectionEl.innerHTML = printHtml;
    }
  }
}

// Attach event listeners
document.getElementById('clear-route-btn').addEventListener('click', clearRoute);
document.getElementById('calculate-btn').addEventListener('click', runFlightPlanningCalculations);
document.getElementById('print-pdf-btn').addEventListener('click', () => window.print());

// Local charts scanning and loading
async function checkLocalChartsDirectory() {
  try {
    const response = await fetch('/charts/');
    if (!response.ok) return; // Silent fail if directory listing is unavailable or directory doesn't exist
    const htmlText = await response.text();
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const links = Array.from(doc.querySelectorAll('a'));
    
    // Find all files ending in .zip, .tif, or .tiff
    const chartFiles = links
      .map(l => l.getAttribute('href'))
      .filter(href => href && (href.endsWith('.zip') || href.endsWith('.tif') || href.endsWith('.tiff')));
      
    if (chartFiles.length === 0) return;
    
    document.getElementById('local-charts-container').style.display = 'block';
    const listEl = document.getElementById('local-charts-list');
    listEl.innerHTML = "";
    
    chartFiles.forEach(filename => {
      const cleanName = decodeURIComponent(filename);
      
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.justify = 'space-between';
      item.style.alignItems = 'center';
      item.style.padding = '8px 10px';
      item.style.background = 'rgba(255,255,255,0.02)';
      item.style.borderRadius = '4px';
      item.style.fontSize = '12px';
      item.style.border = '1px solid rgba(255,255,255,0.05)';
      
      item.innerHTML = `
        <span style="font-family: monospace; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px;" title="${cleanName}">${cleanName}</span>
        <button class="btn btn-primary btn-xs" style="padding: 2px 8px; font-size: 10px;" onclick="loadLocalChart('${filename}')">Load</button>
      `;
      listEl.appendChild(item);
    });
  } catch (e) {
    console.log("Local charts directory scan skipped:", e);
  }
}

async function loadLocalChart(filename) {
  // Find button that triggered the action
  const button = event ? event.target : null;
  const originalText = button ? button.innerText : "Load";
  if (button) {
    button.innerText = "Loading...";
    button.disabled = true;
  }
  
  try {
    const response = await fetch(`/charts/${filename}`);
    if (!response.ok) throw new Error(`Failed to fetch /charts/${filename}`);
    const blob = await response.blob();
    const file = new File([blob], decodeURIComponent(filename), { type: blob.type });
    
    if (filename.endsWith('.zip')) {
      await handleUploadedChartFiles([file]);
    } else {
      const tfwFilename = filename.substring(0, filename.lastIndexOf('.')) + '.tfw';
      try {
        const tfwResponse = await fetch(`/charts/${tfwFilename}`);
        if (tfwResponse.ok) {
          const tfwBlob = await tfwResponse.blob();
          const tfwFile = new File([tfwBlob], decodeURIComponent(tfwFilename), { type: tfwBlob.type });
          await handleUploadedChartFiles([file, tfwFile]);
        } else {
          await handleUploadedChartFiles([file]);
        }
      } catch (e) {
        await handleUploadedChartFiles([file]);
      }
    }
  } catch (error) {
    console.error("Failed loading local chart:", error);
    alert("Error loading local chart: " + error.message);
  } finally {
    if (button) {
      button.innerText = originalText;
      button.disabled = false;
    }
  }
}

// Bind loadLocalChart to global window object
window.loadLocalChart = loadLocalChart;

// Online ENAIRE Catalog loading
const enaireCatalogUrl = "https://aip.enaire.es/AIP/CartasInsigniaImpresas-es.html";

async function loadEnaireVFRChartsCatalog() {
  try {
    const selectEl = document.getElementById('enaire-chart-select');
    if (!selectEl) return;
    
    selectEl.innerHTML = '<option value="">-- Scanning ENAIRE... --</option>';

    // Fetch ENAIRE catalog HTML directly! ENAIRE supports CORS on all resources!
    const response = await fetch(enaireCatalogUrl);
    if (!response.ok) throw new Error("Could not fetch ENAIRE catalog page");
    const htmlText = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    
    // Find all rows in table.cartasVFR500
    const rows = Array.from(doc.querySelectorAll('table.cartasVFR500 tr'));
    const options = [];

    rows.forEach(row => {
      const descCell = row.querySelector('td.desc');
      if (!descCell) return;
      const descText = descCell.innerText.trim();

      const zipLinks = Array.from(row.querySelectorAll('a[href$=".zip"]'));
      zipLinks.forEach(link => {
        let href = link.getAttribute('href');
        if (href) {
          // Resolve relative paths if any
          if (href.startsWith('..')) {
            href = 'https://aip.enaire.es/' + href.replace(/^\.\.\//, '');
          } else if (href.startsWith('/')) {
            href = 'https://aip.enaire.es' + href;
          } else if (!href.startsWith('http')) {
            href = 'https://aip.enaire.es/recursos/descargas/VFR500/' + href;
          }

          options.push({
            name: descText + (zipLinks.length > 1 ? ` (${link.getAttribute('title') || 'GeoTiff'})` : ''),
            url: href
          });
        }
      });
    });

    if (options.length === 0) {
      selectEl.innerHTML = '<option value="">No VFR charts in catalog</option>';
      return;
    }

    let selectHtml = '<option value="">-- Select ENAIRE VFR Chart --</option>';
    options.forEach(opt => {
      selectHtml += `<option value="${opt.url}">${opt.name}</option>`;
    });
    selectEl.innerHTML = selectHtml;
    
    // Enable the load button
    document.getElementById('enaire-load-btn').disabled = false;

  } catch (error) {
    console.error("Failed scanning ENAIRE VFR catalog:", error);
    const selectEl = document.getElementById('enaire-chart-select');
    if (selectEl) {
      selectEl.innerHTML = '<option value="">Error loading ENAIRE VFR catalog</option>';
    }
  }
}

async function downloadAndLoadEnaireChart() {
  const selectEl = document.getElementById('enaire-chart-select');
  const fileUrl = selectEl.value;
  if (!fileUrl) {
    alert("Please select a chart from the ENAIRE list first.");
    return;
  }

  const loadBtn = document.getElementById('enaire-load-btn');
  const originalText = loadBtn.innerText;
  loadBtn.innerText = "Downloading...";
  loadBtn.disabled = true;
  selectEl.disabled = true;

  try {
    // Download directly from ENAIRE! No CORS proxy required since ENAIRE servers return Access-Control-Allow-Origin: *
    console.log("Downloading chart directly from ENAIRE:", fileUrl);
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error("Could not download VFR chart from ENAIRE server.");

    const blob = await response.blob();
    const filename = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
    const file = new File([blob], filename, { type: blob.type });

    console.log("VFR chart downloaded. Unpacking zip payload...");
    await handleUploadedChartFiles([file]);
    console.log("Chart loaded successfully!");

  } catch (error) {
    console.error("Failed downloading ENAIRE chart:", error);
    alert("Failed to load ENAIRE chart: " + error.message);
  } finally {
    loadBtn.innerText = originalText;
    loadBtn.disabled = false;
    selectEl.disabled = false;
  }
}

// Bind load button event listener
document.getElementById('enaire-load-btn').addEventListener('click', downloadAndLoadEnaireChart);

// Initialize Page
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupChartDropZone();
  initPyodideRuntime();

  // Set default departure date-time to current local time
  const now = new Date();
  const localOffset = now.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(now.getTime() - localOffset)).toISOString().slice(0, 16);
  const depTimeInput = document.getElementById('departure-time-input');
  if (depTimeInput) {
    depTimeInput.value = localISOTime;
  }

  // Scan local folder for VFR charts
  checkLocalChartsDirectory();

  // Load online ENAIRE catalog list
  loadEnaireVFRChartsCatalog();
});
