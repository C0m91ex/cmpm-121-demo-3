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
let score = 0;
let coins = 0;
let uniqueCoinId = 0; // Counter to uniquely identify each coin
let playerPosition = { x: 0, y: 0 };

// Memento Pattern Classes
class Memento {
  private state: string;

  constructor(state: string) {
    this.state = state;
  }

  public getState(): string {
    return this.state;
  }
}

class Caretaker {
  private mementos: Memento[] = [];

  public addMemento(memento: Memento): void {
    this.mementos.push(memento);
  }

  public getMemento(index: number): Memento {
    return this.mementos[index];
  }

  public getMementosList(): Memento[] {
    return this.mementos;
  }
}

class Game {
  private visibleCaches: Set<string>;
  private history: Caretaker;

  constructor() {
    this.visibleCaches = new Set();
    this.history = new Caretaker();
    this.updateVisibleCaches();
    this.saveState();
  }

  // Update visible caches based on the player's position
  private updateVisibleCaches(): void {
    this.visibleCaches.clear();
    for (const cache of cacheLocationFlyweights.keys()) {
      const [row, col] = cache.split(",");
      const colNum = parseInt(col, 10);
      if (
        Math.abs(playerPosition.x - parseInt(row, 10)) <= 1 &&
        Math.abs(playerPosition.y - colNum) <= 1
      ) {
        this.visibleCaches.add(cache);
      }
    }
  }

  // Save the current state of the game (player position and visible caches)
  private saveState(): void {
    const state =
      `Position: (${playerPosition.x}, ${playerPosition.y}) | Caches: ${
        Array.from(this.visibleCaches).join(", ")
      }`;
    const memento = new Memento(state);
    this.history.addMemento(memento);
  }

  // Move the player in a given direction (left, right, up, down)
  public movePlayer(direction: string): void {
    switch (direction) {
      case "left":
        playerPosition.x--;
        break;
      case "right":
        playerPosition.x++;
        break;
      case "up":
        playerPosition.y--;
        break;
      case "down":
        playerPosition.y++;
        break;
    }

    this.updateVisibleCaches();
    this.saveState();
    this.updateStatusPanel();
    incrementScore(); // Update score when player moves
  }

  // Undo the last move
  public undoMove(): void {
    const lastMemento = this.history.getMemento(
      this.history.getMementosList().length - 1,
    );
    const state = lastMemento.getState();
    const positionMatch = state.match(/Position: \((\d+), (\d+)\)/);
    if (positionMatch) {
      playerPosition.x = parseInt(positionMatch[1], 10);
      playerPosition.y = parseInt(positionMatch[2], 10);
    }
    this.updateVisibleCaches();
    this.updateStatusPanel();
  }

  // Reset the player position and visible caches
  public resetGame(): void {
    playerPosition = { x: 0, y: 0 };
    this.visibleCaches.clear();
    this.saveState();
    this.updateStatusPanel();
  }

  // Update the status panel on the webpage
  private updateStatusPanel(): void {
    const statusPanel = document.getElementById("statusPanel");
    if (statusPanel) {
      statusPanel.innerHTML =
        `Player Position: (${playerPosition.x}, ${playerPosition.y})<br />Visible Caches: ${
          Array.from(this.visibleCaches).join(", ")
        }`;
    }
  }
}

// Initialize the game
const game = new Game();

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
      <ul id="coinList">${cacheCoins.map((id) => `<li>${id}</li>`).join("")}
      </ul>
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

// Attach the movePlayer function to the global scope
Object.assign(window, {
  movePlayer: game.movePlayer.bind(game),
  undoMove: game.undoMove.bind(game),
  resetGame: game.resetGame.bind(game),
});

// Button event listeners for directional movement
document.getElementById("north")!.addEventListener(
  "click",
  () => game.movePlayer("up"),
);
document.getElementById("south")!.addEventListener(
  "click",
  () => game.movePlayer("down"),
);
document.getElementById("west")!.addEventListener(
  "click",
  () => game.movePlayer("left"),
);
document.getElementById("east")!.addEventListener(
  "click",
  () => game.movePlayer("right"),
);
document.getElementById("reset")!.addEventListener(
  "click",
  () => game.resetGame(),
);

// Increment the score when player moves
function incrementScore() {
  score++;
  updateDisplay();
}
