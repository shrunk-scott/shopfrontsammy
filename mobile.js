let map;
let markers = [];
let infoWindows = [];
let allLocations = [];
let clusterZones = {}; // Key: final cluster id, value: google.maps.Polygon
let finalClusters = []; // Array of cluster objects: { id, features, centroid, radius, zoneGeoJSON }
const defaultCenter = { lat: -27.5, lng: 153.0 };
const defaultZoom = 7;
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

document.addEventListener('DOMContentLoaded', function() {
  initApp();
});

function initApp() {
  // Add event listeners for buttons
  document.getElementById('resetBtn').addEventListener('click', resetView);
  document.getElementById('selectAllBtn').addEventListener('click', selectAllClusters);
  document.getElementById('selectNoneBtn').addEventListener('click', selectNoneClusters);
  document.getElementById('locationListClose').addEventListener('click', hideLocationList);
  
  // Initialize the map
  loadGoogleMaps();
}

function loadGoogleMaps() {
  const apiKey = 'AIzaSyDM5PYHiEkRV4tCdBpP7tKrRtobVXoCzSo'; // Replace if needed
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap`;
  script.async = true;
  script.defer = true;
  script.onerror = function() {
    console.error('Google Maps script failed to load. Check API key and network connection.');
    alert('Failed to load Google Maps. Please check your internet connection.');
  };
  document.head.appendChild(script);
}

// This function is called by the Google Maps API once it's loaded
function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    zoom: defaultZoom,
    center: defaultCenter,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    // Mobile optimized controls
    zoomControl: true,
    mapTypeControl: false,
    scaleControl: true,
    streetViewControl: false,
    rotateControl: false,
    fullscreenControl: false
  });
  
  // Add zoom changed event listener to handle marker sizes
  map.addListener('zoom_changed', adjustMarkersForZoom);
  
  // Also adjust markers on window resize for responsive design
  window.addEventListener('resize', adjustMarkersForZoom);
  
  // Load location data
  loadLocationData();
}

function loadLocationData() {
  // Show loading indicator
  document.getElementById('siteCount').textContent = 'Loading data...';
  
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
      
      // Process the data
      addMarkers();
      optimizedEBikeClustering();
      updateSiteCount();
      createClusterButtons();
    },
    error: function(err) {
      console.error("Error loading CSV file:", err);
      document.getElementById('siteCount').textContent = 'Error loading data';
    }
  });
}

function addMarkers() {
  clearMarkers();
  console.log("Total valid locations:", allLocations.length);
  
  allLocations.forEach((location, index) => {
    const lat = parseFloat(location.Latitude);
    const lng = parseFloat(location.Longitude);
    
    let marker = new google.maps.Marker({
      position: { lat: lat, lng: lng },
      map: map,
      title: location.Name,
      icon: {
        url: "https://raw.githubusercontent.com/shrunk-scott/shopfrontsammy/main/Shopfront%20Sammy%20Logo.png",
        scaledSize: new google.maps.Size(45, 45) // Larger for mobile
      },
      optimized: false,
      zIndex: 10
    });
    
    // Assign the marker its cluster id
    marker.cluster = location.cluster;
    
    // Create info window
    let infoWindow = new google.maps.InfoWindow();
    infoWindows.push(infoWindow);
    
    marker.addListener("click", function() {
      // Close all other info windows first
      infoWindows.forEach(iw => iw.close());
      
      // Update info window content
      let clusterName = marker.cluster ? `Cluster ${marker.cluster}` : 'Unassigned';
      let clusterColor = '';
      
      if (marker.cluster) {
        const clusterIdx = parseInt(marker.cluster) % clusterColorPalette.length;
        const color = clusterColorPalette[clusterIdx];
        clusterColor = `<span style="display:inline-block; width:12px; height:12px; background-color:${color}; border-radius:50%; margin-right:5px;"></span>`;
      }
      
      infoWindow.setContent(`
        <div style="padding: 10px; font-size: 16px;">
          <strong style="font-size: 18px; display: block; margin-bottom: 8px;">${location.Name}</strong>
          <div style="margin-bottom: 8px;">${location.Address}</div>
          <div style="display: flex; align-items: center; font-weight: 500; color: #1c1ce0;">
            ${clusterColor}${clusterName}
          </div>
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
        
        // Show cluster locations
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
    strokeWeight: 3,
    fillColor: color,
    fillOpacity: 0.35,
    map: map
  });
}

