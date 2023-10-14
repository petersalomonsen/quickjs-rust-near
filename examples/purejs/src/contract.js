export function hello() {
    const name = JSON.parse(env.input()).name;
    env.value_return('hello ' + name);
}
