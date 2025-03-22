// No longer need this function
// function createLocationListContainer() {
//   // Function content removed
// }// Function to load Font Awesome for icons
function loadFontAwesome() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css';
  document.head.appendChild(link);
}// Function to adjust marker size based on current zoom level
function adjustMarkersForZoom() {
  const currentZoom = map.getZoom();
  let markerSize;
  
  // Scale marker size based on zoom level
  if (currentZoom >= 18) {
    markerSize = 40; // Very close zoom
  } else if (currentZoom >= 15) {
    markerSize = 35; // Close zoom
  } else if (currentZoom >= 12) {
    markerSize = 30; // Medium zoom
  } else if (currentZoom >= 9) {
    markerSize = 25; // Far zoom
  } else {
    markerSize = 30; // Default size for very far zoom
  }
  
  // Update all markers with new size
  markers.forEach(marker => {
    marker.setIcon({
      url: "https://raw.githubusercontent.com/shrunk-scott/shopfrontsammy/main/Shopfront%20Sammy%20Logo.png",
      scaledSize: new google.maps.Size(markerSize, markerSize)
    });
  });
}let map;
let markers = [];
let infoWindows = [];
let allLocations = [];
let clusterZones = {}; // Key: final cluster id, value: google.maps.Polygon
let finalClusters = []; // Array of cluster objects: { id, features, centroid, radius, zoneGeoJSON }
const defaultCenter = { lat: -27.5, lng: 153.0 };
const defaultZoom = 7;
// Blue color palette for clusters
const clusterColorPalette = [
  "#1e88e5", "#0d47a1", "#64b5f6", "#5c6bc0",
  "#283593", "#1565c0", "#42a5f5", "#2962ff",
  "#0277bd", "#039be5", "#29b6f6", "#01579b"
];

// E-bike specific parameters
const EBIKE_MAX_DAILY_DISTANCE = 40; // Maximum e-bike travel distance in kilometers per day
const EBIKE_MAX_SPEED = 25; // Maximum e-bike speed in km/h
const EBIKE_RANGE = 30; // Maximum e-bike range in kilometers on a single charge
const MAX_SITES_PER_CLUSTER = 20; // Maximum sites per cluster for efficient servicing

