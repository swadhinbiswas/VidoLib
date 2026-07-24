import { Player } from '@vidolib/core';

export interface PlayerUIOptions {
  showPiP?: boolean;
  showFullscreen?: boolean;
  showVolume?: boolean;
}

export class PlayerUI {
  private container: HTMLElement;
  private controlsBar!: HTMLDivElement;
  private playBtn!: HTMLButtonElement;
  private timeSlider!: HTMLInputElement;
  private timeDisplay!: HTMLSpanElement;
  private volumeBtn!: HTMLButtonElement;
  private volumeSlider!: HTMLInputElement;
  private pipBtn!: HTMLButtonElement;
  private fullscreenBtn!: HTMLButtonElement;
  private loadingSpinner!: HTMLDivElement;
  private replayBtn!: HTMLButtonElement;
  private isMuted: boolean = false;
  private volume: number = 1;
  private options: PlayerUIOptions;

  constructor(private player: Player, containerElement: HTMLElement, options?: PlayerUIOptions) {
    this.container = containerElement;
    this.options = options || {};
    this.initDOM();
    this.bindEvents();
    this.bindKeyboardNav();
  }

  private initDOM(): void {
    this.container.classList.add('vidolib-container');
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'VidoLib Media Player Controls');
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.style.backgroundColor = '#000';

