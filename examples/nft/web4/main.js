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
            { path: 'musicwasms/fall.wasm', durationSeconds: 60 },
            { path: 'musicwasms/noiseandmadness.wasm', durationSeconds: 60 },
            { path: 'musicwasms/goodtimes.wasm', durationSeconds: 60 }
        ];

        let loadSuccessful = true;
        for (let n = 0; n < musicwasms.length; n++) {
            const musicwasm = musicwasms[n];
            const wasmbytesresponse = await fetch(musicwasm.path + location.search);

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

        const messageArea = document.getElementById('message');
        if (loadSuccessful) {
            document.getElementById('player').src = 'music.wav';
            messageArea.innerHTML = location.search.match(/message=([^&]+)/)[1];
        } else {
            messageArea.innerHTML = 'unable to load music. check that you have a valid link signed by the NFT owner';
        }
    });
}