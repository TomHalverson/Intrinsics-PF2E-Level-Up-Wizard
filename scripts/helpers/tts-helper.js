// Intrinsics PF2e Level Up Wizard - Text-to-Speech Helper
// Provides text-to-speech functionality using the Web Speech API

const MODULE_NAME = 'intrinsics-pf2e-level-up-wizard';

/**
 * Text-to-Speech Helper Class
 * Manages speech synthesis for accessibility
 */
export class TTSHelper {
  static _instance = null;
  static _currentUtterance = null;
  static _isSpeaking = false;
  static _speakingButton = null;

  /**
   * Check if TTS is enabled in settings
   * @returns {boolean}
   */
  static isEnabled() {
    return game.settings.get(MODULE_NAME, 'text-to-speech');
  }

  /**
   * Check if the browser supports speech synthesis
   * @returns {boolean}
   */
  static isSupported() {
    return 'speechSynthesis' in window;
  }

  /**
   * Get available voices
   * @returns {SpeechSynthesisVoice[]}
   */
  static getVoices() {
    if (!this.isSupported()) return [];
    return speechSynthesis.getVoices();
  }

  /**
   * Get the selected voice from settings
   * @returns {SpeechSynthesisVoice|null}
   */
  static getSelectedVoice() {
    const voiceIndex = game.settings.get(MODULE_NAME, 'tts-voice');
    if (!voiceIndex) return null;
    
    const voices = this.getVoices();
    const index = parseInt(voiceIndex);
    return voices[index] || null;
  }

  /**
   * Get the speech rate from settings
   * @returns {number}
   */
  static getSpeechRate() {
    return game.settings.get(MODULE_NAME, 'tts-rate') || 1;
  }

  /**
   * Speak the given text
   * @param {string} text - The text to speak
   * @param {HTMLElement} [button] - Optional button element to update UI state
   * @returns {Promise<void>}
   */
  static speak(text, button = null) {
    return new Promise((resolve, reject) => {
      if (!this.isSupported()) {
        ui.notifications.warn('Text-to-speech is not supported in your browser.');
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      if (!this.isEnabled()) {
        reject(new Error('Text-to-speech is disabled'));
        return;
      }

      // Stop any current speech
      this.stop();

      // Clean the text for speech (remove HTML, normalize whitespace)
      const cleanText = this.cleanTextForSpeech(text);
      
      if (!cleanText.trim()) {
        reject(new Error('No text to speak'));
        return;
      }

      // Create utterance
      const utterance = new SpeechSynthesisUtterance(cleanText);
      
      // Apply settings
      const voice = this.getSelectedVoice();
      if (voice) {
        utterance.voice = voice;
      }
      utterance.rate = this.getSpeechRate();
      utterance.pitch = 1;
      utterance.volume = 1;

      // Track state
      this._currentUtterance = utterance;
      this._isSpeaking = true;
      this._speakingButton = button;

      // Update button state
      if (button) {
        button.classList.add('speaking');
        const icon = button.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-volume-up');
          icon.classList.add('fa-stop');
        }
      }

      // Event handlers
      utterance.onend = () => {
        this._cleanup();
        resolve();
      };

      utterance.onerror = (event) => {
        this._cleanup();
        if (event.error !== 'canceled') {
          console.error(`${MODULE_NAME} | TTS Error:`, event.error);
          reject(new Error(event.error));
        } else {
          resolve(); // Canceled is not an error
        }
      };

      // Start speaking
      speechSynthesis.speak(utterance);
    });
  }

  /**
   * Stop current speech
   */
  static stop() {
    if (this.isSupported()) {
      speechSynthesis.cancel();
    }
    this._cleanup();
  }

  /**
   * Toggle speech - start if not speaking, stop if speaking
   * @param {string} text - The text to speak
   * @param {HTMLElement} [button] - Optional button element
   */
  static toggle(text, button = null) {
    if (this._isSpeaking) {
      this.stop();
    } else {
      this.speak(text, button).catch(err => {
        if (err.message !== 'canceled') {
          console.warn(`${MODULE_NAME} | TTS:`, err.message);
        }
      });
    }
  }

  /**
   * Check if currently speaking
   * @returns {boolean}
   */
  static isSpeaking() {
    return this._isSpeaking;
  }

