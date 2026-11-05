import { modelT } from "./model-messages.js";
import {
  getDocumentSkillToolName,
  ZURI_DOCUMENT_TOOL_SPECS,
  ZURI_DOCUMENTS_SKILL_ID,
} from "./skill-contract.js";
import { createSkillHostResources } from "#sdk/shared/skill-definition";

export const BUILTIN_ZURI_DOCUMENTS_SKILL_NAME = "zuri-documents";
export const getBuiltinZuriDocumentsDisplayName = () => (modelT("documentsDisplayName"));
export const getBuiltinZuriDocumentsDescription = () => (modelT("documentsDescription"));

const FETCH = getDocumentSkillToolName("document_fetch");
const PARSE = getDocumentSkillToolName("document_parse");
const READ_CHUNK = getDocumentSkillToolName("document_read_chunk");
const CREATE = getDocumentSkillToolName("document_create");
const DOWNLOAD = getDocumentSkillToolName("document_download");
const LIST_ARTIFACTS = getDocumentSkillToolName("document_list_artifacts");
const getCreateFormatValues = () => (ZURI_DOCUMENT_TOOL_SPECS.document_create.parameters.properties.format.enum
  .map(format => `\`${format}\``)
  .join(modelT("formatSeparator")));

export const getBuiltinZuriDocumentsContent = () => (modelT("builtinContent", { FETCH, PARSE, CREATE, READ_CHUNK, CREATE_FORMAT_VALUES: getCreateFormatValues(), LIST_ARTIFACTS, DOWNLOAD }));

export const getBuiltinZuriDocumentsResources = () => (createSkillHostResources({
  id: ZURI_DOCUMENTS_SKILL_ID,
  get displayName() { return getBuiltinZuriDocumentsDisplayName(); },
  version: "0.2.3",
  get description() { return getBuiltinZuriDocumentsDescription(); },
  category: { id: "documents", get label() { return modelT("documentsCategory"); } },
  tools: ZURI_DOCUMENT_TOOL_SPECS,
  get manifestTitle() { return modelT("documentsManifestTitle"); },
  get manifestDescription() { return modelT("documentsManifestDescription"); },
  get scriptDescription() { return modelT("documentsScriptDescription"); },
}));

export default {
  aliases: ["文档处理", "Document processing"],
  name: BUILTIN_ZURI_DOCUMENTS_SKILL_NAME, get displayName() { return getBuiltinZuriDocumentsDisplayName(); },
  get description() { return getBuiltinZuriDocumentsDescription(); }, get content() { return getBuiltinZuriDocumentsContent(); },
  get resources() { return getBuiltinZuriDocumentsResources(); }, order: 3,
};
