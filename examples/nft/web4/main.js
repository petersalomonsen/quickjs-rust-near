import { getNearSocialProfile } from './nearsocial.js';

(async () => {
    if ('serviceWorker' in navigator) {
        const reg = navigator.serviceWorker.register('serviceworker.js', { scope: './' })
        console.log('Service worker registration succeeded. Scope is ' + reg.scope);

        if (reg.active) {
            console.log('Requesting service worker update');
            await reg.update();
        }

        const registration = await navigator.serviceWorker.ready;
        while (registration.active.state !== 'activated') {
            console.log(`Waiting for service worker to be activated. Current state is ${registration.active.state}`);
            await new Promise((resolve) =>
                registration.active.addEventListener('statechange', (e) => {
                    if (e.target.state === 'activated') {
                        resolve();
                    }
                })
            );
        }

        const messageArea = document.getElementById('message');
        messageArea.innerHTML = 'Loading music...';
        const musicwasms = await fetch('songlist.json').then(r => r.json());

        const playerElement = document.getElementById('player');
        const togglePlayButton = document.getElementById('togglePlayButton');
        const timeSliderDiv = document.getElementById('timeslidercontainer');
        const timeSpan = document.getElementById('timespan');

        playerElement.innerHTML = `<source src="music.wav" type="audio/wav">`;
        playerElement.addEventListener('timeupdate', (event) => {
            const percentage = playerElement.currentTime * 100 / playerElement.duration;
            timeSliderDiv.style.background = `linear-gradient(90deg, rgba(32, 196, 196, 0.8) 0%, rgba(32, 196, 196, 0.8) ${percentage}%, rgba(0, 0, 0, 0) ${percentage + 10}%)`;
            const timeStringStart = 'yyyy-MM-dd HH:'.length;

            timeSpan.innerHTML = new Date(playerElement.currentTime * 1000).toJSON().substring(timeStringStart, timeStringStart + 'mm:ss'.length);
        });
        const setPlayIcon = () => {
            togglePlayButton.innerHTML = `                
                <svg height='40px' width='40px' fill="#ffffff" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" version="1.1" x="0px" y="0px">
                    <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                        <path d="M0,5 L11,12 L0,19 L0,5 Z" fill="#ffffff"></path>
                    </g>
                </svg>`;
        };
        const setPauseIcon = () => {
            togglePlayButton.innerHTML = `
                <svg height='40px' width='40px' fill="#ffffff" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" version="1.1" x="0px" y="0px">
                    <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                        <path d="M0,18 L0,6 L2,6 L2,18 L0,18 Z M5,18 L5,6 L7,6 L7,18 L5,18 Z" fill="#ffffff"></path>
                    </g>
                </svg>`;
        };
        setPlayIcon();

        window.togglePlay = () => {
            if (playerElement.paused == true) {
                console.log('play', playerElement.paused);
                playerElement.play();
                setPauseIcon();
            } else {
                playerElement.pause();
                setPlayIcon();
            }
        }

        window.selectSong = (pos) => {            
            playerElement.load();
            timeSpan.innerHTML = 'Loading...';
            playerElement.currentTime = pos;
            playerElement.play();
            setPauseIcon();
        };

        let pos = 0;
        messageArea.innerHTML = musicwasms.map((song) => {
            const jsondateminutesstart = 'yyyy-MM-dd HH:'.length;
            const timestring = new Date(pos * 1000).toJSON().substring(jsondateminutesstart, jsondateminutesstart + 5);

            let ret = `<button onclick="selectSong(${pos})">${timestring}&nbsp;&nbsp;&nbsp;${song.name}</button><br />`
            pos += song.durationSeconds;

            return ret;
        }).join('\n');

        const nftowners = await (await fetch(new URL('nftowners.json?t=' + new Date().getTime(), import.meta.url))).json();
        const nftownerstablebody = document.getElementById('nftownerstablebody');

        nftowners.sort((a,b)=> parseInt(a.token_id) - parseInt(b.token_id));
        
        nftownerstablebody.innerHTML = nftowners.map((o, ndx) => `<tr>
                <td>${o.token_id}</td>
                <td><a href="https://near.social/#/mob.near/widget/ProfilePage?accountId=${o.owner_id}" target="_blank">${o.owner_id}</a></td>
                <td><img id="${o.owner_id}_profileimage_${ndx}"></td>
            </tr>`).join('');
        
        nftowners.forEach(async (o, ndx) => {
            const profile = await getNearSocialProfile(o.owner_id);
            if (profile[o.owner_id] && profile[o.owner_id].profile.image.ipfs_cid) {
                document.getElementById(o.owner_id+'_profileimage_'+ndx).src= `https://i.near.social/thumbnail/https://ipfs.near.social/ipfs/${profile[o.owner_id].profile.image.ipfs_cid}`;
            }
        });
    } else {
        document.documentElement.innerHTML = 'This app requires that your browser supports serviceworkers';
    }
})();