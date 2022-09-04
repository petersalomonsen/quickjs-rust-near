let args = { bpm: 90};

if (globalThis.env!==undefined) {
  const env = globalThis.env;
  Object.assign(args, JSON.parse(env.input()));
  if (env.signer_account_id() != 'acl.testnet') {
    print('signer account id', env.signer_account_id());
    solo(2);
  }
  print(JSON.stringify(args));
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

const beat = () => createTrack(2).steps(4, [
    c5, fs5(0.1, 10), fs5(0.3, 80), ,
    d5, , fs5(0.3, 70), c5,
    , fs5(0.1, 10), [fs5(0.3, 80), c5], ,
    d5, , fs5(0.3, 70), d5(0.1, 20),
]);

createTrack(4).steps(4, [
    d2(0.4), , , d2(0.1),
    a2(0.2), c3(0.2), , d3(0.2),
    , c3(0.3), , a2(0.2),
    , a2(0.2), c3(0.1), d3(0.2)
]);
await beat();

loopHere();
