let map;
let markers = [];
let markerCluster = null;
let cameraData = [];
let initialLoad = true;

window.onload = initMap;

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 22.0, lng: 79.0 },
    zoom: 5
  });

  Papa.parse("AP_13_dist_data.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      cameraData = normalizeData(results.data);
      populateFilters(cameraData);
      displayMarkers(cameraData);
      populateTable([]);
      updateInfoBar(0);
    },
    error: function(err) { console.error("CSV load error:", err); }
  });

  document.getElementById("districtFilter").addEventListener("change", onFilterChange);
  document.getElementById("mandalFilter").addEventListener("change", onFilterChange);
  document.getElementById("typeFilter").addEventListener("change", onFilterChange);
  document.getElementById("analyticsFilter").addEventListener("change", onFilterChange);
  document.getElementById("resetBtn").addEventListener("click", resetFilters);
}

function normalizeData(rows) {
  return rows.map(r => {
    const norm = {};
    for (let k in r) {
      if (!Object.prototype.hasOwnProperty.call(r, k)) continue;
      const key = k.trim();
      let val = r[k] ? r[k].toString().trim() : "";
      if (key === "LATITUDE" || key === "LONGITUDE") val = val.replace(/[^0-9.\-]/g,"");
      norm[key] = val;
    }
    return norm;
  });
}

function updateInfoBar(count) {
  document.getElementById("infoBar").textContent = `Showing ${count} record${count !== 1 ? "s" : ""}.`;
}

function populateFilters(data) {
  const districts = new Set(), mandals = new Set(), types = new Set(), analytics = new Set();
  data.forEach(d => {
    if (d["DISTRICT"]) districts.add(d["DISTRICT"]);
    if (d["MANDAL"]) mandals.add(d["MANDAL"]);
    if (d["TYPE OF CAMERA"]) types.add(d["TYPE OF CAMERA"].toUpperCase());
    if (d["Type Of Analytics"]) analytics.add(d["Type Of Analytics"].toUpperCase());
  });
  addOptions("districtFilter", Array.from(districts).sort());
  addOptions("mandalFilter", Array.from(mandals).sort());
  addOptions("typeFilter", Array.from(types).sort());
  addOptions("analyticsFilter", Array.from(analytics).sort());
}

function addOptions(id, list) {
  const sel = document.getElementById(id);
  while (sel.options.length > 1) sel.remove(1);
  list.forEach(v => {
    if (!v) return;
    const opt = document.createElement("option");
    opt.value = v;
    opt.text = v;
    sel.add(opt);
  });
}

function onFilterChange() {
  const district = document.getElementById("districtFilter").value;
  const mandal = document.getElementById("mandalFilter").value;
  const type = document.getElementById("typeFilter").value;
  const analytics = document.getElementById("analyticsFilter").value;

  if (district) {
    const filteredMandals = new Set(
      cameraData.filter(d => d["DISTRICT"] === district && d["MANDAL"]).map(d => d["MANDAL"])
    );
    addOptions("mandalFilter", Array.from(filteredMandals).sort());
  } else {
    const allMandals = new Set(cameraData.map(d => d["MANDAL"]).filter(Boolean));
    addOptions("mandalFilter", Array.from(allMandals).sort());
  }

  const filtered = cameraData.filter(cam => {
    return (district === '' || cam["DISTRICT"] === district) &&
           (mandal === '' || cam["MANDAL"] === mandal) &&
           (type === '' || cam["TYPE OF CAMERA"].toUpperCase() === type) &&
           (analytics === '' || cam["Type Of Analytics"].toUpperCase() === analytics);
  });

  populateTable(filtered);
  updateInfoBar(filtered.length);
  displayMarkers(filtered);
}

