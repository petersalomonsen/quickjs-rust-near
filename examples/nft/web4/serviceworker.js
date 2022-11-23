const SAMPLE_FRAMES = 128;
const CHUNK_BUFFERS = 512;
const SAMPLERATE = 44100;
const WAV_HEADER_LENGTH = 44;
const ONE_SECOND = SAMPLERATE * 2 * 4;

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
            const durationBytes = (event.data.durationSeconds * ONE_SECOND);
            const wasmInstance = (await WebAssembly.instantiate(event.data.wasmbytes,
                {
                    environment: {
                        SAMPLERATE: SAMPLERATE
                    }
                })).instance.exports;

            const startPos = samplesLength + WAV_HEADER_LENGTH;
            wasmInstances.push({
                instance: wasmInstance,
                startPos: startPos,
                endPos: startPos + durationBytes,
                durationSeconds: event.data.durationSeconds,
                renderPos: startPos,
                allocatedSampleBuffer: wasmInstance.allocateSampleBuffer ? wasmInstance.allocateSampleBuffer(SAMPLE_FRAMES) : undefined
            });

            samplesLength += durationBytes;

            if (event.data.lastInstance == true) {
                totalLength = samplesLength + WAV_HEADER_LENGTH;
                wavfilebytes = new Uint8Array(totalLength);

                console.log('all instances received', wasmInstances.length);
                const rawsamplesview = new DataView(wavfilebytes.buffer);
                writeWavHeader(samplesLength, SAMPLERATE, 2, 32, rawsamplesview);

                console.log('wav header written, ready for rendering from wasm');
                resolve();
            }
        }
    });
});

async function nextChunk(wantedRangeStart, wantedRangeEnd) {
    await wasmInstancesReceivedPromise;
    const currentWasmInstanceIndex = wasmInstances.findIndex((instanceData, ndx) =>
        (ndx == 0 && wantedRangeStart < instanceData.startPos)
        ||
        (instanceData.startPos <= wantedRangeStart &&
            instanceData.endPos > wantedRangeStart)
    );

    const rawsamplesview = new DataView(wavfilebytes.buffer);
    const instanceData = wasmInstances[currentWasmInstanceIndex];
    console.log(currentWasmInstanceIndex, wantedRangeStart, wantedRangeEnd, instanceData.startPos, instanceData.endPos);

    const endpos = instanceData.endPos;
    let currentBytePos = instanceData.renderPos;

    const wasmInstance = instanceData.instance;
    const samplebuffer = instanceData.allocatedSampleBuffer ? instanceData.allocatedSampleBuffer : wasmInstance.samplebuffer;

    for (let n = 0; n < 100 && currentBytePos < endpos && currentBytePos < totalLength; n++) {
        wasmInstance.playEventsAndFillSampleBuffer != undefined ?
            wasmInstance.playEventsAndFillSampleBuffer() :
            wasmInstance.fillSampleBuffer();

        const leftbuffer = new Float32Array(wasmInstance.memory.buffer,
            samplebuffer,
            SAMPLE_FRAMES);
        const rightbuffer = new Float32Array(wasmInstance.memory.buffer,
            samplebuffer + (SAMPLE_FRAMES * 4),
            SAMPLE_FRAMES);

        for (let bufferpos = 0; bufferpos < SAMPLE_FRAMES && currentBytePos < totalLength; bufferpos++) {
            rawsamplesview.setFloat32(currentBytePos, leftbuffer[bufferpos], true);
            currentBytePos += 4;
            rawsamplesview.setFloat32(currentBytePos, rightbuffer[bufferpos], true);
            currentBytePos += 4;
        }
        instanceData.renderPos = currentBytePos;
    }
    let rangeStart = wantedRangeStart;
    let rangeEnd = wantedRangeEnd;
    if (!rangeEnd || currentBytePos <= rangeEnd) {
        rangeEnd = currentBytePos - 1;
    }
    if (rangeEnd < rangeStart) {
        rangeEnd = endpos;
    }
    return {
        rangeStart: rangeStart,
        rangeEnd: rangeEnd
    };
}

self.addEventListener('fetch', (event) =>
    event.respondWith(new Promise(async resolve => {
        if (event.request.url.indexOf('.wav') > -1 && event.request.headers.has('range')) {
            const range = event.request.headers.get('range').match(/bytes=([0-9]+)-([0-9]*)/);

            let wantedRangeStart = parseInt(range[1]);
            let wantedRangeEnd = range[2] ? parseInt(range[2]) : null;

            let { rangeStart, rangeEnd } = await nextChunk(wantedRangeStart, wantedRangeEnd);
            //console.log(rangeStart, rangeEnd);
            const buf = wavfilebytes.subarray(rangeStart, rangeEnd + 1);

            const respondblob = new Blob([buf], { type: 'audio/wav' });
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
