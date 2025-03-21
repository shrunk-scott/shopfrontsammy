let map;
let markers = [];
let allLocations = [];

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

  // Initialize the map using the default ROADMAP view.
  map = new google.maps.Map(document.getElementById('map'), {
    zoom: 7,
    center: { lat: -27.5, lng: 153.0 },
    mapTypeId: google.maps.MapTypeId.ROADMAP
  });

  // Load CSV data using PapaParse from the GitHub raw URL
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
    // Log row keys for debugging
    console.log(`Row ${index} keys:`, Object.keys(location));
    
    // Use the provided CSV headers: "Latitude" and "Longitude"
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
        scaledSize: new google.maps.Size(20, 20) // Adjust the size as needed
      }
    });
    
    let infoWindow = new google.maps.InfoWindow({
      content: `<strong>${location.Name}</strong><br>${location.Address}`
    });
    
    marker.addListener("click", function() {
      // When a marker is clicked, zoom in and center on that location
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

window.onload = loadScript;
