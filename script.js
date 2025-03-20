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

  map = new google.maps.Map(document.getElementById('map'), {
    zoom: 7,
    center: { lat: -27.5, lng: 153.0 },
    styles: [
      { elementType: 'geometry', stylers: [{ color: '#f5f5f7' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#1d1d1f' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] }
    ]
  });

  // Load CSV data using PapaParse
  Papa.parse('Untitled Spreadsheet.csv', {
    download: true,
    header: true,
    complete: function(results) {
      console.log("CSV data loaded", results.data);
      allLocations = results.data;
      addMarkers('All');
    },
    error: function(err) {
      console.error("Error loading CSV file", err);
      alert("Error loading CSV file");
    }
  });
}

function addMarkers(filter) {
  clearMarkers();
  allLocations.forEach(function(location) {
    if (filter === 'All' || location.type === filter) {
      let marker = new google.maps.Marker({
        position: { lat: parseFloat(location.lat), lng: parseFloat(location.lng) },
        map: map,
        title: location.name,
        icon: "https://maps.google.com/mapfiles/kml/shapes/cycling.png"
      });

      let infoWindow = new google.maps.InfoWindow({
        content: `<strong>${location.name}</strong><br>${location.address}`
      });

      marker.addListener("click", function() {
        infoWindow.open(map, marker);
      });

      markers.push(marker);
    }
  });
}

function clearMarkers() {
  markers.forEach(marker => marker.setMap(null));
  markers = [];
}

window.onload = loadScript;
