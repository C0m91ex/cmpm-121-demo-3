// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

import { Grid, Cell } from "./grid.ts";
// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const CACHE_SPAWN_PROBABILITY = 0.1;
const TILE_WIDTH = 0.0001;
const TILE_VISIBILITY_RADIUS = 4;
const MOVE_INCREMENT = 0.0001;
const DEGREES_TO_METERS = 10000;

// game state initialization
const grid = new Grid(TILE_WIDTH, TILE_VISIBILITY_RADIUS);

const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

const playerInventory: Coin[] = [];
const cacheMementos = new Map<string, string>();

const movementHistory: leaflet.LatLng[] = [];
const movementPath = leaflet
  .polyline(movementHistory, { color: "blue" })
  .addTo(map);

// classes
class Coin {
  constructor(public id: string) {}
}

class Cache {
  location: leaflet.LatLng;
  coins: Coin[];

  constructor(location: leaflet.LatLng, coins: Coin[]) {
    this.location = location;
    this.coins = coins;
  }

  toMemento(): string {
    return JSON.stringify(this.coins.map((coin) => coin.id));
  }

  fromMemento(memento: string) {
    const coinIds = JSON.parse(memento);
    this.coins = coinIds.map((id: string) => new Coin(id));
  }
}

// map and icon initialization
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

function resolveAssetPath(relativePath: string): string {
  const isGHPage = location.hostname === "akhalim1.github.io";

  if (isGHPage) {
    console.log(`/cmpm-121-demo-3/${relativePath}`);
    return `/cmpm-121-demo-3/${relativePath}`;
  } else {
    return import.meta.resolve(`../public/${relativePath}`);
  }
}

const playerIcon = leaflet.icon({
  iconUrl: resolveAssetPath("Player.png"),
  iconSize: [32, 32],
});

const cacheIcon = leaflet.icon({
  iconUrl: resolveAssetPath("Money.png"),
  iconSize: [32, 32],
});

// player and cache markers
const activeCacheMarkers = new Map<string, leaflet.Marker>();

const playerMarker = leaflet.marker(OAKES_CLASSROOM, { icon: playerIcon });
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "inventory:";

// game state functions
function recordPlayerMovement(newPosition: leaflet.LatLng) {
  movementHistory.push(newPosition);
  movementPath.setLatLngs(movementHistory);
}

function savePlayerInventory() {
  const inventoryIds = playerInventory.map((coin) => coin.id);
  localStorage.setItem("inventory", JSON.stringify(inventoryIds));
}

function savePlayerPosition() {
  const playerPosition = playerMarker.getLatLng();
  localStorage.setItem(
    "playerPosition",
    JSON.stringify({ lat: playerPosition.lat, lng: playerPosition.lng }),
  );
}

function saveCacheMementos() {
  const cacheMementosObject: { [key: string]: string } = {};
  cacheMementos.forEach((value, key) => {
    cacheMementosObject[key] = value;
  });
  localStorage.setItem("cacheMementos", JSON.stringify(cacheMementosObject));
}

function saveMovementHistory() {
  const movementHistoryArray = movementHistory.map((pos) => ({
    lat: pos.lat,
    lng: pos.lng,
  }));
  localStorage.setItem("movementHistory", JSON.stringify(movementHistoryArray));
}

function loadPlayerPosition() {
  const savedPos = localStorage.getItem("playerPosition");

  if (savedPos) {
    const { lat, lng } = JSON.parse(savedPos);
    playerMarker.setLatLng(new leaflet.LatLng(lat, lng));
  }
}

function loadPlayerInventory() {
  const savedInventory = localStorage.getItem("inventory");

  if (savedInventory) {
    playerInventory.length = 0;
    JSON.parse(savedInventory).forEach((id: string) =>
      playerInventory.push(new Coin(id))
    );
    updateInventoryDisplay();
  }
}

function loadCacheMementos(playerPosition: leaflet.LatLng) {
  activeCacheMarkers.forEach((marker) => marker.remove());
  activeCacheMarkers.clear();

  const savedCacheMementos = localStorage.getItem("cacheMementos");
  const maxDistance = TILE_VISIBILITY_RADIUS * TILE_WIDTH * DEGREES_TO_METERS;

  if (savedCacheMementos) {
    const cacheEntries = JSON.parse(savedCacheMementos);
    cacheMementos.clear();

    for (const key in cacheEntries) {
      if (Object.prototype.hasOwnProperty.call(cacheEntries, key)) {
        const memento = cacheEntries[key];
        if (typeof memento === "string") {
          cacheMementos.set(key, memento);
        } else {
          console.warn(`Invalid ${key}:`, memento);
        }
      }
    }

    cacheMementos.forEach((memento, key) => {
      const [i, j] = key.split(",").map(Number);
      const cell = { i, j };
      const cellCenter = grid.getCellBound(cell).getCenter();
      const distance = playerPosition.distanceTo(cellCenter);

      if (distance <= maxDistance) {
        const cache = new Cache(cellCenter, []);
        cache.fromMemento(memento);
        spawnCache(cellCenter);
      }
    });
  }
}

