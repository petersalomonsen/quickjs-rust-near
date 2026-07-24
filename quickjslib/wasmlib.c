#include <emscripten.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include "./quickjs.h"

extern void create_runtime();
extern void create_env();
extern JSRuntime *rt;
extern JSContext * get_js_context();
extern uint64_t js_get_property(uint64_t obj, const char *name);
extern const char *js_get_string(uint64_t val);
extern uint64_t js_eval_bytecode(const char *buf, unsigned long buf_len);
extern uint64_t js_load_bytecode(const char *buf, unsigned long buf_len);
extern uint64_t js_call_function(uint64_t mod_obj, const char * function_name);
extern uint64_t js_get_promise_result(uint64_t promise);
extern unsigned long js_compile_to_bytecode(char *filename, char *source, unsigned long *buf_len, int module);
extern void js_std_loop_no_os(JSContext *ctx);
extern void js_add_host_function(const char *name, JSCFunction *func, int length);
extern void js_call_host_async(JSValue params, JSValue *resolving_functions);

/* Host-provided wall clock in milliseconds (imported from the wasm host).
   The host JS thread is blocked while wasm runs, so a wall-clock deadline
   checked from the interrupt handler is the way to bound runaway guest code
   in single-threaded use. */
extern double js_host_time_ms();

static int interrupt_requested = 0;
static double eval_deadline_ms = 0; /* 0 = no deadline */

static int interrupt_handler(JSRuntime *rt, void *opaque)
{
    if (interrupt_requested)
        return 1;
    if (eval_deadline_ms > 0 && js_host_time_ms() >= eval_deadline_ms)
        return 1;
    return 0;
}

void EMSCRIPTEN_KEEPALIVE set_eval_deadline(double deadline_ms)
{
    eval_deadline_ms = deadline_ms;
}

void EMSCRIPTEN_KEEPALIVE request_interrupt()
{
    interrupt_requested = 1;
}

void EMSCRIPTEN_KEEPALIVE clear_interrupt()
{
    interrupt_requested = 0;
    eval_deadline_ms = 0;
}

void EMSCRIPTEN_KEEPALIVE set_memory_limit(unsigned long limit)
{
    JS_SetMemoryLimit(rt, limit);
}

void __secs_to_zone(long long secs, int *p_offset, int *p_dst, long *p_time, long *p_time_dst, long *t) {
    // Minimal implementation
    *p_offset = 0;
    *p_dst = 0;
    *p_time = secs;
    *p_time_dst = secs;
}

/* Unlike js_eval in libjseval.c (which returns the int-truncated value for
   the NEAR contract ABI), this returns the full JSValue so floats, strings
   and exceptions reach the host bindings. */
uint64_t EMSCRIPTEN_KEEPALIVE eval_js_source(char *filename, char *source, int module)
{
    JSContext *ctx = get_js_context();
    JSValue val = JS_Eval(ctx,
                          source,
                          strlen(source),
                          filename,
                          (module == 1 ? JS_EVAL_TYPE_MODULE : JS_EVAL_TYPE_GLOBAL));

    if (JS_IsException(val) || JS_IsError(ctx, val))
    {
        printf("%s\n", JS_ToCString(ctx, JS_GetException(ctx)));
    }
    js_std_loop_no_os(ctx);
    return val;
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
    JS_SetInterruptHandler(rt, interrupt_handler, NULL);
    create_env();
    js_add_host_function("callHostAsync", call_host_async, 1);
}
