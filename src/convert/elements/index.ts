import { ConverterRegistry } from "../registry.js";
import { convertParagraph } from "./paragraph.js";
import { convertTable } from "./table.js";
import { convertTextRun } from "./text-run.js";
import { convertInlineObject } from "./figure.js";
import {
  convertAutoText,
  convertColumnBreak,
  convertEquation,
  convertFootnoteReference,
  convertHorizontalRule,
  convertPageBreak,
  convertPerson,
  convertRichLink,
  convertSectionBreak,
  convertTableOfContents,
  convertUnsupportedInline,
} from "./misc.js";

export function createDefaultRegistry(): ConverterRegistry {
  const registry = new ConverterRegistry();

  registry.registerStructural("paragraph", convertParagraph);
  registry.registerStructural("table", convertTable);
  registry.registerStructural("tableOfContents", convertTableOfContents);
  registry.registerStructural("sectionBreak", convertSectionBreak);

  registry.registerInline("textRun", convertTextRun);
  registry.registerInline("inlineObjectElement", convertInlineObject);
  registry.registerInline("horizontalRule", convertHorizontalRule);
  registry.registerInline("pageBreak", convertPageBreak);
  registry.registerInline("columnBreak", convertColumnBreak);
  registry.registerInline("footnoteReference", convertFootnoteReference);
  registry.registerInline("equation", convertEquation);
  registry.registerInline("autoText", convertAutoText);
  registry.registerInline("person", convertPerson);
  registry.registerInline("richLink", convertRichLink);
  registry.registerInline("date", convertUnsupportedInline("date"));
  registry.registerInline("dropdown", convertUnsupportedInline("dropdown"));

  return registry;
}

export { convertListRun } from "./list.js";
export { resolveImagePlaceholders } from "./figure.js";