function loadMovementHistory() {
  const savedMovementHistory = localStorage.getItem("movementHistory");

  if (savedMovementHistory) {
    const loadedMovement = JSON.parse(savedMovementHistory);
    movementHistory.length = 0;

    loadedMovement.forEach((pos: { lat: number; lng: number }) => {
      movementHistory.push(new leaflet.LatLng(pos.lat, pos.lng));
    });
    movementPath.setLatLngs(movementHistory);
  }
}

function saveGameState() {
  savePlayerInventory();
  savePlayerPosition();
  saveCacheMementos();
  saveMovementHistory();
}

function loadGameState() {
  const playerPosition: leaflet.LatLng = playerMarker.getLatLng();
  loadPlayerInventory();
  loadPlayerPosition();
  loadCacheMementos(playerPosition);
  loadMovementHistory();
}

// player movement
function movePlayer(direction: string) {
  const currentPos = playerMarker.getLatLng();

  let newLatLng;

  switch (direction) {
    case "up":
      newLatLng = new leaflet.LatLng(
        currentPos.lat + MOVE_INCREMENT,
        currentPos.lng,
      );
      break;
    case "down":
      newLatLng = new leaflet.LatLng(
        currentPos.lat - MOVE_INCREMENT,
        currentPos.lng,
      );
      break;
    case "left":
      newLatLng = new leaflet.LatLng(
        currentPos.lat,
        currentPos.lng - MOVE_INCREMENT,
      );
      break;
    case "right":
      newLatLng = new leaflet.LatLng(
        currentPos.lat,
        currentPos.lng + MOVE_INCREMENT,
      );
      break;
  }

  if (newLatLng) {
    recordPlayerMovement(newLatLng);
    playerMarker.setLatLng(newLatLng);
    updateNearbyCaches();
  }
}

// cache management functions
function updateNearbyCaches() {
  const playerPosition = playerMarker.getLatLng();
  const nearbyCells = grid.getCellsNearPoint(playerPosition);

  // Remove caches that are no longer within the visibility radius
  activeCacheMarkers.forEach((marker, key) => {
    const [i, j] = key.split(",").map(Number);
    const cellCenter = grid.getCellBound({ i, j }).getCenter();

    if (playerPosition.distanceTo(cellCenter) > TILE_VISIBILITY_RADIUS * TILE_WIDTH * DEGREES_TO_METERS) {
      marker.remove();
      activeCacheMarkers.delete(key);
    }
  });

  // Add new caches if needed
  nearbyCells.forEach((cell) => {
    const cellKey = `${cell.i},${cell.j}`;
    const cellCenter = grid.getCellBound(cell).getCenter();

    if (!activeCacheMarkers.has(cellKey) && luck([cell.i, cell.j].toString()) < CACHE_SPAWN_PROBABILITY) {
      const marker = spawnCache(cellCenter);
      activeCacheMarkers.set(cellKey, marker);
    }
  });
}

function manageCacheState(cellKey: string, cache: Cache, isSave: boolean) {
  if (isSave) {
    const memento = cache.toMemento();
    cacheMementos.set(cellKey, memento);
  } else {
    if (cacheMementos.has(cellKey)) {
      cache.fromMemento(cacheMementos.get(cellKey)!);
    }
  }
}

function spawnCache(cellCenter: leaflet.LatLng): leaflet.Marker {

  const cache = getOrCreateCache(cellCenter);

  return addCacheMarker(cache); 
}

function getOrCreateCache(cellCenter: leaflet.LatLng): Cache {
  const cell = grid.getCellForPoint(cellCenter);
  const cellKey = `${cell.i},${cell.j}`;

  // Restore existing cache state if possible
  if (cacheMementos.has(cellKey)) {
    const cache = new Cache(cellCenter, []);
    manageCacheState(cellKey, cache, false);
    return cache;
  }

  // Otherwise, create a new cache with random coins
  const newCache = new Cache(cellCenter, generateCoins(cell));
  manageCacheState(cellKey, newCache, true);
  return newCache;
}

function addCacheMarker(cache: Cache): leaflet.Marker {
  const marker = leaflet.marker(cache.location, { icon: cacheIcon });
  marker.bindPopup(() => createCachePopupContent(cache)); // Call your existing helper
  marker.addTo(map);
  return marker; 
}

function generateCoins(cell: Cell): Coin[] {
  const coinCount = Math.floor(luck([cell.i, cell.j].toString()) * 100);
  return Array.from({ length: coinCount }, (_, k) => new Coin(`${cell.i}:${cell.j}#${k}`));
}

// deposit/collect coins
function createCoinElement(
  coin: Coin,
  cache: Cache,
  popupDiv: HTMLElement,
): HTMLElement {
  const fixedCoinId = coin.id.replace(/[^a-zA-Z0-9-_]/g, "_");
  const coinDiv = document.createElement("div");
  coinDiv.innerHTML = `
      <span>Coin ID: ${coin.id}</span>
      <button id="collect-${fixedCoinId}">Collect</button>
    `;

  coinDiv
    .querySelector<HTMLButtonElement>(`#collect-${fixedCoinId}`)!
    .addEventListener("click", () => {
      collectCoin(coin, cache, popupDiv);
    });
  return coinDiv;
}

