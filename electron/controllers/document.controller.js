const { documentModel, vaultIndexModel } = require('../models');
const { toSlug } = require('../utils/string-sanitize');
const indexerController = require('./indexer.controller');
const vaultController = require('./vault.controller');
const { ensurePlainObject, normalizeOptionalString, requireString } = require('./utils');

const DOCUMENT_TITLE_MAX_LENGTH = 120;
const DOCUMENT_TYPE_MAX_LENGTH = 40;

function requirePath(body, key = 'path') {
  return requireString(body[key], `payload.${key}`);
}

function requireContent(body) {
  return requireString(body.content, 'payload.content', { trim: false, allowEmpty: true });
}

/** Files of a campaign section folder (empty while the vault index is not open yet). */
function list(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const folder = requirePath(body, 'folder');
  return { rows: indexerController.isOpen() ? vaultIndexModel.listFolderFiles(folder) : [] };
}

async function read(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const relativePath = requirePath(body);
  const document = await documentModel.readDocument(vaultController.getReadyVaultPath(), relativePath);

  return {
    ...document,
    links: indexerController.isOpen() ? vaultIndexModel.listOutgoingLinks(relativePath) : [],
  };
}

function write(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const expectedHash =
    normalizeOptionalString(body.expectedHash, 'payload.expectedHash', { allowNull: true }) ?? null;

  return documentModel.writeDocument(
    vaultController.getReadyVaultPath(),
    requirePath(body),
    requireContent(body),
    expectedHash,
  );
}

function saveCopy(payload) {
  const body = ensurePlainObject(payload, 'payload');
  return documentModel.saveDocumentCopy(vaultController.getReadyVaultPath(), requirePath(body), requireContent(body));
}

function create(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const folderPath = requirePath(body, 'folder');
  const title = requireString(body.title, 'payload.title', { maxLength: DOCUMENT_TITLE_MAX_LENGTH });
  const type = toSlug(requireString(body.type, 'payload.type', { maxLength: DOCUMENT_TYPE_MAX_LENGTH }));

  const slug = toSlug(title);
  if (slug.length === 0) {
    throw new Error('payload.title must contain at least one letter or number.');
  }

  return documentModel.createDocument(vaultController.getReadyVaultPath(), { folderPath, slug, title, type });
}

module.exports = {
  create,
  list,
  read,
  saveCopy,
  write,
};
