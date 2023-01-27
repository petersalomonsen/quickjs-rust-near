export function web4_get() {
    const request = JSON.parse(env.input()).request;

    let response;

    if (request.path == '/index.html') {
        response = {
            contentType: "text/html; charset=UTF-8",
            body: env.get_content_base64('/index.html')
        };
    }
    env.value_return(JSON.stringify(response));
}
