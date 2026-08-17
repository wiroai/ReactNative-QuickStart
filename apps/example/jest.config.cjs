module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/test/**/*.test.ts?(x)'],
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|' +
      '@react-native-community|expo|@expo|@expo-google-fonts|' +
      'react-navigation|@react-navigation|@sentry/react-native|' +
      '@noble|native-base))',
    '/node_modules/react-native-reanimated/plugin/',
  ],
};
