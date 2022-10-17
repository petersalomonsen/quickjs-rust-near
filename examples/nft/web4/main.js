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

            document.getElementById('player').src = 'music.wav';            
        });
}