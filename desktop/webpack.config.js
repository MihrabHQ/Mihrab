/**
 * The desktop renderer bundle: the React Native app, rendered by
 * react-native-web, loaded by Electron.
 *
 * App code is read straight from ../src — there is one codebase. What
 * differs on the desktop lives in two places only:
 *
 *   web/shims/   stand-ins for native libraries that have no web build
 *                (notifee, track-player, blob-util, …), aliased by name
 *   web/native/  desktop implementations of the app's own NativeModules,
 *                installed onto react-native-web's NativeModules at boot
 *
 * Desktop-only dependencies (electron, webpack, react-native-web, react-dom)
 * live in desktop/node_modules so the React Native project, and F-Droid's
 * `npm ci` of it, never download an Electron binary.
 */
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const ROOT = path.resolve(__dirname, '..');
const APP_MODULES = path.join(ROOT, 'node_modules');
const OWN_MODULES = path.join(__dirname, 'node_modules');
const shim = name => path.join(__dirname, 'web', 'shims', name);

// Packages in the RN tree that ship untranspiled (Flow, TS, JSX) sources and
// must go through babel with the app.
const TRANSPILE = [
  'react-native-',
  '@react-native',
  '@react-navigation',
  '@sayem314',
  '@notifee',
];

module.exports = (env = {}, argv) => {
  const dev = argv.mode !== 'production';
  /**
   * `--env web`: Mihrab Web, the same app for a plain browser —
   * web/webapp/ answers what Electron's main process does here, and
   * src/config/webApp.ts is swapped for its browser copy. `--env base=/x`
   * names a path it is served under; GitHub Pages serves it at the root.
   */
  const webApp = Boolean(env.web);
  const base = webApp ? String(env.base ?? '').replace(/\/$/, '') : '';
  return {
    target: 'web',
    entry: webApp ? path.join(__dirname, 'web', 'webapp', 'index.js') : path.join(__dirname, 'web', 'index.js'),
    output: {
      path: path.join(__dirname, 'build', webApp ? 'web' : 'renderer'),
      filename: 'app.[contenthash:8].js',
      publicPath: webApp ? `${base}/` : './',
      clean: true,
    },
    // Never an eval-based map: the page's CSP forbids eval, dev or not.
    // None for the web app: it is published, and the map is ten megabytes.
    devtool: webApp ? false : 'source-map',
    resolve: {
      // Platform extensions the way Metro does them, web first.
      extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.json'],
      mainFields: ['browser', 'module', 'main'],
      modules: [OWN_MODULES, APP_MODULES, 'node_modules'],
      alias: {
        // Our own react-native: react-native-web plus the handful of
        // exports it does not have (TurboModuleRegistry, Alert that shows
        // something, PermissionsAndroid, PlatformColor, …).
        'react-native$': shim('react-native.js'),
        'react-native-web$': path.join(OWN_MODULES, 'react-native-web'),
        // One React for the app and the renderer.
        react: path.join(APP_MODULES, 'react'),
        'react-dom': path.join(OWN_MODULES, 'react-dom'),
        // Native libraries with no web build.
        '@notifee/react-native$': shim('notifee.js'),
        'react-native-track-player$': shim('track-player.js'),
        'react-native-blob-util$': shim('blob-util.js'),
        'react-native-encrypted-storage$': shim('encrypted-storage.js'),
        'react-native-share$': shim('share.js'),
        'react-native-view-shot$': shim('view-shot.js'),
        '@react-native-community/geolocation$': shim('geolocation.js'),
        '@react-native-community/blur$': shim('blur.js'),
        '@react-native/assets-registry/registry$': shim('assets-registry.js'),
        'react-native-safe-area-context$': shim('safe-area.js'),
        '@sayem314/react-native-keep-awake$': shim('keep-awake.js'),
        'react-native-sensors$': shim('sensors.js'),
        // gesture-handler probes for reanimated in a try/catch; there is none.
        'react-native-reanimated': false,
      },
    },
    module: {
      rules: [
        // Packages marked "type": "module" import './x' without an
        // extension, as Metro allows; webpack would insist on './x.js'.
        { test: /\.m?js$/, resolve: { fullySpecified: false } },
        {
          test: /\.[jt]sx?$/,
          include: p =>
            !p.includes('node_modules') ||
            TRANSPILE.some(t => p.includes(`node_modules${path.sep}${t}`)),
          exclude: p => p.includes(`node_modules${path.sep}react-native-web`),
          use: {
            loader: 'babel-loader',
            options: {
              babelrc: false,
              configFile: false,
              cacheDirectory: true,
              // Leave import/export to webpack: the RN preset would turn them
              // into CommonJS, and a module that is then both is neither.
              sourceType: 'unambiguous',
              presets: [
                [
                  require.resolve('@react-native/babel-preset', { paths: [ROOT] }),
                  { disableImportExportTransform: true },
                ],
              ],
              plugins: [],
            },
          },
        },
        { test: /\.(png|jpe?g|gif|webp)$/i, type: 'asset/resource' },
        { test: /\.(ttf|otf|woff2?)$/i, type: 'asset/resource' },
        { test: /\.(mp3|m4a|wav|ogg|caf)$/i, type: 'asset/resource' },
      ],
    },
    plugins: [
      // React Navigation's back button is Android-only (a web build uses
      // browser history instead). Here back is BackHandler — Esc, Alt+←,
      // the mouse's back button — so take the native hook.
      new webpack.NormalModuleReplacementPlugin(/\/useBackButton(\.js)?$/, resource => {
        if (resource.context.includes(path.join('@react-navigation', 'native'))) {
          resource.request = resource.request.replace(/useBackButton(\.js)?$/, 'useBackButton.native.js');
        }
      }),
      // React Native internals and the app's own native views: reached only
      // behind a platform check that is false here (see each shim).
      // start/end over left/right, as in React Native — see the shim. Every
      // import of react-native-web's preprocess but the shim's own.
      new webpack.NormalModuleReplacementPlugin(/[\\/]StyleSheet[\\/]preprocess(\.js)?$|^\.\/preprocess$/, resource => {
        const from = resource.contextInfo && resource.contextInfo.issuer;
        if (!from || from === shim('rnw-preprocess.js')) return;
        if (!/react-native-web[\\/]dist[\\/]exports[\\/]StyleSheet/.test(resource.context || '') && !/StyleSheet[\\/]preprocess/.test(resource.request)) return;
        resource.request = shim('rnw-preprocess.js');
      }),
      new webpack.NormalModuleReplacementPlugin(/^react-native\/Libraries\//, shim('rn-internal.js')),
      // The web app's switches: download manager off, one reciter, its path.
      ...(webApp
        ? [
            new webpack.NormalModuleReplacementPlugin(/[\\/]config[\\/]webApp(\.ts)?$/, path.join(__dirname, 'web', 'webapp', 'webApp.js')),
          ]
        : []),
      new webpack.NormalModuleReplacementPlugin(/\/MushafLineNativeComponent(\.ts)?$/, shim('mushaf-line.js')),
      new webpack.DefinePlugin({
        __DEV__: JSON.stringify(dev),
        'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
        'process.env.MIHRAB_DESKTOP': JSON.stringify('1'),
        __MIHRAB_WEB_BASE__: JSON.stringify(base),
        __MIHRAB_WEB_VERSION__: JSON.stringify(require('./package.json').version),
      }),
      new HtmlWebpackPlugin({
        template: path.join(__dirname, 'web', webApp ? 'webapp' : '', 'index.html'),
        base,
      }),
      // GitHub Pages answers an unknown path with 404.html: the same page,
      // so a reload of /quran opens the app on the Quran tab.
      ...(webApp
        ? [new HtmlWebpackPlugin({ template: path.join(__dirname, 'web', 'webapp', 'index.html'), filename: '404.html', base })]
        : []),
    ],
    performance: { hints: false },
  };
};