    const style = document.createElement('style');
    style.textContent = `
      .vidolib-controls {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 52px;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(12px);
        display: flex;
        align-items: center;
        padding: 0 16px;
        gap: 12px;
        color: #F8FAFC;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        box-sizing: border-box;
        z-index: 100;
      }
      .vidolib-btn {
        background: transparent;
        border: none;
        color: #F8FAFC;
        cursor: pointer;
        padding: 6px;
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .vidolib-btn:focus-visible {
        outline: 2px solid #38BDF8;
        outline-offset: 2px;
      }
      .vidolib-btn:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .vidolib-slider {
        accent-color: #38BDF8;
        cursor: pointer;
        flex: 1;
      }
      .vidolib-loading {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 48px;
        height: 48px;
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-top-color: #38BDF8;
        border-radius: 50%;
        animation: vidolib-spin 1s linear infinite;
        z-index: 50;
        display: none;
      }
      .vidolib-replay {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 64px;
        height: 64px;
        background: rgba(0, 0, 0, 0.7);
        border: none;
        border-radius: 50%;
        color: white;
        font-size: 24px;
        cursor: pointer;
        z-index: 50;
        display: none;
      }
      .vidolib-replay:hover {
        background: rgba(0, 0, 0, 0.9);
      }
      @keyframes vidolib-spin {
        to { transform: translate(-50%, -50%) rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    // Loading spinner
    this.loadingSpinner = document.createElement('div');
    this.loadingSpinner.className = 'vidolib-loading';
    this.loadingSpinner.setAttribute('aria-hidden', 'true');
    this.container.appendChild(this.loadingSpinner);

    // Replay button
    this.replayBtn = document.createElement('button');
    this.replayBtn.className = 'vidolib-replay';
    this.replayBtn.setAttribute('aria-label', 'Replay');
    this.replayBtn.innerHTML = '▶';
    this.replayBtn.style.display = 'none';
    this.container.appendChild(this.replayBtn);

    this.controlsBar = document.createElement('div');
    this.controlsBar.className = 'vidolib-controls';

    // Play button
    this.playBtn = document.createElement('button');
    this.playBtn.className = 'vidolib-btn';
    this.playBtn.setAttribute('aria-label', 'Play');
    this.playBtn.innerHTML = '▶';

    // Time slider
    this.timeSlider = document.createElement('input');
    this.timeSlider.type = 'range';
    this.timeSlider.className = 'vidolib-slider';
    this.timeSlider.min = '0';
    this.timeSlider.max = '100';
    this.timeSlider.value = '0';
    this.timeSlider.setAttribute('aria-label', 'Seek timeline');
    this.timeSlider.setAttribute('aria-valuemin', '0');
    this.timeSlider.setAttribute('aria-valuemax', '100');
    this.timeSlider.setAttribute('aria-valuenow', '0');

    // Time display
    this.timeDisplay = document.createElement('span');
    this.timeDisplay.textContent = '00:00 / 00:00';
    this.timeDisplay.setAttribute('aria-live', 'polite');

    // Volume button
    this.volumeBtn = document.createElement('button');
    this.volumeBtn.className = 'vidolib-btn';
    this.volumeBtn.setAttribute('aria-label', 'Mute');
    this.volumeBtn.innerHTML = '🔊';

    // Volume slider
    this.volumeSlider = document.createElement('input');
    this.volumeSlider.type = 'range';
    this.volumeSlider.className = 'vidolib-slider';
    this.volumeSlider.style.width = '60px';
    this.volumeSlider.min = '0';
    this.volumeSlider.max = '1';
    this.volumeSlider.step = '0.05';
    this.volumeSlider.value = '1';
    this.volumeSlider.setAttribute('aria-label', 'Volume level');
    this.volumeSlider.setAttribute('aria-valuemin', '0');
    this.volumeSlider.setAttribute('aria-valuemax', '1');
    this.volumeSlider.setAttribute('aria-valuenow', '1');

    // PiP button
    this.pipBtn = document.createElement('button');
    this.pipBtn.className = 'vidolib-btn';
    this.pipBtn.setAttribute('aria-label', 'Picture in Picture');
    this.pipBtn.innerHTML = '⧉';
    this.pipBtn.style.display = this.options.showPiP === false ? 'none' : '';

    // Fullscreen button
    this.fullscreenBtn = document.createElement('button');
    this.fullscreenBtn.className = 'vidolib-btn';
    this.fullscreenBtn.setAttribute('aria-label', 'Toggle Fullscreen');
    this.fullscreenBtn.innerHTML = '⛶';
    this.fullscreenBtn.style.display = this.options.showFullscreen === false ? 'none' : '';

    // Assemble controls
    this.controlsBar.appendChild(this.playBtn);
    this.controlsBar.appendChild(this.timeSlider);
    this.controlsBar.appendChild(this.timeDisplay);
    
    if (this.options.showVolume !== false) {
      this.controlsBar.appendChild(this.volumeBtn);
      this.controlsBar.appendChild(this.volumeSlider);
    }
    
    this.controlsBar.appendChild(this.pipBtn);
    this.controlsBar.appendChild(this.fullscreenBtn);

    this.container.appendChild(this.controlsBar);
  }

  private bindEvents(): void {
    // Play/Pause button
    this.playBtn.onclick = () => {
      if (this.player.getState() === 'playing') {
        this.player.pause();
      } else {
        this.player.play();
      }
    };

    // Time slider
    this.timeSlider.oninput = () => {
      const seekTarget = parseFloat(this.timeSlider.value);
      this.player.seek(seekTarget);
    };

    // Volume slider
    this.volumeSlider.oninput = () => {
      this.volume = parseFloat(this.volumeSlider.value);
      this.player.setVolume(this.volume);
      this.player.setMuted(false);
      this.isMuted = false;
      this.updateVolumeIcon();
      this.volumeSlider.setAttribute('aria-valuenow', String(this.volume));
    };

    // Mute button
    this.volumeBtn.onclick = () => {
      this.isMuted = !this.isMuted;
      this.player.setMuted(this.isMuted);
      this.updateVolumeIcon();
    };

    // PiP button
    this.pipBtn.onclick = async () => {
      try {
        const videoElement = this.container.querySelector('video') as HTMLVideoElement;
        if (videoElement) {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else if (videoElement.requestPictureInPicture) {
            await videoElement.requestPictureInPicture();
          }
        }
      } catch (e) {
        console.warn('Picture-in-Picture not supported:', e);
      }
    };

    // Fullscreen button
    this.fullscreenBtn.onclick = async () => {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else if (this.container.requestFullscreen) {
          await this.container.requestFullscreen();
        }
      } catch (e) {
        console.warn('Fullscreen not supported:', e);
      }
    };

    // Replay button
    this.replayBtn.onclick = () => {
      this.player.seek(0);
      this.player.play();
      this.replayBtn.style.display = 'none';
    };

    // Player state changes
    this.player.on('statechange', (state) => {
      if (state === 'playing') {
        this.playBtn.innerHTML = '⏸';
        this.playBtn.setAttribute('aria-label', 'Pause');
        this.loadingSpinner.style.display = 'none';
        this.replayBtn.style.display = 'none';
      } else if (state === 'paused') {
        this.playBtn.innerHTML = '▶';
        this.playBtn.setAttribute('aria-label', 'Play');
      } else if (state === 'loading') {
        this.loadingSpinner.style.display = 'block';
      } else if (state === 'ended') {
        this.playBtn.innerHTML = '▶';
        this.playBtn.setAttribute('aria-label', 'Play');
        this.replayBtn.style.display = 'block';
      }
    });

    // Time updates
    this.player.on('timeupdate', (timeSeconds: any) => {
      const dur = this.player.getDuration() || 100;
      this.timeSlider.max = String(dur);
      this.timeSlider.value = String(timeSeconds || 0);
      this.timeSlider.setAttribute('aria-valuenow', String(timeSeconds || 0));
      this.timeDisplay.textContent = `${this.formatTime(timeSeconds || 0)} / ${this.formatTime(dur)}`;
    });

    // Fullscreen change
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        this.fullscreenBtn.innerHTML = '⛶';
        this.fullscreenBtn.setAttribute('aria-label', 'Exit Fullscreen');
      } else {
        this.fullscreenBtn.innerHTML = '⛶';
        this.fullscreenBtn.setAttribute('aria-label', 'Toggle Fullscreen');
      }
    });
  }

  private bindKeyboardNav(): void {
    this.container.tabIndex = 0;
    this.container.onkeydown = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          this.playBtn.click();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.player.seek(Math.max(0, this.player.getCurrentTime() - 5));
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.player.seek(this.player.getCurrentTime() + 5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.volume = Math.min(1, this.volume + 0.1);
          this.player.setVolume(this.volume);
          this.volumeSlider.value = String(this.volume);
          this.updateVolumeIcon();
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.volume = Math.max(0, this.volume - 0.1);
          this.player.setVolume(this.volume);
          this.volumeSlider.value = String(this.volume);
          this.updateVolumeIcon();
          break;
        case 'm':
          e.preventDefault();
          this.volumeBtn.click();
          break;
        case 'f':
          e.preventDefault();
          this.fullscreenBtn.click();
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
          break;
      }
    };
  }

  private updateVolumeIcon(): void {
    if (this.isMuted || this.volume === 0) {
      this.volumeBtn.innerHTML = '🔇';
      this.volumeBtn.setAttribute('aria-label', 'Unmute');
    } else if (this.volume < 0.5) {
      this.volumeBtn.innerHTML = '🔉';
      this.volumeBtn.setAttribute('aria-label', 'Mute');
    } else {
      this.volumeBtn.innerHTML = '🔊';
      this.volumeBtn.setAttribute('aria-label', 'Mute');
    }
  }

  private formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  public destroy(): void {
    // Remove event listeners
    this.playBtn.onclick = null;
    this.timeSlider.oninput = null;
    this.volumeSlider.oninput = null;
    this.volumeBtn.onclick = null;
    this.pipBtn.onclick = null;
    this.fullscreenBtn.onclick = null;
    this.replayBtn.onclick = null;
    this.container.onkeydown = null;
    
    // Remove DOM elements
    this.container.removeChild(this.controlsBar);
    this.container.removeChild(this.loadingSpinner);
    this.container.removeChild(this.replayBtn);
  }
}
