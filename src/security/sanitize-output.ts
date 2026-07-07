import type {
  AnalyzeImageOutput,
  AnalyzeUiScreenshotOutput,
  OcrImageOutput,
} from "../extraction/schemas.js";
import { checkContentSafety, formatContentSafetyWarnings } from "./content-safety.js";
import { buildPromptInjectionWarnings, tagUntrustedText } from "./prompt-injection.js";
import { type RedactionFinding, formatRedactionWarnings, redactSecrets } from "./redact.js";

export interface SanitizeOutputOptions {
  redactSecrets: boolean;
  checkPii?: boolean;
}

function redactField(text: string, enabled: boolean, findings: RedactionFinding[]): string {
  const result = redactSecrets(text, enabled);
  if (result.redacted) {
    findings.push(...result.findings);
  }
  return result.text;
}

function addInjectionWarnings(texts: string[], warnings: Set<string>): void {
  for (const warning of buildPromptInjectionWarnings(texts)) {
    warnings.add(warning);
  }
}

function addRedactionWarnings(findings: RedactionFinding[], warnings: Set<string>): void {
  if (findings.length === 0) return;
  for (const warning of formatRedactionWarnings(findings)) {
    warnings.add(warning);
  }
}

function addPiiWarnings(combinedText: string, warnings: Set<string>, checkPii?: boolean): void {
  if (!checkPii) return;
  const safetyResult = checkContentSafety(combinedText);
  for (const warning of formatContentSafetyWarnings(safetyResult)) {
    warnings.add(warning);
  }
}

export function sanitizeOcrOutput(
  output: OcrImageOutput,
  options: SanitizeOutputOptions,
): OcrImageOutput {
  const redactionFindings: RedactionFinding[] = [];
  const visibleText = output.visible_text.map((block) => ({
    ...block,
    text: tagUntrustedText(redactField(block.text, options.redactSecrets, redactionFindings)),
  }));

  const layoutRedacted = redactField(output.layout_text, options.redactSecrets, redactionFindings);
  const summaryRedacted = redactField(output.summary, options.redactSecrets, redactionFindings);

  const warnings = new Set(output.warnings);
  addInjectionWarnings(
    [output.summary, layoutRedacted, ...visibleText.map((block) => block.text)],
    warnings,
  );
  addRedactionWarnings(redactionFindings, warnings);
  addPiiWarnings(
    [summaryRedacted, layoutRedacted, ...visibleText.map((b) => b.text)].join(" "),
    warnings,
    options.checkPii,
  );

  return {
    ...output,
    summary: summaryRedacted,
    layout_text: layoutRedacted,
    visible_text: visibleText,
    warnings: [...warnings],
  };
}

export function sanitizeAnalyzeOutput(
  output: AnalyzeImageOutput,
  options: SanitizeOutputOptions,
): AnalyzeImageOutput {
  const textsForInjection: string[] = [output.summary];
  const redactionFindings: RedactionFinding[] = [];

  const observations = output.observations.map((observation) => {
    const content = redactField(observation.content, options.redactSecrets, redactionFindings);
    textsForInjection.push(content);
    return {
      ...observation,
      content: tagUntrustedText(content),
    };
  });

  const inferences = output.inferences.map((inference) => {
    const content = redactField(inference.content, options.redactSecrets, redactionFindings);
    textsForInjection.push(content);
    return {
      ...inference,
      content: tagUntrustedText(content),
    };
  });

  const summaryRedacted = redactField(output.summary, options.redactSecrets, redactionFindings);

  const securityNotes = new Set(output.security_notes);
  addInjectionWarnings(textsForInjection, securityNotes);
  addRedactionWarnings(redactionFindings, securityNotes);
  addPiiWarnings(
    [
      summaryRedacted,
      ...observations.map((o) => o.content),
      ...inferences.map((i) => i.content),
    ].join(" "),
    securityNotes,
    options.checkPii,
  );

  return {
    ...output,
    summary: summaryRedacted,
    observations,
    inferences,
    security_notes: [...securityNotes],
  };
}

export function sanitizeUiScreenshotOutput(
  output: AnalyzeUiScreenshotOutput,
  options: SanitizeOutputOptions,
): AnalyzeUiScreenshotOutput {
  const textsForInjection: string[] = [output.summary, output.layout.structure];
  const redactionFindings: RedactionFinding[] = [];
  const uiElements = output.ui_elements.map((element) => {
    const label = redactField(element.label, options.redactSecrets, redactionFindings);
    const hint = redactField(element.implementation_hint, options.redactSecrets, redactionFindings);
    textsForInjection.push(label, hint);

    return {
      ...element,
      label: tagUntrustedText(label),
      implementation_hint: tagUntrustedText(hint),
    };
  });

  const summaryRedacted = redactField(output.summary, options.redactSecrets, redactionFindings);
  const layoutStructure = redactField(
    output.layout.structure,
    options.redactSecrets,
    redactionFindings,
  );

  const uncertainties = new Set(output.uncertainties);
  addInjectionWarnings(textsForInjection, uncertainties);
  addRedactionWarnings(redactionFindings, uncertainties);

  return {
    ...output,
    summary: summaryRedacted,
    ui_elements: uiElements,
    layout: {
      ...output.layout,
      structure: layoutStructure,
    },
    uncertainties: [...uncertainties],
  };
}
