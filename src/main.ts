// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Import required styles
import "leaflet/dist/leaflet.css";
import "./style.css";

// Import utilities
import luck from "./luck.ts";
import "./leafletWorkaround.ts";

// Core gameplay settings
const CLASSROOM_LOCATION = leaflet.latLng(
  36.98949379578401,
  -122.06277128548504,
);
const VIEW_ZOOM = 19;
const TILE_INCREMENT = 0.0001;
const LOCAL_RADIUS = 8;
const SPAWN_PROB = 0.1;

// Initial player stats
const score = 0;
let coins = 0;

// Initialize map in center location
const mapElement = document.getElementById("map");
const map = leaflet.map(mapElement!, {
  center: CLASSROOM_LOCATION,
  zoom: VIEW_ZOOM,
  minZoom: VIEW_ZOOM,
  maxZoom: VIEW_ZOOM,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Map background layer using OpenStreetMap tiles
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Player location marker
const playerIcon = leaflet.marker(CLASSROOM_LOCATION);
playerIcon.bindTooltip("Your Location");
playerIcon.addTo(map);

// Status panel display
const displayStatus = document.querySelector<HTMLDivElement>("#statusPanel")!;

function updateDisplay() {
  displayStatus.innerHTML = `Score: ${score} | Coins: ${coins}`;
}
updateDisplay(); // Initial display

// Generate caches with coin collection and deposit options
function createCache(x: number, y: number) {
  // Calculate position and bounds for each cache cell
  const origin = CLASSROOM_LOCATION;
  const boundary = leaflet.latLngBounds([
    [origin.lat + x * TILE_INCREMENT, origin.lng + y * TILE_INCREMENT],
    [
      origin.lat + (x + 1) * TILE_INCREMENT,
      origin.lng + (y + 1) * TILE_INCREMENT,
    ],
  ]);

  // Assign a random number of coins between 1 and 10 per cache
  let cacheCoins = Math.floor(luck([x, y, "coins"].toString()) * 10) + 1;

  // Visual representation of the cache as a rectangular marker
  const cacheRectangle = leaflet.rectangle(boundary);
  cacheRectangle.addTo(map);

  // Configure popup for cache interaction
  cacheRectangle.bindPopup(() => {
    const popupContent = document.createElement("div");
    popupContent.innerHTML = `
      <div>Cache at (${x},${y}) has <span id="cacheCoins">${cacheCoins}</span> coins.</div>
      <button id="collectBtn">Collect</button>
      <button id="depositBtn">Deposit</button>
    `;

    // Collect coins from the cache
    popupContent.querySelector<HTMLButtonElement>("#collectBtn")!
      .addEventListener("click", () => {
        if (cacheCoins > 0) {
          cacheCoins--;
          coins++;
          updateDisplay();
          popupContent.querySelector<HTMLSpanElement>("#cacheCoins")!
            .textContent = cacheCoins.toString();
        }
      });

    // Deposit coins into the cache
    popupContent.querySelector<HTMLButtonElement>("#depositBtn")!
      .addEventListener("click", () => {
        if (coins > 0) {
          cacheCoins++;
          coins--;
          updateDisplay();
          popupContent.querySelector<HTMLSpanElement>("#cacheCoins")!
            .textContent = cacheCoins.toString();
        }
      });

    return popupContent;
  });
}

// Procedurally place caches around player
for (let x = -LOCAL_RADIUS; x < LOCAL_RADIUS; x++) {
  for (let y = -LOCAL_RADIUS; y < LOCAL_RADIUS; y++) {
    // Spawn caches based on probability
    if (luck([x, y].toString()) < SPAWN_PROB) {
      createCache(x, y);
    }
  }
}
