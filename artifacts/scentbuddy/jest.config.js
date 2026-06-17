module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?(?:(jest-)?react-native|@react-native(-community)?|@react-native|expo(nent)?|@expo(nent)?|@expo|@expo-google-fonts|react-navigation|@react-navigation|@unimodules|unimodules|sentry-expo|native-base|react-native-svg|phosphor-react-native|@nkzw))',
  ],
  testMatch: ['<rootDir>/__tests__/**/*.test.{ts,tsx}'],
};
