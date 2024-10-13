Web4
====

This contract allows you to create a [web4](https://github.com/vgrichina/web4) contract where you can implement the Web4 interfaces in Javascript.

Example:

```javascript
export function web4_get() {
    const request = JSON.parse(env.input()).request;

    let response;

    if (request.path == '/index.html') {
        response = {
            contentType: "text/html; charset=UTF-8",
            body: env.base64_encode("Hello")
        };
    }
    env.value_return(JSON.stringify(response));
}
```

