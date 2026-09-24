// One Commons app renderer receives both capability bridges. Electron's main
// process grants each bridge only while its matching workspace mode is active.
import "./preload-cloud";
import "./preload-local";
