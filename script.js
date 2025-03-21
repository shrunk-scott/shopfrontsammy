let map;
let markers = [];
let polygons = [];
let allLocations = [];
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

  // Initialize map with default center, zoom and using the default ROADMAP view.
  map = new google.maps.Map(document.getElementById('map'), {
    zoom: defaultZoom,
    center: defaultCenter,
    mapTypeId: google.maps.MapTypeId.ROADMAP
  });

  // Load CSV data using PapaParse from the GitHub raw URL.
  Papa.parse("https://raw.githubusercontent.com/shrunk-scott/shopfrontsammy/main/Untitled%20Spreadsheet.csv", {
    download: true,
    header: true,
    complete: function(results) {
      console.log("CSV data loaded:", results.data);
      allLocations = results.data;
      addMarkers();
      createServiceZones();
    },
    error: function(err) {
      console.error("Error loading CSV file:", err);
      alert("Error loading CSV file");
    }
  });
}

function addMarkers() {
  clearMarkers();
  console.log("Total CSV rows:", allLocations.length);

  allLocations.forEach(function(location, index) {
    // Log the keys for debugging to ensure headers match.
    console.log(`Row ${index} keys:`, Object.keys(location));

    // Use the CSV headers "Latitude" and "Longitude"
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
        scaledSize: new google.maps.Size(20, 20) // Smaller marker size
      }
    });

    let infoWindow = new google.maps.InfoWindow({
      content: `<strong>${location.Name}</strong><br>${location.Address}`
    });

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
}

function createServiceZones() {
  // Convert CSV data (allLocations) into an array of GeoJSON Point features.
  let features = allLocations.map(location => {
    const lat = parseFloat(location.Latitude);
    const lng = parseFloat(location.Longitude);
    if (isNaN(lat) || isNaN(lng)) return null;
    return turf.point([lng, lat], { name: location.Name, address: location.Address });
  }).filter(f => f !== null);

  if (features.length === 0) {
    console.warn("No valid GeoJSON features to cluster.");
    return;
  }

  let fc = turf.featureCollection(features);

  // Cluster features using DBSCAN with maxDistance 15 km.
  // Each feature that is within 15 km of another gets a "cluster" property.
  let clustered = turf.clustersDbscan(fc, 15, { units: 'kilometers' });
  console.log("Clustered features:", clustered.features);

  // Group features by their cluster ID (skip noise with cluster = -1)
  let clusters = {};
  clustered.features.forEach(feature => {
    let clusterId = feature.properties.cluster;
    if (clusterId === undefined || clusterId < 0) return;
    if (!clusters[clusterId]) {
      clusters[clusterId] = [];
    }
    clusters[clusterId].push(feature);
  });
  console.log("Clusters:", clusters);

  // For each cluster, compute the convex hull polygon and add it to the map.
  for (let clusterId in clusters) {
    let clusterFeatures = clusters[clusterId];
    let fcCluster = turf.featureCollection(clusterFeatures);
    let hull = turf.convex(fcCluster);
    if (!hull) {
      console.warn(`Not enough points in cluster ${clusterId} for convex hull.`);
      continue;
    }
    // hull.geometry.coordinates is an array of linear rings; we take the first one.
    let coords = hull.geometry.coordinates[0];
    // Convert each [lng, lat] pair to a google.maps LatLng object.
    let path = coords.map(coord => ({ lat: coord[1], lng: coord[0] }));
    
    // Create a polygon with a distinct style.
    let polygon = new google.maps.Polygon({
      paths: path,
      strokeColor: "#FF0000",
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: "#FF0000",
      fillOpacity: 0.35,
      map: map
    });
    
    polygons.push(polygon);
  }
  console.log("Polygons (service zones) added:", polygons.length);
}

window.onload = loadScript;