  /**
   * Clean up state after speech ends
   * @private
   */
  static _cleanup() {
    this._isSpeaking = false;
    this._currentUtterance = null;
    
    if (this._speakingButton) {
      this._speakingButton.classList.remove('speaking');
      const icon = this._speakingButton.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-stop');
        icon.classList.add('fa-volume-up');
      }
      this._speakingButton = null;
    }
  }

  /**
   * Clean text for speech synthesis
   * Removes HTML tags, normalizes whitespace, handles special characters
   * @param {string} text - Raw text/HTML to clean
   * @returns {string} - Cleaned text ready for speech
   */
  static cleanTextForSpeech(text) {
    if (!text) return '';

    // Create a temporary div to parse HTML
    const div = document.createElement('div');
    div.innerHTML = text;

    // Replace certain elements with spoken equivalents
    div.querySelectorAll('br').forEach(br => br.replaceWith(' '));
    div.querySelectorAll('p').forEach(p => p.append(' '));
    div.querySelectorAll('li').forEach(li => li.prepend('• '));
    
    // Get text content
    let cleanText = div.textContent || div.innerText || '';

    // Normalize whitespace
    cleanText = cleanText.replace(/\s+/g, ' ').trim();

    // Replace common gaming abbreviations for better pronunciation
    cleanText = cleanText
      .replace(/\bDC\b/g, 'D C')
      .replace(/\bHP\b/g, 'hit points')
      .replace(/\bAC\b/g, 'armor class')
      .replace(/\bSTR\b/gi, 'Strength')
      .replace(/\bDEX\b/gi, 'Dexterity')
      .replace(/\bCON\b/gi, 'Constitution')
      .replace(/\bINT\b/gi, 'Intelligence')
      .replace(/\bWIS\b/gi, 'Wisdom')
      .replace(/\bCHA\b/gi, 'Charisma')
      .replace(/\bft\b/g, 'feet')
      .replace(/\+(\d+)/g, 'plus $1')
      .replace(/-(\d+)/g, 'minus $1');

    // Handle dice notation (e.g., 2d6 -> "two d six")
    cleanText = cleanText.replace(/(\d+)d(\d+)/gi, (match, num, sides) => {
      return `${num} d ${sides}`;
    });

    return cleanText;
  }

  /**
   * Create a TTS button element
   * @param {string} text - The text this button will read (can be null to read from parent data-tts)
   * @param {object} [options] - Button options
   * @param {boolean} [options.small] - Use small button variant
   * @param {string} [options.ariaLabel] - Custom aria label
   * @param {HTMLElement} [options.ttsElement] - Element containing data-tts attribute to read from dynamically
   * @returns {HTMLElement}
   */
  static createButton(text, options = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tts-button${options.small ? ' tts-button-small' : ''}`;
    button.setAttribute('aria-label', options.ariaLabel || game.i18n.localize('intrinsics-pf2e-level-up-wizard.buttons.read-aloud'));
    button.setAttribute('title', game.i18n.localize('intrinsics-pf2e-level-up-wizard.buttons.read-aloud'));
    button.innerHTML = '<i class="fas fa-volume-up"></i>';

    // Store reference to the TTS element for dynamic text reading
    const ttsElement = options.ttsElement;

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      // Read text dynamically from data-tts attribute if ttsElement is provided
      // This ensures we get the current text even after re-renders
      let currentText = text;
      if (ttsElement) {
        currentText = ttsElement.getAttribute('data-tts') || ttsElement.textContent;
      }
      
      this.toggle(currentText, button);
    });

    return button;
  }

  /**
   * Add TTS buttons to a container element
   * Finds elements with [data-tts] attribute and adds buttons
   * @param {HTMLElement} container - The container to search within
   */
  static addButtonsToContainer(container) {
    if (!this.isEnabled()) return;

    container.querySelectorAll('[data-tts]').forEach(element => {
      // Don't add duplicate buttons
      if (element.querySelector('.tts-button')) return;

      const text = element.getAttribute('data-tts') || element.textContent;
      const isSmall = element.hasAttribute('data-tts-small');
      // Pass the element reference so the button can read current data-tts on click
      const button = this.createButton(text, { small: isSmall, ttsElement: element });
      
      // Find the best place to insert the button
      const header = element.querySelector('h1, h2, h3, h4, .name, .title');
      if (header) {
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.appendChild(button);
      } else {
        element.appendChild(button);
      }
    });
  }

  /**
   * Initialize TTS voices (call on module ready)
   * Voices may not be immediately available, so we need to wait
   */
  static async initialize() {
    if (!this.isSupported()) {
      console.log(`${MODULE_NAME} | Text-to-speech not supported in this browser`);
      return;
    }

    // Some browsers load voices asynchronously
    return new Promise((resolve) => {
      const voices = this.getVoices();
      if (voices.length > 0) {
        resolve();
        return;
      }

      // Wait for voices to load
      speechSynthesis.addEventListener('voiceschanged', () => {
        resolve();
      }, { once: true });

      // Timeout after 3 seconds
      setTimeout(resolve, 3000);
    });
  }
}

// Export for use in other modules
export default TTSHelper;
