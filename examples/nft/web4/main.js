if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('serviceworker.js', { scope: './' })
        .then((reg) => {
            console.log('Registration succeeded. Scope is ' + reg.scope);

            if (reg.active) {
                reg.update();
                console.log('update requested');
            }
        }).catch((error) => {
            // registration failed
            console.log('Registration failed with ' + error);
        });
    navigator.serviceWorker.ready.then(async (registration) => {
        if (registration.active.state !== 'activated') {
            await new Promise((resolve) =>
                registration.active.addEventListener('statechange', (e) => {
                    if (e.target.state === 'activated') {
                        resolve();
                    }
                })
            );
        }

        const musicwasms = [
            { name: 'Groove is in the code', path: 'grooveisinthecode.wasm', durationSeconds: 154 },
            { name: 'Noise and madness', path: 'noiseandmadness.wasm', durationSeconds: 163 },
            { name: 'Web chip-music', path: 'webchipmusic.wasm', durationSeconds: 133 },
            { name: 'Wasm song', path: 'wasmsong.wasm', durationSeconds: 232 },
            { name: 'Good times', path: 'goodtimes.wasm', durationSeconds: 176 },
            { name: 'WebAssembly summit 1', path: 'wasmsummit1.wasm', durationSeconds: 154 },
            { name: 'First attempt', path: 'firstattempt.wasm', durationSeconds: 217 },
            { name: 'Shuffle chill', path: 'shufflechill.wasm', durationSeconds: 131 },
            { name: 'Fall', path: 'fall.wasm', durationSeconds: 174 },
            { name: 'WebAssembly summit 2', path: 'wasmsummit2.wasm', durationSeconds: 191 }
        ];

        let loadSuccessful = true;
        const messageArea = document.getElementById('message');

        for (let n = 0; n < musicwasms.length; n++) {
            const musicwasm = musicwasms[n];
            messageArea.innerHTML = `Loading ${musicwasm.name} ( ${musicwasm.path} ) ...`;
            const wasmbytesresponse = await fetch(`musicwasms/${musicwasm.path}`);

            if (wasmbytesresponse.headers.get('content-type') == 'application/wasm') {
                const wasmbytes = await wasmbytesresponse.arrayBuffer();
                navigator.serviceWorker.controller.postMessage(
                    {
                        wasmbytes: wasmbytes,
                        durationSeconds: musicwasm.durationSeconds,
                        lastInstance: n == (musicwasms.length - 1)
                    },
                    [wasmbytes]);
            } else {
                loadSuccessful = false;
                break;
            }
        }

        if (loadSuccessful) {
            const playerElement = document.getElementById('player');
            playerElement.src = 'music.wav';
            let pos = 0;
            messageArea.innerHTML = musicwasms.map((song) => {
                const jsondateminutesstart = 'yyyy-MM-dd HH:'.length;
                const timestring = new Date(pos * 1000).toJSON().substring(jsondateminutesstart, jsondateminutesstart + 5);

                let ret = `<a onclick="document.getElementById('player').currentTime=${pos}">${timestring} ${song.name}</a><br />`
                pos += song.durationSeconds;

                return ret;
            }).join('\n');
        } else {
            messageArea.innerHTML = 'unable to load music. check that you have a valid link signed by the NFT owner';
        }
    });
}