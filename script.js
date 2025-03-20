let map;
let markers = [];
let allLocations = [];

function loadScript() {
  const apiKey = 'AIzaSyDM5PYHiEkRV4tCdBpP7tKrRtobVXoCzSo'; // Replace with your API key if needed
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

  // Initialize the map using default ROADMAP type.
  map = new google.maps.Map(document.getElementById('map'), {
    zoom: 7,
    center: { lat: -27.5, lng: 153.0 },
    mapTypeId: google.maps.MapTypeId.ROADMAP
  });

  // Load CSV data using PapaParse from the raw GitHub URL
  Papa.parse("https://raw.githubusercontent.com/shrunk-scott/shopfrontsammy/main/Untitled%20Spreadsheet.csv", {
    download: true,
    header: true,
    complete: function(results) {
      console.log("CSV data loaded:", results.data);
      if (results.data.length === 0) {
        console.error("CSV data is empty. Verify that your CSV has data and the correct header row.");
      }
      allLocations = results.data;
      addMarkers('All');
    },
    error: function(err) {
      console.error("Error loading CSV file:", err);
      alert("Error loading CSV file");
    }
  });
}

function addMarkers(filter) {
  clearMarkers();
  console.log("Total CSV rows:", allLocations.length);
  
  allLocations.forEach(function(location, index) {
    // Log keys to see header names
    console.log(`Row ${index} keys:`, Object.keys(location));
    
    // Support both lowercase and capitalized headers for coordinates.
    const lat = parseFloat(location.lat || location.Latitude);
    const lng = parseFloat(location.lng || location.Longitude);

    if (isNaN(lat) || isNaN(lng)) {
      console.warn(`Invalid coordinates for row ${index}:`, location);
      return;
    }

    // Support both lowercase and capitalized headers for type.
    const type = location.type || location.Type;
    if (filter === 'All' || type === filter) {
      let marker = new google.maps.Marker({
        position: { lat: lat, lng: lng },
        map: map,
        title: location.name || location.Name,
        icon: {
          url: "https://maps.google.com/mapfiles/kml/shapes/cycling.png",
          scaledSize: new google.maps.Size(20, 20) // Smaller marker size
        }
      });

      let infoWindow = new google.maps.InfoWindow({
        content: `<strong>${location.name || location.Name}</strong><br>${location.address || location.Address}`
      });

      marker.addListener("click", function() {
        // Zoom in and center the map on this marker when clicked.
        map.setZoom(15);
        map.setCenter(marker.getPosition());
        infoWindow.open(map, marker);
      });

      markers.push(marker);
    }
  });
  
  console.log("Markers added:", markers.length);
}

function clearMarkers() {
  markers.forEach(marker => marker.setMap(null));
  markers = [];
}

window.onload = loadScript;
