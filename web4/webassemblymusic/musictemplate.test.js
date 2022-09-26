import { wrapJSmusicInTemplate } from './musictemplate.js';
import { readFile } from 'fs/promises';

test('should create a javascript function that generates music', async () => {
    const musicsource = await readFile(new URL('sample_music2.js', import.meta.url));
    const musicfunctionsource = wrapJSmusicInTemplate(musicsource);

    const musicfunction = new Function(musicfunctionsource);
    const generatedMusic = await new Promise(resolve => {
        globalThis.env = {
            input: () => JSON.stringify({bpm: 90}),
            value_return: (val) => resolve(val)
        }
        musicfunction();
    });

    expect(JSON.parse(generatedMusic).length).toBe(115);
});