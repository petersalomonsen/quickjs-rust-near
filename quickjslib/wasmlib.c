#include <emscripten.h>
#include <stdint.h>
#include <time.h>
#include "./quickjs.h"

extern void create_runtime();
extern void create_env();
extern JSContext * get_js_context();
extern uint64_t js_get_property(uint64_t obj, const char *name);
extern const char *js_get_string(uint64_t val);
extern int js_eval(char *filename, char *source, int module);
extern uint64_t js_eval_bytecode(const char *buf, unsigned long buf_len);
extern uint64_t js_load_bytecode(const char *buf, unsigned long buf_len);
extern uint64_t js_call_function(uint64_t mod_obj, const char * function_name);
extern uint64_t js_get_promise_result(uint64_t promise);
extern unsigned long js_compile_to_bytecode(char *filename, char *source, unsigned long *buf_len, int module);
extern void js_std_loop_no_os(JSContext *ctx);
extern void js_add_host_function(const char *name, JSCFunction *func, int length);
extern void js_call_host_async(JSValue params, JSValue *resolving_functions);

void __secs_to_zone(long long secs, int *p_offset, int *p_dst, long *p_time, long *p_time_dst, long *t) {
    // Minimal implementation
    *p_offset = 0;
    *p_dst = 0;
    *p_time = secs;
    *p_time_dst = secs;
}

int EMSCRIPTEN_KEEPALIVE eval_js_source(char *filename, char *source, int module)
{
    return js_eval(filename, source, module);
}

unsigned long EMSCRIPTEN_KEEPALIVE compile_to_bytecode(char *filename, char *source, unsigned long *buf_len, int module)
{
    return js_compile_to_bytecode(filename, source, buf_len, module);
}

uint64_t EMSCRIPTEN_KEEPALIVE eval_js_bytecode(const char *buf, unsigned long buf_len)
{
    return js_eval_bytecode(buf, buf_len);
}

uint64_t EMSCRIPTEN_KEEPALIVE load_js_bytecode(const char *buf, unsigned long buf_len)
{
    return js_load_bytecode(buf, buf_len);
}

uint64_t EMSCRIPTEN_KEEPALIVE call_js_function(uint64_t modobj, const char *name)
{
    return js_call_function(modobj, name);
}

uint64_t EMSCRIPTEN_KEEPALIVE get_js_obj_property(uint64_t obj, const char *name)
{
    return js_get_property(obj, name);
}

const char* EMSCRIPTEN_KEEPALIVE get_js_string(uint64_t val)
{
    return js_get_string(val);
}

const JSValue EMSCRIPTEN_KEEPALIVE new_js_string(const char *str)
{
    JSContext *ctx = get_js_context();
    return JS_NewString(ctx, str);
}

uint64_t EMSCRIPTEN_KEEPALIVE get_promise_result(uint64_t promise)
{
    return js_get_promise_result(promise);
}

JSValue call_host_async(JSContext *ctx, JSValueConst this_val,
              int argc, JSValueConst *argv)
{
    JSValue promise, resolving_funcs[2];

    promise = JS_NewPromiseCapability(ctx, resolving_funcs);
    js_call_host_async(argv[0], resolving_funcs);
    return promise;
}

void EMSCRIPTEN_KEEPALIVE promise_callback(JSValue *resolving_functions, JSValue result)
{
    JSValue argv[1] = {result};
    JSContext *ctx = get_js_context();
    JS_Call(ctx, resolving_functions[0], JS_UNDEFINED, 1, argv);
    js_std_loop_no_os(ctx);
}

void EMSCRIPTEN_KEEPALIVE init() {
    create_runtime();
    create_env();
    js_add_host_function("callHostAsync", call_host_async, 1);
}
