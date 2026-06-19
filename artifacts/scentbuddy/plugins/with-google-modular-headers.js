const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withGoogleModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      const pods = [
        "pod 'GoogleUtilities', :modular_headers => true",
        "pod 'RecaptchaInterop', :modular_headers => true",
      ];
      const toAdd = pods.filter((line) => !contents.includes(line));

      if (toAdd.length > 0) {
        contents = contents.replace(
          /(use_expo_modules!)/,
          `$1\n  ${toAdd.join('\n  ')}`
        );
        fs.writeFileSync(podfilePath, contents);
      }

      return cfg;
    },
  ]);
};
