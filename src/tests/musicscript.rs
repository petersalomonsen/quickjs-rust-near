pub static MUSIC_SCRIPT: &str = "
(async function () {
    'use strict';

    const noteStringToNoteNumberMap =
        new Array(128).fill(null).map((v, ndx) =>
            (['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'])[ndx % 12] + '' + Math.floor(ndx / 12)
        ).reduce((prev, curr, ndx) => {
            prev[curr] = ndx;
            return prev;
        }, {});

    let tick = 0;

    function currentTime() {
        return tick;
    }

    let startTime = currentTime();
    let bpm = 110;
    const setBPM$1 = (tempo) => bpm = tempo;

    const timeToBeat = (time) => (time / (60 * 1000)) * bpm;
    const currentBeat = () => timeToBeat(currentTime() - startTime);

    let pendingEvents = [];

    function pushPendingEvent(timeout) {
        return new Promise(resolve =>
            pendingEvents.push({
                targetTime: Math.round(currentTime() + timeout),
                resolve: resolve
            })
        );
    }

    function resetTick() {
        tick = 0;
    }

    async function nextTick() {
        const minPendingTick = pendingEvents.reduce((prev, event) =>
            event.targetTime < prev || prev === -1 ? event.targetTime : prev, -1);
        const resolvedEvents = [];

        pendingEvents
            .filter(event => event.targetTime === minPendingTick)
            .forEach(event => resolvedEvents.push(event.resolve()));
        pendingEvents = pendingEvents.filter(event => event.targetTime > tick);

        tick = minPendingTick;
        await Promise.all(resolvedEvents);
    }

    async function waitForBeat(beatNo) {
        let timeout = Math.floor((((beatNo) / bpm) * (60 * 1000)) -
            (currentTime() -
                startTime));

        if (timeout < 0) {
            timeout = 0;
        }

        return pushPendingEvent(timeout);
    }

    class Pattern {
        constructor(output) {
            this.output = output;
            this.channel = 0;
            this.velocity = 100;
            this.offset = 0;
            this.stepsperbeat = 16;
        }

        setChannel(channel) {
            this.channel = channel;
        }

        async waitForStep(stepno) {
            return this.waitForBeat(stepno / this.stepsperbeat);
        }

        async waitForBeat(beatNo) {
            let timeout = Math.floor((((beatNo + this.offset) / bpm) * (60 * 1000)) -
                (currentTime() -
                    startTime));

            if (timeout < 0) {
                return;
            } else {
                return pushPendingEvent(timeout);
            }
        }

        toNoteNumber(note) {
            return noteStringToNoteNumberMap[note];
        }

        async waitDuration(duration) {
            const timeout = (duration * 60 * 1000) / bpm;

            return pushPendingEvent(timeout);
        }

        async pitchbend(start, target, duration, steps) {
            const stepdiff = (target - start) / steps;
            let currentValue = start;
            for (let step = 0; step < steps; step++) {

                const rounded = Math.round(currentValue);
                this.output.sendMessage([0xe0 + this.channel, 0x007f & rounded, (0x3f80 & rounded) >> 7]);

                currentValue += stepdiff;

                await this.waitDuration(duration / steps);
            }
            this.output.sendMessage([0xe0 + this.channel, 0x007f & target, (0x3f80 & target) >> 7]);
        }

        async controlchange(controller, start, target, duration, steps) {
            const stepdiff = (target - start) / steps;
            let currentValue = start;
            for (let step = 0; step < steps; step++) {

                const rounded = Math.round(currentValue);
                this.output.sendMessage([0xb0 + this.channel, controller, rounded]);

                currentValue += stepdiff;

                await this.waitDuration(duration / steps);
            }
            this.output.sendMessage([0xb0 + this.channel, controller, 0x7f & target]);
        }

        async note(noteNumber, duration) {
            this.output.sendMessage([0x90 + this.channel, noteNumber, this.velocity]);

            await this.waitDuration(duration);
            this.output.sendMessage([0x80 + this.channel, noteNumber, 0]);
        }

        async playNote(note, duration) {
            this.output.sendMessage([0x90 + this.channel, noteStringToNoteNumberMap[note], this.velocity]);

            await this.waitDuration(duration);
            this.output.sendMessage([0x80 + this.channel, noteStringToNoteNumberMap[note], 0]);
        }
    }

    const noteFunctionKeys = new Array(128).fill(null).map((v, ndx) =>
        (['c', 'cs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'a', 'as', 'b'])[ndx % 12] + '' + Math.floor(ndx / 12)
    );

    // Note functions - can be called with and without parameter (also without parantheses)
    function createNoteFunctions() {
        const notefunctions = {};

        noteFunctionKeys.forEach((note, ndx) => notefunctions[note] = (duration, velocity, offset) => {
            const createNoteFunc = (notenumber, _velocity = velocity) => async (pattern, rowbeat) => {
                await pattern.waitForBeat(rowbeat + (offset ? offset : 0));

                pattern.velocity = _velocity && typeof duration !== 'object' ? _velocity : pattern.defaultvelocity;
                if (!duration || typeof duration === 'object') {
                    duration = 1 / pattern.stepsperbeat;
                }
                pattern.note(notenumber, duration);
            };
            const noteFunc = createNoteFunc(ndx);

            if (typeof duration === 'object') {
                return noteFunc(duration, velocity);
            } else {
                noteFunc.transpose = (transposeAmount) => createNoteFunc(ndx + transposeAmount);
                noteFunc.fixVelocity = (_velocity) => createNoteFunc(ndx, _velocity);
                return noteFunc;
            }
        });
        noteFunctionKeys.forEach((note, ndx) => {
            notefunctions[note].transpose = (transposeAmount) => notefunctions[noteFunctionKeys[ndx + transposeAmount]];
            notefunctions[note].fixVelocity = (_velocity) => notefunctions[noteFunctionKeys[ndx]](undefined, _velocity);
        });
        return notefunctions;
    }

    const pitchbend = (start, target, duration, steps) => async (pattern, rowbeat) => {
        await pattern.waitForBeat(rowbeat);
        pattern.pitchbend(start, target, duration, steps);
    };

    const controlchange = (controller, start, target, duration, steps) => async (pattern, rowbeat) => {
        await pattern.waitForBeat(rowbeat);
        pattern.controlchange(controller, start, target ? target : start, duration, steps);
    };

    function quantize(noteEvents, stepsperbeat, percentage = 1) {
        return noteEvents.map(noteEvent => {
            const scaledUp = noteEvent[0] * stepsperbeat;
            const diff = (scaledUp - Math.round(scaledUp)) * percentage;

            return [
                (scaledUp - diff) / stepsperbeat,
                noteEvent[1]
            ]
        });
    }

    Array.prototype.quantize = function (stepsperbeat, percentage = 1) {
        return quantize(this, stepsperbeat, percentage);
    };

    Array.prototype.fixVelocity = function (velocity) {
        return this.map(evt => evt.fixVelocity ? evt.fixVelocity(velocity) : evt);
    };

    Array.prototype.repeat = function (times = 1) {
        const arrToRepat = this.slice(0);
        let arr = this;
        for (let n = 0; n < times; n++) {
            arr = arr.concat(arrToRepat);
        }
        return arr;
    };

    class TrackerPattern extends Pattern {
        constructor(output, channel, stepsperbeat = 1, defaultvelocity = 100) {
            super(output);
            this.channel = channel;
            this.stepsperbeat = stepsperbeat;
            this.defaultvelocity = defaultvelocity;
        }

        async steps(stepsperbeat, events) {
            this.offset = Math.round(currentBeat());
            for (let step = 0; step < events.length; step++) {
                let beat = step / stepsperbeat;
                const event = events[step];
                if (event && event.constructor && event.constructor.name === 'AsyncFunction') {
                    event(this, beat);
                } else if (event && event.constructor && event.constructor.name === 'Function') {
                    (async () => {
                        await this.waitForBeat(beat);
                        event(this, beat);
                    })();
                } else if (event && event.length) {
                    // Array
                    for (let evt of event) {
                        if (evt.constructor.name === 'AsyncFunction') {
                            evt(this, beat);
                        } else {
                            await this.waitForBeat(beat);
                            evt(this, beat);
                        }
                    }
                }
            }

            await this.waitForBeat(events.length / stepsperbeat);
        }

        async play(rows, rowbeatcolumnmode) {
            this.offset = Math.round(currentBeat());
            let rowbeat = 0;

            if (typeof rows[0] === 'function') {
                rows = [[0].concat(rows)];
            }
            for (let ndx = 0; ndx < rows.length; ndx++) {
                const cols = rows[ndx];

                if (!rowbeatcolumnmode) {
                    rowbeat = cols[0];
                }

                for (let colndx = 1; colndx < cols.length; colndx++) {
                    const col = cols[colndx];
                    if (col.constructor.name === 'AsyncFunction') {
                        col(this, rowbeat);
                    } else {
                        (async () => {
                            const waitforbeat = rowbeat;
                            await this.waitForBeat(rowbeat);
                            col(this, waitforbeat);
                        })();
                    }
                }
                if (rowbeatcolumnmode === 1) {
                    rowbeat += cols[0];
                }
            }
            await this.waitForBeat(rowbeat);
        }
    }

    const SEQ_MSG_LOOP = -1;
    const SEQ_MSG_START_RECORDING = -2;
    const SEQ_MSG_STOP_RECORDING = -3;

    let songmessages = [];
    let instrumentNames = [];
    let muted = {};
    let solo = {};
    let addedAudio = [];
    const addedVideo = {};

    let trackerPatterns = [];
    let songParts = {};

    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
    const output = {
        sendMessage: (msg) => {
            const ch = msg[0] & 0x0f;
            if (msg.length !== 3 ||
                (!muted[ch] && !Object.keys(solo).length || solo[ch])
            ) {
                songmessages.push({
                    time: currentTime(),
                    message: msg
                });
            }
        }
    };

    function playFromHere() {
        songmessages = songmessages.filter(evt => (evt.message[0] & 0xf0) === 0xb0) // keep control changes
            .map(evt => Object.assign(evt, { time: 0 }));

        resetTick();
    }

    async function loopHere$1() {
        output.sendMessage([SEQ_MSG_LOOP]);
    }

    function startRecording() {
        output.sendMessage([SEQ_MSG_START_RECORDING]);
    }

    function stopRecording() {
        output.sendMessage([SEQ_MSG_STOP_RECORDING]);
    }

    function startVideo(name, clipStartTime = 0) {
        addedVideo[name].schedule.push({ startTime: currentTime(), clipStartTime });
    }

    function stopVideo(name) {
        addedVideo[name].schedule[addedVideo[name].schedule.length - 1].stopTime = currentTime();
    }

    const noteFunctions = createNoteFunctions();
    const songargs = {
        'output': output,
        'setBPM': setBPM$1,
        'TrackerPattern': TrackerPattern,
        'createTrack': (channel, stepsperbeat, defaultvelocity) => {
            const trackerPattern = new TrackerPattern({
                startTime: currentTime(),
                midievents: [],
                sendMessage: function (msg) {
                    this.midievents.push({
                        time: currentTime() - this.startTime,
                        message: msg
                    });
                    output.sendMessage(msg);
                }
            }, channel, stepsperbeat, defaultvelocity);
            trackerPatterns.push(trackerPattern);
            return trackerPattern;
        },
        'playFromHere': playFromHere,
        'loopHere': loopHere$1,
        'pitchbend': pitchbend,
        'controlchange': controlchange,
        'waitForBeat': waitForBeat,
        'startRecording': startRecording,
        'stopRecording': stopRecording,
        'startVideo': startVideo,
        'stopVideo': stopVideo,
        'definePartStart': (partName) => songParts[partName] = { startTime: currentTime() },
        'definePartEnd': (partName) => songParts[partName].endTime = currentTime(),
        'mute': (channel) => muted[channel] = true,
        'solo': (channel) => solo[channel] = true,
        'addInstrument': (instrument) => instrumentNames.push(instrument),
        'addAudio': async (url) => {
            if (!(await addedAudio.find(async audioPromise => (await audioPromise).url === url))) {
                addedAudio.push(new Promise(async (resolve, reject) => {
                    const audioObj = { url: url };
                    try {
                        const buf = await fetch(url)
                            .then(response => response.arrayBuffer())
                            .then(buffer => new AudioContext().decodeAudioData(buffer));

                        audioObj.leftbuffer = buf.getChannelData(0).buffer;
                        audioObj.rightbuffer = buf.getChannelData(1).buffer;
                        print('loaded', url);
                        resolve(audioObj);
                    } catch (e) {
                        reject(e);
                    }
                }));
            }
        },
        'addVideo': async (name, url) => {
            if (!addedVideo[name]) {
                const videoElement = document.createElement('video');
                videoElement.src = url;
                videoElement.autoplay = false;
                videoElement.muted = true;
                addedVideo[name] = { videoElement, schedule: [] };
            }
        },
        'addImage': async (name, url) => {
            if (!addedVideo[name]) {
                const imageElement = new Image();
                imageElement.src = url;
                addedVideo[name] = { imageElement, schedule: [] };
            }
        },
        'note': (noteNumber, duration, velocity, offset) =>
            noteFunctions[noteFunctionKeys[noteNumber]](duration, velocity, offset)
    };
    Object.assign(songargs, noteFunctions);
    const songargkeys = Object.keys(songargs);

    async function compileSong(songsource) {
        songmessages = [];
        instrumentNames = [];
        trackerPatterns = [];
        Object.values(addedVideo).forEach(vid => vid.schedule = []);
        muted = {};
        solo = {};
        songParts = {};

        print('compile song');
        resetTick();
        const songfunc = new AsyncFunction(songargkeys, songsource);

        let playing = true;
        let err;

        songfunc.apply(
            null,
            songargkeys.map(k => songargs[k])
        ).then(() => playing = false).catch(e => {
            err = e;
        });

        while (playing) {
            if (err) {
                throw err;
            }
            await nextTick();
        }

        print('song compiled');
        return songmessages;
    }

    const songsrc = `
        setBPM(90);

        addInstrument('piano');
        addInstrument('string');
        addInstrument('drums');
        addInstrument('guitar');
        addInstrument('bass');
        addInstrument('tubelead');
        addInstrument('flute');
        addInstrument('padsynth');
        addInstrument('brass');
        addInstrument('choir');

        const beat = () => createTrack(2).steps(4,[
            c5,fs5(0.1,10),fs5(0.3,80),,
            d5,,fs5(0.3,70),c5,
            ,fs5(0.1,10),[fs5(0.3,80),c5],,
            d5,,fs5(0.3,70),d5(0.1,20),  
        ]);

        createTrack(4).steps(4,[
            d2(0.4),,,d2(0.1),
            a2(0.2),c3(0.2),,d3(0.2),
            ,c3(0.3),,a2(0.2),
            ,a2(0.2),c3(0.1),d3(0.2)
        ]);
        await beat();

        loopHere();`;

    const eventlist = await compileSong(songsrc);
    const result = JSON.stringify(eventlist);
    env.value_return(result); 
}());
";