import { getSynthWasm } from '../synth.js';
import { audioBufferToWav } from './audiobuffertowav.js';
import { AudioWorkletProcessorUrl } from './audioworkletprocessor.js';
import { setProgressbarValue } from '../ui/progressbar.js';

import styleCss from '../style.css.js';

let musicInitialized = false;
let realtimeAudioWorkletNode;
let latestEventList;

const TOGGLE_PLAYPAUSE_PLAY = 'Play';
const TOGGLE_PLAYPAUSE_PAUSE = 'Pause';

export async function connectAudioWorklet(audioctx) {
    const wasmsynth = await getSynthWasm();

    await audioctx.audioWorklet.addModule(AudioWorkletProcessorUrl);
    const audioworkletnode = new AudioWorkletNode(audioctx, 'asc-midisynth-audio-worklet-processor', {
        outputChannelCount: [2]
    });
    audioworkletnode.port.start();

    audioworkletnode.port.postMessage({
        samplerate: audioctx.sampleRate,
        wasm: wasmsynth
    });
    await new Promise(resolve => audioworkletnode.port.onmessage = msg => {
        if (msg.data.wasmloaded) {
            resolve();
        }
    });

    audioworkletnode.connect(audioctx.destination);
    return audioworkletnode;
}

export async function playMusic() {
    if (musicInitialized) {
        return;
    }
    musicInitialized = true;
    const audioctx = new AudioContext();
    audioctx.resume();

    realtimeAudioWorkletNode = await connectAudioWorklet(audioctx);
}

export function pauseMusic() {
    realtimeAudioWorkletNode.port.postMessage({
        isPlaying: false
    });
}

export function resumeMusic() {
    realtimeAudioWorkletNode.port.postMessage({
        isPlaying: true
    });
}

export function postEventList(eventList) {
    latestEventList = eventList;
    realtimeAudioWorkletNode.port.postMessage({
        sequencedata: eventList
    });
}

export async function exportWav() {
    const duration = latestEventList[latestEventList.length - 1].time / 1000;
    const renderSampleRate = 44100;
    const offlineCtx = new OfflineAudioContext(2,
        duration * renderSampleRate,
        renderSampleRate);
    
    const audioWorkletNode = await connectAudioWorklet(offlineCtx);
    audioWorkletNode.port.postMessage({
        sequencedata: latestEventList
    });

    let rendering = true;
    const updateProgressBar = () => requestAnimationFrame(() => {
        setProgressbarValue(offlineCtx.currentTime / duration);
        if (rendering) {
            updateProgressBar();
        } else {
            setProgressbarValue(null);
        }
    });
    updateProgressBar();

    const result = await offlineCtx.startRendering();
    const wavbytes = audioBufferToWav(result);

    const url = URL.createObjectURL(new Blob([wavbytes], {type: 'audio/wav'}));
    const filename = 'music.wav';
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.documentElement.appendChild(a);
    a.click();
    a.remove();

    rendering = false;
}

customElements.define('audio-player', class AudioPlayer extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode: 'open'});
        this.shadowRoot.innerHTML = /*html*/`
            <style>${styleCss}</style>
            <button id="togglePlayPauseButton">${TOGGLE_PLAYPAUSE_PAUSE}</button>
            <button id="exportWavButton">Export WAV</button>
        `;

        const togglePlayPauseButton = this.shadowRoot.querySelector('#togglePlayPauseButton');
        togglePlayPauseButton.addEventListener('click', () => {
            if (togglePlayPauseButton.innerHTML==TOGGLE_PLAYPAUSE_PAUSE) {
                pauseMusic();
                togglePlayPauseButton.innerHTML=TOGGLE_PLAYPAUSE_PLAY;
            } else {
                resumeMusic();
                togglePlayPauseButton.innerHTML=TOGGLE_PLAYPAUSE_PAUSE;
            }
        });
        const exportWavButton = this.shadowRoot.querySelector('#exportWavButton');
        exportWavButton.addEventListener('click', () => {
            exportWav();
        });
    }
});