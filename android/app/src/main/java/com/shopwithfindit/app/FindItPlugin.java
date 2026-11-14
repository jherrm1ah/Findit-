package com.shopwithfindit.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Small native helpers for the FindIt website running inside the app.
// pushReady: whether this build has Firebase. The google-services plugin turns
// google-services.json (added at build time) into a "google_app_id" resource, so its presence
// means Firebase is set up. Phone notifications need it, and asking for them without it would
// crash the app, so the website checks this first and keeps notifications off when it's false.
@CapacitorPlugin(name = "FindIt")
public class FindItPlugin extends Plugin {
    @PluginMethod
    public void pushReady(PluginCall call) {
        boolean ready;
        try {
            ready = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName()) != 0;
        } catch (Throwable t) {
            ready = false;
        }
        JSObject r = new JSObject();
        r.put("ready", ready);
        call.resolve(r);
    }
}
