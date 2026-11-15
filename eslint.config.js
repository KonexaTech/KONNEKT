import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'src/screens/*.js'] },
  {
    files: ['App.jsx', 'main.jsx', 'src/**/*.jsx', 'src/**/*.js', 'sw.js'],
    languageOptions: {
      ecmaVersion: 'latest', sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.serviceworker }
    },
    rules: { 'no-undef': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'constructor-super': 'error', 'valid-typeof': 'error' }
  }
];
