let map;
let markers = [];
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

  // Initialize the map with default ROADMAP view.
  map = new google.maps.Map(document.getElementById('map'), {
    zoom: defaultZoom,
    center: defaultCenter,
    mapTypeId: google.maps.MapTypeId.ROADMAP
  });

  // Add event listener for the Reset View button.
  document.getElementById('resetBtn').addEventListener('click', resetView);

  // Load CSV data using PapaParse from the GitHub raw URL.
  Papa.parse("https://raw.githubusercontent.com/shrunk-scott/shopfrontsammy/main/Untitled%20Spreadsheet.csv", {
    download: true,
    header: true,
    complete: function(results) {
      console.log("CSV data loaded:", results.data);
      allLocations = results.data;
      addMarkers();
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
    // Log keys for debugging.
    console.log(`Row ${index} keys:`, Object.keys(location));
    
    // Use the CSV headers "Latitude" and "Longitude".
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
        scaledSize: new google.maps.Size(20, 20) // Adjust size as needed.
      }
    });
    
    let infoWindow = new google.maps.InfoWindow({
      content: `<strong>${location.Name}</strong><br>${location.Address}`
    });
    
    marker.addListener("click", function() {
      // Zoom in and center on the marker when clicked.
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

function resetView() {
  map.setZoom(defaultZoom);
  map.setCenter(defaultCenter);
}

window.onload = loadScript;
