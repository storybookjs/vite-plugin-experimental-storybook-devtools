/**
 * Vue DevTools global hook bootstrap.
 *
 * Returns the body of an inline classic <script> injected into the HTML <head>
 * *before* any module script. It installs a minimal
 * `__VUE_DEVTOOLS_GLOBAL_HOOK__` so Vue's runtime-core reports every component
 * mount/update/unmount — without us wrapping a single component or
 * reconstructing the SFC (the rendered tree/DOM is untouched). This mirrors the
 * React `devtools-hook.ts` (which installs `__REACT_DEVTOOLS_GLOBAL_HOOK__`).
 *
 * It is deliberately tiny: it relays `component:added` / `component:updated` /
 * `component:removed` to a handler the runtime module installs later via
 * `window.__chInstallVueHandler(fn)`. If the
 * real Vue devtools hook is already present (browser extension / @vitejs
 * devtools), we don't clobber it — we wrap its `emit` so both keep working.
 *
 * Vue specifics (validated in the Phase 0 spike, see
 * docs/plans/vue-non-intrusive-detection.md → "Spike results"):
 *
 * - Vue's devtools component-event emit signature is
 *   `emit(event, app, uid, parentUid, instance)` — the component instance is at
 *   argument index 3 (index 0 is the app).
 * - `component:removed` is ONLY emitted by `@vue/runtime-core` when the hook
 *   exposes a `cleanupBuffer(component)` method returning falsy. Our hook is
 *   installed before the app boots, so it never buffers — `cleanupBuffer`
 *   returns `false` (= "not buffered, proceed with normal removal"). Omitting
 *   it silently drops every unmount event.
 */
export function getDevToolsHookScript(): string {
  return `(function(){
  var W = window;
  function makeMinimalHook(){
    var hook = {
      // Vue's runtime-core sets devtools$1 = this hook, then flags
      // hook.enabled = true and replays its pre-attach buffer through emit.
      enabled: true,
      // Vue gates 'component:removed' on cleanupBuffer existing AND returning
      // falsy. We never buffer (installed before createApp), so always false =
      // "proceed with the removal emit". This is REQUIRED for unmount tracking.
      cleanupBuffer: function(){ return false; },
      _ch: null,
      _listeners: {},
      // app:init / component:* relay. Vue calls emit(event, ...args); for
      // component:added/updated/removed the args are (app, uid, parentUid,
      // instance).
      emit: function(evt){
        var args = Array.prototype.slice.call(arguments, 1);
        var l = hook._listeners[evt];
        if (l) l.slice().forEach(function(fn){ try { fn.apply(null, args); } catch(e){} });
        if (typeof hook._ch === 'function'){
          try { hook._ch(evt, args); } catch(e){}
        }
      },
      on: function(evt, fn){
        (hook._listeners[evt] = hook._listeners[evt] || []).push(fn);
      },
      off: function(evt, fn){
        var l = hook._listeners[evt];
        if (!l) return;
        var i = l.indexOf(fn);
        if (i !== -1) l.splice(i, 1);
      },
      once: function(evt, fn){
        function g(){ hook.off(evt, g); return fn.apply(this, arguments); }
        hook.on(evt, g);
      }
    };
    return hook;
  }

  var existing = W.__VUE_DEVTOOLS_GLOBAL_HOOK__;
  if (!existing){
    var hook = makeMinimalHook();
    try {
      Object.defineProperty(W, '__VUE_DEVTOOLS_GLOBAL_HOOK__', {
        configurable: true,
        enumerable: false,
        get: function(){ return hook; }
      });
    } catch(e){
      W.__VUE_DEVTOOLS_GLOBAL_HOOK__ = hook;
    }
  } else {
    // A real Vue devtools hook is already present — make sure removals reach us
    // even if it lacks cleanupBuffer, and don't clobber its emit.
    if (typeof existing.cleanupBuffer !== 'function'){
      try { existing.cleanupBuffer = function(){ return false; }; } catch(e){}
    }
  }

  // Bridge: the runtime module subscribes to component events here. We also
  // wrap a real hook's emit (rather than replacing it) so the extension keeps
  // working, and we replay nothing extra (Vue replays its own buffer on attach).
  W.__chInstallVueHandler = function(fn){
    var h = W.__VUE_DEVTOOLS_GLOBAL_HOOK__;
    if (!h) return;
    if (Object.prototype.hasOwnProperty.call(h, '_ch')){
      // Our minimal hook.
      h._ch = fn;
    } else {
      // Real devtools hook present — wrap its emit so both keep receiving.
      var prevEmit = h.emit;
      h.emit = function(evt){
        var r = prevEmit ? prevEmit.apply(this, arguments) : undefined;
        try {
          fn(evt, Array.prototype.slice.call(arguments, 1));
        } catch(e){}
        return r;
      };
    }
  };
})();`
}
