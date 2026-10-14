const { vaultIndexModel } = require('../models');
const indexerController = require('./indexer.controller');
const { ensurePlainObject, requireString } = require('./utils');

const MAX_TERM_LENGTH = 200;

/**
 * Full-text search over a campaign (or compendium scope). The vault index must be open.
 *
 * Payload: `{ campaign: string, term: string }`
 * `campaign` is the campaign slug (e.g. `lost-mine`) used as the FTS scope.
 * `term` is the raw user query.
 *
 * Returns: `{ rows: { path, title, kind, type, snippet }[] }`
 */
async function query(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const campaign = requireString(body.campaign, 'payload.campaign', { maxLength: 200 });
  const term = requireString(body.term, 'payload.term', { maxLength: MAX_TERM_LENGTH });

  if (!indexerController.isOpen()) {
    return { rows: [] };
  }

  return { rows: vaultIndexModel.searchFiles(campaign, term) };
}

module.exports = {
  query,
};
