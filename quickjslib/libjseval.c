#include "./quickjs.h"
#include <string.h>

JSValue global_obj;
JSValue env;
JSRuntime *rt = NULL;
JSContext *ctx;

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

void js_set_eval_deadline(double deadline_ms)
{
    eval_deadline_ms = deadline_ms;
}

void js_request_interrupt()
{
    interrupt_requested = 1;
}

void js_clear_interrupt()
{
    interrupt_requested = 0;
    eval_deadline_ms = 0;
}

void js_set_memory_limit(size_t limit)
{
    JS_SetMemoryLimit(rt, limit);
}

static JSValue js_print(JSContext *ctx, JSValueConst this_val,
                        int argc, JSValueConst *argv)
{
    int i;
    const char *str;
    size_t len;

    for (i = 0; i < argc; i++)
    {
        if (i != 0)
            putchar(' ');
        str = JS_ToCStringLen(ctx, &len, argv[i]);
        if (!str)
            return JS_EXCEPTION;
        fwrite(str, 1, len, stdout);
        JS_FreeCString(ctx, str);
    }
    putchar('\n');
    return JS_UNDEFINED;
}

void create_runtime()
{
    rt = JS_NewRuntime();
    ctx = JS_NewContext(rt);
    JS_SetInterruptHandler(rt, interrupt_handler, NULL);

    global_obj = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global_obj, "print",
                      JS_NewCFunction(ctx, js_print, "print", 1));
}

void js_std_loop_no_os(JSContext *ctx)
{
    JSContext *ctx1;
    int err;

    /* execute the pending jobs */
    for (;;)
    {
        err = JS_ExecutePendingJob(JS_GetRuntime(ctx), &ctx1);
        if (err <= 0)
        {
            if (err < 0)
            {
                printf("%s\n", JS_ToCString(ctx, JS_GetException(ctx1)));
            }
            break;
        }
    }
}

JSValue js_eval(const char *filename, const char *source, int module)
{
    int len = strlen(source);

    JSValue val = JS_Eval(ctx,
                          source,
                          len,
                          filename,
                          (module == 1 ? JS_EVAL_TYPE_MODULE : JS_EVAL_TYPE_GLOBAL));

    if (JS_IsException(val) || JS_IsError(ctx, val))
    {
        printf("%s\n", JS_ToCString(ctx, JS_GetException(ctx)));
    }
    js_std_loop_no_os(ctx);
    return val;
}

uint8_t *js_compile_to_bytecode(const char *filename, const char *source, size_t *out_buf_len, int module)
{
    int len = strlen(source);

    JSValue obj = JS_Eval(ctx,
                          source,
                          len,
                          filename,
                          JS_EVAL_FLAG_COMPILE_ONLY | (module == 1 ? JS_EVAL_TYPE_MODULE : JS_EVAL_TYPE_GLOBAL));

    if (JS_IsException(obj))
    {
        printf("%s\n", JS_ToCString(ctx, JS_GetException(ctx)));
    }
    return JS_WriteObject(ctx, out_buf_len, obj, JS_WRITE_OBJ_BYTECODE);
}

JSValue js_eval_bytecode(const uint8_t *buf, size_t buf_len)
{
    JSValue obj, val;

    obj = JS_ReadObject(ctx, buf, buf_len, JS_READ_OBJ_BYTECODE);
    val = JS_EvalFunction(ctx, obj);
    if (JS_IsException(val))
    {
        printf("%s\n", JS_ToCString(ctx, JS_GetException(ctx)));
    }
    js_std_loop_no_os(ctx);
    return val;
}


JSValue js_load_bytecode(const uint8_t *buf, size_t buf_len)
{
    JSValue module_obj;
    JSAtom module_name;
    JSValue load_module_promise;
    const char *module_name_str;

    module_obj = JS_ReadObject(ctx, buf, buf_len, JS_READ_OBJ_BYTECODE);
    JS_EvalFunction(ctx, module_obj);
    module_name = JS_GetModuleName(ctx, JS_VALUE_GET_PTR(module_obj));
    module_name_str = JS_AtomToCString(ctx, module_name);

    load_module_promise = JS_LoadModule(ctx, "", module_name_str);
    js_std_loop_no_os(ctx);
    JS_FreeCString(ctx, module_name_str);

    return JS_PromiseResult(ctx, load_module_promise);
}

JSValue js_get_promise_result(JSValue promise)
{
    JSValue promise_result = JS_PromiseResult(ctx, promise);
    return promise_result;
}

JSValue js_call_function(JSValue mod_obj, const char *function_name)
{
    JSValue fun_obj, val;

    fun_obj = JS_GetPropertyStr(ctx, mod_obj, function_name);

    val = JS_Call(ctx, fun_obj, mod_obj, 0, NULL);
    if (JS_IsException(val))
    {
        printf("%s\n", JS_ToCString(ctx, JS_GetException(ctx)));
    }
    js_std_loop_no_os(ctx);
    return val;
}

void create_env()
{
    global_obj = JS_GetGlobalObject(ctx);
    env = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, global_obj, "env", env);
}

void js_add_host_function(const char *name, JSCFunction *func, int length)
{
    JS_SetPropertyStr(ctx, env, name, JS_NewCFunction(ctx, func, name, length));
}

JSValue js_get_property(JSValue obj, const char *name)
{
    return JS_GetPropertyStr(ctx, obj, name);
}

const char *js_get_string(JSValue val)
{
    return JS_ToCString(ctx, val);
}

JSContext *get_js_context()
{
    return ctx;
}