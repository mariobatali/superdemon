import { GameConsumable } from './GameConsumable.js';

// Expose Game to window for button onclick handlers in HTML
// The HTML calls "Game.start()", so we map our new Game object to window.Game
window.Game = GameConsumable;

window.onload = () => {
    GameConsumable.init();
};
