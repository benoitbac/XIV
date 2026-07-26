import './styles/game.css';
import { Game } from './Game.ts';
import { Menus } from './ui/Menus.ts';
import { audio } from './core/Audio.ts';
import { warmMaterials } from './render/textures.ts';

const canvas = document.getElementById('viewport') as HTMLCanvasElement | null;
const overlay = document.getElementById('overlay');
const boot = document.getElementById('boot');

if (!canvas || !overlay) {
  throw new Error('XIV: missing #viewport or #overlay in the page.');
}

// WebGL2 is required for the depth-texture read the ink pass depends on.
if (!canvas.getContext('webgl2')) {
  overlay.innerHTML = `
    <div class="fatal">
      <div class="fatal__numeral">XIV</div>
      <h1>WebGL 2 indisponible</h1>
      <p>Ce navigateur ne peut pas dessiner la planche. Essaie Chrome, Edge ou Firefox à jour,
      et vérifie que l’accélération matérielle est activée.</p>
    </div>`;
} else {
  const game = new Game(canvas, overlay);
  new Menus(game, overlay);

  // The audio context can only start from a gesture. The listener stays put
  // until the context is genuinely running: a first gesture the browser doesn't
  // consider trusted leaves it created but suspended, and unsubscribing there
  // means nothing ever starts the sound again.
  const unlock = (): void => {
    audio.unlock();
    if (!audio.ready) return;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // Clicking the canvas after a pause takes the pointer back.
  canvas.addEventListener('pointerdown', () => {
    if (game.state === 'playing' && !game.input.locked) game.input.requestLock();
  });

  game.loop.start();
  game.setState('title');
  boot?.remove();

  // Bake the procedural materials behind the title screen, so pressing Start
  // doesn't stall on a couple of seconds of texture synthesis.
  warmMaterials();

  // Handy for poking at the running game from the console.
  Object.assign(window, { xiv: game });
}
