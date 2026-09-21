/** @react-native-community/blur: a CSS backdrop blur does the same job. */
import React from 'react';
import { View } from 'react-native';

export function BlurView({ blurAmount = 10, style, children, ...rest }) {
  return React.createElement(
    View,
    { style: [{ backdropFilter: `blur(${blurAmount}px)`, WebkitBackdropFilter: `blur(${blurAmount}px)` }, style], ...rest },
    children,
  );
}
export const VibrancyView = BlurView;
