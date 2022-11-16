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
                    if(e.target.state === 'activated') {
                        resolve();
                    }
                })
            );
        }

        const wasmbytesresponse = await fetch('musicwasms/fall.wasm'+location.search);
        const messageArea = document.getElementById('message');
        if (wasmbytesresponse.headers.get('content-type') == 'application/wasm') {
            const wasmbytes = await wasmbytesresponse.arrayBuffer();
            const mod = await WebAssembly.compile(wasmbytes);
            navigator.serviceWorker.controller.postMessage({wasmbytes: wasmbytes},[wasmbytes]);
            document.getElementById('player').src = 'music.wav';
            messageArea.innerHTML = location.search.match(/message=([^&]+)/)[1];
        } else {
            messageArea.innerHTML = 'unable to load music. check that you have a valid link signed by the NFT owner';
        }
    });
}