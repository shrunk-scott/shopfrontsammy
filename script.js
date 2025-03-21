let map;
let markers = [];
let infoWindows = [];
let allLocations = [];
let clusterCircles = {}; // Mapping cluster id => google.maps.Circle
const defaultCenter = { lat: -27.5, lng: 153.0 };
const defaultZoom = 7;

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
  
  // Initialize the map.
  map = new google.maps.Map(document.getElementById('map'), {
    zoom: defaultZoom,
    center: defaultCenter,
    mapTypeId: google.maps.MapTypeId.ROADMAP
  });
  
  // Attach Reset View button event.
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetView);
  } else {
    console.warn("Reset button not found.");
  }
  
  // Load CSV data.
  Papa.parse("https://raw.githubusercontent.com/shrunk-scott/shopfrontsammy/main/Untitled%20Spreadsheet.csv", {
    download: true,
    header: true,
    complete: function(results) {
      console.log("CSV data loaded:", results.data);
      allLocations = results.data;
      processClustering();
      addMarkers();
      updateSiteCount();
      updateClusterFilter();
    },
    error: function(err) {
      console.error("Error loading CSV file:", err);
      alert("Error loading CSV file");
    }
  });
}

function processClustering() {
  // Convert each location into a GeoJSON Point.
  let features = allLocations.map(loc => {
    const lat = parseFloat(loc.Latitude);
    const lng = parseFloat(loc.Longitude);
    if (isNaN(lat) || isNaN(lng)) return null;
    return turf.point([lng, lat]);
  }).filter(f => f !== null);
  
  if (features.length === 0) {
    console.warn("No valid features for clustering.");
    return;
  }
  
  let fc = turf.featureCollection(features);
  // Cluster with DBSCAN (7 km threshold).
  let clustered = turf.clustersDbscan(fc, 7, { units: 'kilometers' });
  console.log("Clustered features:", clustered.features);
  
  // For each feature with a valid cluster id, match it to the corresponding location (by coordinates).
  // We'll use a small tolerance to match coordinates.
  const tol = 1e-5;
  clustered.features.forEach(feature => {
    if (feature.properties.cluster === undefined || feature.properties.cluster < 0) return;
    const [lng, lat] = feature.geometry.coordinates;
    allLocations.forEach(loc => {
      const locLat = parseFloat(loc.Latitude);
      const locLng = parseFloat(loc.Longitude);
      if (Math.abs(locLat - lat) < tol && Math.abs(locLng - lng) < tol) {
        loc.cluster = feature.properties.cluster;
      }
    });
  });
  
  // Group locations by cluster id.
  let clusters = {};
  allLocations.forEach(loc => {
    if (loc.cluster !== undefined && loc.cluster >= 0) {
      if (!clusters[loc.cluster]) clusters[loc.cluster] = [];
      clusters[loc.cluster].push(loc);
    }
  });
  
  console.log("Clusters:", clusters);
  
  // Define a palette of colors for the clusters.
  const colors = ["#FF5733", "#33FF57", "#3357FF", "#F39C12", "#8E44AD", "#16A085", "#D35400", "#27AE60"];
  let clusterIds = Object.keys(clusters);
  clusterIds.forEach((clusterId, idx) => {
    let clusterLocations = clusters[clusterId];
    // Create GeoJSON points for the cluster.
    let points = clusterLocations.map(loc => {
      return turf.point([parseFloat(loc.Longitude), parseFloat(loc.Latitude)]);
    });
    let fcCluster = turf.featureCollection(points);
    let centroidFeature = turf.centroid(fcCluster);
    let centroid = centroidFeature.geometry.coordinates; // [lng, lat]
    
    // Find maximum distance from centroid.
    let maxDistance = 0;
    points.forEach(pt => {
      let d = turf.distance(centroidFeature, pt, { units: 'kilometers' });
      if (d > maxDistance) maxDistance = d;
    });
    // Add 10% buffer.
    maxDistance *= 1.1;
    
    let color = colors[idx % colors.length];
    
    // Create a circle representing the service zone.
    let circle = new google.maps.Circle({
      strokeColor: color,
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: color,
      fillOpacity: 0.35,
      map: map,
      center: { lat: centroid[1], lng: centroid[0] },
      radius: maxDistance * 1000 // convert km to meters.
    });
    
    // Save the circle keyed by cluster id.
    clusterCircles[clusterId] = circle;
  });
  
  console.log("Service zones created for clusters:", Object.keys(clusterCircles));
}

function addMarkers() {
  clearMarkers();
  console.log("Total CSV rows:", allLocations.length);
  
  allLocations.forEach((location, index) => {
    console.log(`Row ${index} keys:`, Object.keys(location));
    const lat = parseFloat(location.Latitude);
    const lng = parseFloat(location.Longitude);
    if (isNaN(lat) || isNaN(lng)) {
      console.warn(`Invalid coordinates at row ${index}:`, location);
      return;
    }
    let marker = new google.maps.Marker({
      position: { lat: lat, lng: lng },
      map: map,
      title: location.Name,
      icon: {
        url: "https://raw.githubusercontent.com/shrunk-scott/shopfrontsammy/main/Shopfront%20Sammy%20Logo.png",
        scaledSize: new google.maps.Size(20, 20)
      }
    });
    
    // Append cluster info if available.
    let clusterText = (location.cluster !== undefined) ? "Cluster: " + location.cluster : "No cluster";
    let infoWindow = new google.maps.InfoWindow({
      content: `<strong>${location.Name}</strong><br>${location.Address}<br>${clusterText}`
    });
    infoWindows.push(infoWindow);
    
    marker.addListener("click", function() {
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
}

function resetView() {
  console.log("Reset view clicked");
  map.setZoom(defaultZoom);
  map.setCenter(defaultCenter);
  infoWindows.forEach(iw => iw.close());
}

function updateSiteCount() {
  const siteCountElem = document.getElementById('siteCount');
  if (siteCountElem) {
    siteCountElem.textContent = "Total Sites: " + markers.length;
  }
}

function updateClusterFilter() {
  // Create or get the container for cluster filters.
  let filterContainer = document.getElementById('clusterFilter');
  if (!filterContainer) {
    filterContainer = document.createElement('div');
    filterContainer.id = 'clusterFilter';
    // Insert the container above the map.
    const container = document.querySelector('.container');
    container.insertBefore(filterContainer, document.getElementById('map'));
  }
  filterContainer.innerHTML = "<strong>Clusters: </strong>";
  
  // Create a checkbox for each cluster (from clusterCircles).
  let clusterIds = Object.keys(clusterCircles);
  clusterIds.forEach(clusterId => {
    let checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'cluster_' + clusterId;
    checkbox.checked = true;
    checkbox.addEventListener('change', function() {
      if (this.checked) {
        clusterCircles[clusterId].setMap(map);
      } else {
        clusterCircles[clusterId].setMap(null);
      }
    });
    let label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = "Cluster " + clusterId;
    filterContainer.appendChild(checkbox);
    filterContainer.appendChild(label);
    filterContainer.appendChild(document.createTextNode(" ")); // spacing
  });
}

window.onload = loadScript;
