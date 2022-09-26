/*
 * Copyright (c) 2022 - Peter Johan Salomonsen
 */

let args = {
    "bpm": 50,
    "drums": true,
    "strings": true,
    "piano": true,
    "bass": true,
    "flute": false
};

if (globalThis.env !== undefined) {
    const env = globalThis.env;
    Object.assign(args, JSON.parse(env.input()));
}

setBPM(args.bpm);

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

const drumbeat1 = () => createTrack(2).steps(4, [
    [c5, fs5(0.2, 70)], , fs5(0.2, 30), c5(0.2, 40),
    [d5, fs5(0.2, 70)], , [c5(0.2, 80), fs5(0.2, 30)], ,
    [fs5(0.2, 70)], , fs5(0.2, 30), ,
    [d5, fs5(0.2, 70)], , fs5(0.2, 30), ,
    [c5, fs5(0.2, 70)], , fs5(0.2, 30), ,
    [d5, fs5(0.2, 70)], , fs5(0.2, 30), fs5(0.2, 8),
    [c5, fs5(0.2, 70)], , fs5(0.2, 30), ,
    [d5, fs5(0.2, 70)], , gs5(0.15, 20), d5(0.2, 50),

]);

const emptybeat = () => createTrack(2).steps(1, [
    , , , , , , , ,
]);


startRecording();
if (args.piano)
    createTrack(0).play([[3.88, controlchange(64, 127)],
    [3.78, cs7(0.45, 81)],
    [4.24, d7(0.47, 70)],
    [4.76, e7(0.36, 72)],
    [3.53, fs6(1.64, 77)],
    [5.20, cs7(0.45, 77)],
    [5.86, controlchange(64, 0)],
    [5.93, controlchange(64, 127)],
    [5.69, a6(1.33, 75)],
    [7.76, controlchange(64, 0)]].quantize(4));

if (args.strings)
    createTrack(1).play([
        [0.0, fs4(7.99, 52)],
        [0.0, b4(7.99, 50)],
        [0.0, e5(7.99, 54)],
        [0.0, cs5(7.99, 52)],
        [0.0, b2(7.99, 53)]]);

if (args.bass)
    createTrack(4).play([[0.05, b1(1.10, 93)],
    [1.30, fs2(0.24, 78)],
    [1.53, a2(0.12, 82)],
    [1.79, b2(0.21, 84)],
    [2.25, a2(0.20, 68)],
    [3.32, fs2(0.25, 72)],
    [3.54, a2(0.12, 83)],
    [3.79, b2(0.18, 92)],
    [4.02, b1(0.93, 82)],
    [5.24, fs2(0.28, 69)],
    [5.47, a2(0.14, 82)],
    [5.76, b2(0.22, 88)],
    [6.22, a2(0.26, 90)],
    [7.29, d3(0.21, 89)],
    [7.50, cs3(0.22, 77)],
    [7.76, a2(0.09, 83)]].quantize(4));

if (args.flute)
    createTrack(6).play([[0.46, b6(0.09, 78)],
    [0.70, b6(0.11, 47)],
    [0.99, fs7(0.34, 81)],
    [1.44, fs7(0.12, 73)],
    [1.54, g7(0.20, 75)],
    [1.75, fs7(0.30, 59)],
    [2.26, d7(0.20, 70)],
    [2.72, e7(0.45, 65)],
    [3.20, d7(0.15, 64)],
    [3.65, cs7(0.42, 78)],
    [4.25, cs7(0.10, 52)],
    [4.35, d7(0.09, 70)],
    [4.44, cs7(0.33, 91)],
    [4.80, a6(0.28, 77)],
    [5.31, b6(0.23, 68)],
    [5.77, fs6(0.67, 64)],
    [6.45, a6(0.37, 62)]]);


if (args.drums) {
    await drumbeat1();
} else {
    await emptybeat();
}
stopRecording();
loopHere();