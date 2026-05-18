/**
 * React DevTools global hook bootstrap.
 *
 * Returns the body of an inline classic <script> that is injected into the
 * HTML <head> *before* any module script. It installs a minimal
 * `__REACT_DEVTOOLS_GLOBAL_HOOK__` so react-dom registers its renderer and
 * reports every commit — without us wrapping a single component (no tree
 * pollution, RSC-safe).
 *
 * It is deliberately tiny: it only records renderers + fiber roots and relays
 * commits to a handler installed later by the runtime module via
 * `window.__chInstallCommitHandler(fn)`. If the real React DevTools hook is
 * already present (browser extension), we don't clobber it — we wrap its
 * `onCommitFiberRoot` instead so both keep working.
 */
export function getDevToolsHookScript(): string {
  return `(function(){
  var W = window;
  function makeMinimalHook(){
    var rid = 0;
    var hook = {
      // React 16.9 → 19 all consume the same reconciler hook contract
      // (ReactFiberDevToolsHook). Every method below is invoked behind a
      // typeof guard by React, so this minimal surface is version-robust.
      isDisabled: false,
      supportsFiber: true,
      supportsFlight: true,
      renderers: new Map(),
      // Present so a React DevTools backend that attaches late (extension
      // injected after us) can still operate on our recorded renderers.
      rendererInterfaces: new Map(),
      backends: new Map(),
      _fiberRoots: {},
      _chCommit: null,
      _listeners: {},
      inject: function(renderer){
        var id = ++rid;
        hook.renderers.set(id, renderer);
        hook.emit('renderer', { id: id, renderer: renderer, reactBuildType: 'development' });
        return id;
      },
      // Dev-build console/component-stack framing (React 18+). Harmless noops.
      getInternalModuleRanges: function(){ return []; },
      registerInternalModuleStart: function(){},
      registerInternalModuleStop: function(){},
      getFiberRoots: function(id){
        var roots = hook._fiberRoots;
        if (!roots[id]) roots[id] = new Set();
        return roots[id];
      },
      onCommitFiberRoot: function(id, root){
        var set = hook.getFiberRoots(id);
        set.add(root);
        if (typeof hook._chCommit === 'function'){
          try { hook._chCommit(id, root); } catch(e){}
        }
      },
      onPostCommitFiberRoot: function(){},
      onCommitFiberUnmount: function(){},
      onScheduleFiberRoot: function(){},
      setStrictMode: function(){},
      checkDCE: function(){},
      // Real (tiny) pub/sub so a late-attaching React DevTools backend that
      // subscribes to 'renderer'/'operations' still receives events.
      on: function(evt, fn){
        (hook._listeners[evt] = hook._listeners[evt] || []).push(fn);
      },
      off: function(evt, fn){
        var l = hook._listeners[evt];
        if (!l) return;
        var i = l.indexOf(fn);
        if (i !== -1) l.splice(i, 1);
      },
      sub: function(evt, fn){
        hook.on(evt, fn);
        return function(){ hook.off(evt, fn); };
      },
      emit: function(evt, data){
        var l = hook._listeners[evt];
        if (!l) return;
        l.slice().forEach(function(fn){ try { fn(data); } catch(e){} });
      }
    };
    return hook;
  }

  var existing = W.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!existing){
    var hook = makeMinimalHook();
    try {
      Object.defineProperty(W, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
        configurable: true,
        enumerable: false,
        get: function(){ return hook; }
      });
    } catch(e){
      W.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    }
  }

  // Bridge used by the runtime module to subscribe to commits and replay
  // roots that were already mounted before the runtime finished loading.
  W.__chInstallCommitHandler = function(fn){
    var h = W.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!h) return;
    if (typeof h._chCommit !== 'undefined'){
      // Our minimal hook.
      h._chCommit = fn;
    } else {
      // Real DevTools hook present — wrap its commit callback.
      var prev = h.onCommitFiberRoot;
      h.onCommitFiberRoot = function(id, root, pri, deferred){
        var r = prev ? prev.apply(this, arguments) : undefined;
        try { fn(id, root); } catch(e){}
        return r;
      };
    }
    // Replay roots already committed (runtime loaded after first render).
    try {
      var renderers = h.renderers;
      renderers.forEach(function(_r, id){
        var roots = h.getFiberRoots ? h.getFiberRoots(id) : null;
        if (roots) roots.forEach(function(root){
          try { fn(id, root); } catch(e){}
        });
      });
    } catch(e){}
  };
})();`
}
