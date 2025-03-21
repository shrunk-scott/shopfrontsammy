let map;
let markers = [];
let infoWindows = [];
let allLocations = [];
let clusterZones = {}; // Key: final cluster id, value: google.maps.Polygon
let finalClusters = []; // Array of cluster objects: { id, features, centroid, radius, zoneGeoJSON }
const defaultCenter = { lat: -27.5, lng: 153.0 };
const defaultZoom = 7;
const clusterColorPalette = [
  "#FF5733", "#33FF57", "#3357FF", "#F39C12",
  "#8E44AD", "#16A085", "#D35400", "#27AE60",
  "#C70039", "#900C3F", "#581845", "#1ABC9C"
];

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
  
  // Attach Reset View button event.
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetView);
  } else {
    console.warn("Reset button not found.");
  }
  
  Papa.parse("https://raw.githubusercontent.com/shrunk-scott/shopfrontsammy/main/Untitled%20Spreadsheet.csv", {
    download: true,
    header: true,
    complete: function(results) {
      console.log("CSV data loaded:", results.data);
      allLocations = results.data;
      addMarkers();
      processClustering();
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
  console.log("Total CSV rows:", allLocations.length);
  
  allLocations.forEach((location, index) => {
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
    
    // Assign the marker its cluster id.
    marker.cluster = location.cluster;
    
    let infoWindow = new google.maps.InfoWindow({
      content: `<strong>${location.Name}</strong><br>${location.Address}`
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
  
  // Reset all cluster filter checkboxes to checked and show all markers & zones.
  let checkboxes = document.querySelectorAll('#clusterFilter input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = true;
  });
  
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
    siteCountElem.textContent = "Total Sites: " + visibleCount;
  }
}

function processClustering() {
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
  let clustered = turf.clustersDbscan(fc, 7, { units: 'kilometers', minPoints: 1 });
  console.log("Clustered features:", clustered.features);
  
  let noiseId = 0;
  clustered.features.forEach(feature => {
    if (feature.properties.cluster === undefined || feature.properties.cluster < 0) {
      feature.properties.cluster = "noise_" + noiseId;
      noiseId++;
    }
  });
  
  let clusters = {};
  clustered.features.forEach(feature => {
    let cid = feature.properties.cluster;
    if (!clusters[cid]) clusters[cid] = [];
    clusters[cid].push(feature);
  });
  console.log("Initial clusters:", clusters);
  
  finalClusters = [];
  let finalClusterIdCounter = 0;
  for (let cid in clusters) {
    let clusterPoints = clusters[cid];
    if (clusterPoints.length > 25) {
      clusterPoints.sort((a, b) => a.geometry.coordinates[1] - b.geometry.coordinates[1]);
      let numSub = Math.ceil(clusterPoints.length / 25);
      for (let i = 0; i < numSub; i++) {
        let subPoints = clusterPoints.slice(i * 25, (i + 1) * 25);
        let newId = String(finalClusterIdCounter);
        finalClusterIdCounter++;
        finalClusters.push({ id: newId, features: subPoints });
        subPoints.forEach(pt => {
          allLocations.forEach(loc => {
            let latVal = parseFloat(loc.Latitude);
            let lngVal = parseFloat(loc.Longitude);
            if (Math.abs(latVal - pt.geometry.coordinates[1]) < 1e-5 &&
                Math.abs(lngVal - pt.geometry.coordinates[0]) < 1e-5) {
              loc.cluster = newId;
            }
          });
        });
      }
    } else {
      let newId = String(finalClusterIdCounter);
      finalClusterIdCounter++;
      finalClusters.push({ id: newId, features: clusters[cid] });
      clusters[cid].forEach(pt => {
        allLocations.forEach(loc => {
          let latVal = parseFloat(loc.Latitude);
          let lngVal = parseFloat(loc.Longitude);
          if (Math.abs(latVal - pt.geometry.coordinates[1]) < 1e-5 &&
              Math.abs(lngVal - pt.geometry.coordinates[0]) < 1e-5) {
            loc.cluster = newId;
          }
        });
      });
    }
  }
  console.log("Final clusters (whole numbers):", finalClusters);
  
  let clusterData = finalClusters.map(cluster => {
    let fcCluster = turf.featureCollection(cluster.features);
    let centroidFeature = turf.centroid(fcCluster);
    let centroid = centroidFeature.geometry.coordinates; // [lng, lat]
    let maxDist = 0;
    cluster.features.forEach(pt => {
      let d = turf.distance(centroidFeature, pt, { units: 'kilometers' });
      if (d > maxDist) maxDist = d;
    });
    maxDist *= 1.1; // Buffer.
    return { id: cluster.id, centroid: centroid, radius: maxDist };
  });
  console.log("Cluster data:", clusterData);
  
  let centroidFeatures = clusterData.map(cd => turf.point(cd.centroid, { id: cd.id }));
  let centroidFC = turf.featureCollection(centroidFeatures);
  let bbox = [-180, -90, 180, 90];
  let voronoiPolygons = turf.voronoi(centroidFC, { bbox: bbox });
  console.log("Voronoi polygons:", voronoiPolygons);
  
  clusterData.forEach(cd => {
    let rawCircle = turf.circle(cd.centroid, cd.radius, { steps: 64, units: 'kilometers' });
    let cell = null;
    if (voronoiPolygons && voronoiPolygons.features) {
      voronoiPolygons.features.forEach(poly => {
        if (turf.booleanPointInPolygon(turf.point(cd.centroid), poly)) {
          cell = poly;
        }
      });
    }
    let finalZone = cell ? turf.intersect(rawCircle, cell) : rawCircle;
    if (!finalZone) finalZone = rawCircle;
    cd.zoneGeoJSON = finalZone;
  });
  
  clusterData.forEach((cd, idx) => {
    if (!cd.zoneGeoJSON) return;
    let coords = cd.zoneGeoJSON.geometry.coordinates[0];
    let path = coords.map(coord => ({ lat: coord[1], lng: coord[0] }));
    let color = clusterColorPalette[idx % clusterColorPalette.length];
    let polygon = new google.maps.Polygon({
      paths: path,
      strokeColor: color,
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: color,
      fillOpacity: 0.35,
      map: map
    });
    clusterZones[cd.id] = polygon;
  });
  
  finalClusters = clusterData;
  console.log("Service zones created for clusters:", finalClusters.map(c => c.id));
}

function updateClusterFilter() {
  let filterContainer = document.getElementById('clusterFilter');
  if (!filterContainer) {
    filterContainer = document.createElement('div');
    filterContainer.id = 'clusterFilter';
    const container = document.querySelector('.container');
    container.insertBefore(filterContainer, document.getElementById('map'));
  }
  filterContainer.innerHTML = "<strong>Clusters: </strong>";
  
  finalClusters.forEach(cd => {
    let checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'cluster_' + cd.id;
    checkbox.classList.add('modern-checkbox');
    checkbox.checked = true;
    checkbox.addEventListener('change', function() {
      if (this.checked) {
        if (clusterZones[cd.id]) clusterZones[cd.id].setMap(map);
      } else {
        if (clusterZones[cd.id]) clusterZones[cd.id].setMap(null);
      }
      markers.forEach(marker => {
        if (marker.cluster === cd.id) {
          marker.setMap(this.checked ? map : null);
        }
      });
      updateSiteCount();
    });
    let label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.style.cursor = "pointer";
    let span = document.createElement('span');
    span.textContent = "Cluster " + cd.id;
    span.addEventListener('click', function(e) {
      e.stopPropagation();
      if (clusterZones[cd.id]) {
        let bounds = new google.maps.LatLngBounds();
        clusterZones[cd.id].getPath().forEach(point => bounds.extend(point));
        map.fitBounds(bounds);
      }
    });
    label.appendChild(span);
    filterContainer.appendChild(checkbox);
    filterContainer.appendChild(label);
    filterContainer.appendChild(document.createTextNode(" "));
  });
}

window.onload = loadScript;