function collectCoin(coin: Coin, cache: Cache, popupDiv: HTMLElement) {
  console.log(`Collecting coin ${coin.id}`);
  cache.coins = cache.coins.filter((c) => c.id !== coin.id);
  playerInventory.push(coin);

  updateInventoryDisplay();

  const cellKey = `${grid.getCellForPoint(cache.location).i},${
    grid.getCellForPoint(cache.location).j
  }`;
  manageCacheState(cellKey, cache, true);

  const newPopupContent = createCachePopupContent(cache);
  popupDiv.innerHTML = newPopupContent.innerHTML;
}

function createDepositElement(
  cache: Cache,
  popupDiv: HTMLElement | null, 
): HTMLElement {
  const depositDiv = document.createElement("div");
  depositDiv.innerHTML = `
  <div>Deposit a coin from your inventory </div>
  <button id = "deposit"> Deposit </button>
  `;

  const depositButton = depositDiv.querySelector<HTMLButtonElement>("#deposit")!;
  depositButton.addEventListener("click", () => {
    if (popupDiv) {
      depositCoin(cache, popupDiv); 
    }
  });

  return depositDiv;
}

function depositCoin(cache: Cache, popupDiv: HTMLElement) {
  if (playerInventory.length > 0) {
    const coinToDeposit = playerInventory.shift()!;
    cache.coins.push(coinToDeposit);

    updateInventoryDisplay();

    const cellKey = `${grid.getCellForPoint(cache.location).i},${
      grid.getCellForPoint(cache.location).j
    }`;
    manageCacheState(cellKey, cache, true);

    const newPopupContent = createCachePopupContent(cache);
    popupDiv.innerHTML = newPopupContent.innerHTML;
  } else {
    console.log("No coins in inventory to deposit");
  }
}

function renderCoinInfo(cache: Cache): HTMLElement {
  const coinInfoDiv = document.createElement("div");
  cache.coins.forEach((coin) => {
    const coinDiv = createCoinElement(coin, cache, coinInfoDiv);
    coinInfoDiv.appendChild(coinDiv);
  });
  return coinInfoDiv;
}

function renderDepositOptions(cache: Cache): HTMLElement {
  const depositDiv = createDepositElement(cache, null); 
  return depositDiv;
}

function createCachePopupContent(cache: Cache): HTMLElement {
  const popupDiv = document.createElement("div");

  // Popup header with location information
  const headerDiv = document.createElement("div");
  headerDiv.innerHTML = `
    <div>There is a cache here at 
      ${cache.location.lat.toFixed(5)}, 
      ${cache.location.lng.toFixed(5)}
    </div>
  `;
  popupDiv.appendChild(headerDiv);

  // Coin information section
  const coinInfoDiv = renderCoinInfo(cache);
  popupDiv.appendChild(coinInfoDiv);

  // Deposit options section
  const depositDiv = renderDepositOptions(cache);
  popupDiv.appendChild(depositDiv);

  return popupDiv;
}

function updateInventoryDisplay() {
  const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
  statusPanel.innerHTML = `inventory: 
  ${playerInventory.map((coin) => coin.id).join(", ")}`;
}

const nearbyCell = grid.getCellsNearPoint(OAKES_CLASSROOM);

nearbyCell.forEach((cell) => {
  const cellCenter = grid.getCellBound(cell).getCenter();
  if (luck([cell.i, cell.j].toString()) < CACHE_SPAWN_PROBABILITY) {
    spawnCache(cellCenter);
  }
});

// event listeners
document
  .getElementById("north")!
  .addEventListener("click", () => movePlayer("up"));

document
  .getElementById("south")!
  .addEventListener("click", () => movePlayer("down"));

document
  .getElementById("west")!
  .addEventListener("click", () => movePlayer("left"));

document
  .getElementById("east")!
  .addEventListener("click", () => movePlayer("right"));

let geolocationActive = false;
let geolocactionWatcherId: number | null = null;

document.getElementById("sensor")!.addEventListener("click", () => {
  if (navigator.geolocation) {
    if (!geolocationActive) {
      geolocationActive = true;
      geolocactionWatcherId = navigator.geolocation.watchPosition(
        (position) => {
          const newLatLng = new leaflet.LatLng(
            position.coords.latitude,
            position.coords.longitude,
          );
          playerMarker.setLatLng(newLatLng);
          updateNearbyCaches();
          recordPlayerMovement(newLatLng);
        },
      );
    } else {
      geolocationActive = false;
      if (geolocactionWatcherId != null) {
        navigator.geolocation.clearWatch(geolocactionWatcherId);
        geolocactionWatcherId = null;
      }
    }
  }
});

document.getElementById("reset")!.addEventListener("click", () => {
  localStorage.clear();

  playerInventory.length = 0;
  updateInventoryDisplay();

  cacheMementos.clear();
  movementHistory.length = 0;
  movementPath.setLatLngs([]);
  playerMarker.setLatLng(OAKES_CLASSROOM);
});

// final setup
globalThis.addEventListener("beforeunload", saveGameState);
loadGameState();