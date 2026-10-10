const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {};

/**
 * tools/startup-trace only: write down which file every numeric module id
 * is, so a traced release build's logcat can be read back as file names.
 * The ids are assigned the way Metro's default does (first seen, counting
 * from zero); with the variable unset, nothing here runs.
 */
const traceMap = process.env.MIHRAB_TRACE_MAP;
if (traceMap) {
  config.serializer = {
    createModuleIdFactory() {
      const fs = require('fs');
      const ids = new Map();
      return modulePath => {
        let id = ids.get(modulePath);
        if (id === undefined) {
          id = ids.size;
          ids.set(modulePath, id);
          fs.appendFileSync(traceMap, `${id}\t${path.relative(__dirname, modulePath)}\n`);
        }
        return id;
      };
    },
  };
}

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
