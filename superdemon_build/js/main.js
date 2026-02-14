import { Game } from './Game.js';

// Expose Game to window for button onclick handlers in HTML
window.Game = Game;

window.onload = () => {
    Game.init();
};