function loadScript() {
  const apiKey = 'AIzaSyDM5PYHiEkRV4tCdBpP7tKrRtobVXoCzSo'; // Replace if needed
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap`;
  script.async = true;
  script.defer = true;
  script.onerror = function() {
    console.error('Google Maps script failed to load. Check API key and network connection.');
    alert('Failed to load Google Maps. Please check the API key or internet connection.');
  };
  document.head.appendChild(script);
}

function initMap() {
  if (typeof google === 'undefined' || !google.maps) {
    console.error('Google Maps API failed to load.');
    alert('Google Maps failed to load. Please check API key permissions.');
    return;
  }
  
  map = new google.maps.Map(document.getElementById('map'), {
    zoom: defaultZoom,
    center: defaultCenter,
    mapTypeId: google.maps.MapTypeId.ROADMAP
  });
  
  // Add zoom changed event listener to handle marker sizes
  map.addListener('zoom_changed', function() {
    adjustMarkersForZoom();
  });
  
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetView);
  } else {
    console.warn("Reset button not found.");
  }
  
  // Create location list container - much simpler approach
  const locationListHTML = `
    <div id="locationListOverlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9998;">
      <div id="locationList" style="position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:white; padding:20px; max-width:500px; width:90%; max-height:80vh; border-radius:12px; box-shadow:0 5px 20px rgba(0,0,0,0.2); z-index:9999; overflow:hidden; display:flex; flex-direction:column; border:2px solid #1c1ce0;">
        <h3 id="locationListTitle" style="margin-top:0; padding-bottom:10px; border-bottom:1px solid #eee; color:#1c1ce0;">Locations</h3>
        <div id="locationListItems" style="overflow-y:auto; max-height:calc(80vh - 100px);"></div>
        <button id="locationListClose" style="position:absolute; top:10px; right:10px; background:none; border:none; font-size:24px; cursor:pointer; color:#999;">×</button>
      </div>
    </div>
  `;
  
  // Append to body
  document.body.insertAdjacentHTML('beforeend', locationListHTML);
  
  // Add event listener for close button
  document.getElementById('locationListClose').addEventListener('click', function() {
    document.getElementById('locationListOverlay').style.display = 'none';
  });
  
  // Close when clicking on the overlay background
  document.getElementById('locationListOverlay').addEventListener('click', function(e) {
    if (e.target === this) {
      this.style.display = 'none';
    }
  });
  
  
  
  Papa.parse("https://raw.githubusercontent.com/shrunk-scott/shopfrontsammy/main/Untitled%20Spreadsheet.csv", {
    download: true,
    header: true,
    complete: function(results) {
      console.log("CSV data loaded:", results.data);
      allLocations = results.data.filter(loc => {
        const lat = parseFloat(loc.Latitude);
        const lng = parseFloat(loc.Longitude);
        return !isNaN(lat) && !isNaN(lng);
      });
      
      // Sort locations by latitude to help with regional clustering
      allLocations.sort((a, b) => parseFloat(a.Latitude) - parseFloat(b.Latitude));
      
      addMarkers();
      optimizedEBikeClustering();
      updateSiteCount();
      updateClusterFilter();
    },
    error: function(err) {
      console.error("Error loading CSV file:", err);
      alert("Error loading CSV file");
    }
  });
}

function addMarkers() {
  clearMarkers();
  console.log("Total valid locations:", allLocations.length);
  
  allLocations.forEach((location, index) => {
    const lat = parseFloat(location.Latitude);
    const lng = parseFloat(location.Longitude);
    
    // Initial marker size is larger now
    let marker = new google.maps.Marker({
      position: { lat: lat, lng: lng },
      map: map,
      title: location.Name,
      icon: {
        url: "https://raw.githubusercontent.com/shrunk-scott/shopfrontsammy/main/Shopfront%20Sammy%20Logo.png",
        scaledSize: new google.maps.Size(30, 30)
      },
      // Improve marker visibility
      optimized: false,
      zIndex: 10
    });
    
    // Assign the marker its cluster id
    marker.cluster = location.cluster;
    
    // Create info window but don't set content yet (will update after clustering)
    let infoWindow = new google.maps.InfoWindow();
    infoWindows.push(infoWindow);
    
          marker.addListener("click", function() {
      // Close all other info windows first
      infoWindows.forEach(iw => iw.close());
      
      // Update info window content with latest cluster information
      let clusterName = marker.cluster ? `Cluster ${marker.cluster}` : 'Processing...';
      infoWindow.setContent(`
        <div style="padding: 5px;">
          <strong>${location.Name}</strong><br>
          ${location.Address}<br>
          <em>${clusterName}</em>
        </div>
      `);
      
      map.setZoom(15);
      map.setCenter(marker.getPosition());
      infoWindow.open(map, marker);
    });
    
    markers.push(marker);
  });
  
  console.log("Markers added:", markers.length);
}

function clearMarkers() {
  markers.forEach(marker => marker.setMap(null));
  markers = [];
  infoWindows.forEach(iw => iw.close());
  infoWindows = [];
  
  // Also clear cluster zones
  for (let id in clusterZones) {
    if (clusterZones.hasOwnProperty(id)) {
      clusterZones[id].setMap(null);
    }
  }
  clusterZones = {};
}

function resetView() {
  console.log("Reset view clicked");
  map.setZoom(defaultZoom);
  map.setCenter(defaultCenter);
  infoWindows.forEach(iw => iw.close());
  
  // Reset cluster filters (all selected)
  let checkboxes = document.querySelectorAll('#clusterFilter input[type="checkbox"]');
  checkboxes.forEach(cb => { 
    cb.checked = true; 
  });
  
  // Show all cluster zones and markers
  for (let id in clusterZones) {
    if (clusterZones.hasOwnProperty(id)) {
      clusterZones[id].setMap(map);
    }
  }
  markers.forEach(marker => marker.setMap(map));
  
  updateSiteCount();
}

function updateSiteCount() {
  const siteCountElem = document.getElementById('siteCount');
  if (siteCountElem) {
    let visibleCount = markers.filter(marker => marker.getMap() !== null).length;
    let totalClusters = Object.keys(clusterZones).length;
    siteCountElem.textContent = `Total Sites: ${visibleCount} in ${totalClusters} clusters`;
    
    // Make the count more prominent on mobile
    if (window.innerWidth <= 767) {
      siteCountElem.style.fontWeight = '500';
    }
  }
}

function optimizedEBikeClustering() {
  console.log("Starting optimized e-bike clustering...");
  
  // Create Turf.js features from location data
  let features = allLocations.map(loc => {
    const lat = parseFloat(loc.Latitude);
    const lng = parseFloat(loc.Longitude);
    return turf.point([lng, lat], { name: loc.Name, address: loc.Address });
  });
  
  if (features.length === 0) {
    console.warn("No valid features for clustering.");
    return;
  }
  
  // Create a feature collection for all locations
  let allPointsFC = turf.featureCollection(features);
  
  // Use DBSCAN clustering with parameters optimized for e-bike travel
  // Adjust clustering distance based on e-bike range (with some margin)
  let clustered = turf.clustersDbscan(allPointsFC, EBIKE_RANGE * 0.2, { 
    units: 'kilometers', 
    minPoints: 2  // Require at least 2 points to form a cluster
  });
  
  console.log("Initial DBSCAN clustering results:", clustered);
  
  // Ensure all points are assigned to a cluster (including noise points)
  let clusterIdCounter = 0;
  let pointsInClusters = new Set();
  
  // First pass: identify points in clusters
  clustered.features.forEach(feature => {
    if (feature.properties.cluster !== undefined && feature.properties.cluster >= 0) {
      pointsInClusters.add(JSON.stringify(feature.geometry.coordinates));
    }
  });
  
  // Create initial clusters
  let clusters = {};
  clustered.features.forEach(feature => {
    let cid;
    
    if (feature.properties.cluster !== undefined && feature.properties.cluster >= 0) {
      // Point is already in a cluster
      cid = "cluster_" + feature.properties.cluster;
    } else {
      // Point is noise (not in any cluster)
      // Assign to nearest existing cluster if within range, or create a new cluster
      let nearestCluster = findNearestCluster(feature, clusters);
      
      if (nearestCluster && nearestCluster.distance <= EBIKE_RANGE) {
        cid = nearestCluster.id;
      } else {
        // Create a new cluster for this isolated point
        cid = "cluster_isolated_" + clusterIdCounter++;
      }
    }
    
    if (!clusters[cid]) clusters[cid] = [];
    clusters[cid].push(feature);
  });
  
  console.log("Initial clusters with all points assigned:", clusters);
  
  // Optimize clusters for e-bike routing
  let finalClusterIdCounter = 0;
  finalClusters = [];
  
  for (let cid in clusters) {
    let clusterPoints = clusters[cid];
    
    // Split large clusters to ensure they're manageable for e-bike servicing
    if (clusterPoints.length > MAX_SITES_PER_CLUSTER) {
      // Sort by latitude to help with creating geographically coherent subclusters
      clusterPoints.sort((a, b) => a.geometry.coordinates[1] - b.geometry.coordinates[1]);
      
      let numSubclusters = Math.ceil(clusterPoints.length / MAX_SITES_PER_CLUSTER);
      console.log(`Splitting cluster ${cid} into ${numSubclusters} subclusters`);
      
      for (let i = 0; i < numSubclusters; i++) {
        let subPoints = clusterPoints.slice(
          i * MAX_SITES_PER_CLUSTER, 
          (i + 1) * MAX_SITES_PER_CLUSTER
        );
        
        let subClusterId = String(finalClusterIdCounter++);
        
        // Create a feature collection for this subcluster
        let subClusterFC = turf.featureCollection(subPoints);
        
        // Calculate centroid for this subcluster
        let centroidFeature = turf.centroid(subClusterFC);
        let centroid = centroidFeature.geometry.coordinates;
        
        // Calculate radius (maximum distance from centroid to any point)
        let maxDist = calculateMaxDistance(centroidFeature, subPoints);
        
        // Create final cluster object
        finalClusters.push({
          id: subClusterId,
          features: subPoints,
          centroid: centroid,
          radius: maxDist,
          pointCount: subPoints.length
        });
        
        // Update cluster IDs in location data
        updateLocationClusterIds(subPoints, subClusterId);
      }
    } else {
      let clusterId = String(finalClusterIdCounter++);
      
      // Create a feature collection for this cluster
      let clusterFC = turf.featureCollection(clusterPoints);
      
      // Calculate centroid
      let centroidFeature = turf.centroid(clusterFC);
      let centroid = centroidFeature.geometry.coordinates;
      
      // Calculate radius (maximum distance from centroid to any point)
      let maxDist = calculateMaxDistance(centroidFeature, clusterPoints);
      
      // Create final cluster object
      finalClusters.push({
        id: clusterId,
        features: clusterPoints,
        centroid: centroid,
        radius: maxDist,
        pointCount: clusterPoints.length
      });
      
      // Update cluster IDs in location data
      updateLocationClusterIds(clusterPoints, clusterId);
    }
  }
  
  console.log("Final optimized clusters:", finalClusters);
  
  // Create zones for each cluster
  createClusterZones();
}

function findNearestCluster(point, clusters) {
  let minDistance = Infinity;
  let nearestClusterId = null;
  
  for (let cid in clusters) {
    let clusterPoints = clusters[cid];
    
    // Skip empty clusters
    if (clusterPoints.length === 0) continue;
    
    // Calculate centroid of the cluster
    let clusterFC = turf.featureCollection(clusterPoints);
    let centroid = turf.centroid(clusterFC);
    
    // Calculate distance from point to cluster centroid
    let distance = turf.distance(point, centroid, { units: 'kilometers' });
    
    if (distance < minDistance) {
      minDistance = distance;
      nearestClusterId = cid;
    }
  }
  
  return nearestClusterId ? { id: nearestClusterId, distance: minDistance } : null;
}

function calculateMaxDistance(centroid, points) {
  let maxDist = 0;
  points.forEach(pt => {
    let d = turf.distance(centroid, pt, { units: 'kilometers' });
    if (d > maxDist) maxDist = d;
  });
  
  // Add a 10% buffer
  return maxDist * 1.1;
}

function updateLocationClusterIds(points, clusterId) {
  points.forEach(pt => {
    allLocations.forEach(loc => {
      let latVal = parseFloat(loc.Latitude);
      let lngVal = parseFloat(loc.Longitude);
      if (Math.abs(latVal - pt.geometry.coordinates[1]) < 1e-5 &&
          Math.abs(lngVal - pt.geometry.coordinates[0]) < 1e-5) {
        loc.cluster = clusterId;
      }
    });
  });
  
  // Also update marker cluster IDs
  markers.forEach(marker => {
    let pos = marker.getPosition();
    points.forEach(pt => {
      if (Math.abs(pos.lat() - pt.geometry.coordinates[1]) < 1e-5 &&
          Math.abs(pos.lng() - pt.geometry.coordinates[0]) < 1e-5) {
        marker.cluster = clusterId;
      }
    });
  });
}

function createClusterZones() {
  // Create convex hulls for each cluster with buffer
  finalClusters.forEach((cluster, idx) => {
    // Skip if no features
    if (!cluster.features || cluster.features.length === 0) return;
    
    try {
      // For single-point clusters, create a circle
      if (cluster.features.length === 1) {
        let bufferSize = Math.min(2, EBIKE_RANGE / 10); // Small buffer for single points
        let circleZone = turf.circle(cluster.centroid, bufferSize, { steps: 64, units: 'kilometers' });
        cluster.zoneGeoJSON = circleZone;
      } 
      // For clusters with 2 points, create a buffered line
      else if (cluster.features.length === 2) {
        let lineString = turf.lineString([
          cluster.features[0].geometry.coordinates,
          cluster.features[1].geometry.coordinates
        ]);
        let bufferedLine = turf.buffer(lineString, 1, { units: 'kilometers' });
        cluster.zoneGeoJSON = bufferedLine;
      }
      // For clusters with 3+ points, create a convex hull with buffer
      else {
        let clusterFC = turf.featureCollection(cluster.features);
        let hull = turf.convex(clusterFC);
        
        // Add buffer around the hull for e-bike maneuverability
        let bufferedHull = turf.buffer(hull, 1, { units: 'kilometers' });
        cluster.zoneGeoJSON = bufferedHull;
      }
      
      // Create a Google Maps polygon for this cluster zone
      let color = clusterColorPalette[idx % clusterColorPalette.length];
      let polygon = createPolygonFromGeoJSON(cluster.zoneGeoJSON, color);
      
      // Add click listener to zoom to cluster and show locations
      polygon.addListener('click', function() {
        let bounds = new google.maps.LatLngBounds();
        this.getPath().forEach(point => bounds.extend(point));
        map.fitBounds(bounds);
        
        // Show cluster info and locations
        showClusterLocations(cluster.id);
      });
      
      clusterZones[cluster.id] = polygon;
    } catch (error) {
      console.error(`Error creating zone for cluster ${cluster.id}:`, error);
    }
  });
}

function createPolygonFromGeoJSON(geoJSON, color) {
  let coords;
  
  // Handle different GeoJSON types
  if (geoJSON.geometry.type === 'Polygon') {
    coords = geoJSON.geometry.coordinates[0];
  } else if (geoJSON.geometry.type === 'MultiPolygon') {
    // Take the first polygon from a MultiPolygon
    coords = geoJSON.geometry.coordinates[0][0];
  } else {
    console.error('Unsupported GeoJSON type:', geoJSON.geometry.type);
    return null;
  }
  
  let path = coords.map(coord => ({ lat: coord[1], lng: coord[0] }));
  
  return new google.maps.Polygon({
    paths: path,
    strokeColor: color,
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: color,
    fillOpacity: 0.35,
    map: map
  });
}

function updateClusterFilter() {
  let filterContainer = document.getElementById('clusterFilter');
  if (!filterContainer) {
    filterContainer = document.createElement('div');
    filterContainer.id = 'clusterFilter';
    filterContainer.className = 'filter-container';
    const container = document.querySelector('.container');
    container.insertBefore(filterContainer, document.getElementById('map'));
  }
  
  filterContainer.innerHTML = "<strong>Clusters: </strong>";
  
  // Update all info windows with final cluster information
  updateInfoWindows();
  
  // Add "Select All/None" controls
  let selectAllBtn = document.createElement('button');
  selectAllBtn.textContent = "Select All";
  selectAllBtn.className = "filter-button";
  selectAllBtn.addEventListener('click', function() {
    document.querySelectorAll('#clusterFilter input[type="checkbox"]').forEach(cb => {
      cb.checked = true;
      cb.dispatchEvent(new Event('change'));
    });
  });
  
  let selectNoneBtn = document.createElement('button');
  selectNoneBtn.textContent = "Select None";
  selectNoneBtn.className = "filter-button";
  selectNoneBtn.addEventListener('click', function() {
    document.querySelectorAll('#clusterFilter input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
      cb.dispatchEvent(new Event('change'));
    });
  });
  
  filterContainer.appendChild(selectAllBtn);
  filterContainer.appendChild(selectNoneBtn);
  filterContainer.appendChild(document.createElement('br'));
  
  // Create filter items for each cluster
  finalClusters.forEach(cluster => {
    let filterItem = document.createElement('div');
    filterItem.className = 'filter-item';
    
    let checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'cluster_' + cluster.id;
    checkbox.className = 'modern-checkbox';
    checkbox.checked = true;
    checkbox.addEventListener('change', function() {
      if (this.checked) {
        if (clusterZones[cluster.id]) clusterZones[cluster.id].setMap(map);
      } else {
        if (clusterZones[cluster.id]) clusterZones[cluster.id].setMap(null);
      }
      
      markers.forEach(marker => {
        if (marker.cluster === cluster.id) {
          marker.setMap(this.checked ? map : null);
        }
      });
      
      updateSiteCount();
    });
    
    let label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.className = 'filter-label';
    
    let colorIndicator = document.createElement('span');
    colorIndicator.className = 'color-indicator';
    colorIndicator.style.backgroundColor = clusterColorPalette[parseInt(cluster.id) % clusterColorPalette.length];
    
    let labelText = document.createElement('span');
    labelText.textContent = `Cluster ${cluster.id} (${cluster.pointCount} sites)`;
    labelText.className = 'filter-text';
    labelText.addEventListener('click', function(e) {
      e.stopPropagation();
      if (clusterZones[cluster.id]) {
        let bounds = new google.maps.LatLngBounds();
        clusterZones[cluster.id].getPath().forEach(point => bounds.extend(point));
        map.fitBounds(bounds);
      }
    });
    
    label.appendChild(colorIndicator);
    label.appendChild(labelText);
    
    filterItem.appendChild(checkbox);
    filterItem.appendChild(label);
    
    filterContainer.appendChild(filterItem);
  });
}

// Function to show locations within a cluster - simplified approach
function showClusterLocations(clusterId) {
  console.log("Showing locations for cluster:", clusterId);
  
  // Get locations in this cluster
  const clusterLocations = allLocations.filter(loc => loc.cluster === clusterId);
  console.log("Found locations:", clusterLocations.length);
  
  // Get overlay and list elements
  const overlay = document.getElementById('locationListOverlay');
  const listTitle = document.getElementById('locationListTitle');
  const listItems = document.getElementById('locationListItems');
  
  if (!overlay || !listTitle || !listItems) {
    console.error("Location list elements not found!");
    alert("Could not display location list. Please refresh the page and try again.");
    return;
  }
  
  // Update title
  listTitle.textContent = `Cluster ${clusterId} Locations (${clusterLocations.length})`;
  
  // Clear previous items
  listItems.innerHTML = '';
  
  // Sort locations alphabetically by name
  clusterLocations.sort((a, b) => a.Name.localeCompare(b.Name));
  
  // Add each location to the list
  clusterLocations.forEach(location => {
    const itemHTML = `
      <div class="location-item" style="padding:12px; border-bottom:1px solid #eef; cursor:pointer; transition:background-color 0.2s;" 
           onmouseover="this.style.backgroundColor='#f0f4ff'" 
           onmouseout="this.style.backgroundColor='transparent'">
        <strong style="display:block; margin-bottom:5px;">${location.Name}</strong>
        <div>${location.Address}</div>
      </div>
    `;
    
    listItems.insertAdjacentHTML('beforeend', itemHTML);
    
    // Get the element we just added
    const item = listItems.lastElementChild;
    
    // Add click event
    item.addEventListener('click', function() {
      const lat = parseFloat(location.Latitude);
      const lng = parseFloat(location.Longitude);
      
      // Find the corresponding marker
      const marker = markers.find(m => {
        const pos = m.getPosition();
        return Math.abs(pos.lat() - lat) < 1e-5 && Math.abs(pos.lng() - lng) < 1e-5;
      });
      
      if (marker) {
        // Center on the marker
        map.setCenter(marker.getPosition());
        map.setZoom(16);
        
        // Open the info window
        const infoWindowIndex = markers.indexOf(marker);
        if (infoWindowIndex >= 0 && infoWindows[infoWindowIndex]) {
          // Close any open info windows
          infoWindows.forEach(iw => iw.close());
          infoWindows[infoWindowIndex].open(map, marker);
        }
      }
      
      // Close the location list
      overlay.style.display = 'none';
    });
  });
  
  // Show the container
  overlay.style.display = 'block';
}

function updateInfoWindows() {
  markers.forEach((marker, index) => {
    const location = allLocations.find(loc => {
      const lat = parseFloat(loc.Latitude);
      const lng = parseFloat(loc.Longitude);
      return Math.abs(lat - marker.getPosition().lat()) < 1e-5 &&
             Math.abs(lng - marker.getPosition().lng()) < 1e-5;
    });
    
    if (location && infoWindows[index]) {
      let clusterName = location.cluster ? `Cluster ${location.cluster}` : 'Unassigned';
      let clusterColor = '';
      
      // Add color information if available
      if (location.cluster && finalClusters.length > 0) {
        const clusterIdx = parseInt(location.cluster) % clusterColorPalette.length;
        const color = clusterColorPalette[clusterIdx];
        clusterColor = `<span class="color-indicator" style="display:inline-block; width:10px; height:10px; background-color:${color}; border-radius:50%; margin-right:5px;"></span>`;
      }
      
      infoWindows[index].setContent(`
        <div style="padding: 8px; font-size: 16px;">
          <strong style="font-size: 18px; display: block; margin-bottom: 8px;">${location.Name}</strong>
          <div style="margin-bottom: 8px;">${location.Address}</div>
          <div style="display: flex; align-items: center; font-weight: 500; color: #1c1ce0;">
            ${clusterColor}${clusterName}
          </div>
        </div>
      `);
    }
  });
}

window.onload = loadScript;
