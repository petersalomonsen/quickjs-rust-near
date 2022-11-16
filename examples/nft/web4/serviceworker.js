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

let wasmInstancePromise = new Promise(async resolve => {
    self.addEventListener('message', async (event) => {
        if (event.data && event.data.wasmbytes) {
            console.log('got wasmbytes');
            resolve((await WebAssembly.instantiate(event.data.wasmbytes,
            {
                environment: {
                    SAMPLERATE: SAMPLERATE
                }
            })).instance.exports);
        }
    });
});;

let currentBytePos = 0;

const samplesLength = 2 * 60 * SAMPLERATE * 4 * 2;
const totalLength = samplesLength + WAV_HEADER_LENGTH;
const wavfilebytes = new Uint8Array(totalLength);

async function createWav() {
    console.log('create wav');
    const wasmInstance = await wasmInstancePromise;
    
    const samplebuffer = wasmInstance.allocateSampleBuffer ? wasmInstance.allocateSampleBuffer(SAMPLE_FRAMES) : wasmInstance.samplebuffer;

    const leftbuffer = new Float32Array(wasmInstance.memory.buffer,
        samplebuffer,
        SAMPLE_FRAMES);
    const rightbuffer = new Float32Array(wasmInstance.memory.buffer,
        samplebuffer + (SAMPLE_FRAMES * 4),
        SAMPLE_FRAMES);

    const rawsamplesview = new DataView(wavfilebytes.buffer);
    writeWavHeader(samplesLength, SAMPLERATE, 2, 32, rawsamplesview);

    let pos = WAV_HEADER_LENGTH;

    let lastIdleTime = new Date().getTime();
    while (pos < totalLength) {        
        wasmInstance.playEventsAndFillSampleBuffer ? wasmInstance.playEventsAndFillSampleBuffer() : wasmInstance.fillSampleBuffer();

        for (let bufferpos = 0; bufferpos < SAMPLE_FRAMES && pos < totalLength; bufferpos++) {
            rawsamplesview.setFloat32(pos, leftbuffer[bufferpos], true);
            pos += 4;
            rawsamplesview.setFloat32(pos, rightbuffer[bufferpos], true);
            pos += 4;
        }

        if (new Date().getTime() - lastIdleTime > 50) {
            // release resources every 50 msecs
            await new Promise(r => setTimeout(r, 0));
            lastIdleTime = new Date().getTime();
            console.log(pos / totalLength);
        }
        currentBytePos = pos;
    }
}

let wavpromise;

self.addEventListener('fetch', (event) =>
    event.respondWith(new Promise(async resolve => {
        if (event.request.url.indexOf('.wav') > -1 && event.request.headers.has('range')) {
            if (!wavpromise) {
                wavpromise = createWav();
            }

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
