package com.shopwithfindit.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;

// Small native helpers for the FindIt website running inside the app.
// pushReady: whether this build has Firebase (google-services.json added at build time). Phone
// notifications need it, and asking for them without it would crash the app, so the website
// checks this first and simply keeps notifications off when it's false.
@CapacitorPlugin(name = "FindIt")
public class FindItPlugin extends Plugin {
    @PluginMethod
    public void pushReady(PluginCall call) {
        boolean ready;
        try {
            ready = !FirebaseApp.getApps(getContext()).isEmpty();
        } catch (Throwable t) {
            ready = false;
        }
        JSObject r = new JSObject();
        r.put("ready", ready);
        call.resolve(r);
    }
}
