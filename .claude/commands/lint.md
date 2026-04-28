Run ESLint on the project to check for code quality issues.

If ESLint is not yet installed, set it up first:
1. Install dev dependencies: `npm install --save-dev eslint @eslint/js`
2. Create an `eslint.config.mjs` file with a flat config that:
   - Uses the recommended JS rules from `@eslint/js`
   - Ignores `node_modules/` and `public/`
   - Sets the environment to Node.js (sourceType: "commonjs", globals for node)
3. Add a `"lint"` script to package.json: `"lint": "eslint ."`
4. Add a `"lint:fix"` script to package.json: `"lint:fix": "eslint . --fix"`

If ESLint is already installed, skip setup.

Then run `npm run lint` and report the results. If $ARGUMENTS contains "fix", run `npm run lint:fix` instead.

Summarize the output: how many files had issues, the most common problems, and any quick wins to fix.
