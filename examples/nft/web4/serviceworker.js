const SAMPLE_FRAMES = 128;
const CHUNK_BUFFERS = 512;
const SAMPLERATE = 44100;
const WAV_HEADER_LENGTH = 44;

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    self.clients.claim();
});

function writeWavHeader(sampleslength, sampleRate, numChannels, bitDepth, view) {
    var bytesPerSample = bitDepth / 8;
    var blockAlign = numChannels * bytesPerSample;

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* RIFF chunk length */
    view.setUint32(4, 36 + sampleslength * bytesPerSample, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, 3, true);
    /* channel count */
    view.setUint16(22, numChannels, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * blockAlign, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, blockAlign, true);
    /* bits per sample */
    view.setUint16(34, bitDepth, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, sampleslength * bytesPerSample, true);
}

function writeFloat32(output, offset, input) {
    for (var i = 0; i < input.length; i++, offset += 4) {
        output.setFloat32(offset, input[i], true)
    }
}

function writeString(view, offset, string) {
    for (var i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
    }
}

let samplesLength = 0;
let totalLength;
let wavfilebytes = null;

const wasmInstances = [];
const wasmInstancesReceivedPromise = new Promise(resolve => {
    self.addEventListener('message', async (event) => {
        if (!wavfilebytes && event.data && event.data.wasmbytes) {
            wasmInstances.push({
                instanceExportsPromise: (await WebAssembly.instantiate(event.data.wasmbytes,
                    {
                        environment: {
                            SAMPLERATE: SAMPLERATE
                        }
                    })).instance.exports,
                durationSeconds: event.data.durationSeconds
            });

            samplesLength += (event.data.durationSeconds * SAMPLERATE * 4 * 2);

            if (event.data.lastInstance == true) {
                totalLength = samplesLength + WAV_HEADER_LENGTH;
                wavfilebytes = new Uint8Array(totalLength);
                console.log('all instances received', wasmInstances.length);
                resolve();
            }
        }
    });
});

let currentBytePos = 0;

async function createWav() {
    console.log('create wav');
    await wasmInstancesReceivedPromise;

    const rawsamplesview = new DataView(wavfilebytes.buffer);
    writeWavHeader(samplesLength, SAMPLERATE, 2, 32, rawsamplesview);

    let pos = WAV_HEADER_LENGTH;

    for (let n = 0; n < wasmInstances.length; n++) {
        const instanceData = wasmInstances[n];
        console.log('rendering wasminstance', n, instanceData.durationSeconds);
        const endpos = pos + instanceData.durationSeconds * SAMPLERATE * 4 * 2
        const wasmInstance = await instanceData.instanceExportsPromise;

        const samplebuffer = wasmInstance.allocateSampleBuffer ? wasmInstance.allocateSampleBuffer(SAMPLE_FRAMES) : wasmInstance.samplebuffer;

        let lastIdleTime = new Date().getTime();
        while (pos < endpos && pos < totalLength) {
            wasmInstance.playEventsAndFillSampleBuffer != undefined ?
                wasmInstance.playEventsAndFillSampleBuffer() :
                wasmInstance.fillSampleBuffer();

            const leftbuffer = new Float32Array(wasmInstance.memory.buffer,
                samplebuffer,
                SAMPLE_FRAMES);
            const rightbuffer = new Float32Array(wasmInstance.memory.buffer,
                samplebuffer + (SAMPLE_FRAMES * 4),
                SAMPLE_FRAMES);

            for (let bufferpos = 0; bufferpos < SAMPLE_FRAMES && pos < totalLength; bufferpos++) {
                rawsamplesview.setFloat32(pos, leftbuffer[bufferpos], true);
                pos += 4;
                rawsamplesview.setFloat32(pos, rightbuffer[bufferpos], true);
                pos += 4;
            }

            if (new Date().getTime() - lastIdleTime > 50) {
                // release resources every 50 msecs
                await new Promise(r => setTimeout(r, 1));
                lastIdleTime = new Date().getTime();
                console.log(n, pos / totalLength, pos, endpos);
            }
            currentBytePos = pos;
        }
    }
    console.log('all audio rendered');
}

const wavpromise = createWav();

self.addEventListener('fetch', (event) =>
    event.respondWith(new Promise(async resolve => {
        if (event.request.url.indexOf('.wav') > -1 && event.request.headers.has('range')) {
            while (currentBytePos == 0) {
                await new Promise(r => setTimeout(() => r(), 20));
            }
            const range = event.request.headers.get('range').match(/bytes=([0-9]+)-([0-9]*)/);
            let rangeStart = parseInt(range[1]);
            let rangeEnd = range[2] ? parseInt(range[2]) : currentBytePos;

            if (rangeEnd >= currentBytePos) {
                rangeEnd = currentBytePos - 1;
            }

            if (rangeStart > rangeEnd) {
                rangeStart = rangeEnd;
            }

            const respondblob = new Blob([wavfilebytes.buffer.slice(rangeStart, rangeEnd + 1)], { type: 'audio/wav' });
            resolve(new Response(respondblob, {
                status: 206,
                statusText: 'Partial Content',
                headers: {
                    'Content-Range': `bytes ${rangeStart}-${rangeEnd}/${totalLength}`
                }
            }));
        } else {
            resolve(fetch(event.request));
        }
    }))
);
