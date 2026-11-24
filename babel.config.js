const { reactCompiler } = require('./babel.reactCompiler');

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // First, as the compiler asks: it must see the code before it is lowered.
  plugins: [reactCompiler],
};