function resetFilters() {
  document.getElementById('districtFilter').value = "";
  document.getElementById('mandalFilter').value = "";
  document.getElementById('typeFilter').value = "";
  document.getElementById('analyticsFilter').value = "";

  const allMandals = new Set(cameraData.map(d => d["MANDAL"]).filter(Boolean));
  addOptions("mandalFilter", Array.from(allMandals).sort());

  populateTable([]);
  updateInfoBar(0);
  displayMarkers(cameraData);
}

function displayMarkers(data) {
  if (markerCluster) { markerCluster.clearMarkers(); markerCluster = null; }
  markers = [];
  const bounds = new google.maps.LatLngBounds();
  let validCount = 0, invalidCount = 0;

  const cameraIcons = {
    "ANPR": { url: "icons/anpr.png", size: new google.maps.Size(42, 42) },
    "ANALYTICS": { url: "icons/analytics.png", size: new google.maps.Size(42, 42) },
    "FIXED": { url: "icons/fixed.png", size: new google.maps.Size(42, 42) },
    "FRS": { url: "icons/frs.png", size: new google.maps.Size(42, 42) },
    "FRZ": { url: "icons/frz.png", size: new google.maps.Size(42, 42) },
    "PTZ": { url: "icons/ptz.png", size: new google.maps.Size(42, 42) },
    "RLVD": { url: "icons/rlvd2.png", size: new google.maps.Size(42, 42) },
    "DEFAULT": { url: "icons/default.png", size: new google.maps.Size(42, 42) }
  };

  data.forEach(cam => {
    const lat = parseFloat(cam["LATITUDE"]);
    const lng = parseFloat(cam["LONGITUDE"]);
    if (!isFinite(lat) || !isFinite(lng)) { invalidCount++; return; }
    validCount++;

    const typeVal = (cam["TYPE OF CAMERA"] || "DEFAULT").toUpperCase();
    const iconInfo = cameraIcons[typeVal] || cameraIcons["DEFAULT"];

    const marker = new google.maps.Marker({
      position: { lat, lng },
      title: cam["LOCATION NAME"] || "",
      icon: { url: iconInfo.url, scaledSize: iconInfo.size },
      map: map
    });

    const infoWindow = new google.maps.InfoWindow({
      content: `<div><b>${cam["LOCATION NAME"] || "Unknown"}</b><br>
                <small>${cam["DISTRICT"] || ""} / ${cam["MANDAL"] || ""}</small><br>
                <small>Camera: ${typeVal} — Analytics: ${cam["Type Of Analytics"] || "N/A"}</small>
                </div>`
    });
    marker.addListener("click", () => infoWindow.open(map, marker));

    markers.push(marker);
    bounds.extend(marker.getPosition());
  });

  if (markers.length) {
    markerCluster = new markerClusterer.MarkerClusterer({ map, markers });
    if (!initialLoad) {
      map.fitBounds(bounds);
      const listener = google.maps.event.addListener(map, "idle", function() {
        if (map.getZoom() > 12) map.setZoom(12);
        google.maps.event.removeListener(listener);
      });
    }
  } else {
    map.setCenter({ lat: 22.0, lng: 79.0 });
    map.setZoom(5);
  }

  if (initialLoad) initialLoad = false;
  console.log(`Markers: ${validCount} valid, ${invalidCount} invalid`);
}

function populateTable(data) {
  const tbody = document.querySelector('#dataTable tbody');
  tbody.innerHTML = '';
  data.forEach(cam => {
    const row = `<tr>
      <td>${cam["DISTRICT"] || ""}</td>
      <td>${cam["MANDAL"] || ""}</td>
      <td>${(cam["LOCATION NAME"] || "").replace(/</g, '&lt;')}</td>
      <td>${cam["LATITUDE"] || ""}</td>
      <td>${cam["LONGITUDE"] || ""}</td>
      <td>${cam["TYPE OF CAMERA"] || ""}</td>
      <td>${cam["Type Of Analytics"] || ""}</td>
    </tr>`;
    tbody.insertAdjacentHTML('beforeend', row);
  });
}

