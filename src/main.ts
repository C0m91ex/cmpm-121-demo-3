// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import luck from "./luck.ts";
import "./leafletWorkaround.ts";

// Core gameplay settings with Null Island as origin
const NULL_ISLAND = leaflet.latLng(0, 0); // Reference origin at Null Island
const VIEW_ZOOM = 19;
const TILE_INCREMENT = 0.0001;
const LOCAL_RADIUS = 8;
const SPAWN_PROB = 0.1;

// Flyweight cache for coordinates to reduce object creation
const cacheLocationFlyweights = new Map<string, leaflet.LatLngBounds>();

// Initial player stats
const score = 0;
let coins = 0;
let uniqueCoinId = 0; // Counter to uniquely identify each coin

// Map setup with Null Island as center
const mapElement = document.getElementById("map");
const map = leaflet.map(mapElement!, {
  center: NULL_ISLAND,
  zoom: VIEW_ZOOM,
  minZoom: VIEW_ZOOM,
  maxZoom: VIEW_ZOOM,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// Status panel
const displayStatus = document.querySelector<HTMLDivElement>("#statusPanel")!;
function updateDisplay() {
  displayStatus.innerHTML = `Score: ${score} | Coins: ${coins}`;
}
updateDisplay();

// Function to generate or retrieve a flyweight location
function getFlyweightLocation(x: number, y: number): leaflet.LatLngBounds {
  const key = `${x},${y}`;
  if (!cacheLocationFlyweights.has(key)) {
    const boundary = leaflet.latLngBounds([
      [
        NULL_ISLAND.lat + x * TILE_INCREMENT,
        NULL_ISLAND.lng + y * TILE_INCREMENT,
      ],
      [
        NULL_ISLAND.lat + (x + 1) * TILE_INCREMENT,
        NULL_ISLAND.lng + (y + 1) * TILE_INCREMENT,
      ],
    ]);
    cacheLocationFlyweights.set(key, boundary);
  }
  return cacheLocationFlyweights.get(key)!;
}

// Generate a unique token for each coin (simple incrementing ID for demonstration)
function generateCoinToken(): string {
  return `coin_${uniqueCoinId++}`;
}

// Create cache with unique coins as non-fungible tokens
function createCache(x: number, y: number) {
  const boundary = getFlyweightLocation(x, y);
  const cacheCoins = Array.from({
    length: Math.floor(luck([x, y, "coins"].toString()) * 10) + 1,
  }, generateCoinToken);

  const cacheRectangle = leaflet.rectangle(boundary);
  cacheRectangle.addTo(map);

  // Configure popup for cache interaction
  cacheRectangle.bindPopup(() => {
    const popupContent = document.createElement("div");
    popupContent.innerHTML = `
      <div>Cache at (${x},${y}) contains coins:</div>
      <ul id="coinList">${
      cacheCoins.map((id) => `<li>${id}</li>`).join("")
    }</ul>
      <button id="collectBtn">Collect</button>
      <button id="depositBtn">Deposit</button>
    `;

    // Collect coins from cache
    popupContent.querySelector<HTMLButtonElement>("#collectBtn")!
      .addEventListener("click", () => {
        if (cacheCoins.length > 0) {
          coins++;
          const collectedCoin = cacheCoins.pop();
          updateDisplay();
          document.getElementById("coinList")!.innerHTML = cacheCoins.map(
            (id) => `<li>${id}</li>`,
          ).join("");
          console.log(`Collected coin with ID: ${collectedCoin}`);
        }
      });

    // Deposit a coin into the cache
    popupContent.querySelector<HTMLButtonElement>("#depositBtn")!
      .addEventListener("click", () => {
        if (coins > 0) {
          coins--;
          const newCoinToken = generateCoinToken();
          cacheCoins.push(newCoinToken);
          updateDisplay();
          document.getElementById("coinList")!.innerHTML = cacheCoins.map(
            (id) => `<li>${id}</li>`,
          ).join("");
          console.log(`Deposited coin with ID: ${newCoinToken}`);
        }
      });

    return popupContent;
  });
}

// Place caches using flyweight pattern for grid coordinates
for (let x = -LOCAL_RADIUS; x < LOCAL_RADIUS; x++) {
  for (let y = -LOCAL_RADIUS; y < LOCAL_RADIUS; y++) {
    if (luck([x, y].toString()) < SPAWN_PROB) {
      createCache(x, y);
    }
  }
}
