import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['preview/**', 'evidence/**', 'assets/**', 'scripts/**', 'tests/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser }, plugins: { 'jsx-a11y': jsxA11y, 'react-hooks': hooks }, rules: { ...jsxA11y.configs.recommended.rules, ...hooks.configs.recommended.rules } },
);
