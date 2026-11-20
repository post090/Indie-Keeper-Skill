// Supported registry locations, in discovery order, relative to the project root.
'use strict';

module.exports = {
  truth: ['truth-source.json', 'docs/truth-source.json', '.docs/truth-source.json'],
  docs: ['docs-manifest.json', 'docs/docs-manifest.json', 'locales/docs-manifest.json', '.docs/docs-manifest.json'],
  schedule: ['schedule.json', 'docs/schedule.json', '.docs/schedule.json'],
};
