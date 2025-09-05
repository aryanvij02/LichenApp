// styles/typography.ts
import { TextStyle } from 'react-native';

export const typography = {
  // Font sizes
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
  
  // Font weights
  fontWeight: {
    normal: '400' as TextStyle['fontWeight'],
    medium: '500' as TextStyle['fontWeight'],
    semibold: '600' as TextStyle['fontWeight'],
    bold: '700' as TextStyle['fontWeight'],
  },
  
  // Line heights
  lineHeight: {
    tight: 20,
    normal: 24,
    relaxed: 28,
  },
  
  // Pre-defined text styles
  styles: {
    // Headings
    h1: {
      fontSize: 32,
      fontWeight: '700' as TextStyle['fontWeight'],
      lineHeight: 36,
    },
    h2: {
      fontSize: 30,
      fontWeight: '600' as TextStyle['fontWeight'],
      lineHeight: 34,
    },
    h3: {
      fontSize: 24,
      fontWeight: '600' as TextStyle['fontWeight'],
      lineHeight: 28,
    },
    h4: {
      fontSize: 20,
      fontWeight: '600' as TextStyle['fontWeight'],
      lineHeight: 24,
    },
    
    // Body text
    body: {
      fontSize: 16,
      fontWeight: '400' as TextStyle['fontWeight'],
      lineHeight: 24,
    },
    bodyLarge: {
      fontSize: 18,
      fontWeight: '400' as TextStyle['fontWeight'],
      lineHeight: 26,
    },
    bodySmall: {
      fontSize: 14,
      fontWeight: '400' as TextStyle['fontWeight'],
      lineHeight: 20,
    },
    
    // Special styles
    caption: {
      fontSize: 12,
      fontWeight: '400' as TextStyle['fontWeight'],
      lineHeight: 16,
    },
    button: {
      fontSize: 16,
      fontWeight: '600' as TextStyle['fontWeight'],
      lineHeight: 20,
    },
  },
} as const;