function createClusterButtons() {
  const filterContainer = document.getElementById('clusterFilter');
  filterContainer.innerHTML = ''; // Clear existing content
  
  // Sort clusters by ID for consistent order
  finalClusters.sort((a, b) => parseInt(a.id) - parseInt(b.id));
  
  // Create a button for each cluster
  finalClusters.forEach(cluster => {
    const clusterColor = clusterColorPalette[parseInt(cluster.id) % clusterColorPalette.length];
    
    const button = document.createElement('button');
    button.className = 'cluster-btn active'; // Start as active
    button.dataset.clusterId = cluster.id;
    
    button.innerHTML = `
      <span class="cluster-indicator" style="background-color: ${clusterColor};"></span>
      <span class="cluster-label">Cluster ${cluster.id} (${cluster.pointCount} sites)</span>
    `;
    
    // Toggle cluster visibility on click
    button.addEventListener('click', function(e) {
      this.classList.toggle('active');
      const isActive = this.classList.contains('active');
      
      if (isActive) {
        if (clusterZones[cluster.id]) clusterZones[cluster.id].setMap(map);
        markers.forEach(marker => {
          if (marker.cluster === cluster.id) {
            marker.setMap(map);
          }
        });
      } else {
        if (clusterZones[cluster.id]) clusterZones[cluster.id].setMap(null);
        markers.forEach(marker => {
          if (marker.cluster === cluster.id) {
            marker.setMap(null);
          }
        });
      }
      
      updateSiteCount();
    });
    
    // Double-tap to view locations
    let lastTap = 0;
    button.addEventListener('touchend', function(e) {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;
      
      if (tapLength < 300 && tapLength > 0) {
        // Double tap detected
        e.preventDefault();
        if (clusterZones[cluster.id]) {
          // Zoom to cluster
          let bounds = new google.maps.LatLngBounds();
          clusterZones[cluster.id].getPath().forEach(point => bounds.extend(point));
          map.fitBounds(bounds);
          
          // Show locations list
          showClusterLocations(cluster.id);
        }
      }
      
      lastTap = currentTime;
    });
    
    // Also support dblclick for testing on desktop
    button.addEventListener('dblclick', function(e) {
      e.preventDefault();
      if (clusterZones[cluster.id]) {
        // Zoom to cluster
        let bounds = new google.maps.LatLngBounds();
        clusterZones[cluster.id].getPath().forEach(point => bounds.extend(point));
        map.fitBounds(bounds);
        
        // Show locations list
        showClusterLocations(cluster.id);
      }
    });
    
    filterContainer.appendChild(button);
  });
}

function showClusterLocations(clusterId) {
  console.log("Showing locations for cluster:", clusterId);
  
  // Get locations in this cluster
  const clusterLocations = allLocations.filter(loc => loc.cluster === clusterId);
  console.log("Found locations:", clusterLocations.length);
  
  if (clusterLocations.length === 0) {
    alert('No locations found in this cluster.');
    return;
  }
  
  // Get overlay and list elements
  const overlay = document.getElementById('locationListOverlay');
  const listTitle = document.getElementById('locationListTitle');
  const listItems = document.getElementById('locationListItems');
  
  // Update title
  listTitle.textContent = `Cluster ${clusterId} Locations (${clusterLocations.length})`;
  
  // Clear previous items
  listItems.innerHTML = '';
  
  // Sort locations alphabetically by name
  clusterLocations.sort((a, b) => a.Name.localeCompare(b.Name));
  
  // Add each location to the list
  clusterLocations.forEach(location => {
    const item = document.createElement('div');
    item.className = 'location-item';
    item.innerHTML = `
      <strong>${location.Name}</strong>
      <div>${location.Address}</div>
    `;
    
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
      
      // Hide the location list
      hideLocationList();
    });
    
    listItems.appendChild(item);
  });
  
  // Show the overlay
  overlay.style.display = 'flex';
  
  // Prevent scrolling of background content
  document.body.style.overflow = 'hidden';
}

function hideLocationList() {
  document.getElementById('locationListOverlay').style.display = 'none';
  document.body.style.overflow = 'auto'; // Restore scrolling
}

function selectAllClusters() {
  document.querySelectorAll('.cluster-btn').forEach(btn => {
    btn.classList.add('active');
    const clusterId = btn.dataset.clusterId;
    if (clusterZones[clusterId]) clusterZones[clusterId].setMap(map);
    markers.forEach(marker => {
      if (marker.cluster === clusterId) {
        marker.setMap(map);
      }
    });
  });
  updateSiteCount();
}

function selectNoneClusters() {
  document.querySelectorAll('.cluster-btn').forEach(btn => {
    btn.classList.remove('active');
    const clusterId = btn.dataset.clusterId;
    if (clusterZones[clusterId]) clusterZones[clusterId].setMap(null);
    markers.forEach(marker => {
      if (marker.cluster === clusterId) {
        marker.setMap(null);
      }
    });
  });
  updateSiteCount();
}

function resetView() {
  map.setZoom(defaultZoom);
  map.setCenter(defaultCenter);
  infoWindows.forEach(iw => iw.close());
  
  // Reset cluster filters (all selected)
  selectAllClusters();
}

function updateSiteCount() {
  const siteCountElem = document.getElementById('siteCount');
  if (siteCountElem) {
    let visibleCount = markers.filter(marker => marker.getMap() !== null).length;
    let totalClusters = Object.keys(clusterZones).length;
    siteCountElem.textContent = `Total Sites: ${visibleCount} in ${totalClusters} clusters`;
  }
}

function adjustMarkersForZoom() {
  const currentZoom = map.getZoom();
  let markerSize;
  
  // Scale marker size based on zoom level - optimized for mobile
  if (currentZoom >= 18) {
    markerSize = 55; // Very close zoom
  } else if (currentZoom >= 15) {
    markerSize = 50; // Close zoom
  } else if (currentZoom >= 12) {
    markerSize = 45; // Medium zoom
  } else {
    markerSize = 40; // Default for farther zoom levels
  }
  
  // Update all markers with new size
  markers.forEach(marker => {
    marker.setIcon({
      url: "https://raw.githubusercontent.com/shrunk-scott/shopfrontsammy/main/Shopfront%20Sammy%20Logo.png",
      scaledSize: new google.maps.Size(markerSize, markerSize)
    });
  });
}

// Handle device orientation change
window.addEventListener('orientationchange', function() {
  // Give the browser time to adjust
  setTimeout(function() {
    google.maps.event.trigger(map, 'resize');
    
    // If we have clusters, fit the map to show all markers
    if (markers.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach(marker => {
        if (marker.getVisible()) {
          bounds.extend(marker.getPosition());
        }
      });
      map.fitBounds(bounds);
    }
  }, 200);
});
