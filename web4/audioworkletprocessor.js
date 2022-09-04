export function AudioWorkletModuleFunc() {
    const SAMPLE_FRAMES = 128;

    class AssemblyScriptMidiSynthAudioWorkletProcessor extends AudioWorkletProcessor {

        constructor() {
            super();
            this.processorActive = true;
            this.playMidiSequence = true;
            this.currentFrame = 0;
            this.sequenceIndex = 0;

            this.port.onmessage = async (msg) => {
                if (msg.data.wasm) {
                    this.wasmInstancePromise = WebAssembly.instantiate(msg.data.wasm, {
                        environment: { SAMPLERATE: msg.data.samplerate },
                        env: {
                            abort: () => console.log('webassembly synth abort, should not happen')
                        }
                    });

                    const wasmInstance = (await this.wasmInstancePromise).instance.exports;
                    this.wasmInstance = wasmInstance;
                    this.port.postMessage({ wasmloaded: true });
                }

                if (msg.data.sequencedata) {
                    this.allNotesOff();
                    this.sequence = msg.data.sequencedata;
                    this.currentFrame = 0;
                    this.sequenceIndex = 0;
                }

                if (msg.data.currentTime) {
                    this.port.postMessage({
                        currentTime: this.wasmInstance.currentTimeMillis.value,
                        activeVoicesStatusSnapshot: new Uint8Array(this.wasmInstance.memory.buffer,
                            this.wasmInstance.getActiveVoicesStatusSnapshot(),
                            32*3).slice(0)
                    });
                }
            };
            this.port.start();
        }

        getCurrentTime() {
            return (this.currentFrame / sampleRate) * 1000;
        }

        allNotesOff() {
            if (this.wasmInstance) {
                this.wasmInstance.allNotesOff();
                for (let ch = 0; ch < 16; ch++) {
                    this.wasmInstance.shortmessage(
                        0xb0 + ch, 64, 0  // reset sustain pedal
                    );
                }
            }
        }

        process(inputs, outputs, parameters) {
            const output = outputs[0];

            if (this.wasmInstance) {
                let currentTime = this.getCurrentTime();

                if (this.sequence) {
                    while (this.sequenceIndex < this.sequence.length &&
                        this.sequence[this.sequenceIndex] && // sometimes this is undefined for yet unkown reasons
                        this.sequence[this.sequenceIndex].time < currentTime) {

                        const message = this.sequence[this.sequenceIndex].message;
                        this.wasmInstance.shortmessage(message[0], message[1], message[2]);
                        this.sequenceIndex++;
                    }
                    this.currentFrame += 128;
                    if (this.sequenceIndex >= this.sequence.length) {
                        this.currentFrame = 0;
                        this.sequenceIndex = 0;
                    }                    
                }
            }
            this.wasmInstance.fillSampleBuffer();
            output[0].set(new Float32Array(this.wasmInstance.memory.buffer,
                this.wasmInstance.samplebuffer,
                SAMPLE_FRAMES));
            output[1].set(new Float32Array(this.wasmInstance.memory.buffer,
                this.wasmInstance.samplebuffer + (SAMPLE_FRAMES * 4),
                SAMPLE_FRAMES));

            return this.processorActive;
        }
    }

    registerProcessor('asc-midisynth-audio-worklet-processor', AssemblyScriptMidiSynthAudioWorkletProcessor);
}

const functionSource = AudioWorkletModuleFunc.toString();
const functionSourceUnwrapped = functionSource.substring(functionSource.indexOf('{') + 1, functionSource.lastIndexOf('}'));
export const AudioWorkletProcessorUrl = URL.createObjectURL(new Blob([functionSourceUnwrapped], { type: 'text/javascript' }));