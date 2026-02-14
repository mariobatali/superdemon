import { GameAuto } from './GameAuto.js';

// Expose Game to window for button onclick handlers in HTML
window.Game = GameAuto;

window.onload = () => {
    GameAuto.init();
};
