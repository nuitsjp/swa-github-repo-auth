const libPaths = [
  '../packages/swa-github-auth/lib/config',
  '../packages/swa-github-auth/lib/githubPrincipal',
  '../packages/swa-github-auth/lib/repositoryAuthorizer'
];

// Load library modules so V8 coverage captures them outside the default test roots.
libPaths.forEach((p) => {
  const resolved = require.resolve(p);
  if (process.env.DEBUG_COVERAGE === 'true') {
    // eslint-disable-next-line no-console
    console.log('[coverage] resolved:', resolved);
  }
  require(resolved);
});
